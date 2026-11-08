import { expect, it } from 'vitest'
import { localCustomerId } from './local-access'

it('keeps the fixed local identity away from public and forwarded requests', () => {
  const env = { NODE_ENV: 'development', ARRANGE_FAKE_PROVIDERS: 'true', ARRANGE_LOCAL_CUSTOMER_ID: 'maya' }
  expect(localCustomerId(env, new Request('http://localhost:3100/api/arrange/events'))).toBe('maya')
  for (const request of [
    new Request('https://public.example/api/arrange/events'),
    new Request('http://localhost:3100/api/arrange/events', { headers: { 'x-forwarded-for': '1.2.3.4' } }),
    new Request('http://localhost:3100/api/arrange/events', { headers: { origin: 'https://public.example' } }),
  ]) expect(() => localCustomerId(env, request)).toThrow('Local access only')
  expect(localCustomerId({ ...env, NODE_ENV: 'production' }, new Request('http://localhost'))).toBeUndefined()
  expect(localCustomerId({ ...env, ARRANGE_FAKE_PROVIDERS: 'false' }, new Request('http://localhost'))).toBeUndefined()
})
