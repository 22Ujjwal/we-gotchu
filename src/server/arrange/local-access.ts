import { UnauthenticatedError } from '../auth'

export function localCustomerId(env: NodeJS.ProcessEnv, request: Request): string | undefined {
  if (env.NODE_ENV !== 'development' || env.ARRANGE_FAKE_PROVIDERS !== 'true' || !env.ARRANGE_LOCAL_CUSTOMER_ID) return undefined
  const url = new URL(request.url)
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  const forwarded = ['forwarded', 'x-forwarded-for', 'x-forwarded-host', 'cf-connecting-ip'].some(name => request.headers.has(name))
  const origin = request.headers.get('origin')
  if (!local || forwarded || (origin && origin !== url.origin)) {
    const error = new UnauthenticatedError()
    error.message = 'Local access only'
    throw error
  }
  return env.ARRANGE_LOCAL_CUSTOMER_ID
}
