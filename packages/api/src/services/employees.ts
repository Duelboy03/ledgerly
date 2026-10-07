import { z } from 'zod'
import { can, ensure, type Actor } from '../authz'
import { camel, camelAll, type Db } from '../db/types'
import { notFound, unprocessable } from '../errors'
import type { Compensation, DirectoryEntry, EmployeeDetail } from '../types'
import { record } from './audit'

const SELECT = `SELECT e.id, e.name, e.email, e.title, e.department, e.manager_id, m.name AS manager_name,
                       e.hire_date, e.status, e.pay_type, e.annual_salary_cents, e.hourly_rate_cents,
                       e.pay_frequency, e.filing_status, e.state, e.k401_pct, e.health_premium_cents
                  FROM employees e LEFT JOIN employees m ON m.id = e.manager_id`

type Full = DirectoryEntry & Compensation

function toDirectory(row: Full): DirectoryEntry {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    title: row.title,
    department: row.department,
    managerId: row.managerId,
    managerName: row.managerName,
    hireDate: row.hireDate,
    status: row.status,
  }
}

function split(row: Full, viewer: Actor): EmployeeDetail {
  const { payType, annualSalaryCents, hourlyRateCents, payFrequency, filingStatus, state, k401Pct, healthPremiumCents } = row
  return {
    ...toDirectory(row),
    compensation: can.readEmployeeRecord(viewer, row.id)
      ? { payType, annualSalaryCents, hourlyRateCents, payFrequency, filingStatus, state, k401Pct, healthPremiumCents }
      : null,
  }
}

export const compensationPatch = z
  .object({
    title: z.string().trim().min(1).max(80),
    department: z.string().trim().min(1).max(60),
    payType: z.enum(['salary', 'hourly']),
    annualSalaryCents: z.number().int().min(0).max(100_000_000),
    hourlyRateCents: z.number().int().min(0).max(1_000_000),
    payFrequency: z.enum(['weekly', 'biweekly', 'semimonthly', 'monthly']),
    filingStatus: z.enum(['single', 'married']),
    state: z.string().trim().length(2).toUpperCase(),
    k401Pct: z.number().min(0).max(100),
    healthPremiumCents: z.number().int().min(0).max(5_000_00),
  })
  .partial()
  .strict()

const COLUMN: Record<string, string> = {
  title: 'title',
  department: 'department',
  payType: 'pay_type',
  annualSalaryCents: 'annual_salary_cents',
  hourlyRateCents: 'hourly_rate_cents',
  payFrequency: 'pay_frequency',
  filingStatus: 'filing_status',
  state: 'state',
  k401Pct: 'k401_pct',
  healthPremiumCents: 'health_premium_cents',
}

export function createEmployees(db: Db) {
  return {
    /** Names, titles and departments are visible to everyone; pay is not. */
    async directory(_actor: Actor): Promise<DirectoryEntry[]> {
      const rows = await db.query(`${SELECT} ORDER BY e.name`)
      return camelAll<Full>(rows).map(toDirectory)
    },

    async get(actor: Actor, id: string): Promise<EmployeeDetail> {
      const rows = await db.query(`${SELECT} WHERE e.id = $1`, [id]).catch(() => [])
      if (!rows[0]) throw notFound('Employee')
      return split(camel<Full>(rows[0]), actor)
    },

    async update(actor: Actor, id: string, input: unknown): Promise<EmployeeDetail> {
      ensure(can.editEmployee(actor), 'Only HR can edit employee records.')
      const parsed = compensationPatch.safeParse(input)
      if (!parsed.success) throw unprocessable('Check the highlighted fields.', z.flattenError(parsed.error).fieldErrors)
      const patch = parsed.data
      const keys = Object.keys(patch) as (keyof typeof patch)[]
      if (keys.length === 0) return this.get(actor, id)
      const before = await this.get(actor, id)
      const sets = keys.map((k, i) => `${COLUMN[k]} = $${i + 2}`).join(', ')
      await db.query(`UPDATE employees SET ${sets} WHERE id = $1`, [id, ...keys.map((k) => patch[k])])
      const changed = Object.fromEntries(
        keys.map((k) => [k, { from: (before.compensation as unknown as Record<string, unknown>)?.[k] ?? (before as unknown as Record<string, unknown>)[k], to: patch[k] }]),
      )
      await record(db, actor.employeeId, 'employee.update', 'employee', id, { changed })
      return this.get(actor, id)
    },
  }
}
