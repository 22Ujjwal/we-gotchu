import { mkdtemp, mkdir, readFile, writeFile, copyFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { expect, it } from 'vitest'

const folder = fileURLToPath(new URL('./migrations', import.meta.url))

it.each(['main', 'arrange'] as const)('upgrades an existing %s database without losing records', async branch => {
  const prior = await mkdtemp(join(tmpdir(), 'migration-history-'))
  const client = new PGlite()
  try {
    const journal = JSON.parse(await readFile(join(folder, 'meta/_journal.json'), 'utf8'))
    // Recreate both histories by their original timestamps, which Drizzle uses for upgrades.
    journal.entries = journal.entries.filter((entry: { idx: number }) => branch === 'main'
      ? entry.idx <= 4
      : entry.idx <= 2 || entry.idx >= 5 && entry.idx <= 8)
    await mkdir(join(prior, 'meta'))
    await writeFile(join(prior, 'meta/_journal.json'), JSON.stringify(journal))
    for (const entry of journal.entries) await copyFile(join(folder, `${entry.tag}.sql`), join(prior, `${entry.tag}.sql`))
    const db = drizzle(client)
    await migrate(db, { migrationsFolder: prior })
    await client.exec("CREATE TABLE migration_preserved (value text); INSERT INTO migration_preserved VALUES ('keep me')")
    await migrate(db, { migrationsFolder: folder })
    await migrate(db, { migrationsFolder: folder })
    const tables = await client.query<{ tablename: string }>("SELECT tablename FROM pg_tables WHERE schemaname = 'public'")
    expect(tables.rows.map(row => row.tablename)).toEqual(expect.arrayContaining([
      'supplier_mail_operations', 'supplier_mail_receipts', 'arrange_events', 'arrange_commerce', 'arrange_payment_events',
    ]))
    const columns = await client.query<{ column_name: string }>("SELECT column_name FROM information_schema.columns WHERE table_name = 'payments'")
    expect(columns.rows.map(row => row.column_name)).toContain('paid_at')
    expect((await client.query('SELECT value FROM migration_preserved')).rows).toEqual([{ value: 'keep me' }])
  } finally {
    await client.close()
    await rm(prior, { recursive: true, force: true })
  }
})
