// Applies Drizzle migrations to the Neon database in DATABASE_URL.
// Run with: bun run db:migrate (Bun loads .env.local automatically).
import { migrateNeon } from '../src/server/db/client'

const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL is not set.')
  process.exit(1)
}
await migrateNeon(url)
console.log('Migrations applied.')
