import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, CalendarPlus, CheckCircle2, Palmtree } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useApi } from '../api'
import { useAuth } from '../components/auth'
import { Alert, Badge, Button, Card, CardHeader, EmptyState, Field, Input, Modal, PageHeader, Ring, Select, Skeleton, StatusBadge, Table, Td, Textarea, Th, Tabs, useToast } from '../components/ui'
import { days, fmtRange, plural, typeLabel } from '../lib/format'
import type { LeaveDraftInput } from '@ledgerly/api'

const TYPES = ['vacation', 'sick', 'personal', 'unpaid'] as const
const TONE = { vacation: 'brand', sick: 'info', personal: 'warn', unpaid: 'bad' } as const

function useDebounced<T>(v: T, ms = 250) {
  const [d, setD] = useState(v)
  useEffect(() => {
    const t = setTimeout(() => setD(v), ms)
    return () => clearTimeout(t)
  }, [v, ms])
  return d
}

export function Leave() {
  const { api } = useApi()
  const { user } = useAuth()
  const qc = useQueryClient()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<'upcoming' | 'history'>('upcoming')

  const meta = useQuery({ queryKey: ['meta'], queryFn: () => api.meta() })
  const balances = useQuery({ queryKey: ['balances', user!.employeeId], queryFn: () => api.balances() })
  const mine = useQuery({ queryKey: ['leave', 'mine'], queryFn: () => api.leaveRequests('mine') })
  const today = meta.data?.today ?? ''

  const cancel = useMutation({
    mutationFn: (id: string) => api.decideLeave(id, 'cancel'),
    onSuccess: () => {
      qc.invalidateQueries()
      toast('Request cancelled')
    },
    onError: (e: Error) => toast(e.message, 'bad'),
  })

  const rows = (mine.data ?? []).filter((r) => (tab === 'upcoming' ? r.endDate >= today && r.status !== 'rejected' && r.status !== 'cancelled' : r.endDate < today || r.status === 'rejected' || r.status === 'cancelled'))
  const ordered = [...rows].sort((a, b) => (tab === 'upcoming' ? a.startDate.localeCompare(b.startDate) : b.startDate.localeCompare(a.startDate)))

  return (
    <>
      <PageHeader title="Time off" subtitle="Balances build up each month. Requests go to your manager." actions={<Button variant="primary" onClick={() => setOpen(true)}><CalendarPlus size={16} /> Request time off</Button>} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {balances.isLoading
          ? [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[118px]" />)
          : balances.data!.map((b) => {
              const paid = Number.isFinite(b.available)
              return (
                <Card key={b.type} className="p-5">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-sm font-semibold">{typeLabel(b.type)}</p>
                    <Badge tone={TONE[b.type]}>{paid ? 'Paid' : 'Unpaid'}</Badge>
                  </div>
                  {paid ? (
                    <Ring size={64} stroke={7} tone={b.type === 'sick' ? 'info' : b.type === 'personal' ? 'warn' : 'brand'} value={Math.max(0, b.available)} max={Math.max(b.accrued + b.carryOver, 1)} label={+b.available.toFixed(2)} sub={<><p className="font-medium">{days(b.available)} left</p><p className="text-xs text-sub">{b.used} used · {b.pending} pending</p></>} />
                  ) : (
                    <p className="text-[13px] text-sub">No balance. Needs manager approval and a week’s notice. {b.used ? `${plural(b.used, 'day')} taken this year.` : ''}</p>
                  )}
                </Card>
              )
            })}
      </div>

      <Card className="mt-6">
        <CardHeader title="Your requests" action={<Tabs value={tab} onChange={setTab} items={[{ id: 'upcoming', label: 'Upcoming' }, { id: 'history', label: 'History' }]} />} />
        {mine.isLoading ? (
          <div className="space-y-3 p-5"><Skeleton className="h-10" /><Skeleton className="h-10" /></div>
        ) : ordered.length === 0 ? (
          <EmptyState title={tab === 'upcoming' ? 'No upcoming time off' : 'Nothing in your history yet'} hint={tab === 'upcoming' ? 'Use “Request time off” to book some.' : undefined} icon={<Palmtree size={20} />} />
        ) : (
          <Table>
            <thead className="border-b border-line bg-surface-2/50"><tr><Th>Dates</Th><Th>Type</Th><Th right>Days</Th><Th>Status</Th><Th>Decision</Th><Th /></tr></thead>
            <tbody className="divide-y divide-line">
              {ordered.map((r) => (
                <tr key={r.id} className="hover:bg-surface-2/40">
                  <Td className="font-medium">{fmtRange(r.startDate, r.endDate)}</Td>
                  <Td><Badge tone={TONE[r.type]}>{typeLabel(r.type)}</Badge></Td>
                  <Td right>{r.days}</Td>
                  <Td><StatusBadge status={r.status} /></Td>
                  <Td className="max-w-56 text-[13px] text-sub">{r.decidedByName ? <>{r.decidedByName}{r.decisionNote ? <> · “{r.decisionNote}”</> : null}</> : r.reason || '–'}</Td>
                  <Td className="text-right">{r.actions.includes('cancel') && <Button size="sm" variant="ghost" onClick={() => cancel.mutate(r.id)} loading={cancel.isPending && cancel.variables === r.id}>Cancel</Button>}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <RequestDialog open={open} onClose={() => setOpen(false)} today={today} />
    </>
  )
}

function RequestDialog({ open, onClose, today }: { open: boolean; onClose: () => void; today: string }) {
  const { api } = useApi()
  const qc = useQueryClient()
  const toast = useToast()
  const [type, setType] = useState<LeaveDraftInput['type']>('vacation')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [reason, setReason] = useState('')

  useEffect(() => {
    if (open) {
      setType('vacation')
      setStart('')
      setEnd('')
      setReason('')
    }
  }, [open])

  const draft = useDebounced({ type, startDate: start, endDate: end || start })
  const ready = /^\d{4}-\d{2}-\d{2}$/.test(draft.startDate) && /^\d{4}-\d{2}-\d{2}$/.test(draft.endDate)
  const check = useQuery({ queryKey: ['validate', draft], queryFn: () => api.validateLeave(draft), enabled: open && ready })

  const submit = useMutation({
    mutationFn: () => api.createLeave({ type, startDate: start, endDate: end || start, reason }),
    onSuccess: () => {
      qc.invalidateQueries()
      toast('Request sent to your manager')
      onClose()
    },
    onError: (e: Error) => toast(e.message, 'bad'),
  })

  const v = check.data
  const stale = !ready || check.isFetching || (v && (draft.startDate !== start || draft.endDate !== (end || start)))

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Request time off"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!v?.ok || !!stale} loading={submit.isPending} onClick={() => submit.mutate()}>Send request</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Type">{(id) => <Select id={id} value={type} onChange={(e) => setType(e.target.value as typeof type)}>{TYPES.map((t) => <option key={t} value={t}>{typeLabel(t)}</option>)}</Select>}</Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="From">{(id) => <Input id={id} type="date" min={today} value={start} onChange={(e) => { setStart(e.target.value); if (!end || e.target.value > end) setEnd(e.target.value) }} />}</Field>
          <Field label="To">{(id) => <Input id={id} type="date" min={start || today} value={end} onChange={(e) => setEnd(e.target.value)} />}</Field>
        </div>
        <Field label="Note for your manager" hint="Optional">{(id) => <Textarea id={id} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />}</Field>

        <div className="min-h-[88px]" aria-live="polite">
          {!ready ? (
            <p className="rounded-lg bg-surface-2 px-3 py-3 text-[13px] text-sub">Pick your dates and we’ll check them against your balance, holidays and existing requests.</p>
          ) : !v || stale ? (
            <Skeleton className="h-[88px]" />
          ) : (
            <div className="space-y-2">
              {v.errors.map((e) => <Alert key={e} tone="bad">{e}</Alert>)}
              {v.warnings.map((e) => <Alert key={e} tone="warn">{e}</Alert>)}
              {v.ok && (
                <div className="flex items-center gap-3 rounded-lg bg-good-soft px-3 py-3 text-good">
                  <CheckCircle2 size={18} />
                  <div className="text-[13px]">
                    <p className="font-semibold">{days(v.days)} of working time</p>
                    {v.balanceAfter !== null && Number.isFinite(v.balanceAfter) && <p className="opacity-80">{+v.balanceAfter.toFixed(2)} {type} days left afterwards</p>}
                  </div>
                </div>
              )}
              {!v.ok && v.days > 0 && <p className="flex items-center gap-1.5 text-xs text-sub"><AlertTriangle size={13} /> {days(v.days)} of working time in this range.</p>}
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}
