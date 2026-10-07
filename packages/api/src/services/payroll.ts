import {
  addToYtd,
  computePaycheck,
  EMPTY_YTD,
  periodsFor,
  year,
  type ISODate,
  type PayEmployee,
  type PayFrequency,
  type PayPeriod,
  type Paycheck,
  type Ytd,
} from '@ledgerly/domain'
import { z } from 'zod'
import { can, ensure, type Actor } from '../authz'
import { camel, camelAll, type Db } from '../db/types'
import { conflict, notFound, unprocessable } from '../errors'
import type {
  PaycheckDetail,
  PaycheckSummary,
  PayrollPreview,
  PayrollRunDetail,
  PayrollRunSummary,
  PayrollTotals,
  PeriodStatus,
  PreviewRow,
} from '../types'
import { record } from './audit'
import type { Clock } from './leave'
import { createLeave } from './leave'

const frequencySchema = z.enum(['weekly', 'biweekly', 'semimonthly', 'monthly'])
const periodInput = z.object({ frequency: frequencySchema, periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })

interface EmpPayRow extends PayEmployee {
  name: string
  department: string
}

const sumTotals = (rows: PreviewRow[]): PayrollTotals => ({
  gross: rows.reduce((a, r) => a + r.paycheck.grossCents, 0),
  net: rows.reduce((a, r) => a + r.paycheck.netCents, 0),
  taxes: rows.reduce((a, r) => a + r.paycheck.taxCents, 0),
  preTax: rows.reduce((a, r) => a + r.paycheck.preTaxCents, 0),
  employerCost: rows.reduce((a, r) => a + r.paycheck.employerCostCents, 0),
  headcount: rows.length,
})

export function createPayroll(db: Db, clock: Clock) {
  const leave = createLeave(db, clock)

  function resolvePeriod(input: unknown): { frequency: PayFrequency; period: PayPeriod } {
    const p = periodInput.safeParse(input)
    if (!p.success) throw unprocessable('Choose a pay frequency and period.')
    const period = periodsFor(p.data.frequency, year(p.data.periodStart)).find((x) => x.start === p.data.periodStart)
    if (!period) throw unprocessable('That is not a pay period for this schedule.')
    if (period.end >= clock.today()) throw unprocessable('That pay period has not closed yet.')
    return { frequency: p.data.frequency, period }
  }

  async function build(q: Db, frequency: PayFrequency, period: PayPeriod): Promise<PayrollPreview> {
    const employees = camelAll<EmpPayRow>(
      await q.query(
        `SELECT id, name, department, pay_type, annual_salary_cents, hourly_rate_cents, pay_frequency, filing_status,
                state, k401_pct, health_premium_cents, hire_date
           FROM employees WHERE status = 'active' AND pay_frequency = $1 AND hire_date <= $2 ORDER BY name`,
        [frequency, period.end],
      ),
    )
    const holidays = new Set((await q.query<{ date: string }>('SELECT date FROM holidays')).map((h) => h.date))
    const unpaid = await leave.unpaidDaysInPeriod(period.start, period.end, q)

    // year-to-date totals from every earlier committed paycheck this year, in one query
    const prior = await q.query<{ employee_id: string; data: Paycheck }>(
      `SELECT p.employee_id, p.data FROM paychecks p JOIN payroll_runs r ON r.id = p.run_id
        WHERE r.pay_date >= $1 AND r.pay_date < $2 ORDER BY r.pay_date`,
      [`${year(period.payDate)}-01-01`, period.payDate],
    )
    const ytd = new Map<string, Ytd>()
    for (const r of prior) ytd.set(r.employee_id, addToYtd(ytd.get(r.employee_id) ?? EMPTY_YTD, r.data))

    const hours = await q.query<{ employee_id: string; work_date: string; hours: number }>(
      'SELECT employee_id, work_date, hours FROM timesheet_entries WHERE work_date BETWEEN $1 AND $2',
      [period.start, period.end],
    )
    const hoursBy = new Map<string, Record<ISODate, number>>()
    for (const h of hours) {
      const m = hoursBy.get(h.employee_id) ?? {}
      m[h.work_date] = h.hours
      hoursBy.set(h.employee_id, m)
    }

    const warnings: string[] = []
    const rows: PreviewRow[] = employees.map((e) => {
      const paycheck = computePaycheck({
        employee: e,
        period,
        holidays,
        hoursByDate: hoursBy.get(e.id) ?? {},
        unpaidLeaveDays: unpaid.get(e.id) ?? 0,
        ytd: ytd.get(e.id),
      })
      if (e.payType === 'hourly' && paycheck.hours.regular + paycheck.hours.overtime === 0)
        warnings.push(`${e.name} is hourly but has no hours recorded for this period.`)
      return { employeeId: e.id, name: e.name, department: e.department, paycheck }
    })
    return { frequency, period, rows, totals: sumTotals(rows), warnings }
  }

  async function runSummary(id: string, q: Db = db): Promise<PayrollRunSummary> {
    const run = (await q.query('SELECT id, frequency, period_start, period_end, pay_date, created_at FROM payroll_runs WHERE id = $1', [id]))[0]
    if (!run) throw notFound('Payroll run')
    const t = (
      await q.query<Record<string, number>>(
        `SELECT count(*)::int AS headcount, coalesce(sum(gross_cents),0)::int AS gross, coalesce(sum(net_cents),0)::int AS net,
                coalesce(sum(employer_cost_cents),0)::int AS employer_cost,
                coalesce(sum((data->>'taxCents')::int),0)::int AS taxes, coalesce(sum((data->>'preTaxCents')::int),0)::int AS pre_tax
           FROM paychecks WHERE run_id = $1`,
        [id],
      )
    )[0]
    return {
      ...camel<Omit<PayrollRunSummary, 'totals'>>(run),
      totals: { gross: t.gross, net: t.net, taxes: t.taxes, preTax: t.pre_tax, employerCost: t.employer_cost, headcount: t.headcount },
    }
  }

  return {
    async periods(actor: Actor, frequency: string, y: number): Promise<PeriodStatus[]> {
      ensure(can.runPayroll(actor), 'Only HR can view payroll periods.')
      const f = frequencySchema.parse(frequency)
      const runs = await db.query<{ id: string; period_start: string }>('SELECT id, period_start FROM payroll_runs WHERE frequency = $1', [f])
      const byStart = new Map(runs.map((r) => [r.period_start, r.id]))
      return periodsFor(f, y)
        .filter((p) => p.start <= clock.today())
        .map((p) => ({ ...p, frequency: f, closed: p.end < clock.today(), runId: byStart.get(p.start) ?? null }))
    },

    async preview(actor: Actor, input: unknown): Promise<PayrollPreview> {
      ensure(can.runPayroll(actor), 'Only HR can run payroll.')
      const { frequency, period } = resolvePeriod(input)
      return build(db, frequency, period)
    },

    async commit(actor: Actor, input: unknown): Promise<PayrollRunSummary> {
      ensure(can.runPayroll(actor), 'Only HR can run payroll.')
      const { frequency, period } = resolvePeriod(input)
      const id = await db.transaction(async (tx) => {
        const exists = await tx.query('SELECT 1 FROM payroll_runs WHERE frequency = $1 AND period_start = $2 AND period_end = $3', [frequency, period.start, period.end])
        if (exists.length) throw conflict('Payroll has already been run for that period.')
        // periods must be paid in order, otherwise year-to-date limits would be wrong
        const earlier = await tx.query(
          'SELECT 1 FROM payroll_runs WHERE frequency = $1 AND period_start > $2 LIMIT 1',
          [frequency, period.start],
        )
        if (earlier.length) throw conflict('A later period has already been paid. Periods must be run in order.')
        const preview = await build(tx, frequency, period)
        if (preview.rows.length === 0) throw unprocessable('No employees are due pay in that period.')
        const run = await tx.query<{ id: string }>(
          `INSERT INTO payroll_runs (frequency, period_start, period_end, pay_date, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [frequency, period.start, period.end, period.payDate, actor.employeeId],
        )
        for (const r of preview.rows) {
          await tx.query(
            `INSERT INTO paychecks (run_id, employee_id, gross_cents, net_cents, employer_cost_cents, data) VALUES ($1, $2, $3, $4, $5, $6)`,
            [run[0].id, r.employeeId, r.paycheck.grossCents, r.paycheck.netCents, r.paycheck.employerCostCents, JSON.stringify(r.paycheck)],
          )
        }
        await record(tx, actor.employeeId, 'payroll.commit', 'payroll_run', run[0].id, {
          frequency,
          period: period.start,
          headcount: preview.rows.length,
          gross: preview.totals.gross,
        })
        return run[0].id
      })
      return runSummary(id)
    },

    async runs(actor: Actor): Promise<PayrollRunSummary[]> {
      ensure(can.runPayroll(actor), 'Only HR can view payroll runs.')
      const ids = await db.query<{ id: string }>('SELECT id FROM payroll_runs ORDER BY pay_date DESC, created_at DESC LIMIT 60')
      return Promise.all(ids.map((r) => runSummary(r.id)))
    },

    async run(actor: Actor, id: string): Promise<PayrollRunDetail> {
      ensure(can.runPayroll(actor), 'Only HR can view payroll runs.')
      const summary = await runSummary(id)
      const rows = await db.query<{ id: string; employee_id: string; name: string; department: string; data: Paycheck }>(
        `SELECT p.id, p.employee_id, e.name, e.department, p.data FROM paychecks p JOIN employees e ON e.id = p.employee_id
          WHERE p.run_id = $1 ORDER BY e.name`,
        [id],
      )
      return {
        ...summary,
        rows: rows.map((r) => ({ paycheckId: r.id, employeeId: r.employee_id, name: r.name, department: r.department, paycheck: r.data })),
      }
    },

    async myPaychecks(actor: Actor): Promise<PaycheckSummary[]> {
      const rows = await db.query(
        `SELECT p.id, r.pay_date, r.period_start, r.period_end, p.gross_cents, p.net_cents
           FROM paychecks p JOIN payroll_runs r ON r.id = p.run_id WHERE p.employee_id = $1 ORDER BY r.pay_date DESC`,
        [actor.employeeId],
      )
      return camelAll<PaycheckSummary>(rows)
    },

    async paycheck(actor: Actor, id: string): Promise<PaycheckDetail> {
      const rows = await db.query(
        `SELECT p.id, p.employee_id, e.name AS employee_name, r.pay_date, r.period_start, r.period_end,
                p.gross_cents, p.net_cents, p.data
           FROM paychecks p JOIN payroll_runs r ON r.id = p.run_id JOIN employees e ON e.id = p.employee_id WHERE p.id = $1`,
        [id],
      ).catch(() => [])
      if (!rows[0]) throw notFound('Paycheck')
      const row = camel<PaycheckSummary & { employeeId: string; employeeName: string; data: Paycheck }>(rows[0])
      // answer "not found" rather than "forbidden" so ids cannot be probed
      if (!can.readPaycheck(actor, row.employeeId)) throw notFound('Paycheck')
      const ytd = await db.query<{ gross: number; net: number }>(
        `SELECT coalesce(sum(p.gross_cents),0)::int AS gross, coalesce(sum(p.net_cents),0)::int AS net
           FROM paychecks p JOIN payroll_runs r ON r.id = p.run_id
          WHERE p.employee_id = $1 AND r.pay_date <= $2 AND r.pay_date >= $3`,
        [row.employeeId, row.payDate, `${year(row.payDate)}-01-01`],
      )
      const { data, ...rest } = row
      return { ...rest, paycheck: data, ytd: { grossCents: ytd[0].gross, netCents: ytd[0].net } }
    },
  }
}
