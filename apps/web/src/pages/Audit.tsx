import { useQuery } from '@tanstack/react-query'
import { ScrollText } from 'lucide-react'
import { useApi } from '../api'
import { Badge, Card, EmptyState, PageHeader, Skeleton, Table, Td, Th } from '../components/ui'

const LABELS: Record<string, string> = {
  'auth.login': 'Signed in',
  'leave.request': 'Requested leave',
  'leave.approve': 'Approved leave',
  'leave.reject': 'Declined leave',
  'leave.cancel': 'Cancelled leave',
  'payroll.commit': 'Ran payroll',
  'employee.update': 'Edited employee',
  'timesheet.save': 'Saved timesheet',
}
const TONE: Record<string, 'neutral' | 'good' | 'bad' | 'warn' | 'info' | 'brand'> = { 'leave.approve': 'good', 'leave.reject': 'bad', 'leave.cancel': 'neutral', 'payroll.commit': 'brand', 'employee.update': 'warn', 'leave.request': 'info' }

function summary(a: { action: string; detail: Record<string, unknown> }): string {
  const d = a.detail as Record<string, unknown>
  if (a.action === 'payroll.commit') return `${d.headcount} paychecks · period ${d.period}`
  if (a.action === 'leave.request') return `${d.type} · ${d.startDate} to ${d.endDate}`
  if (a.action.startsWith('leave.')) return d.note ? `“${d.note}”` : `→ ${d.to}`
  if (a.action === 'employee.update') return Object.keys((d.changed as object) ?? {}).join(', ')
  if (a.action === 'timesheet.save') return `${d.days} day(s)`
  return ''
}

export function Audit() {
  const { api } = useApi()
  const q = useQuery({ queryKey: ['audit'], queryFn: () => api.auditLog() })
  return (
    <>
      <PageHeader title="Audit log" subtitle="Who did what, newest first. Entries are append-only." />
      <Card>
        {q.isLoading ? <div className="p-5"><Skeleton className="h-40" /></div> : q.data!.length === 0 ? <EmptyState title="No activity yet" icon={<ScrollText size={20} />} /> : (
          <Table>
            <thead className="border-b border-line bg-surface-2/50"><tr><Th>When</Th><Th>Who</Th><Th>Action</Th><Th>Details</Th></tr></thead>
            <tbody className="divide-y divide-line">
              {q.data!.map((a) => (
                <tr key={a.id}>
                  <Td className="whitespace-nowrap text-[13px] text-sub">{new Date(a.at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</Td>
                  <Td className="font-medium">{a.actorName ?? 'System'}</Td>
                  <Td><Badge tone={TONE[a.action] ?? 'neutral'}>{LABELS[a.action] ?? a.action}</Badge></Td>
                  <Td className="text-[13px] text-sub">{summary(a)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  )
}
