import { addDays, countBusinessDays, DEFAULT_POLICIES, eachDay, isWeekend, periodsFor, year, type ISODate, type LeaveStatus, type LeaveType, type PayFrequency, type Role } from '@ledgerly/domain'
import type { Db } from './db/types'
import type { Services } from './services'

export const DEMO_PASSWORD = 'demo1234'

export const DEMO_ACCOUNTS = {
  hr: 'priya.raman@northwind.test',
  manager: 'arjun.mehta@northwind.test',
  employee: 'meera.kapoor@northwind.test',
} as const

interface Seed {
  name: string
  title: string
  department: string
  role: Role
  manager?: string
  hire: ISODate | `recent:${number}`
  type: 'salary' | 'hourly'
  pay: number // dollars a year, or dollars an hour
  freq: PayFrequency
  filing: 'single' | 'married'
  state: string
  k401: number
  health: number // dollars per pay period
}

const PEOPLE: Seed[] = [
  { name: 'Priya Raman', title: 'HR Director', department: 'People', role: 'hr_admin', hire: '2019-03-04', type: 'salary', pay: 128_000, freq: 'monthly', filing: 'single', state: 'TX', k401: 6, health: 260 },
  { name: 'Arjun Mehta', title: 'Engineering Manager', department: 'Engineering', role: 'manager', hire: '2020-08-17', type: 'salary', pay: 156_000, freq: 'biweekly', filing: 'married', state: 'CA', k401: 8, health: 140 },
  { name: 'Sofia Alvarez', title: 'Operations Manager', department: 'Operations', role: 'manager', hire: '2021-02-01', type: 'salary', pay: 118_000, freq: 'monthly', filing: 'single', state: 'TX', k401: 6, health: 240 },
  { name: 'Daniel Okafor', title: 'Sales Manager', department: 'Sales', role: 'manager', hire: '2020-01-13', type: 'salary', pay: 112_000, freq: 'biweekly', filing: 'married', state: 'NY', k401: 5, health: 120 },
  { name: 'Meera Kapoor', title: 'Software Engineer', department: 'Engineering', role: 'employee', manager: 'Arjun Mehta', hire: '2022-06-06', type: 'salary', pay: 128_000, freq: 'biweekly', filing: 'single', state: 'CA', k401: 10, health: 75 },
  { name: 'Liam Chen', title: 'Software Engineer', department: 'Engineering', role: 'employee', manager: 'Arjun Mehta', hire: '2023-01-09', type: 'salary', pay: 118_000, freq: 'biweekly', filing: 'single', state: 'WA', k401: 5, health: 75 },
  { name: 'Hannah Berg', title: 'QA Engineer', department: 'Engineering', role: 'employee', manager: 'Arjun Mehta', hire: '2023-09-18', type: 'salary', pay: 96_000, freq: 'biweekly', filing: 'single', state: 'IL', k401: 4, health: 75 },
  { name: 'Ravi Shankar', title: 'Data Analyst', department: 'Engineering', role: 'employee', manager: 'Arjun Mehta', hire: '2024-04-01', type: 'salary', pay: 92_000, freq: 'biweekly', filing: 'single', state: 'TX', k401: 3, health: 75 },
  { name: 'Noah Patel', title: 'Product Designer', department: 'Engineering', role: 'employee', manager: 'Arjun Mehta', hire: '2022-10-03', type: 'salary', pay: 104_000, freq: 'biweekly', filing: 'married', state: 'NY', k401: 6, health: 140 },
  { name: 'Ava Thompson', title: 'Operations Coordinator', department: 'Operations', role: 'employee', manager: 'Sofia Alvarez', hire: '2023-05-15', type: 'hourly', pay: 24.5, freq: 'biweekly', filing: 'single', state: 'TX', k401: 3, health: 60 },
  { name: 'Marcus Reed', title: 'Warehouse Associate', department: 'Operations', role: 'employee', manager: 'Sofia Alvarez', hire: '2024-02-12', type: 'hourly', pay: 21, freq: 'biweekly', filing: 'single', state: 'GA', k401: 0, health: 60 },
  { name: 'Ella Rossi', title: 'Support Specialist', department: 'Operations', role: 'employee', manager: 'Sofia Alvarez', hire: 'recent:84', type: 'salary', pay: 54_000, freq: 'biweekly', filing: 'single', state: 'IL', k401: 2, health: 60 },
  { name: 'Zoe Williams', title: 'Sales Representative', department: 'Sales', role: 'employee', manager: 'Daniel Okafor', hire: '2023-03-06', type: 'salary', pay: 78_000, freq: 'biweekly', filing: 'single', state: 'CO', k401: 4, health: 75 },
  { name: 'Omar Haddad', title: 'Sales Representative', department: 'Sales', role: 'employee', manager: 'Daniel Okafor', hire: '2024-07-08', type: 'salary', pay: 82_000, freq: 'biweekly', filing: 'married', state: 'NY', k401: 5, health: 140 },
]

const HOLIDAYS: Record<number, [string, string][]> = {
  2026: [['01-01', "New Year's Day"], ['01-19', 'Martin Luther King Jr. Day'], ['02-16', "Presidents' Day"], ['05-25', 'Memorial Day'], ['06-19', 'Juneteenth'], ['07-03', 'Independence Day (observed)'], ['09-07', 'Labor Day'], ['10-12', 'Columbus Day'], ['11-11', 'Veterans Day'], ['11-26', 'Thanksgiving'], ['12-25', 'Christmas Day']],
  2027: [['01-01', "New Year's Day"], ['01-18', 'Martin Luther King Jr. Day'], ['02-15', "Presidents' Day"], ['05-31', 'Memorial Day'], ['06-18', 'Juneteenth (observed)'], ['07-05', 'Independence Day (observed)'], ['09-06', 'Labor Day'], ['10-11', 'Columbus Day'], ['11-11', 'Veterans Day'], ['11-25', 'Thanksgiving'], ['12-24', 'Christmas Day (observed)']],
}

const nextWeekday = (d: ISODate): ISODate => {
  let x = d
  while (isWeekend(x)) x = addDays(x, 1)
  return x
}

/** deterministic pseudo-random numbers so the demo data is the same every run */
function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (Math.imul(a, 1664525) + 1013904223) >>> 0
    return a / 4294967296
  }
}

export interface SeedOptions {
  today: ISODate
  /** run payroll for every closed period this year except the latest one */
  withPayrollHistory?: boolean
}

export async function seedDemo(services: Services, opts: SeedOptions): Promise<{ employees: number; runs: number }> {
  const { db } = services
  const today = opts.today
  const hash = await services.auth.hashPassword(DEMO_PASSWORD)
  const ids = new Map<string, string>()
  const hireOf = new Map<string, ISODate>()

  for (const p of DEFAULT_POLICIES)
    await db.query('INSERT INTO leave_policies (type, annual_days, max_balance, paid, min_notice_days) VALUES ($1,$2,$3,$4,$5)', [p.type, p.annualDays, p.maxBalance, p.paid, p.minNoticeDays])

  for (const y of [year(today) - 1, year(today), year(today) + 1])
    for (const [md, name] of HOLIDAYS[y] ?? []) await db.query('INSERT INTO holidays (date, name) VALUES ($1, $2)', [`${y}-${md}`, name])

  for (const p of PEOPLE) {
    const hire = p.hire.startsWith('recent:') ? nextWeekday(addDays(today, -Number(p.hire.slice(7)))) : (p.hire as ISODate)
    const email = `${p.name.toLowerCase().replace(/ /g, '.')}@northwind.test`
    const rows = await db.query<{ id: string }>(
      `INSERT INTO employees (name, email, title, department, manager_id, hire_date, pay_type, annual_salary_cents, hourly_rate_cents,
                              pay_frequency, filing_status, state, k401_pct, health_premium_cents)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`,
      [p.name, email, p.title, p.department, p.manager ? ids.get(p.manager) : null, hire, p.type,
        p.type === 'salary' ? Math.round(p.pay * 100) : 0, p.type === 'hourly' ? Math.round(p.pay * 100) : 0,
        p.freq, p.filing, p.state, p.k401, p.health * 100],
    )
    ids.set(p.name, rows[0].id)
    hireOf.set(p.name, hire)
    await db.query('INSERT INTO users (email, password_hash, role, employee_id) VALUES ($1,$2,$3,$4)', [email, hash, p.role, rows[0].id])
  }

  const holidaySet = new Set((await db.query<{ date: string }>('SELECT date FROM holidays')).map((h) => h.date))
  const leave = async (who: string, type: LeaveType, from: number, length: number, status: LeaveStatus, reason: string, decidedBy?: string) => {
    const start = nextWeekday(addDays(today, from))
    let end = start
    for (let n = 1; n < length; n++) end = nextWeekday(addDays(end, 1))
    const days = countBusinessDays(start, end, holidaySet)
    if (days === 0) return
    const decided = status === 'approved' || status === 'rejected'
    await db.query(
      `INSERT INTO leave_requests (employee_id, type, start_date, end_date, days, status, reason, decided_by, decided_at, decision_note)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,${decided ? 'now()' : 'NULL'},$9)`,
      [ids.get(who), type, start, end, days, status, reason, decided ? ids.get(decidedBy ?? 'Priya Raman') : null, decided ? (status === 'rejected' ? 'Release week, please pick another slot.' : 'Enjoy!') : null],
    )
  }
  await leave('Meera Kapoor', 'vacation', -63, 5, 'approved', 'Family trip', 'Arjun Mehta')
  await leave('Meera Kapoor', 'sick', -20, 2, 'approved', 'Flu', 'Arjun Mehta')
  await leave('Meera Kapoor', 'vacation', 21, 5, 'pending', 'Long weekend away and a few days after')
  await leave('Liam Chen', 'vacation', 6, 4, 'approved', 'Visiting family', 'Arjun Mehta')
  await leave('Hannah Berg', 'personal', 10, 1, 'pending', 'Moving apartments')
  await leave('Arjun Mehta', 'vacation', 40, 8, 'approved', 'Summer break', 'Priya Raman')
  await leave('Noah Patel', 'unpaid', -36, 3, 'approved', 'Personal project', 'Arjun Mehta')
  await leave('Marcus Reed', 'sick', -14, 2, 'approved', 'Dentist and recovery', 'Sofia Alvarez')
  await leave('Zoe Williams', 'vacation', 3, 3, 'rejected', 'Quarter-end push', 'Daniel Okafor')
  await leave('Zoe Williams', 'vacation', 28, 5, 'pending', 'Wedding')
  await leave('Omar Haddad', 'vacation', 9, 5, 'approved', 'Hiking trip', 'Daniel Okafor')
  await leave('Ravi Shankar', 'personal', 5, 1, 'pending', 'Appointment')

  // timesheets for hourly staff from the start of the year (or their hire date)
  const r = rng(42)
  const yearStart = `${year(today)}-01-01`
  for (const p of PEOPLE.filter((x) => x.type === 'hourly')) {
    const id = ids.get(p.name)!
    const from = hireOf.get(p.name)! > yearStart ? hireOf.get(p.name)! : yearStart
    const stop = addDays(today, -1)
    if (from > stop) continue
    const values: string[] = []
    const params: unknown[] = []
    for (const d of eachDay(from, stop)) {
      if (isWeekend(d) || holidaySet.has(d)) continue
      const busyWeek = Math.floor(Date.parse(d) / 604_800_000) % 5 === 0
      const hours = Math.round((busyWeek ? 8.5 + r() * 2.2 : 7.4 + r() * 1.2) * 4) / 4
      params.push(id, d, hours)
      values.push(`($${params.length - 2}, $${params.length - 1}, $${params.length})`)
    }
    if (values.length) await db.query(`INSERT INTO timesheet_entries (employee_id, work_date, hours) VALUES ${values.join(',')}`, params)
  }

  // Past payroll: everything this year that has closed except the newest period, which HR can run live.
  let runs = 0
  if (opts.withPayrollHistory !== false) {
    const hr = { userId: 'seed', employeeId: ids.get('Priya Raman')!, role: 'hr_admin' as Role }
    for (const freq of ['biweekly', 'monthly'] as PayFrequency[]) {
      const closed = periodsFor(freq, year(today)).filter((p) => p.end < today)
      for (const p of closed.slice(0, -1)) {
        await services.payroll.commit(hr, { frequency: freq, periodStart: p.start })
        runs++
      }
    }
  }
  await db.query('DELETE FROM audit_log')
  return { employees: PEOPLE.length, runs }
}

export async function isSeeded(db: Db): Promise<boolean> {
  return (await db.query<{ n: number }>('SELECT count(*)::int AS n FROM employees'))[0].n > 0
}
