import { resolve4 } from 'node:dns/promises'
import { request } from 'node:https'
import { isIPv4 } from 'node:net'
import type { IncomingHttpHeaders, IncomingMessage } from 'node:http'

/** Conservative IPv4-only policy: fail closed for special-use and IPv6 addresses. */
export function publicAddress(address: string): boolean {
  if (!isIPv4(address)) return false
  const [a, b, c] = address.split('.').map(Number)
  return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 0 || b === 168 || (b === 88 && c === 99))) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113))
}
export function sourceUrl(value: string): URL {
  const url = new URL(value)
  if (url.protocol !== 'https:' || url.username || url.password || url.port ||
    !url.hostname.includes('.') || url.hostname.endsWith('.') ||
    /(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(url.hostname) ||
    (isIPv4(url.hostname) && !publicAddress(url.hostname)) || url.hostname.includes(':')) {
    throw new Error('Unsafe image source')
  }
  url.hash = ''
  return url
}

export async function consumeSource(status: number, headers: IncomingHttpHeaders, body: AsyncIterable<Buffer>): Promise<string> {
  if (status !== 200) throw new Error('Source unavailable') // No redirects, including to public URLs.
  if (!/^text\/html(?:;|$)/i.test(headers['content-type'] ?? '') ||
    (headers['content-encoding'] && headers['content-encoding'] !== 'identity')) throw new Error('Unsupported source content')
  const limit = 1_500_000
  if (Number(headers['content-length']) > limit) throw new Error('Source too large')
  const chunks: Buffer[] = []
  let bytes = 0
  for await (const chunk of body) {
    bytes += chunk.length
    if (bytes > limit) throw new Error('Source too large')
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

export async function readSource(value: string, opts: {
  resolve?: (host: string) => Promise<string[]>
  timeoutMs?: number
} = {}): Promise<string> {
  const url = sourceUrl(value)
  const abort = new AbortController()
  let response: IncomingMessage | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { abort.abort(); response?.destroy(); reject(new Error('Source deadline exceeded')) }, opts.timeoutMs ?? 5000)
  })
  const operation = async () => {
    const addresses = await (opts.resolve ?? resolve4)(url.hostname)
    if (!addresses.length || !addresses.every(publicAddress)) throw new Error('Unsafe source address')
    if (abort.signal.aborted) throw new Error('Source deadline exceeded')
    return new Promise<string>((resolve, reject) => {
      const req = request(url, {
        signal: abort.signal, agent: false, family: 4,
        headers: { Accept: 'text/html', 'Accept-Encoding': 'identity', 'User-Agent': 'Arrange-Venue-Images/1.0' },
        // Connect only to the validated address; retain original host for TLS/SNI.
        lookup: (_host, _options, callback) => callback(null, addresses[0], 4),
      }, res => {
        response = res
        consumeSource(res.statusCode ?? 0, res.headers, res).then(resolve, reject).finally(() => res.destroy())
      })
      req.on('error', reject)
      req.end()
    })
  }
  try { return await Promise.race([operation(), deadline]) }
  finally { clearTimeout(timer); abort.abort(); response?.destroy() }
}
