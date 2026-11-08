import { defineConfig } from 'drizzle-kit'

// Generates SQL migrations from schema.ts:
//   bunx drizzle-kit generate --config src/server/db/drizzle.config.ts
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/server/db/schema.ts',
  out: './src/server/db/migrations',
})
