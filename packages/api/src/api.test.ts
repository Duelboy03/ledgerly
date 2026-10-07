import { beforeAll, describe, expect, it } from 'vitest'
import { AppError } from './errors'
import { LocalApi } from './api'
import { makeWorld, TODAY } from './testkit'

type World = Awaited<ReturnType<typeof makeWorld>>
let w: World

beforeAll(async () => {
  w = await makeWorld()
}, 60_000)

const rejects = async (p: Promise<unknown>, status: number) => {
  const err = await p.then(
    () => null,
    (e) => e,
  )
  expect(err).toBeInstanceOf(AppError)
  expect((err as AppError).status).toBe(status)
  return err as AppError
}

describe('authentication', () => {
  it('signs in with the demo password and returns the session user', async () => {
    const a = await w.as('employee')
    expect(await a.me()).toMatchObject({ name: 'Meera Kapoor', role: 'employee' })
  })
  it('rejects a wrong password and an unknown user with the same message', async () => {
    const api = new LocalApi(w.services)
    const a = await rejects(api.login('meera.kapoor@northwind.test', 'nope'), 401)
    const b = await rejects(api.login('nobody@northwind.test', 'nope'), 401)
    expect(a.message).toBe(b.message)
  })
  it('rejects calls without a token or with a tampered token', async () => {
    await rejects(new LocalApi(w.services).directory(), 401)
    const good = await w.as('employee')
    const bad = new LocalApi(w.services, good.getToken()!.slice(0, -3) + 'abc')
    await rejects(bad.me(), 401)
  })
  it('re-reads the role on every call, so a demotion applies at once', async () => {
    const hr = await w.as('hr')
    const mgr = await w.as('manager')
    expect((await mgr.approvals()).length).toBeGreaterThanOrEqual(0)
    await w.services.db.query("UPDATE users SET role = 'employee' WHERE email = 'arjun.mehta@northwind.test'")
    await rejects(mgr.approvals(), 403)
    await w.services.db.query("UPDATE users SET role = 'manager' WHERE email = 'arjun.mehta@northwind.test'")
    expect(hr).toBeTruthy()
  })
})

describe('who can see pay', () => {
  it('shows an employee their own compensation but not a colleague’s', async () => {
    const meera = await w.as('employee')
    const dir = await meera.directory()
    const me = dir.find((d) => d.name === 'Meera Kapoor')!
    const liam = dir.find((d) => d.name === 'Liam Chen')!
    expect((await meera.employee(me.id)).compensation?.annualSalaryCents).toBe(12_800_000)
    expect((await meera.employee(liam.id)).compensation).toBeNull()
  })
  it('hides reports’ pay from their manager, but not from HR', async () => {
    const arjun = await w.as('manager')
    const hr = await w.as('hr')
    const meeraId = (await hr.directory()).find((d) => d.name === 'Meera Kapoor')!.id
    expect((await arjun.employee(meeraId)).compensation).toBeNull()
    expect((await hr.employee(meeraId)).compensation).not.toBeNull()
  })
  it('lets only HR edit, validates input, and writes an audit entry', async () => {
    const hr = await w.as('hr')
    const meera = await w.as('employee')
    const id = (await hr.directory()).find((d) => d.name === 'Ravi Shankar')!.id
    await rejects(meera.updateEmployee(id, { k401Pct: 10 }), 403)
    await rejects(hr.updateEmployee(id, { k401Pct: 150 }), 422)
    await rejects(hr.updateEmployee(id, { password: 'x' }), 422) // unknown fields are refused
    const updated = await hr.updateEmployee(id, { k401Pct: 7, title: 'Senior Data Analyst' })
    expect(updated.compensation?.k401Pct).toBe(7)
    expect(updated.title).toBe('Senior Data Analyst')
    const log = await hr.auditLog()
    expect(log[0]).toMatchObject({ action: 'employee.update', actorName: 'Priya Raman' })
  })
  it('keeps the audit log away from everyone but HR', async () => {
    await rejects((await w.as('manager')).auditLog(), 403)
    await rejects((await w.as('employee')).auditLog(), 403)
  })
})

describe('leave workflow', () => {
  it('balances reflect accrual and pending requests', async () => {
    const meera = await w.as('employee')
    const vac = (await meera.balances()).find((b) => b.type === 'vacation')!
    expect(vac.accrued).toBeGreaterThan(10)
    expect(vac.pending).toBe(5)
    expect(vac.used).toBe(5)
  })

  it('validates a draft without saving it', async () => {
    const meera = await w.as('employee')
    const before = (await meera.leaveRequests()).length
    const v = await meera.validateLeave({ type: 'vacation', startDate: '2026-11-30', endDate: '2026-12-02' })
    expect(v).toMatchObject({ ok: true, days: 3 })
    expect((await meera.leaveRequests()).length).toBe(before)
  })

  it('rejects an invalid request with a useful message', async () => {
    const meera = await w.as('employee')
    const e = await rejects(meera.createLeave({ type: 'vacation', startDate: '2026-10-08', endDate: '2026-10-09' }), 422)
    expect(e.message).toMatch(/notice/)
  })

  it('runs the full request → approve cycle and the balance moves', async () => {
    const meera = await w.as('employee')
    const arjun = await w.as('manager')
    const created = await meera.createLeave({ type: 'personal', startDate: '2026-11-16', endDate: '2026-11-16', reason: 'Appointment' })
    expect(created.status).toBe('pending')
    expect(created.actions).toEqual(['cancel'])

    const queue = await arjun.approvals()
    expect(queue.some((r) => r.id === created.id)).toBe(true)
    const approved = await arjun.decideLeave(created.id, 'approve', 'Fine by me')
    expect(approved).toMatchObject({ status: 'approved', decidedByName: 'Arjun Mehta', decisionNote: 'Fine by me' })

    const personal = (await meera.balances()).find((b) => b.type === 'personal')!
    expect(personal.used).toBe(1)
    expect((await arjun.approvals()).some((r) => r.id === created.id)).toBe(false)
  })

  it('stops a requester approving their own request or someone else’s manager approving it', async () => {
    const meera = await w.as('employee')
    const daniel = await w.as('someone') .catch(() => null)
    expect(daniel).toBeNull() // unknown demo key is treated as an email and fails to log in
    const mine = (await meera.leaveRequests()).find((r) => r.status === 'pending')!
    await rejects(meera.decideLeave(mine.id, 'approve'), 403)
    const otherManager = await w.as('daniel.okafor@northwind.test')
    await rejects(otherManager.decideLeave(mine.id, 'approve'), 403)
  })

  it('refuses a second decision on a request that is no longer pending', async () => {
    const meera = await w.as('employee')
    const hr = await w.as('hr')
    const r = await meera.createLeave({ type: 'personal', startDate: '2026-12-07', endDate: '2026-12-07' })
    await hr.decideLeave(r.id, 'reject', 'Coverage')
    await rejects(hr.decideLeave(r.id, 'approve'), 403)
  })

  it('does not let two requests overlap', async () => {
    const meera = await w.as('employee')
    const e = await rejects(meera.createLeave({ type: 'vacation', startDate: '2026-10-29', endDate: '2026-11-03' }), 422)
    expect(e.message).toMatch(/Overlaps/)
  })

  it('lets the requester cancel a pending request', async () => {
    const meera = await w.as('employee')
    const r = await meera.createLeave({ type: 'personal', startDate: '2026-12-14', endDate: '2026-12-14' })
    expect((await meera.decideLeave(r.id, 'cancel')).status).toBe('cancelled')
  })

  it('scopes request lists by role', async () => {
    const meera = await w.as('employee')
    const arjun = await w.as('manager')
    const hr = await w.as('hr')
    await rejects(meera.leaveRequests('team'), 403)
    await rejects(arjun.leaveRequests('all'), 403)
    const team = await arjun.leaveRequests('team')
    expect(team.every((r) => ['Meera Kapoor', 'Liam Chen', 'Hannah Berg', 'Ravi Shankar', 'Noah Patel'].includes(r.employeeName))).toBe(true)
    expect((await hr.leaveRequests('all')).length).toBeGreaterThan(team.length)
    expect((await meera.leaveRequests()).every((r) => r.employeeName === 'Meera Kapoor')).toBe(true)
  })

  it('never offers a manager someone else’s request, or their own, in the queue', async () => {
    const arjun = await w.as('manager')
    const queue = await arjun.approvals()
    expect(queue.every((r) => r.employeeName !== 'Arjun Mehta')).toBe(true)
    expect(queue.some((r) => r.employeeName === 'Zoe Williams')).toBe(false)
  })

  it('shows the team calendar to a department, without exposing leave types of others', async () => {
    const liam = await w.as('liam.chen@northwind.test')
    const cal = await liam.calendar('2026-10')
    expect(cal.holidays.some((h) => h.name === 'Columbus Day')).toBe(true)
    const others = cal.entries.filter((e) => e.name !== "Liam Chen")
    expect(others.every((e) => e.type === 'leave')).toBe(true)
    expect(cal.entries.every((e) => e.department === 'Engineering')).toBe(true)
  })

  it('balances cannot be read across people', async () => {
    const meera = await w.as('employee')
    const hr = await w.as('hr')
    const liamId = (await hr.directory()).find((d) => d.name === 'Liam Chen')!.id
    await rejects(meera.balances(liamId), 403)
    expect((await hr.balances(liamId)).length).toBe(4)
  })
})

describe('timesheets', () => {
  it('lets an hourly employee log hours and refuses salaried staff and other people', async () => {
    const ava = await w.as('ava.thompson@northwind.test')
    const meera = await w.as('employee')
    const hr = await w.as('hr')
    const avaId = (await ava.me()).employeeId
    await ava.saveTimesheet(avaId, [{ date: '2026-10-06', hours: 8.5 }])
    expect((await ava.timesheet(avaId, '2026-10-06', '2026-10-06'))[0].hours).toBe(8.5)
    await rejects(meera.timesheet(avaId, '2026-10-01', '2026-10-07'), 403)
    await rejects(meera.saveTimesheet((await meera.me()).employeeId, [{ date: '2026-10-06', hours: 8 }]), 422)
    await rejects(ava.saveTimesheet(avaId, [{ date: '2026-10-06', hours: 30 }]), 422)
    await hr.saveTimesheet(avaId, [{ date: '2026-10-06', hours: 8 }])
  })
})

describe('meta', () => {
  it('reports the pinned date, holidays and policies', async () => {
    const m = await w.services.meta()
    expect(m.today).toBe(TODAY)
    expect(m.policies.map((p) => p.type).sort()).toEqual(['personal', 'sick', 'unpaid', 'vacation'])
    expect(m.holidays.length).toBeGreaterThan(10)
  })
})
