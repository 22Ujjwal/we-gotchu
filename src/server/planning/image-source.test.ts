import { expect, it } from 'vitest'
import { publicAddress, sourceUrl, readSource, consumeSource } from './image-source'

it.each(['127.0.0.1', '10.2.3.4', '169.254.169.254', '172.16.0.1', '192.168.1.1', '100.64.0.1', '0.0.0.0', '224.0.0.1', '192.0.2.1', '::1', '::ffff:8.8.8.8'])('rejects non-public or unsupported address %s', address => {
  expect(publicAddress(address)).toBe(false)
})
it('accepts public IPv4', () => expect(publicAddress('93.184.216.34')).toBe(true))
it.each(['http://venue.test', 'https://user:pass@venue.test', 'https://venue.test:444', 'https://localhost', 'https://127.1', 'https://[::1]', 'file:///etc/passwd'])('rejects unsafe URL %s', url => {
  expect(() => sourceUrl(url)).toThrow()
})
it('rejects private DNS results before requesting', async () => {
  await expect(readSource('https://venue.example.com', { resolve: async () => ['127.0.0.1'] })).rejects.toThrow()
})
it('bounds stalled DNS resolution', async () => {
  await expect(readSource('https://venue.example.com', { resolve: () => new Promise(() => {}), timeoutMs: 20 })).rejects.toThrow('deadline')
})

it('rejects redirects, non-HTML and oversized responses', async () => {
  async function* body() { yield Buffer.alloc(1_500_001) }
  await expect(consumeSource(302, { location: 'http://127.0.0.1', 'content-type': 'text/html' }, body())).rejects.toThrow()
  await expect(consumeSource(200, { 'content-type': 'application/json' }, body())).rejects.toThrow()
  await expect(consumeSource(200, { 'content-type': 'text/html' }, body())).rejects.toThrow('large')
})
it('reads bounded HTML', async () => {
  async function* body() { yield Buffer.from('<title>Venue</title>') }
  await expect(consumeSource(200, { 'content-type': 'text/html; charset=utf-8' }, body())).resolves.toBe('<title>Venue</title>')
})
