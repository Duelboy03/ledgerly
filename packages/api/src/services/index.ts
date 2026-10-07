import type { ISODate } from '@ledgerly/domain'
import { camelAll, type Db } from '../db/types'
import type { Meta } from '../types'
import type { LeavePolicy } from '@ledgerly/domain'
import { createAudit } from './audit'
import { createAuth, type AuthConfig } from './auth'
import { createEmployees } from './employees'
import { createLeave } from './leave'
import { createPayroll } from './payroll'
import { createTimesheets } from './timesheets'

export interface ServiceConfig extends AuthConfig {
  /** injectable clock: tests pin it, the app uses the real date */
  today?: () => ISODate
}

export const realToday = (): ISODate => new Date().toISOString().slice(0, 10)

export function createServices(db: Db, cfg: ServiceConfig) {
  const clock = { today: cfg.today ?? realToday }
  return {
    db,
    clock,
    auth: createAuth(db, cfg),
    employees: createEmployees(db),
    leave: createLeave(db, clock),
    payroll: createPayroll(db, clock),
    timesheets: createTimesheets(db),
    audit: createAudit(db),
    async meta(): Promise<Meta> {
      const holidays = await db.query<{ date: string; name: string }>('SELECT date, name FROM holidays ORDER BY date')
      const policies = camelAll<LeavePolicy>(await db.query('SELECT type, annual_days, max_balance, paid, min_notice_days FROM leave_policies ORDER BY type'))
      return { today: clock.today(), holidays, policies }
    },
  }
}

export type Services = ReturnType<typeof createServices>
