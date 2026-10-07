import { beforeAll, describe, expect, it } from 'vitest'
import { AppError } from './errors'
import { makeWorld } from './testkit'

type World = Awaited<ReturnType<typeof makeWorld>>
let w: World

beforeAll(async () => {
  w = await makeWorld({ payrollHistory: true })
}, 120_000)

const status = async (p: Promise<unknown>) =>
  p.then(
    () => 0,
    (e) => (e instanceof AppError ? e.status : -1),
  )

describe('payroll runs', () => {
  it('seeded a history of committed runs and left the latest periods open', async () => {
    const hr = await w.as('hr')
    const runs = await hr.payrollRuns()
    expect(runs.length).toBeGreaterThan(15)
    const periods = await hr.payrollPeriods('biweekly', 2026)
    const open = periods.filter((p) => p.closed && !p.runId)
    expect(open).toHaveLength(1)
  })

  it('previews the open period without saving anything', async () => {
    const hr = await w.as('hr')
    const open = (await hr.payrollPeriods('biweekly', 2026)).find((p) => p.closed && !p.runId)!
    const before = (await hr.payrollRuns()).length
    const preview = await hr.previewPayroll('biweekly', open.start)
    expect(preview.rows.length).toBe(12)
    expect(preview.totals.gross).toBe(preview.rows.reduce((a, r) => a + r.paycheck.grossCents, 0))
    expect((await hr.payrollRuns()).length).toBe(before)
  })

  it('every paycheck in a run balances: net + deductions + taxes = gross', async () => {
    const hr = await w.as('hr')
    const run = await hr.payrollRun((await hr.payrollRuns())[0].id)
    for (const r of run.rows) {
      const p = r.paycheck
      expect(p.netCents + p.preTaxCents + p.taxCents).toBe(p.grossCents)
    }
  })

  it('carries year-to-date totals forward: later paychecks reflect earlier ones', async () => {
    const hr = await w.as('hr')
    const meera = await w.as('employee')
    const checks = await meera.myPaychecks()
    expect(checks.length).toBeGreaterThan(10)
    const latest = await meera.paycheck(checks[0].id)
    expect(latest.ytd.grossCents).toBeGreaterThan(latest.grossCents * (checks.length - 1))
    expect(latest.paycheck.earnings[0].label).toBe('Salary')
    expect(hr).toBeTruthy()
  })

  it('pays hourly staff from their timesheets, including overtime weeks', async () => {
    const hr = await w.as('hr')
    const runs = await hr.payrollRuns()
    let sawOvertime = false
    for (const r of runs.filter((x) => x.frequency === 'biweekly').slice(0, 8)) {
      const detail = await hr.payrollRun(r.id)
      const ava = detail.rows.find((x) => x.name === 'Ava Thompson')
      if (ava?.paycheck.hours.overtime) sawOvertime = true
      if (ava) expect(ava.paycheck.hours.regular).toBeGreaterThan(40)
    }
    expect(sawOvertime).toBe(true)
  })

  it('deducts approved unpaid leave from a salaried employee’s pay', async () => {
    const hr = await w.as('hr')
    let found = false
    for (const r of await hr.payrollRuns()) {
      const noah = (await hr.payrollRun(r.id)).rows.find((x) => x.name === 'Noah Patel')
      if (noah?.paycheck.earnings.some((l) => l.code === 'UNPAID')) found = true
    }
    expect(found).toBe(true)
  })

  it('prorates a new hire in their first period and leaves them out of earlier ones', async () => {
    const hr = await w.as('hr')
    const biweekly = (await hr.payrollRuns()).filter((r) => r.frequency === 'biweekly')
    const appearances: { run: string; gross: number; notes: string[] }[] = []
    for (const r of biweekly) {
      const ella = (await hr.payrollRun(r.id)).rows.find((x) => x.name === 'Ella Rossi')
      if (ella) appearances.push({ run: r.periodStart, gross: ella.paycheck.grossCents, notes: ella.paycheck.notes })
    }
    appearances.sort((a, b) => a.run.localeCompare(b.run))
    expect(appearances.length).toBeGreaterThan(0)
    expect(appearances[0].notes.join(' ')).toMatch(/Prorated/)
    expect(appearances[0].gross).toBeLessThan(appearances.at(-1)!.gross)
    expect(biweekly.length).toBeGreaterThan(appearances.length)
  })

  it('commits the open period once and refuses a duplicate', async () => {
    const hr = await w.as('hr')
    const open = (await hr.payrollPeriods('biweekly', 2026)).find((p) => p.closed && !p.runId)!
    const run = await hr.commitPayroll('biweekly', open.start)
    expect(run.totals.headcount).toBe(12)
    expect(await status(hr.commitPayroll('biweekly', open.start))).toBe(409)
    const periods = await hr.payrollPeriods('biweekly', 2026)
    expect(periods.find((p) => p.start === open.start)?.runId).toBe(run.id)
  })

  it('will not run a period that has not closed or does not exist', async () => {
    const hr = await w.as('hr')
    const future = (await hr.payrollPeriods('biweekly', 2026)).at(-1)!
    expect(await status(hr.commitPayroll('biweekly', future.start))).toBe(422)
    expect(await status(hr.commitPayroll('biweekly', '2026-02-03'))).toBe(422)
  })

  it('records the commit in the audit log', async () => {
    const hr = await w.as('hr')
    expect((await hr.auditLog()).some((a) => a.action === 'payroll.commit')).toBe(true)
  })
})

describe('payroll access control', () => {
  it('keeps payroll operations away from managers and employees', async () => {
    const arjun = await w.as('manager')
    const meera = await w.as('employee')
    for (const who of [arjun, meera]) {
      expect(await status(who.payrollRuns())).toBe(403)
      expect(await status(who.previewPayroll('biweekly', '2026-01-05'))).toBe(403)
      expect(await status(who.commitPayroll('biweekly', '2026-01-05'))).toBe(403)
    }
  })

  it('lets an employee read their own paycheck only, and hides other ids behind "not found"', async () => {
    const meera = await w.as('employee')
    const liam = await w.as('liam.chen@northwind.test')
    const mine = (await meera.myPaychecks())[0]
    expect((await meera.paycheck(mine.id)).employeeName).toBe('Meera Kapoor')
    expect(await status(liam.paycheck(mine.id))).toBe(404)
    expect(await status(meera.paycheck('00000000-0000-0000-0000-000000000000'))).toBe(404)
    expect(await status(meera.paycheck('not-a-uuid'))).toBe(404)
  })

  it('lets HR read any paycheck', async () => {
    const hr = await w.as('hr')
    const meera = await w.as('employee')
    const id = (await meera.myPaychecks())[0].id
    expect((await hr.paycheck(id)).employeeName).toBe('Meera Kapoor')
  })
})
