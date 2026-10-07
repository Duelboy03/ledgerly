import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, ClipboardCheck, X } from 'lucide-react'
import { useState } from 'react'
import { useApi } from '../api'
import { useAuth } from '../components/auth'
import { Avatar, Badge, Button, Card, EmptyState, Input, PageHeader, Skeleton, Tabs, useToast, StatusBadge } from '../components/ui'
import { days, fmtDate, fmtRange, typeLabel } from '../lib/format'

export function Approvals() {
  const { api } = useApi()
  const { user } = useAuth()
  const qc = useQueryClient()
  const toast = useToast()
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [tab, setTab] = useState<'pending' | 'decided'>('pending')

  const queue = useQuery({ queryKey: ['approvals'], queryFn: () => api.approvals() })
  const scope = user!.role === 'hr_admin' ? 'all' : 'team'
  const all = useQuery({ queryKey: ['leave', scope], queryFn: () => api.leaveRequests(scope), enabled: tab === 'decided' })

  const decide = useMutation({
    mutationFn: (v: { id: string; action: 'approve' | 'reject' }) => api.decideLeave(v.id, v.action, notes[v.id]),
    onSuccess: (r) => {
      qc.invalidateQueries()
      toast(`${r.employeeName}’s request ${r.status}`)
    },
    onError: (e: Error) => toast(e.message, 'bad'),
  })

  const decided = (all.data ?? []).filter((r) => r.status !== 'pending').slice(0, 40)

  return (
    <>
      <PageHeader title="Approvals" subtitle={user!.role === 'hr_admin' ? 'Requests from everyone, except your own.' : 'Requests from your direct reports.'} actions={<Tabs value={tab} onChange={setTab} items={[{ id: 'pending', label: 'Pending', count: queue.data?.length }, { id: 'decided', label: 'Decided' }]} />} />

      {tab === 'pending' ? (
        queue.isLoading ? (
          <div className="space-y-4"><Skeleton className="h-36" /><Skeleton className="h-36" /></div>
        ) : queue.data!.length === 0 ? (
          <Card><EmptyState title="Nothing to approve" hint="When your team asks for time off, it will show up here." icon={<ClipboardCheck size={20} />} /></Card>
        ) : (
          <div className="space-y-4">
            {queue.data!.map((r) => (
              <Card key={r.id} className="p-5">
                <div className="flex flex-wrap items-start gap-4">
                  <Avatar name={r.employeeName} size={42} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[15px] font-semibold">{r.employeeName}</p>
                      <span className="text-[13px] text-sub">{r.department}</span>
                    </div>
                    <p className="mt-1 text-sm">
                      <span className="font-medium">{typeLabel(r.type)}</span> · {days(r.days)} · {fmtRange(r.startDate, r.endDate)}
                    </p>
                    {r.reason && <p className="mt-2 rounded-lg bg-surface-2 px-3 py-2 text-[13px] text-sub">“{r.reason}”</p>}
                    <p className="mt-2 text-xs text-muted">Requested {fmtDate(r.createdAt.slice(0, 10))}</p>
                  </div>
                  <div className="flex w-full flex-col gap-2 sm:w-64">
                    <Input aria-label={`Note for ${r.employeeName}`} placeholder="Add a note (optional)" value={notes[r.id] ?? ''} onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))} />
                    <div className="flex gap-2">
                      <Button variant="primary" className="flex-1" disabled={!r.actions.includes('approve')} loading={decide.isPending && decide.variables?.id === r.id && decide.variables.action === 'approve'} onClick={() => decide.mutate({ id: r.id, action: 'approve' })}><Check size={15} /> Approve</Button>
                      <Button className="flex-1" disabled={!r.actions.includes('reject')} loading={decide.isPending && decide.variables?.id === r.id && decide.variables.action === 'reject'} onClick={() => decide.mutate({ id: r.id, action: 'reject' })}><X size={15} /> Decline</Button>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )
      ) : (
        <Card>
          {all.isLoading ? <div className="p-5"><Skeleton className="h-24" /></div> : decided.length === 0 ? <EmptyState title="No decisions yet" /> : (
            <ul className="divide-y divide-line">
              {decided.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                  <Avatar name={r.employeeName} size={34} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{r.employeeName} <span className="font-normal text-sub">· {typeLabel(r.type)}, {days(r.days)}</span></p>
                    <p className="text-[13px] text-sub">{fmtRange(r.startDate, r.endDate)}{r.decidedByName && <> · {r.decidedByName}</>}{r.decisionNote && <> · “{r.decisionNote}”</>}</p>
                  </div>
                  <StatusBadge status={r.status} />
                  {r.actions.includes('cancel') && <Badge>can be revoked</Badge>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </>
  )
}
