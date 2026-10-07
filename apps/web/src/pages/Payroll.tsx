import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Clock3, Play } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { PayFrequency } from '@ledgerly/domain'
import { useApi } from '../api'
import { PaycheckBreakdown } from '../components/PaycheckBreakdown'
import { Alert, Avatar, Badge, Button, Card, CardHeader, EmptyState, Modal, PageHeader, Skeleton, Stat, Table, Tabs, Td, Th, cn, useToast } from '../components/ui'
import { fmtDate, fmtRange, money, moneyShort, plural } from '../lib/format'
import type { PayrollTotals, PreviewRow } from '@ledgerly/api'

export function Payroll() {
  const { api } = useApi()
  const qc = useQueryClient()
  const toast = useToast()
  const meta = useQuery({ queryKey: ['meta'], queryFn: () => api.meta() })
  const year = Number(meta.data?.today.slice(0, 4))
  const [freq, setFreq] = useState<PayFrequency>('biweekly')
  const [selected, setSelected] = useState<string | null>(null)
  const [confirm, setConfirm] = useState(false)
  const [detail, setDetail] = useState<PreviewRow | null>(null)

  const periods = useQuery({ queryKey: ['periods', freq, String(year)], queryFn: () => api.payrollPeriods(freq, year), enabled: !!year })
  const list = useMemo(() => [...(periods.data ?? [])].reverse(), [periods.data])
  const current = list.find((p) => p.start === selected) ?? list.find((p) => p.closed && !p.runId) ?? list[0]

  useEffect(() => setSelected(null), [freq])

  const preview = useQuery({
    queryKey: ['preview', freq, current?.start],
    queryFn: () => api.previewPayroll(freq, current!.start),
    enabled: !!current && current.closed && !current.runId,
  })
  const run = useQuery({ queryKey: ['run', current?.runId], queryFn: () => api.payrollRun(current!.runId!), enabled: !!current?.runId })

  const commit = useMutation({
    mutationFn: () => api.commitPayroll(freq, current!.start),
    onSuccess: (r) => {
      qc.invalidateQueries()
      setConfirm(false)
      toast(`Payroll run: ${plural(r.totals.headcount, 'paycheck')}, ${money(r.totals.net)} net`)
    },
    onError: (e: Error) => {
      setConfirm(false)
      toast(e.message, 'bad')
    },
  })

  const rows: PreviewRow[] = run.data ? run.data.rows : preview.data?.rows ?? []
  const totals: PayrollTotals | undefined = run.data ? run.data.totals : preview.data?.totals
  const warnings = preview.data?.warnings ?? []
  const mode = !current ? 'none' : current.runId ? 'paid' : current.closed ? 'ready' : 'open'

  return (
    <>
      <PageHeader title="Payroll" subtitle="Preview a closed period, check the numbers, then run it." actions={<Tabs value={freq} onChange={setFreq} items={[{ id: 'biweekly', label: 'Biweekly' }, { id: 'monthly', label: 'Monthly' }]} />} />

      <div className="grid gap-6 lg:grid-cols-[15.5rem_minmax(0,1fr)]">
        <Card className="self-start">
          <CardHeader title={`${year} pay periods`} />
          {periods.isLoading ? <div className="p-4"><Skeleton className="h-40" /></div> : (
            <ul className="max-h-[34rem] divide-y divide-line overflow-y-auto" aria-label="Pay periods">
              {list.map((p) => {
                const active = p.start === current?.start
                return (
                  <li key={p.start}>
                    <button onClick={() => setSelected(p.start)} aria-current={active} className={cn('flex w-full items-center justify-between gap-2 px-4 py-3 text-left transition-colors', active ? 'bg-brand-soft' : 'hover:bg-surface-2')}>
                      <span>
                        <span className="block text-sm font-medium">{fmtRange(p.start, p.end)}</span>
                        <span className="block text-xs text-sub">Pay date {fmtDate(p.payDate, { month: 'short', day: 'numeric' })}</span>
                      </span>
                      {p.runId ? <CheckCircle2 size={17} className="text-good" aria-label="Paid" /> : p.closed ? <Badge tone="warn">Ready</Badge> : <Clock3 size={16} className="text-muted" aria-label="In progress" />}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>

        <div className="min-w-0 space-y-5">
          {mode === 'none' && <Card><EmptyState title="No pay periods yet" /></Card>}
          {mode === 'open' && current && <Alert tone="info">This period ({fmtRange(current.start, current.end)}) is still open. Payroll can be run once it closes on {fmtDate(current.end)}.</Alert>}

          {(mode === 'ready' || mode === 'paid') && current && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">{fmtRange(current.start, current.end)}</h2>
                  <p className="text-[13px] text-sub">Pay date {fmtDate(current.payDate)} · {mode === 'paid' ? <span className="text-good">Paid</span> : <span className="text-warn">Not yet run</span>}</p>
                </div>
                {mode === 'ready' && <Button variant="primary" disabled={!preview.data || preview.data.rows.length === 0} onClick={() => setConfirm(true)}><Play size={15} /> Run payroll</Button>}
              </div>

              {warnings.map((w) => <Alert key={w} tone="warn">{w}</Alert>)}

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Stat label="Gross pay" value={totals ? moneyShort(totals.gross) : '–'} sub={totals ? plural(totals.headcount, 'employee') : undefined} />
                <Stat label="Net pay" value={totals ? moneyShort(totals.net) : '–'} sub="Paid to employees" />
                <Stat label="Taxes withheld" value={totals ? moneyShort(totals.taxes) : '–'} sub={totals ? `${moneyShort(totals.preTax)} pre-tax deductions` : undefined} />
                <Stat label="Total employer cost" value={totals ? moneyShort(totals.employerCost) : '–'} sub="Gross plus employer taxes and match" />
              </div>

              <Card>
                <CardHeader title="Paychecks" subtitle="Select a row for the full breakdown" />
                {preview.isLoading || run.isLoading ? <div className="p-5"><Skeleton className="h-48" /></div> : rows.length === 0 ? <EmptyState title="No one is due pay in this period" /> : (
                  <Table className="[&_td]:px-3 [&_th]:px-3">
                    <thead className="border-b border-line bg-surface-2/50"><tr><Th>Employee</Th><Th right>Hours</Th><Th right>Gross</Th><Th right>Pre-tax</Th><Th right>Taxes</Th><Th right>Net</Th><Th right>Employer</Th></tr></thead>
                    <tbody className="divide-y divide-line">
                      {rows.map((r) => (
                        <tr key={r.employeeId} className="cursor-pointer hover:bg-surface-2/50" onClick={() => setDetail(r)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setDetail(r)}>
                          <Td>
                            <div className="flex items-center gap-2.5">
                              <Avatar name={r.name} size={30} />
                              <div className="min-w-0"><p className="whitespace-nowrap font-medium leading-tight">{r.name}</p><p className="text-xs text-sub">{r.department}</p></div>
                              {r.paycheck.notes.length > 0 && <Badge tone="info">note</Badge>}
                            </div>
                          </Td>
                          <Td right className="text-sub">{r.paycheck.hours.regular + r.paycheck.hours.overtime > 0 ? <>{(r.paycheck.hours.regular + r.paycheck.hours.overtime).toFixed(1)}{r.paycheck.hours.overtime > 0 && <span className="ml-1 text-warn" title="Includes overtime">OT</span>}</> : '–'}</Td>
                          <Td right>{money(r.paycheck.grossCents)}</Td>
                          <Td right className="text-sub">{money(r.paycheck.preTaxCents)}</Td>
                          <Td right className="text-sub">{money(r.paycheck.taxCents)}</Td>
                          <Td right className="font-semibold">{money(r.paycheck.netCents)}</Td>
                          <Td right className="text-sub">{money(r.paycheck.employerCostCents)}</Td>
                        </tr>
                      ))}
                    </tbody>
                    {totals && <tfoot className="border-t-2 border-line bg-surface-2/50 text-sm font-semibold"><tr><Td>Total</Td><Td /><Td right>{money(totals.gross)}</Td><Td right>{money(totals.preTax)}</Td><Td right>{money(totals.taxes)}</Td><Td right>{money(totals.net)}</Td><Td right>{money(totals.employerCost)}</Td></tr></tfoot>}
                  </Table>
                )}
              </Card>
            </>
          )}
        </div>
      </div>

      <Modal open={confirm} onClose={() => setConfirm(false)} title="Run payroll?" footer={<><Button variant="ghost" onClick={() => setConfirm(false)}>Not yet</Button><Button variant="primary" loading={commit.isPending} onClick={() => commit.mutate()}>Run payroll</Button></>}>
        {current && totals && (
          <div className="space-y-3 text-sm">
            <p>This creates {plural(totals.headcount, 'paycheck')} for <b>{fmtRange(current.start, current.end)}</b>, paid on {fmtDate(current.payDate)}.</p>
            <dl className="grid grid-cols-2 gap-3 rounded-lg bg-surface-2 p-3.5">
              <div><dt className="text-xs text-sub">Net pay to employees</dt><dd className="num font-semibold">{money(totals.net)}</dd></div>
              <div><dt className="text-xs text-sub">Total employer cost</dt><dd className="num font-semibold">{money(totals.employerCost)}</dd></div>
            </dl>
            <Alert tone="warn">A payroll run can’t be edited afterwards, and periods must be run in order.</Alert>
          </div>
        )}
      </Modal>

      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail ? `${detail.name} · paycheck` : ''} width="max-w-xl">
        {detail && <PaycheckBreakdown p={detail.paycheck} showEmployer />}
      </Modal>
    </>
  )
}
