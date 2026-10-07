import { addDays, countBusinessDays, type ISODate, month, parseDate, rangesOverlap, year } from './dates'

export type LeaveType = 'vacation' | 'sick' | 'personal' | 'unpaid'
export type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled'
export type Role = 'employee' | 'manager' | 'hr_admin'

export interface LeavePolicy {
  type: LeaveType
  /** days granted per calendar year, accrued monthly */
  annualDays: number
  /** accrual stops once available days reach this ceiling */
  maxBalance: number
  paid: boolean
  /** days of notice required before a non-sick request starts */
  minNoticeDays: number
}

export interface LeaveRequestLike {
  id?: string
  type: LeaveType
  startDate: ISODate
  endDate: ISODate
  days: number
  status: LeaveStatus
}

export const DEFAULT_POLICIES: LeavePolicy[] = [
  { type: 'vacation', annualDays: 20, maxBalance: 30, paid: true, minNoticeDays: 3 },
  { type: 'sick', annualDays: 10, maxBalance: 15, paid: true, minNoticeDays: 0 },
  { type: 'personal', annualDays: 3, maxBalance: 5, paid: true, minNoticeDays: 1 },
  { type: 'unpaid', annualDays: 0, maxBalance: 0, paid: false, minNoticeDays: 7 },
]

/**
 * Days accrued in the calendar year of `asOf`, granted at month end. A hire part-way
 * through the year starts accruing from the month after they join.
 */
export function accruedDays(policy: LeavePolicy, hireDate: ISODate, asOf: ISODate): number {
  if (policy.annualDays === 0) return 0
  const y = year(asOf)
  const firstMonth = year(hireDate) < y ? 1 : month(hireDate) + 1
  const lastMonth = month(asOf) - 1 // months fully elapsed before the as-of month
  const months = Math.max(0, lastMonth - firstMonth + 1)
  const raw = (policy.annualDays / 12) * months
  return Math.min(Math.round(raw * 100) / 100, policy.maxBalance)
}

export interface Balance {
  type: LeaveType
  accrued: number
  carryOver: number
  used: number
  pending: number
  available: number
}

export function computeBalance(
  policy: LeavePolicy,
  hireDate: ISODate,
  asOf: ISODate,
  requests: LeaveRequestLike[],
  carryOver = 0,
): Balance {
  const y = year(asOf)
  const inYear = requests.filter((r) => r.type === policy.type && year(r.startDate) === y)
  const used = inYear.filter((r) => r.status === 'approved').reduce((a, r) => a + r.days, 0)
  const pending = inYear.filter((r) => r.status === 'pending').reduce((a, r) => a + r.days, 0)
  const accrued = accruedDays(policy, hireDate, asOf)
  const cap = policy.maxBalance
  const available = policy.paid ? Math.min(accrued + carryOver, cap > 0 ? cap : Infinity) - used - pending : Infinity
  return { type: policy.type, accrued, carryOver, used, pending, available }
}

export interface RequestDraft {
  type: LeaveType
  startDate: ISODate
  endDate: ISODate
}

export interface Validation {
  ok: boolean
  days: number
  errors: string[]
  warnings: string[]
}

export interface ValidateContext {
  today: ISODate
  policy: LeavePolicy
  hireDate: ISODate
  holidays: ReadonlySet<ISODate>
  existing: LeaveRequestLike[]
  /** requests from the same employee being edited are ignored when checking overlap */
  ignoreId?: string
}

export function validateRequest(draft: RequestDraft, ctx: ValidateContext): Validation {
  const errors: string[] = []
  const warnings: string[] = []

  let days = 0
  try {
    if (parseDate(draft.endDate) < parseDate(draft.startDate)) {
      errors.push('The end date is before the start date.')
    } else {
      days = countBusinessDays(draft.startDate, draft.endDate, ctx.holidays)
      if (days === 0) errors.push('That range contains no working days.')
    }
  } catch {
    errors.push('Enter valid dates.')
    return { ok: false, days: 0, errors, warnings }
  }
  if (errors.length) return { ok: false, days, errors, warnings }

  if (parseDate(draft.startDate) < parseDate(ctx.hireDate)) errors.push('The request starts before the hire date.')

  const notice = (parseDate(draft.startDate) - parseDate(ctx.today)) / 86_400_000
  if (draft.type !== 'sick' && notice < ctx.policy.minNoticeDays) {
    errors.push(
      `${draft.type[0].toUpperCase()}${draft.type.slice(1)} leave needs ${ctx.policy.minNoticeDays} day${
        ctx.policy.minNoticeDays === 1 ? '' : 's'
      } of notice.`,
    )
  }

  const clash = ctx.existing.find(
    (r) =>
      r.id !== ctx.ignoreId &&
      (r.status === 'pending' || r.status === 'approved') &&
      rangesOverlap(draft.startDate, draft.endDate, r.startDate, r.endDate),
  )
  if (clash) errors.push(`Overlaps an existing ${clash.status} request (${clash.startDate} to ${clash.endDate}).`)

  if (year(draft.startDate) !== year(draft.endDate)) {
    errors.push('Requests cannot span two calendar years. Submit one request per year.')
  } else if (ctx.policy.paid) {
    // judge the balance as it will stand when the leave starts, so future accrual counts
    const bal = computeBalance(ctx.policy, ctx.hireDate, draft.startDate, ctx.existing.filter((r) => r.id !== ctx.ignoreId))
    if (days > bal.available) {
      errors.push(`Only ${bal.available.toFixed(bal.available % 1 ? 2 : 0)} ${draft.type} day(s) will be available by then; you asked for ${days}.`)
    } else if (bal.available - days < 1) {
      warnings.push('This uses almost all of your remaining balance.')
    }
  }

  return { ok: errors.length === 0, days, errors, warnings }
}

export type LeaveAction = 'approve' | 'reject' | 'cancel'

/**
 * Who may do what, and from which state.
 * - approve / reject: pending requests, by the employee's manager or any HR admin, never by the requester
 * - cancel: the requester (pending, or approved and not yet started) or HR
 */
export function nextStatus(
  current: LeaveStatus,
  action: LeaveAction,
  opts: { role: Role; isRequester: boolean; isManagerOfRequester: boolean; startDate: ISODate; today: ISODate },
): { ok: true; status: LeaveStatus } | { ok: false; reason: string } {
  const { role, isRequester, isManagerOfRequester } = opts
  if (action === 'approve' || action === 'reject') {
    if (current !== 'pending') return { ok: false, reason: `A ${current} request cannot be ${action}d.` }
    if (isRequester) return { ok: false, reason: 'You cannot decide your own request.' }
    if (!(role === 'hr_admin' || (role === 'manager' && isManagerOfRequester)))
      return { ok: false, reason: 'Only the manager or HR can decide this request.' }
    return { ok: true, status: action === 'approve' ? 'approved' : 'rejected' }
  }
  if (current === 'rejected' || current === 'cancelled') return { ok: false, reason: `A ${current} request cannot be cancelled.` }
  if (!(isRequester || role === 'hr_admin')) return { ok: false, reason: 'Only the requester or HR can cancel.' }
  if (current === 'approved' && parseDate(opts.startDate) <= parseDate(opts.today) && role !== 'hr_admin')
    return { ok: false, reason: 'Leave that has already started cannot be cancelled. Ask HR.' }
  return { ok: true, status: 'cancelled' }
}

/** Dates (business days only) on which the request keeps someone away, for the team calendar. */
export function leaveDates(r: { startDate: ISODate; endDate: ISODate }, holidays: ReadonlySet<ISODate>): ISODate[] {
  const out: ISODate[] = []
  for (let d = r.startDate; parseDate(d) <= parseDate(r.endDate); d = addDays(d, 1)) {
    if (countBusinessDays(d, d, holidays) === 1) out.push(d)
  }
  return out
}
