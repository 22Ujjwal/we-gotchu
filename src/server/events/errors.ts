// API errors return JSON { errorCode, message } plus optional extra fields.
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly errorCode: string,
    message: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(message)
  }
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

export function errorResponse(err: unknown): Response {
  if (err instanceof ApiError) return json({ errorCode: err.errorCode, message: err.message, ...err.extra }, err.status)
  // UnauthenticatedError from ../auth carries status 401; checked structurally so this
  // module does not load Clerk.
  if ((err as { status?: unknown } | null)?.status === 401) {
    return json({ errorCode: 'unauthenticated', message: 'Sign in required.' }, 401)
  }
  console.error('[api] unexpected error', err)
  return json({ errorCode: 'internal_error', message: 'Something went wrong.' }, 500)
}

/** Runs a handler and converts thrown errors into JSON error responses. */
export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn()
  } catch (err) {
    return errorResponse(err)
  }
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    throw new ApiError(422, 'invalid_json', 'Request body must be JSON.')
  }
}
