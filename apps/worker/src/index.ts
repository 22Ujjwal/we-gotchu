// Long-running jobs (supplier research, replies, booking steps) run here instead of
// inside Vercel requests. See docs/architecture-draft.md.
import { CONTRACTS_VERSION } from '@we-gotchu/contracts'

console.log(`worker started (contracts ${CONTRACTS_VERSION})`)
