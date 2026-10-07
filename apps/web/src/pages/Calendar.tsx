import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useApi } from '../api'
import { Button, Card, PageHeader, Skeleton } from '../components/ui'
import { cn } from '../components/ui'
import { fmtDate, hueFor, initials, monthKey, shiftMonth } from '../lib/format'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export function Calendar() {
  const { api } = useApi()
  const meta = useQuery({ queryKey: ['meta'], queryFn: () => api.meta() })
  const [month, setMonth] = useState<string | null>(null)
  const current = month ?? (meta.data ? monthKey(meta.data.today) : null)
  const today = meta.data?.today
  const cal = useQuery({ queryKey: ['calendar', current], queryFn: () => api.calendar(current!), enabled: !!current })

  const cells = useMemo(() => {
    if (!current) return []
    const [y, m] = current.split('-').map(Number)
    const first = new Date(Date.UTC(y, m - 1, 1))
    const lead = (first.getUTCDay() + 6) % 7
    const count = new Date(Date.UTC(y, m, 0)).getUTCDate()
    const out: (string | null)[] = Array(lead).fill(null)
    for (let d = 1; d <= count; d++) out.push(`${current}-${String(d).padStart(2, '0')}`)
    while (out.length % 7) out.push(null)
    return out
  }, [current])

  const holidays = new Map((cal.data?.holidays ?? []).map((h) => [h.date, h.name]))
  const onDay = (d: string) => (cal.data?.entries ?? []).filter((e) => e.startDate <= d && e.endDate >= d)
  const people = [...new Set((cal.data?.entries ?? []).map((e) => e.name))]

  return (
    <>
      <PageHeader
        title="Team calendar"
        subtitle="Approved time off in your department. Your own pending requests show with a dashed outline."
        actions={
          <>
            <Button aria-label="Previous month" onClick={() => setMonth(shiftMonth(current!, -1))}><ChevronLeft size={16} /></Button>
            <span className="num w-36 text-center text-sm font-semibold">{current ? fmtDate(`${current}-01`, { month: 'long', year: 'numeric' }) : ''}</span>
            <Button aria-label="Next month" onClick={() => setMonth(shiftMonth(current!, 1))}><ChevronRight size={16} /></Button>
            <Button variant="ghost" onClick={() => setMonth(null)}>Today</Button>
          </>
        }
      />
      {!current ? <Skeleton className="h-96" /> : (
        <Card className="overflow-hidden">
          <div className="grid grid-cols-7 border-b border-line bg-surface-2/60 text-center text-xs font-medium uppercase tracking-wide text-sub">
            {WEEKDAYS.map((w) => <div key={w} className="py-2.5">{w}</div>)}
          </div>
          <div className="grid grid-cols-7">
            {cells.map((d, i) => {
              const weekend = i % 7 >= 5
              const entries = d ? onDay(d) : []
              const hol = d ? holidays.get(d) : undefined
              return (
                <div key={i} className={cn('min-h-[92px] border-b border-r border-line p-1.5 sm:min-h-[104px]', weekend && 'bg-surface-2/40', i % 7 === 6 && 'border-r-0')}>
                  {d && (
                    <>
                      <div className="flex items-center justify-between">
                        <span className={cn('num grid h-6 min-w-6 place-items-center rounded-full px-1 text-xs font-medium', d === today ? 'bg-brand text-brand-ink' : weekend ? 'text-muted' : 'text-sub')}>{Number(d.slice(8))}</span>
                      </div>
                      {hol && <p className="mt-1 truncate rounded bg-info-soft px-1.5 py-0.5 text-[11px] font-medium text-info" title={hol}>{hol}</p>}
                      <div className="mt-1 space-y-1">
                        {entries.slice(0, 3).map((e, k) => {
                          const h = hueFor(e.name)
                          return (
                            <p key={k} title={`${e.name}${e.type !== 'leave' ? ` · ${e.type}` : ''}${e.status === 'pending' ? ' (pending)' : ''}`}
                              className={cn('truncate rounded px-1.5 py-0.5 text-[11px] font-medium', e.status === 'pending' && 'border border-dashed')}
                              style={{ background: `hsl(${h} 70% 50% / 0.16)`, color: `hsl(${h} 55% 35%)`, borderColor: `hsl(${h} 55% 45% / 0.6)` }}>
                              <span className="hidden sm:inline">{e.name.split(' ')[0]}</span><span className="sm:hidden">{initials(e.name)}</span>
                              {e.type !== 'leave' && <span className="hidden opacity-70 sm:inline"> · {e.type}</span>}
                            </p>
                          )
                        })}
                        {entries.length > 3 && <p className="px-1.5 text-[11px] text-sub">+{entries.length - 3} more</p>}
                      </div>
                    </>
                  )}
                </div>
              )
            })}
          </div>
        </Card>
      )}
      {people.length > 0 && (
        <p className="mt-3 text-[13px] text-sub">{people.length} {people.length === 1 ? 'person has' : 'people have'} time off this month.</p>
      )}
    </>
  )
}
