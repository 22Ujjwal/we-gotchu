import { auth } from '@clerk/tanstack-react-start/server'

export class UnauthenticatedError extends Error {
  readonly status = 401
  constructor() {
    super('Sign in required.')
  }
}

/**
 * Returns the signed-in customer's identifier, or throws UnauthenticatedError.
 * Server-only: import from API routes and server modules, never from UI code.
 * The rest of the transaction service depends on this function, not on Clerk,
 * so the identity provider can be swapped without touching ownership checks.
 */
export async function requireCustomerId(): Promise<string> {
  const { userId } = await auth()
  if (!userId) throw new UnauthenticatedError()
  return userId
}
