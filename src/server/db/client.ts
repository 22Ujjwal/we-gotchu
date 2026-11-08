import { fileURLToPath } from 'node:url'
import { Pool } from '@neondatabase/serverless'
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-serverless'
import { migrate as migrateNeonDb } from 'drizzle-orm/neon-serverless/migrator'
import type { Store } from '../store'
import { schema } from './schema'
import { createStore } from './store-impl'

// Server-only. Never import from UI code.

const migrationsFolder = fileURLToPath(new URL('./migrations', import.meta.url))

// Uses the WebSocket Pool driver (not neon-http) because the store needs
// interactive transactions. Bun and Node 22+ provide a global WebSocket.
function neonDb(databaseUrl: string) {
  const pool = new Pool({ connectionString: databaseUrl })
  return { pool, db: drizzleNeon({ client: pool, schema }) }
}

export function createNeonStore(databaseUrl: string): Store {
  return createStore(neonDb(databaseUrl).db)
}

/** Applies the committed drizzle-kit migrations in src/server/db/migrations to a Neon database. */
export async function migrateNeon(databaseUrl: string): Promise<void> {
  const { pool, db } = neonDb(databaseUrl)
  try {
    await migrateNeonDb(db, { migrationsFolder })
  } finally {
    await pool.end()
  }
}

/** In-memory PGlite with migrations applied. For tests and local demos. */
export async function createTestStore(): Promise<Store> {
  const [{ PGlite }, { drizzle: drizzlePglite }, { migrate: migratePglite }] = await Promise.all([
    import('@electric-sql/pglite'),
    import('drizzle-orm/pglite'),
    import('drizzle-orm/pglite/migrator'),
  ])
  const db = drizzlePglite({ client: new PGlite(), schema })
  await migratePglite(db, { migrationsFolder })
  return createStore(db)
}
