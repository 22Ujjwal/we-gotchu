import { configureStore } from '../runtime'
import { configureDeps, getDeps } from './deps'
import type { Store } from '../store'

let localStore: Store | undefined

// Local event requests must use the same database owner as the planning conversation.
export async function getRequestDeps(env: NodeJS.ProcessEnv = process.env) {
  if (env.NODE_ENV === 'development' && env.PLANNING_LOCAL_DB_DIR) {
    const { getPlanningTransactionStore } = await import('../planning/runtime')
    const store = await getPlanningTransactionStore()
    if (store !== localStore) {
      configureStore(store)
      configureDeps({ store })
      localStore = store
    }
  }
  return getDeps()
}
