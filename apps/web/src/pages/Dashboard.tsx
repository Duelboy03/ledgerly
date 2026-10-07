import { useQuery } from '@tanstack/react-query'
import { CalendarClock, ChevronRight, Wallet } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useApi } from '../api'
import { useAuth } from '../components/auth'
import { Badge, Button, Card, CardHeader, EmptyState, PageHeader, Ring, Skeleton, Stat, StatusBadge } from '../components/ui'
import { days, fmtDate, fmtRange, money, moneyShort, plural, typeLabel } from '../lib/format'

export function Dashboard() {
  const { user } = useAuth()
  const { api } = useApi()
  const me = user!
  const isHr = me.role === 'hr_admin'
  const isMgr = me.role !== 'employee'

  const meta = useQuery({ queryKey: ['meta'], queryFn: () => api.meta() })
  const balances = useQuery({ queryKey: ['balances', me.employeeId], queryFn: () => api.balances() })
  const mine = useQuery({ queryKey: ['leave', 'mine'], queryFn: () => api.leaveRequests('mine') })
  const checks = useQuery({ queryKey: ['paychecks'], queryFn: () => api.myPaychecks() })
  const queue = useQuery({ queryKey: ['approvals'], queryFn: () => api.approvals(), enabled: isMgr })
  const month = meta.data?.today.slice(0, 7)
  const cal = useQuery({ queryKey: ['calendar', month], queryFn: () => api.calendar(month!), enabled: !!month })
  const runs = useQuery({ queryKey: ['runs'], queryFn: () => api.payrollRuns(), enabled: isHr })
  const periods = useQuery({
    queryKey: ['periods', 'biweekly', meta.data?.today.slice(0, 4)],
    queryFn: () => api.payrollPeriods('biweekly', Number(meta.data!.today.slice(0, 4))),
    enabled: isHr && !!meta.data,
  })
  const directory = useQuery({ queryKey: ['directory'], queryFn: () => api.directory(), enabled: isHr })

  const today = meta.data?.today
  const vac = balances.data?.find((b) => b.type === 'vacation')
  const sick = balances.data?.find((b) => b.type === 'sick')
  const upcoming = (mine.data ?? []).filter((r) => (r.status === 'approved' || r.status === 'pending') && today && r.endDate >= today).slice(0, 4)
  const lastPay = checks.data?.[0]
  const awayNow = (cal.data?.entries ?? []).filter((e) => e.status === 'approved' && today && e.startDate <= today && e.endDate >= today)
  const awaySoon = (cal.data?.entries ?? []).filter((e) => e.status === 'approved' && today && e.startDate > today && e.startDate <= addDay(today, 14))
  const openPeriod = periods.data?.find((p) => p.closed && !p.runId)

  const byDept = new Map<string, number>()
  for (const d of directory.data ?? []) byDept.set(d.department, (byDept.get(d.department) ?? 0) + 1)
  const deptRows = [...byDept.entries()].sort((a, b) => b[1] - a[1])
  const maxDept = Math.max(1, ...deptRows.map(([, n]) => n))

  return (
    <>
      <PageHeader title={`Good ${greeting()}, ${me.name.split(' ')[0]}`} subtitle={`${me.title} · ${me.department}`} actions={<Link to="/leave"><Button variant="primary">Request time off</Button></Link>} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="p-5">
          <p className="mb-3 text-[13px] font-medium text-sub">Vacation available</p>
          {balances.isLoading || !vac ? (
            <Skeleton className="h-[76px]" />
          ) : (
            <Ring value={Math.max(0, vac.available)} max={Math.max(vac.accrued + vac.carryOver, 1)} label={Number.isFinite(vac.available) ? trim(vac.available) : '∞'} sub={<><p className="font-medium">{days(vac.available)}</p><p className="text-xs text-sub">{trim(vac.used)} used · {trim(vac.pending)} pending</p></>} />
          )}
        </Card>
        <Card className="p-5">
          <p className="mb-3 text-[13px] font-medium text-sub">Sick leave available</p>
          {balances.isLoading || !sick ? (
            <Skeleton className="h-[76px]" />
          ) : (
            <Ring tone="info" value={Math.max(0, sick.available)} max={Math.max(sick.accrued, 1)} label={trim(sick.available)} sub={<><p className="font-medium">{days(sick.available)}</p><p className="text-xs text-sub">{trim(sick.used)} used this year</p></>} />
          )}
        </Card>
        {isMgr ? (
          <Link to="/approvals" className="block">
            <Stat label="Waiting for your decision" value={queue.data?.length ?? '–'} sub={queue.data?.length ? 'Review pending requests →' : 'You are all caught up'} tone={queue.data?.length ? 'bad' : 'good'} />
          </Link>
        ) : (
          <Stat label="Pending requests" value={mine.data?.filter((r) => r.status === 'pending').length ?? '–'} sub="Awaiting your manager" />
        )}
        <Link to={lastPay ? `/payslips/${lastPay.id}` : '/payslips'} className="block">
          <Stat label="Last take-home pay" value={lastPay ? money(lastPay.netCents) : '–'} sub={lastPay ? `Paid ${fmtDate(lastPay.payDate)} →` : 'No payslips yet'} />
        </Link>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader title="Your upcoming time off" action={<Link to="/leave" className="text-[13px] font-medium text-brand">All requests</Link>} />
          {mine.isLoading ? (
            <div className="space-y-3 p-5"><Skeleton className="h-10" /><Skeleton className="h-10" /></div>
          ) : upcoming.length === 0 ? (
            <EmptyState title="Nothing booked" hint="Time off you request will show up here." icon={<CalendarClock size={20} />} />
          ) : (
            <ul className="divide-y divide-line">
              {upcoming.map((r) => (
                <li key={r.id} className="flex items-center gap-4 px-5 py-3.5">
                  <div className="grid h-11 w-11 place-items-center rounded-lg bg-surface-2 text-center leading-none">
                    <div>
                      <p className="text-[10px] font-semibold uppercase text-sub">{fmtDate(r.startDate, { month: 'short' })}</p>
                      <p className="text-base font-semibold">{fmtDate(r.startDate, { day: 'numeric' })}</p>
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{typeLabel(r.type)} · {days(r.days)}</p>
                    <p className="text-[13px] text-sub">{fmtRange(r.startDate, r.endDate)}</p>
                  </div>
                  <StatusBadge status={r.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Who’s out" subtitle="Your department, next two weeks" action={<Link to="/calendar" className="text-[13px] font-medium text-brand">Calendar</Link>} />
          {cal.isLoading ? (
            <div className="space-y-3 p-5"><Skeleton className="h-9" /><Skeleton className="h-9" /></div>
          ) : awayNow.length + awaySoon.length === 0 ? (
            <EmptyState title="Everyone is in" hint="No approved time off in the next two weeks." />
          ) : (
            <ul className="divide-y divide-line">
              {[...awayNow.map((e) => ({ e, now: true })), ...awaySoon.map((e) => ({ e, now: false }))].slice(0, 5).map(({ e, now }, i) => (
                <li key={i} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{e.name}</p>
                    <p className="text-xs text-sub">{fmtRange(e.startDate, e.endDate)}</p>
                  </div>
                  {now ? <Badge tone="warn">Out today</Badge> : <Badge>Upcoming</Badge>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {isHr && (
        <div className="mt-6 grid gap-6 lg:grid-cols-5">
          <Card className="lg:col-span-3">
            <CardHeader title="Payroll" subtitle="Biweekly schedule" action={<Link to="/payroll"><Button size="sm">Open payroll</Button></Link>} />
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <div className="rounded-lg bg-surface-2 p-4">
                <p className="text-xs font-medium text-sub">Ready to run</p>
                {openPeriod ? (
                  <>
                    <p className="mt-1 text-base font-semibold">{fmtRange(openPeriod.start, openPeriod.end)}</p>
                    <p className="mt-0.5 text-[13px] text-sub">Pay date {fmtDate(openPeriod.payDate)}</p>
                    <Link to="/payroll" className="mt-3 inline-flex items-center gap-1 text-[13px] font-medium text-brand">Review and run <ChevronRight size={14} /></Link>
                  </>
                ) : (
                  <p className="mt-1 text-sm text-sub">Every closed period is paid.</p>
                )}
              </div>
              <div className="rounded-lg bg-surface-2 p-4">
                <p className="text-xs font-medium text-sub">Last run</p>
                {runs.data?.[0] ? (
                  <>
                    <p className="num mt-1 text-base font-semibold">{moneyShort(runs.data[0].totals.gross)} gross</p>
                    <p className="mt-0.5 text-[13px] text-sub">{plural(runs.data[0].totals.headcount, 'employee')} · paid {fmtDate(runs.data[0].payDate)}</p>
                  </>
                ) : (
                  <p className="mt-1 text-sm text-sub">No payroll has run yet.</p>
                )}
              </div>
            </div>
          </Card>
          <Card className="lg:col-span-2">
            <CardHeader title="Headcount" subtitle={`${directory.data?.length ?? 0} people`} />
            <ul className="space-y-3 p-5">
              {deptRows.map(([d, n]) => (
                <li key={d}>
                  <div className="mb-1 flex justify-between text-[13px]"><span>{d}</span><span className="num text-sub">{n}</span></div>
                  <div className="h-2 rounded-full bg-surface-2"><div className="h-full rounded-full bg-brand" style={{ width: `${(n / maxDept) * 100}%` }} /></div>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
      {!isHr && lastPay && (
        <Card className="mt-6 flex items-center gap-4 p-5">
          <span className="grid h-10 w-10 place-items-center rounded-lg bg-brand-soft text-brand"><Wallet size={19} /></span>
          <div className="flex-1">
            <p className="text-sm font-medium">Your latest payslip is ready</p>
            <p className="text-[13px] text-sub">Pay period {fmtRange(lastPay.periodStart, lastPay.periodEnd)}</p>
          </div>
          <Link to={`/payslips/${lastPay.id}`}><Button>View payslip</Button></Link>
        </Card>
      )}
    </>
  )
}

const trim = (n: number) => String(+n.toFixed(2))
const greeting = () => {
  const h = new Date().getHours()
  return h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening'
}
function addDay(d: string, n: number) {
  const t = new Date(`${d}T00:00:00Z`)
  t.setUTCDate(t.getUTCDate() + n)
  return t.toISOString().slice(0, 10)
}
