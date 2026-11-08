import { ZodError } from 'zod'
import { verifyWebhookSignature } from './signature'

const MAX_BYTES = 256 * 1024
class BodyError extends Error {
  constructor(readonly status: number) { super('Invalid webhook body') }
}

async function readBody(request: Request, timeoutMs: number): Promise<string> {
  const length = Number(request.headers.get('content-length'))
  if (length > MAX_BYTES) throw new BodyError(413)
  if (!request.body) throw new BodyError(400)
  const reader = request.body.getReader()
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      (async () => {
        const chunks: Uint8Array[] = []
        let bytes = 0
        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          bytes += value.byteLength
          if (bytes > MAX_BYTES) throw new BodyError(413)
          chunks.push(value)
        }
        try { return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)) }
        catch { throw new BodyError(400) }
      })(),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new BodyError(408)), timeoutMs) }),
    ])
  } finally {
    clearTimeout(timer)
    await reader.cancel().catch(() => {})
  }
}

/** Mount as POST /api/supplier-mail/webhook after supplying durable runtime adapters. */
export function createSupplierMailWebhook(opts: {
  secret: string
  receiver: { receive(rawBody: string): Promise<'processed' | 'duplicate' | 'ignored'> }
  now?: () => number
  bodyTimeoutMs?: number
}): (request: Request) => Promise<Response> {
  const response = (status: number, body: object) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } })
  return async request => {
    if (!opts.secret) return response(503, { error: 'Supplier mail is not configured' })
    if (request.method !== 'POST') return response(405, { error: 'Method not allowed' })
    let body: string
    try { body = await readBody(request, opts.bodyTimeoutMs ?? 5000) }
    catch (error) { return response(error instanceof BodyError ? error.status : 400, { error: 'Invalid webhook body' }) }
    if (!verifyWebhookSignature({ body, headers: request.headers, secret: opts.secret, now: (opts.now ?? Date.now)() })) {
      return response(401, { error: 'Invalid webhook signature' })
    }
    try {
      const status = await opts.receiver.receive(body)
      return response(200, { status })
    } catch (error) {
      if (error instanceof SyntaxError || error instanceof ZodError) return response(400, { error: 'Invalid webhook payload' })
      return response(503, { error: 'Receipt processing incomplete; retry later' })
    }
  }
}
