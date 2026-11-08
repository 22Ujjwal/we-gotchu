import { createHmac, timingSafeEqual } from 'node:crypto'

/** Svix's documented HMAC scheme. Verify the unmodified body BEFORE parsing JSON.
 * https://docs.svix.com/receiving/verifying-payloads/how-manual */
export function verifyWebhookSignature(opts: { body: string; headers: Headers; secret: string; now: number }): boolean {
  const id = opts.headers.get('svix-id')
  const timestamp = opts.headers.get('svix-timestamp')
  const signatures = opts.headers.get('svix-signature')
  if (!id || !timestamp || !signatures || !/^\d+$/.test(timestamp)) return false
  if (!Number.isFinite(opts.now) || Math.abs(opts.now / 1000 - Number(timestamp)) > 300) return false
  if (!/^whsec_[A-Za-z0-9+/]+={0,2}$/.test(opts.secret)) return false
  const key = Buffer.from(opts.secret.slice(6), 'base64')
  if (key.length < 16) return false
  const expected = createHmac('sha256', key).update(`${id}.${timestamp}.${opts.body}`).digest()
  return signatures.split(' ').some(signature => {
    const [version, encoded] = signature.split(',')
    if (version !== 'v1' || !encoded || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) return false
    const received = Buffer.from(encoded, 'base64')
    return received.length === expected.length && timingSafeEqual(received, expected)
  })
}
