import type { Role } from '@ledgerly/domain'
import { forbidden } from './errors'

export interface Actor {
  userId: string
  employeeId: string
  role: Role
}

/**
 * Every permission decision lives here so it can be read, and tested, in one place.
 * Services call these before touching data.
 */
export const can = {
  /** Full record (compensation, tax details): the person themselves, or HR. Managers do not see reports' pay. */
  readEmployeeRecord: (a: Actor, employeeId: string) => a.role === 'hr_admin' || a.employeeId === employeeId,
  editEmployee: (a: Actor) => a.role === 'hr_admin',
  runPayroll: (a: Actor) => a.role === 'hr_admin',
  readAudit: (a: Actor) => a.role === 'hr_admin',
  readPaycheck: (a: Actor, employeeId: string) => a.role === 'hr_admin' || a.employeeId === employeeId,
  editTimesheet: (a: Actor, employeeId: string) => a.role === 'hr_admin' || a.employeeId === employeeId,
  /** Whose leave requests can this actor see? */
  readLeaveOf: (a: Actor, employeeId: string, managerOfEmployee: string | null) =>
    a.role === 'hr_admin' || a.employeeId === employeeId || (a.role === 'manager' && managerOfEmployee === a.employeeId),
}

export function ensure(ok: boolean, message?: string): asserts ok {
  if (!ok) throw forbidden(message)
}
