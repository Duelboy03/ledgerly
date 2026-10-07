import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Printer } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { useApi } from '../api'
import { PaycheckBreakdown } from '../components/PaycheckBreakdown'
import { Alert, Button, Card, Skeleton } from '../components/ui'
import { fmtDate, fmtRange, money } from '../lib/format'

export function Payslip() {
  const { id } = useParams()
  const { api } = useApi()
  const q = useQuery({ queryKey: ['paycheck', id], queryFn: () => api.paycheck(id!) })

  if (q.isLoading) return <Skeleton className="h-96" />
  if (q.error) return <Alert tone="bad">{(q.error as Error).message}</Alert>
  const p = q.data!

  return (
    <div className="mx-auto max-w-2xl">
      <div className="no-print mb-5 flex items-center justify-between">
        <Link to="/payslips" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-sub hover:text-ink"><ArrowLeft size={15} /> All payslips</Link>
        <Button onClick={() => window.print()}><Printer size={15} /> Print</Button>
      </div>
      <Card className="p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-sub">Payslip</p>
            <h1 className="mt-1 text-xl font-semibold">{p.employeeName}</h1>
            <p className="mt-0.5 text-[13px] text-sub">Northwind Labs</p>
          </div>
          <dl className="text-right text-[13px]">
            <dt className="text-sub">Pay date</dt>
            <dd className="font-semibold">{fmtDate(p.payDate)}</dd>
            <dt className="mt-2 text-sub">Pay period</dt>
            <dd className="font-medium">{fmtRange(p.periodStart, p.periodEnd)}</dd>
          </dl>
        </div>
        <div className="py-6"><PaycheckBreakdown p={p.paycheck} /></div>
        <div className="grid grid-cols-2 gap-4 rounded-lg bg-surface-2 p-4 text-sm">
          <div><p className="text-xs text-sub">Gross pay, year to date</p><p className="num mt-0.5 font-semibold">{money(p.ytd.grossCents)}</p></div>
          <div><p className="text-xs text-sub">Take-home, year to date</p><p className="num mt-0.5 font-semibold">{money(p.ytd.netCents)}</p></div>
        </div>
        <p className="mt-5 text-xs text-muted">Illustrative figures from a simplified payroll model, not tax advice.</p>
      </Card>
    </div>
  )
}
