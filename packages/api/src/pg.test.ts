import { PGlite } from '@electric-sql/pglite'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { LocalApi } from './api'
import { migrate } from './db/migrations'
import { createPgDb } from './db/pg'
import { DEMO_PASSWORD, seedDemo } from './seed'
import { createServices } from './services'
import { TODAY } from './testkit'

/**
 * The production path uses the `pg` driver. To exercise it without installing PostgreSQL, a real
 * Postgres engine (PGlite) is exposed over the wire protocol and the same services run through `pg`.
 */
let server: PGLiteSocketServer
let backing: PGlite
let db: ReturnType<typeof createPgDb>
let api: LocalApi

beforeAll(async () => {
  backing = await PGlite.create()
  server = new PGLiteSocketServer({ db: backing, port: 54329, host: '127.0.0.1' })
  await server.start()
  db = createPgDb('postgres://postgres:postgres@127.0.0.1:54329/postgres', { max: 1 })
  expect(await migrate(db)).toBe(1)
  const services = createServices(db, { jwtSecret: 'pg-test-secret-pg-test-secret-pg-test', bcryptRounds: 4, today: () => TODAY })
  await seedDemo(services, { today: TODAY, withPayrollHistory: true })
  api = new LocalApi(services)
  await api.login('priya.raman@northwind.test', DEMO_PASSWORD)
}, 120_000)

afterAll(async () => {
  await db.close()
  await server.stop()
  await backing.close()
})

describe('PostgreSQL via the pg driver', () => {
  it('migrates once and is idempotent', async () => {
    expect(await migrate(db)).toBe(0)
  })
  it('returns DATE columns as plain strings and timestamps as ISO strings', async () => {
    const dir = await api.directory()
    expect(dir[0].hireDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    const log = await api.auditLog()
    expect(log[0].at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })
  it('runs payroll end to end, including the transactional commit', async () => {
    const periods = await api.payrollPeriods('biweekly', 2026)
    const open = periods.find((p) => p.closed && !p.runId)!
    const run = await api.commitPayroll('biweekly', open.start)
    expect(run.totals.headcount).toBe(12)
    await expect(api.commitPayroll('biweekly', open.start)).rejects.toMatchObject({ status: 409 })
  })
  it('runs the leave workflow, including the row lock used when deciding', async () => {
    const queue = await api.approvals()
    const r = queue[0]
    const done = await api.decideLeave(r.id, 'approve', 'ok')
    expect(done.status).toBe('approved')
  })
  it('rolls back a failed transaction', async () => {
    await expect(
      db.transaction(async (tx) => {
        await tx.query("INSERT INTO holidays (date, name) VALUES ('2030-01-01', 'Rollback me')")
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')
    expect(await db.query("SELECT 1 FROM holidays WHERE date = '2030-01-01'")).toHaveLength(0)
  })
})
