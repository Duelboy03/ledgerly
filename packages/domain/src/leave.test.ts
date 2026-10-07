import { describe, expect, it } from 'vitest'
import {
  accruedDays,
  computeBalance,
  DEFAULT_POLICIES,
  leaveDates,
  nextStatus,
  validateRequest,
  type LeaveRequestLike,
  type ValidateContext,
} from './leave'

const vacation = DEFAULT_POLICIES[0]
const sick = DEFAULT_POLICIES[1]
const holidays = new Set(['2026-12-25'])

const ctx = (over: Partial<ValidateContext> = {}): ValidateContext => ({
  today: '2026-03-02',
  policy: vacation,
  hireDate: '2020-01-01',
  holidays,
  existing: [],
  ...over,
})

describe('accrual', () => {
  it('grants one twelfth per fully elapsed month', () => {
    expect(accruedDays(vacation, '2020-01-01', '2026-07-01')).toBeCloseTo(10)
    expect(accruedDays(vacation, '2020-01-01', '2026-01-15')).toBe(0)
    expect(accruedDays(vacation, '2020-01-01', '2026-12-31')).toBeCloseTo(110 / 6, 1)
  })
  it('starts a mid-year hire from the month after they join', () => {
    expect(accruedDays(vacation, '2026-04-10', '2026-07-01')).toBeCloseTo(20 / 12 * 2)
    expect(accruedDays(vacation, '2026-04-10', '2026-04-20')).toBe(0)
  })
  it('never exceeds the policy ceiling and is zero for unpaid leave', () => {
    expect(accruedDays({ ...vacation, maxBalance: 5 }, '2020-01-01', '2026-12-01')).toBe(5)
    expect(accruedDays(DEFAULT_POLICIES[3], '2020-01-01', '2026-12-01')).toBe(0)
  })
})

describe('balance', () => {
  const reqs: LeaveRequestLike[] = [
    { type: 'vacation', startDate: '2026-02-02', endDate: '2026-02-04', days: 3, status: 'approved' },
    { type: 'vacation', startDate: '2026-04-06', endDate: '2026-04-07', days: 2, status: 'pending' },
    { type: 'vacation', startDate: '2026-05-04', endDate: '2026-05-04', days: 1, status: 'rejected' },
    { type: 'vacation', startDate: '2025-05-04', endDate: '2025-05-08', days: 5, status: 'approved' },
    { type: 'sick', startDate: '2026-02-09', endDate: '2026-02-09', days: 1, status: 'approved' },
  ]
  it('subtracts approved and pending, ignores rejected and other years or types', () => {
    const b = computeBalance(vacation, '2020-01-01', '2026-07-01', reqs)
    expect(b.used).toBe(3)
    expect(b.pending).toBe(2)
    expect(b.available).toBeCloseTo(10 - 3 - 2)
  })
  it('adds carry-over', () => {
    expect(computeBalance(vacation, '2020-01-01', '2026-07-01', [], 4).available).toBeCloseTo(14)
  })
  it('treats unpaid leave as unlimited', () => {
    expect(computeBalance(DEFAULT_POLICIES[3], '2020-01-01', '2026-07-01', []).available).toBe(Infinity)
  })
})

describe('request validation', () => {
  it('accepts a normal request and counts working days only', () => {
    const v = validateRequest({ type: 'vacation', startDate: '2026-07-06', endDate: '2026-07-10' }, ctx())
    expect(v).toMatchObject({ ok: true, days: 5 })
  })
  it('rejects reversed ranges, weekends only, and bad dates', () => {
    expect(validateRequest({ type: 'vacation', startDate: '2026-07-10', endDate: '2026-07-06' }, ctx()).errors[0]).toMatch(/before the start/)
    expect(validateRequest({ type: 'vacation', startDate: '2026-07-04', endDate: '2026-07-05' }, ctx()).errors[0]).toMatch(/no working days/)
    expect(validateRequest({ type: 'vacation', startDate: 'nope', endDate: '2026-07-05' }, ctx()).ok).toBe(false)
  })
  it('does not charge holidays against the balance', () => {
    expect(validateRequest({ type: 'vacation', startDate: '2026-12-24', endDate: '2026-12-28' }, ctx()).days).toBe(2)
  })
  it('enforces notice for everything except sick leave', () => {
    const late = { startDate: '2026-03-03', endDate: '2026-03-03' }
    expect(validateRequest({ type: 'vacation', ...late }, ctx()).errors.join()).toMatch(/3 days of notice/)
    expect(validateRequest({ type: 'sick', ...late }, ctx({ policy: sick, today: '2026-03-03' })).ok).toBe(true)
  })
  it('blocks overlap with pending or approved requests but not cancelled ones', () => {
    const existing: LeaveRequestLike[] = [{ id: 'a', type: 'sick', startDate: '2026-07-08', endDate: '2026-07-09', days: 2, status: 'approved' }]
    const draft = { type: 'vacation' as const, startDate: '2026-07-06', endDate: '2026-07-10' }
    expect(validateRequest(draft, ctx({ existing })).errors.join()).toMatch(/Overlaps/)
    expect(validateRequest(draft, ctx({ existing: [{ ...existing[0], status: 'cancelled' }] })).ok).toBe(true)
  })
  it('rejects requests larger than the balance that will be available', () => {
    const v = validateRequest({ type: 'vacation', startDate: '2026-03-16', endDate: '2026-03-27' }, ctx())
    expect(v.ok).toBe(false)
    expect(v.errors.join()).toMatch(/available by then/)
  })
  it('lets future accrual count toward a later request', () => {
    // by September there are 8 vacation days of accrual
    expect(validateRequest({ type: 'vacation', startDate: '2026-09-07', endDate: '2026-09-15' }, ctx()).ok).toBe(true)
  })
  it('refuses to span a year boundary and pre-hire dates', () => {
    expect(validateRequest({ type: 'unpaid', startDate: '2026-12-30', endDate: '2027-01-05' }, ctx({ policy: DEFAULT_POLICIES[3], today: '2026-01-01' })).errors.join()).toMatch(/two calendar years/)
    expect(validateRequest({ type: 'unpaid', startDate: '2026-06-01', endDate: '2026-06-02' }, ctx({ policy: DEFAULT_POLICIES[3], hireDate: '2026-06-15' })).errors.join()).toMatch(/hire date/)
  })
  it('warns when almost the whole balance is used', () => {
    const v = validateRequest({ type: 'vacation', startDate: '2026-07-06', endDate: '2026-07-17' }, ctx())
    expect(v.warnings.length).toBeGreaterThan(0)
  })
})

describe('approval state machine', () => {
  const base = { startDate: '2026-07-06', today: '2026-06-01' }
  const as = (role: 'employee' | 'manager' | 'hr_admin', isRequester = false, isManagerOfRequester = false) => ({ ...base, role, isRequester, isManagerOfRequester })

  it('lets the manager and HR decide, but never the requester', () => {
    expect(nextStatus('pending', 'approve', as('manager', false, true))).toEqual({ ok: true, status: 'approved' })
    expect(nextStatus('pending', 'reject', as('hr_admin'))).toEqual({ ok: true, status: 'rejected' })
    expect(nextStatus('pending', 'approve', as('hr_admin', true)).ok).toBe(false)
    expect(nextStatus('pending', 'approve', as('manager', false, false)).ok).toBe(false)
    expect(nextStatus('pending', 'approve', as('employee')).ok).toBe(false)
  })
  it('only decides pending requests', () => {
    expect(nextStatus('approved', 'approve', as('hr_admin')).ok).toBe(false)
    expect(nextStatus('rejected', 'reject', as('hr_admin')).ok).toBe(false)
  })
  it('lets the requester cancel before the start date but not after', () => {
    expect(nextStatus('approved', 'cancel', as('employee', true))).toEqual({ ok: true, status: 'cancelled' })
    expect(nextStatus('approved', 'cancel', { ...as('employee', true), today: '2026-07-07' }).ok).toBe(false)
    expect(nextStatus('approved', 'cancel', { ...as('hr_admin'), today: '2026-07-07' }).ok).toBe(true)
    expect(nextStatus('pending', 'cancel', as('employee', false)).ok).toBe(false)
    expect(nextStatus('cancelled', 'cancel', as('hr_admin')).ok).toBe(false)
  })
})

describe('leaveDates', () => {
  it('lists working days only', () => {
    expect(leaveDates({ startDate: '2026-12-24', endDate: '2026-12-28' }, holidays)).toEqual(['2026-12-24', '2026-12-28'])
  })
})
