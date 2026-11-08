import { ApiError } from '../events/errors'
import { LedgerRefusal } from './ledger'

/** Maps ledger refusals on customer routes to friendly API errors. */
export async function customerError<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (error) {
    if (!(error instanceof LedgerRefusal)) throw error
    if (error.code === 'not_found' || error.code === 'unknown_event') throw new ApiError(404, 'not_found', 'We could not find that event.')
    throw new ApiError(422, error.code, error.message)
  }
}
