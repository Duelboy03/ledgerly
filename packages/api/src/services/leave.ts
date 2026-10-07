import { z } from 'zod'
import {
  computeBalance,
  DEFAULT_POLICIES,
  leaveDates,
  nextStatus,
  validateRequest,
  type Balance,
  type ISODate,
  type LeaveAction,
  type LeavePolicy,
  type LeaveRequestLike,
  type LeaveType,
  type Role,
} from '@ledgerly/domain'
import { can, ensure, type Actor } from '../authz'
import { camel, camelAll, type Db } from '../db/types'
import { conflict, forbidden, notFound, unprocessable } from '../errors'
import type { CalendarEntry, LeaveRequestView, LeaveValidation } from '../types'
import { record } from './audit'

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

export const leaveDraft = z.object({
  type: z.enum(['vacation', 'sick', 'personal', 'unpaid']),
  startDate: dateStr,
  endDate: dateStr,
  reason: z.string().trim().max(500).optional().default(''),
})

export interface Clock {
  today: () => ISODate
}

interface EmpRow {
  id: string
  name: string
  department: string
  hireDate: ISODate
  managerId: string | null
}

interface ReqRow extends LeaveRequestLike {
  id: string
  employeeId: string
  employeeName: string
  department: string
  managerId: string | null
  startDate: ISODate
  endDate: ISODate
  reason: string
  decidedByName: string | null
  decidedAt: string | null
  decisionNote: string | null
  createdAt: string
}

const REQ_SELECT = `SELECT r.id, r.employee_id, e.name AS employee_name, e.department, e.manager_id, r.type, r.start_date,
                           r.end_date, r.days, r.status, r.reason, d.name AS decided_by_name, r.decided_at,
                           r.decision_note, r.created_at
                      FROM leave_requests r
                      JOIN employees e ON e.id = r.employee_id
                      LEFT JOIN employees d ON d.id = r.decided_by`

export function createLeave(db: Db, clock: Clock) {
  async function policies(q: Db = db): Promise<Map<LeaveType, LeavePolicy>> {
    const rows = await q.query('SELECT type, annual_days, max_balance, paid, min_notice_days FROM leave_policies')
    const list = camelAll<LeavePolicy>(rows)
    return new Map((list.length ? list : DEFAULT_POLICIES).map((p) => [p.type, p]))
  }

  async function holidaySet(q: Db = db): Promise<Set<ISODate>> {
    return new Set((await q.query<{ date: string }>('SELECT date FROM holidays')).map((r) => r.date))
  }

  async function employee(id: string, q: Db = db): Promise<EmpRow> {
    const rows = await q.query('SELECT id, name, department, hire_date, manager_id FROM employees WHERE id = $1', [id])
    if (!rows[0]) throw notFound('Employee')
    return camel<EmpRow>(rows[0])
  }

  async function requestsOf(employeeId: string, q: Db = db): Promise<ReqRow[]> {
    return camelAll<ReqRow>(await q.query(`${REQ_SELECT} WHERE r.employee_id = $1 ORDER BY r.start_date`, [employeeId]))
  }

  function actionsFor(actor: Actor, r: ReqRow): LeaveAction[] {
    const out: LeaveAction[] = []
    const ctx = {
      role: actor.role as Role,
      isRequester: r.employeeId === actor.employeeId,
      isManagerOfRequester: r.managerId === actor.employeeId,
      startDate: r.startDate,
      today: clock.today(),
    }
    for (const a of ['approve', 'reject', 'cancel'] as LeaveAction[]) if (nextStatus(r.status, a, ctx).ok) out.push(a)
    return out
  }

  const view = (actor: Actor, r: ReqRow): LeaveRequestView => ({
    id: r.id,
    employeeId: r.employeeId,
    employeeName: r.employeeName,
    department: r.department,
    type: r.type,
    startDate: r.startDate,
    endDate: r.endDate,
    days: r.days,
    status: r.status,
    reason: r.reason,
    decidedByName: r.decidedByName,
    decidedAt: r.decidedAt,
    decisionNote: r.decisionNote,
    createdAt: r.createdAt,
    actions: actionsFor(actor, r),
  })

  async function validateFor(employeeId: string, draft: z.infer<typeof leaveDraft>, q: Db = db, ignoreId?: string) {
    // sequential on purpose: inside a transaction every query shares one connection
    const emp = await employee(employeeId, q)
    const pol = await policies(q)
    const hol = await holidaySet(q)
    const existing = await requestsOf(employeeId, q)
    const policy = pol.get(draft.type)
    if (!policy) throw unprocessable(`Unknown leave type: ${draft.type}`)
    const v = validateRequest(draft, { today: clock.today(), policy, hireDate: emp.hireDate, holidays: hol, existing, ignoreId })
    let balanceAfter: number | null = null
    if (policy.paid && v.days > 0) {
      const bal = computeBalance(policy, emp.hireDate, draft.startDate, existing.filter((r) => r.id !== ignoreId))
      balanceAfter = bal.available - v.days
    }
    return { v: { ...v, balanceAfter } as LeaveValidation, emp, policy, existing }
  }

  return {
    async balances(actor: Actor, employeeId = actor.employeeId): Promise<Balance[]> {
      const emp = await employee(employeeId)
      ensure(can.readLeaveOf(actor, employeeId, emp.managerId), 'You cannot view that balance.')
      const pol = await policies()
      const reqs = await requestsOf(employeeId)
      return [...pol.values()].map((p) => computeBalance(p, emp.hireDate, clock.today(), reqs))
    },

    /** scope: 'mine' = own requests, 'team' = requests of direct reports, 'all' = everyone (HR). */
    async list(actor: Actor, scope: 'mine' | 'team' | 'all' = 'mine'): Promise<LeaveRequestView[]> {
      let rows: ReqRow[]
      if (scope === 'mine') rows = await requestsOf(actor.employeeId)
      else if (scope === 'team') {
        ensure(actor.role !== 'employee', 'Only managers and HR can see team requests.')
        rows = camelAll<ReqRow>(
          await db.query(`${REQ_SELECT} WHERE e.manager_id = $1 ORDER BY r.start_date DESC`, [actor.employeeId]),
        )
      } else {
        ensure(actor.role === 'hr_admin', 'Only HR can see every request.')
        rows = camelAll<ReqRow>(await db.query(`${REQ_SELECT} ORDER BY r.start_date DESC`))
      }
      return rows.map((r) => view(actor, r))
    },

    /** Pending requests this person is allowed to decide: their reports' for a manager, everyone's for HR. */
    async approvals(actor: Actor): Promise<LeaveRequestView[]> {
      ensure(actor.role !== 'employee', 'Only managers and HR can approve leave.')
      const rows = camelAll<ReqRow>(
        await db.query(
          `${REQ_SELECT} WHERE r.status = 'pending' AND r.employee_id <> $1 AND ($2 OR e.manager_id = $1) ORDER BY r.start_date`,
          [actor.employeeId, actor.role === 'hr_admin'],
        ),
      )
      return rows.map((r) => view(actor, r))
    },

    async validate(actor: Actor, input: unknown): Promise<LeaveValidation> {
      const draft = parseDraft(input)
      return (await validateFor(actor.employeeId, draft)).v
    },

    async create(actor: Actor, input: unknown): Promise<LeaveRequestView> {
      const draft = parseDraft(input)
      const id = await db.transaction(async (tx) => {
        const { v } = await validateFor(actor.employeeId, draft, tx)
        if (!v.ok) throw unprocessable(v.errors[0], v.errors)
        const rows = await tx.query<{ id: string }>(
          `INSERT INTO leave_requests (employee_id, type, start_date, end_date, days, status, reason)
           VALUES ($1, $2, $3, $4, $5, 'pending', $6) RETURNING id`,
          [actor.employeeId, draft.type, draft.startDate, draft.endDate, v.days, draft.reason],
        )
        await record(tx, actor.employeeId, 'leave.request', 'leave_request', rows[0].id, { ...draft, days: v.days })
        return rows[0].id
      })
      return view(actor, camel<ReqRow>((await db.query(`${REQ_SELECT} WHERE r.id = $1`, [id]))[0]))
    },

    async decide(actor: Actor, id: string, action: LeaveAction, note = ''): Promise<LeaveRequestView> {
      if (!['approve', 'reject', 'cancel'].includes(action)) throw unprocessable('Unknown action.')
      await db.transaction(async (tx) => {
        const rows = await tx.query(`${REQ_SELECT} WHERE r.id = $1 FOR UPDATE OF r`, [id])
        if (!rows[0]) throw notFound('Leave request')
        const r = camel<ReqRow>(rows[0])
        const result = nextStatus(r.status, action, {
          role: actor.role,
          isRequester: r.employeeId === actor.employeeId,
          isManagerOfRequester: r.managerId === actor.employeeId,
          startDate: r.startDate,
          today: clock.today(),
        })
        if (!result.ok) throw forbidden(result.reason)

        if (action === 'approve') {
          // the balance may have changed since the request was made, so check it again
          const { v } = await validateFor(
            r.employeeId,
            { type: r.type, startDate: r.startDate, endDate: r.endDate, reason: r.reason },
            tx,
            r.id,
          )
          const stillOk = v.errors.filter((e) => !/notice/.test(e))
          if (stillOk.length) throw conflict(`Cannot approve: ${stillOk[0]}`)
        }

        await tx.query(
          `UPDATE leave_requests SET status = $2, decided_by = $3, decided_at = now(), decision_note = $4 WHERE id = $1`,
          [id, result.status, actor.employeeId, String(note).slice(0, 500) || null],
        )
        await record(tx, actor.employeeId, `leave.${action}`, 'leave_request', id, { to: result.status, note })
      })
      return view(actor, camel<ReqRow>((await db.query(`${REQ_SELECT} WHERE r.id = $1`, [id]))[0]))
    },

    /** Who is away in a month. People see their department; HR sees everyone. Leave type is shown only to the person, their manager and HR. */
    async calendar(actor: Actor, month: string): Promise<{ entries: CalendarEntry[]; holidays: { date: ISODate; name: string }[] }> {
      if (!/^\d{4}-\d{2}$/.test(month)) throw unprocessable('Month must look like 2026-07.')
      const start = `${month}-01`
      const end = `${month}-31`
      const me = await employee(actor.employeeId)
      const rows = camelAll<ReqRow>(
        await db.query(
          `${REQ_SELECT} WHERE r.status IN ('approved', 'pending') AND r.start_date <= $2 AND r.end_date >= $1
            AND ($3 OR e.department = $4 OR r.employee_id = $5) ORDER BY r.start_date`,
          [start, end, actor.role === 'hr_admin', me.department, actor.employeeId],
        ),
      )
      const holidays = (await db.query<{ date: string; name: string }>('SELECT date, name FROM holidays WHERE date BETWEEN $1 AND $2 ORDER BY date', [start, end]))
      return {
        holidays,
        entries: rows
          // pending requests are visible only to the requester and the people who can decide them
          .filter((r) => r.status === 'approved' || can.readLeaveOf(actor, r.employeeId, r.managerId))
          .map((r) => ({
            employeeId: r.employeeId,
            name: r.employeeName,
            department: r.department,
            startDate: r.startDate,
            endDate: r.endDate,
            status: r.status,
            type: can.readLeaveOf(actor, r.employeeId, r.managerId) ? r.type : 'leave',
          })),
      }
    },

    /** Approved unpaid-leave business days that fall inside a pay period, per employee. Used by payroll. */
    async unpaidDaysInPeriod(start: ISODate, end: ISODate, q: Db = db): Promise<Map<string, number>> {
      const hol = await holidaySet(q)
      const rows = camelAll<{ employeeId: string; startDate: ISODate; endDate: ISODate }>(
        await q.query(
          `SELECT employee_id, start_date, end_date FROM leave_requests
            WHERE type = 'unpaid' AND status = 'approved' AND start_date <= $2 AND end_date >= $1`,
          [start, end],
        ),
      )
      const out = new Map<string, number>()
      for (const r of rows) {
        const inPeriod = leaveDates(r, hol).filter((d) => d >= start && d <= end).length
        out.set(r.employeeId, (out.get(r.employeeId) ?? 0) + inPeriod)
      }
      return out
    },
  }
}

function parseDraft(input: unknown) {
  const p = leaveDraft.safeParse(input)
  if (!p.success) throw unprocessable('Check the request details.', z.flattenError(p.error).fieldErrors)
  return p.data
}
