import { z } from 'zod'
import { can, ensure, type Actor } from '../authz'
import type { Db } from '../db/types'
import { notFound, unprocessable } from '../errors'
import type { TimesheetEntry } from '../types'
import { record } from './audit'

const entries = z
  .array(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), hours: z.number().min(0).max(24) }))
  .max(62)

export function createTimesheets(db: Db) {
  return {
    async list(actor: Actor, employeeId: string, from: string, to: string): Promise<TimesheetEntry[]> {
      ensure(can.editTimesheet(actor, employeeId), 'You cannot view that timesheet.')
      const rows = await db.query<{ work_date: string; hours: number }>(
        'SELECT work_date, hours FROM timesheet_entries WHERE employee_id = $1 AND work_date BETWEEN $2 AND $3 ORDER BY work_date',
        [employeeId, from, to],
      )
      return rows.map((r) => ({ date: r.work_date, hours: r.hours }))
    },

    async save(actor: Actor, employeeId: string, input: unknown): Promise<void> {
      ensure(can.editTimesheet(actor, employeeId), 'You cannot edit that timesheet.')
      const parsed = entries.safeParse(input)
      if (!parsed.success) throw unprocessable('Hours must be between 0 and 24 for each day.')
      const emp = await db.query<{ pay_type: string }>('SELECT pay_type FROM employees WHERE id = $1', [employeeId])
      if (!emp[0]) throw notFound('Employee')
      if (emp[0].pay_type !== 'hourly') throw unprocessable('Timesheets apply to hourly employees only.')
      // a day already paid in a committed payroll run is frozen
      const dates = parsed.data.map((e) => e.date)
      if (dates.length) {
        const locked = await db.query(
          `SELECT 1 FROM payroll_runs r JOIN paychecks p ON p.run_id = r.id
            WHERE p.employee_id = $1 AND r.period_start <= $3 AND r.period_end >= $2 LIMIT 1`,
          [employeeId, [...dates].sort()[0], [...dates].sort().at(-1)],
        )
        if (locked.length && actor.role !== 'hr_admin') throw unprocessable('That period has already been paid. Ask HR to correct it.')
      }
      await db.transaction(async (tx) => {
        for (const e of parsed.data) {
          await tx.query(
            `INSERT INTO timesheet_entries (employee_id, work_date, hours) VALUES ($1, $2, $3)
             ON CONFLICT (employee_id, work_date) DO UPDATE SET hours = EXCLUDED.hours`,
            [employeeId, e.date, e.hours],
          )
        }
        await record(tx, actor.employeeId, 'timesheet.save', 'employee', employeeId, { days: parsed.data.length })
      })
    },
  }
}
