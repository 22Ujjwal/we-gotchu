import { CONTRACTS_VERSION } from '@we-gotchu/contracts'

export function GET() {
  return Response.json({ ok: true, contractsVersion: CONTRACTS_VERSION })
}
