import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { createApp } from './server'
import { createPgDb } from './db/pg'
import { createPgliteDb } from './db/pglite'
import { migrate } from './db/migrations'
import { isSeeded, seedDemo } from './seed'
import { createServices, realToday } from './services'

const port = Number(process.env.PORT ?? 4000)
const secret = process.env.JWT_SECRET ?? 'dev-only-secret-change-me-dev-only-secret'
if (process.env.NODE_ENV === 'production' && secret.startsWith('dev-only')) {
  throw new Error('Set JWT_SECRET to a long random value in production.')
}

const dataDir = process.env.PGLITE_DIR ?? '.data/ledgerly'
if (!process.env.DATABASE_URL) mkdirSync(dirname(dataDir), { recursive: true })

// DATABASE_URL points at real PostgreSQL; without it the API runs on PGlite (Postgres in WASM), stored under ./.data
const db = process.env.DATABASE_URL ? createPgDb(process.env.DATABASE_URL) : await createPgliteDb(dataDir)
const applied = await migrate(db)
const services = createServices(db, { jwtSecret: secret })
if (process.env.SEED_DEMO !== 'false' && !(await isSeeded(db))) {
  const r = await seedDemo(services, { today: realToday(), withPayrollHistory: true })
  console.log(`Seeded demo data: ${r.employees} employees, ${r.runs} payroll runs`)
}

createApp(services, { corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:5173').split(',') }).listen(port, () => {
  console.log(`Ledgerly API on http://localhost:${port} (${applied} migration(s) applied, ${process.env.DATABASE_URL ? 'PostgreSQL' : 'PGlite'})`)
})
