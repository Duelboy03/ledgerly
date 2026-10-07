import type { Db } from './types'

export interface Migration {
  id: number
  name: string
  sql: string
}

export const MIGRATIONS: Migration[] = [
  {
    id: 1,
    name: 'initial schema',
    sql: `
CREATE TABLE employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  department TEXT NOT NULL,
  manager_id UUID REFERENCES employees(id),
  hire_date DATE NOT NULL,
  pay_type TEXT NOT NULL CHECK (pay_type IN ('salary', 'hourly')),
  annual_salary_cents INTEGER NOT NULL DEFAULT 0 CHECK (annual_salary_cents >= 0),
  hourly_rate_cents INTEGER NOT NULL DEFAULT 0 CHECK (hourly_rate_cents >= 0),
  pay_frequency TEXT NOT NULL CHECK (pay_frequency IN ('weekly', 'biweekly', 'semimonthly', 'monthly')),
  filing_status TEXT NOT NULL CHECK (filing_status IN ('single', 'married')),
  state TEXT NOT NULL,
  k401_pct DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (k401_pct BETWEEN 0 AND 100),
  health_premium_cents INTEGER NOT NULL DEFAULT 0 CHECK (health_premium_cents >= 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'terminated'))
);
CREATE INDEX employees_manager_idx ON employees (manager_id);

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('employee', 'manager', 'hr_admin')),
  employee_id UUID NOT NULL UNIQUE REFERENCES employees(id)
);

CREATE TABLE leave_policies (
  type TEXT PRIMARY KEY CHECK (type IN ('vacation', 'sick', 'personal', 'unpaid')),
  annual_days DOUBLE PRECISION NOT NULL,
  max_balance DOUBLE PRECISION NOT NULL,
  paid BOOLEAN NOT NULL,
  min_notice_days INTEGER NOT NULL
);

CREATE TABLE holidays (date DATE PRIMARY KEY, name TEXT NOT NULL);

CREATE TABLE leave_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id),
  type TEXT NOT NULL REFERENCES leave_policies(type),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  days INTEGER NOT NULL CHECK (days > 0),
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  reason TEXT NOT NULL DEFAULT '',
  decided_by UUID REFERENCES employees(id),
  decided_at TIMESTAMPTZ,
  decision_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);
CREATE INDEX leave_requests_employee_idx ON leave_requests (employee_id, start_date);
CREATE INDEX leave_requests_status_idx ON leave_requests (status);

CREATE TABLE timesheet_entries (
  employee_id UUID NOT NULL REFERENCES employees(id),
  work_date DATE NOT NULL,
  hours DOUBLE PRECISION NOT NULL CHECK (hours >= 0 AND hours <= 24),
  PRIMARY KEY (employee_id, work_date)
);

CREATE TABLE payroll_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  frequency TEXT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  pay_date DATE NOT NULL,
  created_by UUID NOT NULL REFERENCES employees(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (frequency, period_start, period_end)
);

CREATE TABLE paychecks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id),
  gross_cents INTEGER NOT NULL,
  net_cents INTEGER NOT NULL,
  employer_cost_cents INTEGER NOT NULL,
  data JSONB NOT NULL,
  UNIQUE (run_id, employee_id)
);
CREATE INDEX paychecks_employee_idx ON paychecks (employee_id);

CREATE TABLE audit_log (
  id BIGSERIAL PRIMARY KEY,
  at TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_id UUID,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT,
  detail JSONB NOT NULL DEFAULT '{}'
);
`,
  },
]

export async function migrate(db: Db): Promise<number> {
  await db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (id INTEGER PRIMARY KEY, name TEXT NOT NULL)')
  const done = new Set((await db.query<{ id: number }>('SELECT id FROM schema_migrations')).map((r) => r.id))
  let applied = 0
  for (const m of MIGRATIONS) {
    if (done.has(m.id)) continue
    await db.transaction(async (tx) => {
      // PGlite and pg both accept multi-statement scripts only without parameters
      await tx.exec(m.sql)
      await tx.query('INSERT INTO schema_migrations (id, name) VALUES ($1, $2)', [m.id, m.name])
    })
    applied++
  }
  return applied
}
