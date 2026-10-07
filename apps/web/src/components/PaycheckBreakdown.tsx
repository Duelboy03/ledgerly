import type { Line, Paycheck } from '@ledgerly/domain'
import { Alert, cn } from './ui'
import { money } from '../lib/format'

function Lines({ title, lines, total, negative }: { title: string; lines: Line[]; total?: number; negative?: boolean }) {
  if (lines.length === 0) return null
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-sub">{title}</h3>
      <ul className="divide-y divide-line rounded-lg border border-line">
        {lines.map((l) => (
          <li key={l.code} className="flex items-center justify-between gap-4 px-3.5 py-2.5 text-sm">
            <span>{l.label}</span>
            <span className={cn('num', l.cents < 0 && 'text-bad')}>{negative && l.cents > 0 ? '−' : ''}{money(Math.abs(l.cents)).replace(/^/, l.cents < 0 && !negative ? '−' : '')}</span>
          </li>
        ))}
        {total !== undefined && (
          <li className="flex items-center justify-between bg-surface-2/60 px-3.5 py-2.5 text-sm font-semibold">
            <span>Total</span>
            <span className="num">{negative ? '−' : ''}{money(total)}</span>
          </li>
        )}
      </ul>
    </div>
  )
}

/** Where one paycheck went: a stacked bar plus the full line-by-line breakdown. */
export function PaycheckBreakdown({ p, showEmployer = false }: { p: Paycheck; showEmployer?: boolean }) {
  const parts = [
    { key: 'Take-home', cents: p.netCents, color: 'var(--brand)' },
    { key: 'Taxes', cents: p.taxCents, color: 'var(--warn)' },
    { key: 'Pre-tax deductions', cents: p.preTaxCents, color: 'var(--info)' },
  ]
  const total = Math.max(1, p.grossCents)
  return (
    <div className="space-y-5">
      <div>
        <div className="mb-2 flex items-baseline justify-between">
          <p className="text-sm text-sub">Gross pay</p>
          <p className="num text-lg font-semibold">{money(p.grossCents)}</p>
        </div>
        <div className="flex h-3 overflow-hidden rounded-full bg-surface-2" role="img" aria-label={parts.map((x) => `${x.key} ${Math.round((x.cents / total) * 100)}%`).join(', ')}>
          {parts.map((x) => <div key={x.key} style={{ width: `${(x.cents / total) * 100}%`, background: x.color }} />)}
        </div>
        <ul className="mt-3 grid grid-cols-3 gap-3 text-[13px]">
          {parts.map((x) => (
            <li key={x.key}>
              <p className="flex items-center gap-1.5 text-sub"><span className="h-2 w-2 rounded-full" style={{ background: x.color }} />{x.key}</p>
              <p className="num mt-0.5 font-semibold">{money(x.cents)} <span className="font-normal text-sub">{Math.round((x.cents / total) * 100)}%</span></p>
            </li>
          ))}
        </ul>
      </div>
      {p.notes.map((n) => <Alert key={n} tone="info">{n}</Alert>)}
      <Lines title="Earnings" lines={p.earnings} total={p.grossCents} />
      <Lines title="Pre-tax deductions" lines={p.preTax} total={p.preTaxCents} negative />
      <Lines title="Taxes withheld" lines={p.taxes} total={p.taxCents} negative />
      {showEmployer && <Lines title="Employer cost on top of gross" lines={p.employer} total={p.employerCostCents - p.grossCents} />}
      <div className="flex items-center justify-between rounded-xl bg-brand-soft px-4 py-3.5">
        <span className="text-sm font-semibold text-brand">Net pay</span>
        <span className="num text-xl font-semibold text-brand">{money(p.netCents)}</span>
      </div>
    </div>
  )
}
