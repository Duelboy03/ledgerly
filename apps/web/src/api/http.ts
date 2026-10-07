import type { Balance, LeaveAction, PayFrequency } from '@ledgerly/domain'
import type {
  AuditEntry,
  CalendarEntry,
  DirectoryEntry,
  EmployeeDetail,
  LeaveDraftInput,
  LeaveRequestView,
  LeaveValidation,
  LedgerlyApi,
  Meta,
  PaycheckDetail,
  PaycheckSummary,
  PayrollPreview,
  PayrollRunDetail,
  PayrollRunSummary,
  PeriodStatus,
  SessionUser,
  TimesheetEntry,
} from '@ledgerly/api'

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message)
  }
}

const TOKEN_KEY = 'ledgerly:token'

/** Talks to the Express API. */
export class HttpApi implements LedgerlyApi {
  constructor(private base = import.meta.env.VITE_API_URL ?? '/api') {}

  private get token() {
    try {
      return sessionStorage.getItem(TOKEN_KEY) ?? undefined
    } catch {
      return undefined
    }
  }

  private async req<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.base}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    }).catch(() => {
      throw new ApiError(0, 'network', 'Cannot reach the server. Is the API running?')
    })
    if (res.status === 204) return undefined as T
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw new ApiError(res.status, json.error?.code ?? 'error', json.error?.message ?? res.statusText, json.error?.details)
    return json as T
  }

  async login(email: string, password: string) {
    const r = await this.req<{ token: string; user: SessionUser }>('POST', '/auth/login', { email, password })
    try {
      sessionStorage.setItem(TOKEN_KEY, r.token)
    } catch {
      /* session storage unavailable: the user will need to sign in again after a reload */
    }
    return r
  }
  logout() {
    try {
      sessionStorage.removeItem(TOKEN_KEY)
    } catch {
      /* nothing to clear */
    }
  }
  me = () => this.req<SessionUser>('GET', '/me')
  meta = () => this.req<Meta>('GET', '/meta')
  directory = () => this.req<DirectoryEntry[]>('GET', '/employees')
  employee = (id: string) => this.req<EmployeeDetail>('GET', `/employees/${id}`)
  updateEmployee = (id: string, patch: Record<string, unknown>) => this.req<EmployeeDetail>('PATCH', `/employees/${id}`, patch)
  balances = (employeeId?: string) => this.req<Balance[]>('GET', `/leave/balances${employeeId ? `?employeeId=${employeeId}` : ''}`)
  leaveRequests = (scope: 'mine' | 'team' | 'all' = 'mine') => this.req<LeaveRequestView[]>('GET', `/leave/requests?scope=${scope}`)
  approvals = () => this.req<LeaveRequestView[]>('GET', '/leave/approvals')
  validateLeave = (d: LeaveDraftInput) => this.req<LeaveValidation>('POST', '/leave/requests/validate', d)
  createLeave = (d: LeaveDraftInput) => this.req<LeaveRequestView>('POST', '/leave/requests', d)
  decideLeave = (id: string, action: LeaveAction, note?: string) => this.req<LeaveRequestView>('POST', `/leave/requests/${id}/${action}`, { note })
  calendar = (month: string) => this.req<{ entries: CalendarEntry[]; holidays: { date: string; name: string }[] }>('GET', `/leave/calendar?month=${month}`)
  timesheet = (id: string, from: string, to: string) => this.req<TimesheetEntry[]>('GET', `/timesheets/${id}?from=${from}&to=${to}`)
  saveTimesheet = (id: string, entries: TimesheetEntry[]) => this.req<void>('PUT', `/timesheets/${id}`, entries)
  payrollPeriods = (f: PayFrequency, year: number) => this.req<PeriodStatus[]>('GET', `/payroll/periods?frequency=${f}&year=${year}`)
  previewPayroll = (frequency: PayFrequency, periodStart: string) => this.req<PayrollPreview>('POST', '/payroll/preview', { frequency, periodStart })
  commitPayroll = (frequency: PayFrequency, periodStart: string) => this.req<PayrollRunSummary>('POST', '/payroll/runs', { frequency, periodStart })
  payrollRuns = () => this.req<PayrollRunSummary[]>('GET', '/payroll/runs')
  payrollRun = (id: string) => this.req<PayrollRunDetail>('GET', `/payroll/runs/${id}`)
  myPaychecks = () => this.req<PaycheckSummary[]>('GET', '/paychecks/mine')
  paycheck = (id: string) => this.req<PaycheckDetail>('GET', `/paychecks/${id}`)
  auditLog = () => this.req<AuditEntry[]>('GET', '/audit')
}
