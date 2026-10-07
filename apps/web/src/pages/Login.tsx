import { Building2, ShieldCheck, UserRound, Users } from 'lucide-react'
import { useState } from 'react'
import { MODE } from '../api'
import { useAuth } from '../components/auth'
import { Alert, Button, Field, Input } from '../components/ui'

const PERSONAS = [
  { email: 'priya.raman@northwind.test', name: 'Priya Raman', role: 'HR admin', note: 'Runs payroll, sees everyone', icon: ShieldCheck },
  { email: 'arjun.mehta@northwind.test', name: 'Arjun Mehta', role: 'Manager', note: 'Approves his team’s leave', icon: Users },
  { email: 'meera.kapoor@northwind.test', name: 'Meera Kapoor', role: 'Employee', note: 'Requests time off, reads payslips', icon: UserRound },
]

export function Login() {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: string, p: string) => {
    setBusy(true)
    setError('')
    try {
      await login(e, p)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid min-h-full lg:grid-cols-[1.05fr_1fr]">
      <div className="relative hidden overflow-hidden bg-[#0b3b37] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{ background: 'radial-gradient(600px 400px at 20% 10%, rgb(45 212 191 / 0.25), transparent 60%), radial-gradient(500px 400px at 90% 90%, rgb(94 234 212 / 0.14), transparent 60%)' }}
        />
        <div className="relative flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/15 text-base font-bold">L</span>
          <span className="text-lg font-semibold tracking-tight">Ledgerly</span>
        </div>
        <div className="relative max-w-md">
          <h1 className="text-4xl font-semibold leading-[1.1] tracking-tight">Payroll and time off, without the spreadsheet.</h1>
          <p className="mt-4 text-[15px] leading-relaxed text-white/70">
            Request leave, get it approved by the right person, and see exactly where every paycheck dollar went. Run payroll for the whole company in a few clicks.
          </p>
          <dl className="mt-10 grid grid-cols-3 gap-6 border-t border-white/15 pt-6 text-sm">
            {[
              ['Payroll engine', 'Overtime, 401(k), FICA, YTD caps'],
              ['Approvals', 'Role-based, fully audited'],
              ['Real SQL', 'PostgreSQL under the hood'],
            ].map(([t, d]) => (
              <div key={t}>
                <dt className="font-medium">{t}</dt>
                <dd className="mt-1 text-white/60">{d}</dd>
              </div>
            ))}
          </dl>
        </div>
        <p className="relative flex items-center gap-2 text-xs text-white/50">
          <Building2 size={14} /> Demo company: Northwind Labs. All people and numbers are fictional.
        </p>
      </div>

      <div className="flex items-center justify-center p-6">
        <div className="enter w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand text-sm font-bold text-brand-ink">L</span>
            <span className="text-lg font-semibold tracking-tight">Ledgerly</span>
          </div>
          <h2 className="text-2xl font-semibold tracking-tight">Sign in</h2>
          <p className="mt-1 text-sm text-sub">{MODE === 'demo' ? 'Pick a role to explore the demo.' : 'Use your work email.'}</p>

          <div className="mt-6 space-y-2.5">
            {PERSONAS.map((p) => (
              <button
                key={p.email}
                disabled={busy}
                onClick={() => submit(p.email, 'demo1234')}
                className="flex w-full items-center gap-3 rounded-xl border border-line bg-surface p-3 text-left shadow-card transition-colors hover:border-brand hover:bg-brand-soft disabled:opacity-60"
              >
                <span className="grid h-10 w-10 place-items-center rounded-lg bg-brand-soft text-brand">
                  <p.icon size={19} />
                </span>
                <span className="flex-1">
                  <span className="block text-sm font-semibold">
                    {p.name} <span className="font-normal text-sub">· {p.role}</span>
                  </span>
                  <span className="block text-xs text-sub">{p.note}</span>
                </span>
              </button>
            ))}
          </div>

          <div className="my-6 flex items-center gap-3 text-xs text-muted">
            <span className="h-px flex-1 bg-line" /> or use email <span className="h-px flex-1 bg-line" />
          </div>

          <form
            className="space-y-3.5"
            onSubmit={(e) => {
              e.preventDefault()
              submit(email, password)
            }}
          >
            <Field label="Email">{(id) => <Input id={id} type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />}</Field>
            <Field label="Password">{(id) => <Input id={id} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />}</Field>
            {error && <Alert tone="bad">{error}</Alert>}
            <Button variant="primary" className="w-full" loading={busy} type="submit">
              Sign in
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
