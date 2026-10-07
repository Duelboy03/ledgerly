import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { addDays, isWeekend, weekStart, type ISODate } from '@ledgerly/domain'
import { useApi } from '../api'
import { useAuth } from '../components/auth'
import { Alert, Badge, Button, Card, CardHeader, Input, PageHeader, Skeleton, useToast, cn } from '../components/ui'
import { fmtDay } from '../lib/format'

export function Timesheet() {
  const { api } = useApi()
  const { user } = useAuth()
  const qc = useQueryClient()
  const toast = useToast()
  const meta = useQuery({ queryKey: ['meta'], queryFn: () => api.meta() })
  const today = meta.data?.today
  const me = user!.employeeId

  // two work weeks: the previous one and the current one
  const from = today ? addDays(weekStart(today), -7) : ''
  const dates = useMemo(() => (today ? Array.from({ length: 14 }, (_, i) => addDays(from as ISODate, i)).filter((d) => !isWeekend(d) && d <= today) : []), [today, from])
  const q = useQuery({ queryKey: ['timesheet', me, from], queryFn: () => api.timesheet(me, from, today!), enabled: !!today })
  const [hours, setHours] = useState<Record<string, string>>({})
  useEffect(() => {
    if (q.data) setHours(Object.fromEntries(q.data.map((e) => [e.date, String(e.hours)])))
  }, [q.data])

  const save = useMutation({
    mutationFn: () => api.saveTimesheet(me, dates.filter((d) => hours[d] !== undefined && hours[d] !== '').map((d) => ({ date: d, hours: Number(hours[d]) }))),
    onSuccess: () => {
      qc.invalidateQueries()
      toast('Timesheet saved')
    },
    onError: (e: Error) => toast(e.message, 'bad'),
  })

  const weeks = new Map<string, string[]>()
  for (const d of dates) weeks.set(weekStart(d), [...(weeks.get(weekStart(d)) ?? []), d])
  const total = (ds: string[]) => ds.reduce((a, d) => a + (Number(hours[d]) || 0), 0)

  return (
    <>
      <PageHeader title="Timesheet" subtitle="Log your hours for the last two weeks. Anything over 40 hours in a week is paid at 1.5×." actions={<Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>Save hours</Button>} />
      {q.isLoading || !today ? <Skeleton className="h-80" /> : (
        <div className="space-y-6">
          {[...weeks.entries()].map(([ws, ds]) => {
            const t = total(ds)
            return (
              <Card key={ws}>
                <CardHeader title={`Week of ${fmtDay(ws)}`} action={<div className="flex items-center gap-2"><span className="num text-sm font-semibold">{t.toFixed(2)} h</span>{t > 40 && <Badge tone="warn">{(t - 40).toFixed(2)} h overtime</Badge>}</div>} />
                <ul className="divide-y divide-line">
                  {ds.map((d) => (
                    <li key={d} className="flex items-center justify-between gap-4 px-5 py-2.5">
                      <span className={cn('text-sm', d === today && 'font-semibold')}>{fmtDay(d)}{d === today && <span className="ml-2 text-xs text-brand">today</span>}</span>
                      <Input aria-label={`Hours on ${d}`} type="number" min={0} max={24} step={0.25} className="w-28 text-right" value={hours[d] ?? ''} onChange={(e) => setHours((h) => ({ ...h, [d]: e.target.value }))} placeholder="0" />
                    </li>
                  ))}
                </ul>
              </Card>
            )
          })}
          <Alert tone="info">Hours already included in a payroll run are locked. Ask HR if one needs correcting.</Alert>
        </div>
      )}
    </>
  )
}
