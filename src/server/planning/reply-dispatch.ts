// Register with the host runtime only after the webhook has saved its durable receipt.
export function withReplyProcessing(
  receive: (request: Request) => Promise<Response>,
  process: () => Promise<unknown>,
  waitUntil: (task: Promise<unknown>) => void,
) {
  return async (request: Request): Promise<Response> => {
    const response = await receive(request)
    if (response.ok) {
      waitUntil(Promise.resolve().then(process).catch(() => {
        console.error('Supplier reply processing interrupted; saved jobs remain available for recovery.')
      }))
    }
    return response
  }
}
