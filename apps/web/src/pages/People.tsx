import { useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useApi } from '../api'
import { Avatar, Badge, Card, EmptyState, Input, PageHeader, Select, Skeleton } from '../components/ui'
import { fmtDate } from '../lib/format'

export function People() {
  const { api } = useApi()
  const [q, setQ] = useState('')
  const [dept, setDept] = useState('all')
  const dir = useQuery({ queryKey: ['directory'], queryFn: () => api.directory() })
  const depts = [...new Set((dir.data ?? []).map((d) => d.department))].sort()
  const list = (dir.data ?? []).filter((d) => (dept === 'all' || d.department === dept) && `${d.name} ${d.title} ${d.email}`.toLowerCase().includes(q.toLowerCase()))

  return (
    <>
      <PageHeader title="People" subtitle={dir.data ? `${dir.data.length} people at Northwind Labs` : ''} />
      <div className="mb-5 flex flex-wrap gap-3">
        <div className="relative min-w-60 flex-1 sm:max-w-sm">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <Input aria-label="Search people" placeholder="Search by name, title or email" className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select aria-label="Department" className="w-48" value={dept} onChange={(e) => setDept(e.target.value)}>
          <option value="all">All departments</option>
          {depts.map((d) => <option key={d}>{d}</option>)}
        </Select>
      </div>
      {dir.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-28" />)}</div>
      ) : list.length === 0 ? (
        <Card><EmptyState title="No one matches that search" /></Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((d) => (
            <Link key={d.id} to={`/people/${d.id}`}>
              <Card className="h-full p-4 transition-colors hover:border-brand">
                <div className="flex items-center gap-3">
                  <Avatar name={d.name} size={44} />
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{d.name}</p>
                    <p className="truncate text-[13px] text-sub">{d.title}</p>
                  </div>
                </div>
                <div className="mt-3.5 flex items-center justify-between text-xs text-sub">
                  <Badge>{d.department}</Badge>
                  <span>Since {fmtDate(d.hireDate, { month: 'short', year: 'numeric' })}</span>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  )
}
