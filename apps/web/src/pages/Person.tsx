import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Lock, Pencil } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useApi } from '../api'
import { useAuth } from '../components/auth'
import { Alert, Avatar, Badge, Button, Card, CardHeader, Field, Input, Modal, Select, Skeleton, useToast } from '../components/ui'
import { days, fmtDate, money, typeLabel } from '../lib/format'

export function Person() {
  const { id } = useParams()
  const { api } = useApi()
  const { user } = useAuth()
  const [edit, setEdit] = useState(false)
  const q = useQuery({ queryKey: ['employee', id], queryFn: () => api.employee(id!) })
  const e = q.data
  const comp = e?.compensation
  const balances = useQuery({ queryKey: ['balances', id], queryFn: () => api.balances(id), enabled: !!comp })

  if (q.isLoading) return <Skeleton className="h-96" />
  if (!e) return <Alert tone="bad">{(q.error as Error)?.message ?? 'Not found'}</Alert>

  const perPeriod = comp?.payType === 'salary' ? '/ year' : '/ hour'
  const rate = comp ? (comp.payType === 'salary' ? comp.annualSalaryCents : comp.hourlyRateCents) : 0

  return (
    <>
      <Link to="/people" className="mb-5 inline-flex items-center gap-1.5 text-[13px] font-medium text-sub hover:text-ink"><ArrowLeft size={15} /> People</Link>
      <Card className="mb-6 p-6">
        <div className="flex flex-wrap items-center gap-5">
          <Avatar name={e.name} size={64} />
          <div className="flex-1">
            <h1 className="text-2xl font-semibold tracking-tight">{e.name}</h1>
            <p className="mt-0.5 text-sm text-sub">{e.title} · {e.department}</p>
            <p className="mt-2 flex flex-wrap items-center gap-2 text-[13px] text-sub">
              <a href={`mailto:${e.email}`} className="text-brand">{e.email}</a>
              <span>·</span>
              <span>Joined {fmtDate(e.hireDate)}</span>
              {e.managerName && <><span>·</span><span>Reports to {e.managerName}</span></>}
            </p>
          </div>
          {user!.role === 'hr_admin' && comp && <Button onClick={() => setEdit(true)}><Pencil size={15} /> Edit pay details</Button>}
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Compensation" />
          {comp ? (
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 p-5 text-sm">
              <Item label="Pay" value={<span className="num font-semibold">{money(rate)} <span className="font-normal text-sub">{perPeriod}</span></span>} />
              <Item label="Pay schedule" value={typeLabel(comp.payFrequency)} />
              <Item label="Filing status" value={typeLabel(comp.filingStatus)} />
              <Item label="State" value={comp.state} />
              <Item label="401(k) deferral" value={`${comp.k401Pct}% of gross`} />
              <Item label="Health premium" value={`${money(comp.healthPremiumCents)} per period`} />
            </dl>
          ) : (
            <div className="flex items-center gap-3 p-5 text-sm text-sub"><Lock size={18} /> Pay details are visible to the employee and HR only.</div>
          )}
        </Card>
        <Card>
          <CardHeader title="Time off" subtitle={comp ? undefined : 'Not shared'} />
          {balances.data ? (
            <ul className="divide-y divide-line">
              {balances.data.map((b) => (
                <li key={b.type} className="flex items-center justify-between px-5 py-3 text-sm">
                  <span className="font-medium">{typeLabel(b.type)}</span>
                  {Number.isFinite(b.available) ? <span className="num">{days(b.available)} <span className="text-sub">left</span></span> : <Badge>Unpaid</Badge>}
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex items-center gap-3 p-5 text-sm text-sub"><Lock size={18} /> Balances are visible to the employee and HR only.</div>
          )}
        </Card>
      </div>

      {comp && <EditDialog open={edit} onClose={() => setEdit(false)} id={e.id} init={{ title: e.title, department: e.department, ...comp }} />}
    </>
  )
}

const Item = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div><dt className="text-xs text-sub">{label}</dt><dd className="mt-0.5">{value}</dd></div>
)

interface Form {
  title: string
  department: string
  payType: string
  annualSalaryCents: number
  hourlyRateCents: number
  payFrequency: string
  filingStatus: string
  state: string
  k401Pct: number
  healthPremiumCents: number
}

function EditDialog({ open, onClose, id, init }: { open: boolean; onClose: () => void; id: string; init: Form }) {
  const { api } = useApi()
  const qc = useQueryClient()
  const toast = useToast()
  const [f, setF] = useState(init)
  const [errors, setErrors] = useState<Record<string, string>>({})
  useEffect(() => {
    if (open) {
      setF(init)
      setErrors({})
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const save = useMutation({
    mutationFn: () => api.updateEmployee(id, f as unknown as Record<string, unknown>),
    onSuccess: () => {
      qc.invalidateQueries()
      toast('Employee updated')
      onClose()
    },
    onError: (e: Error & { details?: Record<string, string[]> }) => {
      const d = e.details
      if (d && typeof d === 'object') setErrors(Object.fromEntries(Object.entries(d).map(([k, v]) => [k, Array.isArray(v) ? v[0] : String(v)])))
      toast(e.message, 'bad')
    },
  })
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }))
  const dollarsOf = (c: number) => (c / 100).toString()
  const toCents = (s: string) => Math.round(Number(s || 0) * 100)

  return (
    <Modal open={open} onClose={onClose} title="Edit pay details" footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>Save changes</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Job title" error={errors.title}>{(i) => <Input id={i} value={f.title} onChange={(e) => set('title', e.target.value)} />}</Field>
        <Field label="Department" error={errors.department}>{(i) => <Input id={i} value={f.department} onChange={(e) => set('department', e.target.value)} />}</Field>
        <Field label="Pay type">{(i) => <Select id={i} value={f.payType} onChange={(e) => set('payType', e.target.value)}><option value="salary">Salary</option><option value="hourly">Hourly</option></Select>}</Field>
        {f.payType === 'salary'
          ? <Field label="Annual salary ($)" error={errors.annualSalaryCents}>{(i) => <Input id={i} type="number" min={0} step={500} value={dollarsOf(f.annualSalaryCents)} onChange={(e) => set('annualSalaryCents', toCents(e.target.value))} />}</Field>
          : <Field label="Hourly rate ($)" error={errors.hourlyRateCents}>{(i) => <Input id={i} type="number" min={0} step={0.25} value={dollarsOf(f.hourlyRateCents)} onChange={(e) => set('hourlyRateCents', toCents(e.target.value))} />}</Field>}
        <Field label="Pay schedule">{(i) => <Select id={i} value={f.payFrequency} onChange={(e) => set('payFrequency', e.target.value)}><option value="weekly">Weekly</option><option value="biweekly">Biweekly</option><option value="semimonthly">Semi-monthly</option><option value="monthly">Monthly</option></Select>}</Field>
        <Field label="Filing status">{(i) => <Select id={i} value={f.filingStatus} onChange={(e) => set('filingStatus', e.target.value)}><option value="single">Single</option><option value="married">Married</option></Select>}</Field>
        <Field label="State" error={errors.state}>{(i) => <Input id={i} maxLength={2} value={f.state} onChange={(e) => set('state', e.target.value.toUpperCase())} />}</Field>
        <Field label="401(k) deferral (%)" error={errors.k401Pct}>{(i) => <Input id={i} type="number" min={0} max={100} step={0.5} value={f.k401Pct} onChange={(e) => set('k401Pct', Number(e.target.value))} />}</Field>
        <Field label="Health premium per period ($)" error={errors.healthPremiumCents}>{(i) => <Input id={i} type="number" min={0} step={5} value={dollarsOf(f.healthPremiumCents)} onChange={(e) => set('healthPremiumCents', toCents(e.target.value))} />}</Field>
      </div>
    </Modal>
  )
}
