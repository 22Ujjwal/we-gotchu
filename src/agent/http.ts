import { setTimeout } from 'node:timers/promises'

export class ProviderHttpError extends Error {
  constructor(readonly status: number, readonly code?: string) {
    super(`Research provider HTTP ${status}`)
  }
}

export async function requestJson(
  fetcher: typeof fetch, url: string, key: string, signal: AbortSignal,
  body?: unknown, idempotencyKey?: string, method = body === undefined ? 'GET' : 'POST',
): Promise<unknown> {
  signal.throwIfAborted()
  const response = await fetcher(url, {
    method, signal, redirect: 'error',
    headers: {
      Authorization: `Bearer ${key}`, 'Content-Type': 'application/json',
      'User-Agent': 'we-gotchu-research/0.1',
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: { code?: unknown }; code?: unknown } | null
    const code = body?.error?.code ?? body?.code
    throw new ProviderHttpError(response.status, typeof code === 'string' ? code : undefined)
  }
  return response.json()
}

export async function pause(signal: AbortSignal) {
  await setTimeout(1000, undefined, { signal })
}
