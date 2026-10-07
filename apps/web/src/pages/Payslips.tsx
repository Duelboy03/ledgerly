import { useQuery } from '@tanstack/react-query'
import { FileText } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useApi } from '../api'
import { Card, EmptyState, PageHeader, Skeleton, Stat, Table, Td, Th } from '../components/ui'
import { fmtDate, fmtRange, money } from '../lib/format'

export function Payslips() {
  const { api } = useApi()
  const q = useQuery({ queryKey: ['paychecks'], queryFn: () => api.myPaychecks() })
  const list = q.data ?? []
  const year = list[0]?.payDate.slice(0, 4)
  const ytd = list.filter((p) => p.payDate.startsWith(year ?? '')).reduce((a, p) => ({ gross: a.gross + p.grossCents, net: a.net + p.netCents }), { gross: 0, net: 0 })

  return (
    <>
      <PageHeader title="Payslips" subtitle="Every paycheck you have received, with the full breakdown." />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label={`Gross pay ${year ?? ''} to date`} value={money(ytd.gross)} />
        <Stat label={`Take-home ${year ?? ''} to date`} value={money(ytd.net)} />
        <Stat label="Paychecks" value={list.length} sub={list[0] ? `Latest on ${fmtDate(list[0].payDate)}` : undefined} />
      </div>
      <Card>
        {q.isLoading ? <div className="p-5"><Skeleton className="h-32" /></div> : list.length === 0 ? <EmptyState title="No payslips yet" hint="They appear here after payroll runs." icon={<FileText size={20} />} /> : (
          <Table>
            <thead className="border-b border-line bg-surface-2/50"><tr><Th>Pay date</Th><Th>Period</Th><Th right>Gross</Th><Th right>Net pay</Th><Th /></tr></thead>
            <tbody className="divide-y divide-line">
              {list.map((p) => (
                <tr key={p.id} className="hover:bg-surface-2/40">
                  <Td className="font-medium">{fmtDate(p.payDate)}</Td>
                  <Td className="text-sub">{fmtRange(p.periodStart, p.periodEnd)}</Td>
                  <Td right>{money(p.grossCents)}</Td>
                  <Td right className="font-semibold">{money(p.netCents)}</Td>
                  <Td className="text-right"><Link to={`/payslips/${p.id}`} className="text-[13px] font-medium text-brand">View</Link></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  )
}
