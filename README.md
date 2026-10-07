# Ledgerly

Payroll and time-off management for a small company. Employees request leave and read payslips, managers approve their team's requests, and HR runs payroll for everyone. React front end, Express API, PostgreSQL, and a payroll engine with property-based tests.

**[Try the live demo →](https://duelboy03.github.io/ledgerly/)** Pick a role on the sign-in screen. The whole backend runs in your browser (see [Two ways to run it](#two-ways-to-run-it)), so there is nothing to install and nothing leaves your machine.

![Payroll screen: pay periods, totals and a paycheck per employee](docs/screenshots/payroll.png)

<table>
<tr>
<td><img src="docs/screenshots/dashboard-hr.png" alt="HR dashboard"></td>
<td><img src="docs/screenshots/leave-request.png" alt="Leave request with live validation"></td>
</tr>
<tr>
<td><img src="docs/screenshots/payslip.png" alt="Payslip with a breakdown of where the pay went"></td>
<td><img src="docs/screenshots/calendar.png" alt="Team calendar with holidays"></td>
</tr>
<tr>
<td><img src="docs/screenshots/approvals.png" alt="Manager approval queue"></td>
<td><img src="docs/screenshots/dashboard-dark.png" alt="Dark theme"></td>
</tr>
</table>

## What it does

**Employees** request time off with live validation (working days, holidays, notice period, overlaps, and the balance they will have *on the day the leave starts*), track balances that accrue monthly, see a team calendar, log hours if they are hourly, and read a payslip that shows exactly where each dollar went.

**Managers** get an approval queue of their direct reports' requests, with a note on every decision. They never see their reports' pay.

**HR** previews a closed pay period, checks the totals, runs payroll, edits pay details, and reads an append-only audit log.

### The payroll engine

`packages/domain/src/payroll.ts` is a pure function: `computePaycheck(employee, period, hours, ytd) → paycheck`. All money is integer cents.

- Salaried pay by pay frequency (weekly, biweekly, semi-monthly, monthly), prorated by working days for a mid-period start, with unpaid leave deducted at the daily rate.
- Hourly pay with **overtime at 1.5x for hours over 40 in each Monday-to-Sunday week**, not averaged across the period.
- Pre-tax health premium and 401(k) deferral, with the **annual 401(k) limit tracked year to date**.
- Federal income tax by the annualised percentage method, Social Security with the **wage base cap**, Medicare plus the **additional Medicare tax above $200,000**, and a flat illustrative state rate.
- Employer cost: matching FICA, FUTA up to its wage base, and a 401(k) match.
- Net pay can never go below zero, and the paycheck says so when it had to cap something.

> The tax tables are a simplified model for demonstration. They are not tax advice and must not be used to pay real people.

### Leave rules

`packages/domain/src/leave.ts` holds the rules as pure functions: monthly accrual (a mid-year hire starts the month after they join), balance with pending requests, request validation, and an approval state machine. A requester can never decide their own request, a manager can only decide their own reports', and leave that has already started cannot be cancelled without HR.

## How it is put together

```mermaid
flowchart LR
  subgraph Browser
    UI[React app<br/>TanStack Query + Tailwind]
  end
  subgraph Server["Express API (Node)"]
    R[REST routes<br/>JWT + rate limit + helmet]
  end
  subgraph Core["Shared code"]
    S[Services<br/>auth, leave, payroll, employees]
    D[Domain<br/>payroll engine + leave rules]
    A[Authorization rules]
  end
  DB[(PostgreSQL)]
  UI -- "HTTP (server mode)" --> R --> S
  UI -- "direct calls (demo mode)" --> S
  S --> D
  S --> A
  S -- "pg driver or PGlite" --> DB
```

| Package | What is in it |
| --- | --- |
| `packages/domain` | Dates, money, tax tables, the payroll engine, leave rules. No I/O, no framework. |
| `packages/api` | SQL migrations, services, authorization, the Express app, seed data. |
| `apps/web` | The React app. It talks to a `LedgerlyApi` interface with two implementations. |

### Two ways to run it

The web app codes against one `LedgerlyApi` interface.

- **Server mode:** `HttpApi` calls the Express API. This is the normal deployment.
- **Demo mode:** `LocalApi` calls the same services directly, with PostgreSQL compiled to WebAssembly ([PGlite](https://pglite.dev)) running in the browser tab and seeded on load. The hosted demo uses this, so it needs no server and holds no secrets, yet it runs the same SQL, authorization and payroll code as the API. A sign-in still produces a signed JWT that is re-verified on every call.

Because the database sits behind a small `Db` interface (`query`, `exec`, `transaction`), the API runs on **real PostgreSQL via `pg`** when `DATABASE_URL` is set, and on PGlite otherwise.

## Security and correctness decisions

- **Authorization lives in one file** (`packages/api/src/authz.ts`) and every service calls it. Managers do not see their reports' pay; an employee can read only their own paycheck, and asking for someone else's returns "not found" so ids cannot be probed.
- **The role is re-read from the database on every request**, so a demotion or deactivation applies immediately instead of when a token expires.
- **Sign-in does not reveal whether an email exists** (same message, and a dummy bcrypt comparison keeps timing alike), and is rate limited.
- **Input is validated with zod** at the service boundary, and unknown fields on an update are rejected rather than ignored.
- **Money is integer cents** everywhere, so there is no floating-point drift. A property test asserts `net + deductions + taxes = gross` for hundreds of random employees.
- **Payroll runs are transactional and ordered.** A period can be run once, periods must be run in order (so year-to-date limits are right), and each run is written to the audit log.
- **Decisions use a row lock** (`SELECT … FOR UPDATE`) so two approvers cannot decide the same request, and approval re-checks the balance because it may have changed since the request was made.
- Calendar entries for other people show only "leave", never the type, and pending requests are visible only to the requester and the people who can decide them.

## Run it

```bash
npm install

npm run dev:demo      # the whole app in the browser, no server (http://localhost:5173)
npm run dev           # API on :4000 plus the web app on :5173 (PGlite stored in packages/api/.data)
```

To use a real PostgreSQL:

```bash
docker compose up -d
DATABASE_URL=postgres://ledgerly:ledgerly@localhost:5432/ledgerly npm run dev
```

Demo accounts all use the password `demo1234`: `priya.raman@northwind.test` (HR), `arjun.mehta@northwind.test` (manager), `meera.kapoor@northwind.test` (employee). Set `JWT_SECRET` for anything beyond local use (see `.env.example`).

| Command | What it does |
| --- | --- |
| `npm test` | Unit and integration tests (Vitest) |
| `npm run coverage` | The same with a coverage report |
| `npm run test:e2e` | Browser tests (Playwright, uses installed Chrome) |
| `npm run typecheck` / `npm run lint` | `tsc` and oxlint |
| `npm run build:demo` | Production build of the in-browser demo |

## Testing

**101 unit and integration tests and 10 browser tests**, with about 94% statement coverage (99.6% in the domain package).

- **Domain:** hand-worked paychecks, overtime across weeks, the 401(k) cap, the Social Security wage base, additional Medicare, proration, unpaid leave, accrual, validation, the approval state machine, and `fast-check` properties (net plus deductions equals gross; more salary never lowers withholding).
- **Services against a real Postgres engine:** authentication, who can see which pay, the full request-approve-balance cycle, calendar visibility, timesheets, and seeded payroll history, including year-to-date carry-over and proration of a new hire.
- **HTTP:** supertest against the Express app for status codes, bearer-token enforcement, structured validation errors, malformed ids and JSON, and the sign-in rate limit.
- **The `pg` driver:** the production path is exercised too. PGlite is exposed over the PostgreSQL wire protocol and the same services run through `pg`, covering migrations, `DATE` parsing, transactions, rollback and the row lock.
- **Browser:** Playwright drives the demo through role changes, a request approved by a manager, payroll run by HR, field-level validation errors, and pages that must be hidden from the wrong role.

## Stack

React 19 · TypeScript · Vite · Tailwind CSS 4 · TanStack Query · React Router · Express 5 · PostgreSQL (`pg`) / PGlite · zod · jose (JWT) · bcryptjs · Vitest · fast-check · Playwright · GitHub Actions

## License

MIT
