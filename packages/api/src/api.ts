import type { Balance, LeaveAction, PayFrequency } from '@ledgerly/domain'
import type { Actor } from './authz'
import type {
  AuditEntry,
  CalendarEntry,
  DirectoryEntry,
  EmployeeDetail,
  LeaveRequestView,
  LeaveValidation,
  Meta,
  PaycheckDetail,
  PaycheckSummary,
  PayrollPreview,
  PayrollRunDetail,
  PayrollRunSummary,
  PeriodStatus,
  SessionUser,
  TimesheetEntry,
} from './types'
import type { Services } from './services'

export interface LeaveDraftInput {
  type: 'vacation' | 'sick' | 'personal' | 'unpaid'
  startDate: string
  endDate: string
  reason?: string
}

/** The contract the web app codes against. One implementation talks HTTP, the other calls the services directly (demo mode). */
export interface LedgerlyApi {
  login(email: string, password: string): Promise<{ token: string; user: SessionUser }>
  logout(): void
  me(): Promise<SessionUser>
  meta(): Promise<Meta>
  directory(): Promise<DirectoryEntry[]>
  employee(id: string): Promise<EmployeeDetail>
  updateEmployee(id: string, patch: Record<string, unknown>): Promise<EmployeeDetail>
  balances(employeeId?: string): Promise<Balance[]>
  leaveRequests(scope?: 'mine' | 'team' | 'all'): Promise<LeaveRequestView[]>
  approvals(): Promise<LeaveRequestView[]>
  validateLeave(draft: LeaveDraftInput): Promise<LeaveValidation>
  createLeave(draft: LeaveDraftInput): Promise<LeaveRequestView>
  decideLeave(id: string, action: LeaveAction, note?: string): Promise<LeaveRequestView>
  calendar(month: string): Promise<{ entries: CalendarEntry[]; holidays: { date: string; name: string }[] }>
  timesheet(employeeId: string, from: string, to: string): Promise<TimesheetEntry[]>
  saveTimesheet(employeeId: string, entries: TimesheetEntry[]): Promise<void>
  payrollPeriods(frequency: PayFrequency, year: number): Promise<PeriodStatus[]>
  previewPayroll(frequency: PayFrequency, periodStart: string): Promise<PayrollPreview>
  commitPayroll(frequency: PayFrequency, periodStart: string): Promise<PayrollRunSummary>
  payrollRuns(): Promise<PayrollRunSummary[]>
  payrollRun(id: string): Promise<PayrollRunDetail>
  myPaychecks(): Promise<PaycheckSummary[]>
  paycheck(id: string): Promise<PaycheckDetail>
  auditLog(): Promise<AuditEntry[]>
}

/** Demo-mode client: same authentication path as the server (signed token, re-checked on every call). */
export class LocalApi implements LedgerlyApi {
  private token: string | undefined
  constructor(private s: Services, initialToken?: string) {
    this.token = initialToken
  }

  getToken() {
    return this.token
  }

  private async actor(): Promise<Actor> {
    return (await this.s.auth.authenticate(this.token)).actor
  }

  async login(email: string, password: string) {
    const r = await this.s.auth.login(email, password)
    this.token = r.token
    return r
  }
  logout() {
    this.token = undefined
  }
  async me() {
    return (await this.s.auth.authenticate(this.token)).user
  }
  meta() {
    return this.s.meta()
  }
  async directory() {
    return this.s.employees.directory(await this.actor())
  }
  async employee(id: string) {
    return this.s.employees.get(await this.actor(), id)
  }
  async updateEmployee(id: string, patch: Record<string, unknown>) {
    return this.s.employees.update(await this.actor(), id, patch)
  }
  async balances(employeeId?: string) {
    return this.s.leave.balances(await this.actor(), employeeId)
  }
  async leaveRequests(scope: 'mine' | 'team' | 'all' = 'mine') {
    return this.s.leave.list(await this.actor(), scope)
  }
  async approvals() {
    return this.s.leave.approvals(await this.actor())
  }
  async validateLeave(draft: LeaveDraftInput) {
    return this.s.leave.validate(await this.actor(), draft)
  }
  async createLeave(draft: LeaveDraftInput) {
    return this.s.leave.create(await this.actor(), draft)
  }
  async decideLeave(id: string, action: LeaveAction, note?: string) {
    return this.s.leave.decide(await this.actor(), id, action, note)
  }
  async calendar(month: string) {
    return this.s.leave.calendar(await this.actor(), month)
  }
  async timesheet(employeeId: string, from: string, to: string) {
    return this.s.timesheets.list(await this.actor(), employeeId, from, to)
  }
  async saveTimesheet(employeeId: string, entries: TimesheetEntry[]) {
    return this.s.timesheets.save(await this.actor(), employeeId, entries)
  }
  async payrollPeriods(frequency: PayFrequency, year: number) {
    return this.s.payroll.periods(await this.actor(), frequency, year)
  }
  async previewPayroll(frequency: PayFrequency, periodStart: string) {
    return this.s.payroll.preview(await this.actor(), { frequency, periodStart })
  }
  async commitPayroll(frequency: PayFrequency, periodStart: string) {
    return this.s.payroll.commit(await this.actor(), { frequency, periodStart })
  }
  async payrollRuns() {
    return this.s.payroll.runs(await this.actor())
  }
  async payrollRun(id: string) {
    return this.s.payroll.run(await this.actor(), id)
  }
  async myPaychecks() {
    return this.s.payroll.myPaychecks(await this.actor())
  }
  async paycheck(id: string) {
    return this.s.payroll.paycheck(await this.actor(), id)
  }
  async auditLog() {
    return this.s.audit.list(await this.actor())
  }
}
