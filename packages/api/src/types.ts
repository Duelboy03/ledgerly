import type { Balance, FilingStatus, ISODate, LeaveAction, LeavePolicy, LeaveStatus, LeaveType, PayFrequency, PayPeriod, Paycheck, PayType, Role, Validation } from '@ledgerly/domain'

export interface SessionUser {
  userId: string
  employeeId: string
  name: string
  email: string
  role: Role
  title: string
  department: string
}

export interface Meta {
  today: ISODate
  holidays: { date: ISODate; name: string }[]
  policies: LeavePolicy[]
}

export interface DirectoryEntry {
  id: string
  name: string
  email: string
  title: string
  department: string
  managerId: string | null
  managerName: string | null
  hireDate: ISODate
  status: 'active' | 'terminated'
}

export interface Compensation {
  payType: PayType
  annualSalaryCents: number
  hourlyRateCents: number
  payFrequency: PayFrequency
  filingStatus: FilingStatus
  state: string
  k401Pct: number
  healthPremiumCents: number
}

export interface EmployeeDetail extends DirectoryEntry {
  /** null when the viewer is not allowed to see pay details */
  compensation: Compensation | null
}

export interface LeaveRequestView {
  id: string
  employeeId: string
  employeeName: string
  department: string
  type: LeaveType
  startDate: ISODate
  endDate: ISODate
  days: number
  status: LeaveStatus
  reason: string
  decidedByName: string | null
  decidedAt: string | null
  decisionNote: string | null
  createdAt: string
  /** what this viewer may do with it right now */
  actions: LeaveAction[]
}

export interface LeaveValidation extends Validation {
  balanceAfter: number | null
}

export interface CalendarEntry {
  employeeId: string
  name: string
  department: string
  startDate: ISODate
  endDate: ISODate
  type: LeaveType | 'leave'
  status: LeaveStatus
}

export interface TimesheetEntry {
  date: ISODate
  hours: number
}

export interface PeriodStatus extends PayPeriod {
  frequency: PayFrequency
  closed: boolean
  runId: string | null
}

export interface PreviewRow {
  employeeId: string
  name: string
  department: string
  paycheck: Paycheck
}

export interface PayrollTotals {
  gross: number
  net: number
  taxes: number
  preTax: number
  employerCost: number
  headcount: number
}

export interface PayrollPreview {
  frequency: PayFrequency
  period: PayPeriod
  rows: PreviewRow[]
  totals: PayrollTotals
  warnings: string[]
}

export interface PayrollRunSummary {
  id: string
  frequency: PayFrequency
  periodStart: ISODate
  periodEnd: ISODate
  payDate: ISODate
  createdAt: string
  totals: PayrollTotals
}

export interface PayrollRunDetail extends PayrollRunSummary {
  rows: (PreviewRow & { paycheckId: string })[]
}

export interface PaycheckSummary {
  id: string
  payDate: ISODate
  periodStart: ISODate
  periodEnd: ISODate
  grossCents: number
  netCents: number
}

export interface PaycheckDetail extends PaycheckSummary {
  employeeId: string
  employeeName: string
  paycheck: Paycheck
  ytd: { grossCents: number; netCents: number }
}

export interface AuditEntry {
  id: number
  at: string
  actorName: string | null
  action: string
  entity: string
  entityId: string | null
  detail: Record<string, unknown>
}

export type { Balance }
