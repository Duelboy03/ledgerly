import { useQuery } from '@tanstack/react-query'
import { CalendarDays, ClipboardCheck, Clock, FileText, LayoutDashboard, LogOut, Menu, Moon, Palmtree, RotateCcw, ScrollText, Sun, Users, Wallet, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { MODE, useApi } from '../api'
import { fmtDate } from '../lib/format'
import { useAuth } from './auth'
import { Avatar, Badge, cn } from './ui'

interface Item {
  to: string
  label: string
  icon: React.ReactNode
  badge?: number
}

function useTheme() {
  const [dark, setDark] = useState(() => {
    try {
      const saved = localStorage.getItem('ledgerly:theme')
      return saved ? saved === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches
    } catch {
      return false
    }
  })
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    try {
      localStorage.setItem('ledgerly:theme', dark ? 'dark' : 'light')
    } catch {
      /* ignore */
    }
  }, [dark])
  return [dark, () => setDark((d) => !d)] as const
}

export function Layout() {
  const { user, logout } = useAuth()
  const { api, resetDemo } = useApi()
  const [dark, toggleTheme] = useTheme()
  const [open, setOpen] = useState(false)
  const loc = useLocation()
  useEffect(() => setOpen(false), [loc.pathname])

  const me = user!
  const meta = useQuery({ queryKey: ['meta'], queryFn: () => api.meta(), staleTime: 60_000 })
  const detail = useQuery({ queryKey: ['employee', me.employeeId], queryFn: () => api.employee(me.employeeId) })
  const queue = useQuery({
    queryKey: ['approvals'],
    queryFn: () => api.approvals(),
    enabled: me.role !== 'employee',
  })
  const hourly = detail.data?.compensation?.payType === 'hourly'

  const items: Item[] = [
    { to: '/', label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
    { to: '/leave', label: 'Time off', icon: <Palmtree size={18} /> },
    ...(me.role !== 'employee' ? [{ to: '/approvals', label: 'Approvals', icon: <ClipboardCheck size={18} />, badge: queue.data?.length }] : []),
    { to: '/calendar', label: 'Calendar', icon: <CalendarDays size={18} /> },
    ...(hourly ? [{ to: '/timesheet', label: 'Timesheet', icon: <Clock size={18} /> }] : []),
    { to: '/payslips', label: 'Payslips', icon: <FileText size={18} /> },
    { to: '/people', label: 'People', icon: <Users size={18} /> },
    ...(me.role === 'hr_admin'
      ? [
          { to: '/payroll', label: 'Payroll', icon: <Wallet size={18} /> },
          { to: '/audit', label: 'Audit log', icon: <ScrollText size={18} /> },
        ]
      : []),
  ]

  const nav = (
    <nav className="flex flex-1 flex-col gap-0.5 px-3" aria-label="Main">
      {items.map((i) => (
        <NavLink
          key={i.to}
          to={i.to}
          end={i.to === '/'}
          className={({ isActive }) =>
            cn('flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors', isActive ? 'bg-brand-soft text-brand' : 'text-sub hover:bg-surface-2 hover:text-ink')
          }
        >
          {i.icon}
          <span className="flex-1">{i.label}</span>
          {!!i.badge && <Badge tone="warn">{i.badge}</Badge>}
        </NavLink>
      ))}
    </nav>
  )

  const sidebar = (
    <div className="flex h-full flex-col bg-surface">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand text-sm font-bold text-brand-ink">L</span>
        <div>
          <p className="text-[15px] font-semibold leading-none tracking-tight">Ledgerly</p>
          <p className="mt-1 text-[11px] text-sub">Northwind Labs</p>
        </div>
      </div>
      {nav}
      <div className="border-t border-line p-3">
        <div className="flex items-center gap-2.5 rounded-lg p-2">
          <Avatar name={me.name} size={34} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{me.name}</p>
            <p className="truncate text-xs text-sub">{me.role === 'hr_admin' ? 'HR admin' : me.role === 'manager' ? 'Manager' : me.title}</p>
          </div>
        </div>
        <div className="mt-1 flex gap-1">
          <button onClick={logout} className="flex flex-1 items-center justify-center gap-2 rounded-lg px-2 py-2 text-[13px] text-sub hover:bg-surface-2 hover:text-ink">
            <LogOut size={15} /> Sign out
          </button>
          <button onClick={toggleTheme} aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'} className="rounded-lg px-2.5 text-sub hover:bg-surface-2 hover:text-ink">
            {dark ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="flex h-full">
      <aside className="no-print hidden w-64 shrink-0 border-r border-line lg:block">{sidebar}</aside>

      {open && (
        <div className="no-print fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="enter absolute inset-y-0 left-0 w-72 border-r border-line">{sidebar}</aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print flex items-center gap-3 border-b border-line bg-surface px-4 py-3 lg:px-8">
          <button onClick={() => setOpen((o) => !o)} aria-label="Open menu" className="rounded-lg p-1.5 text-sub hover:bg-surface-2 lg:hidden">
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
          <div className="text-[13px] text-sub">{meta.data ? fmtDate(meta.data.today, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : ''}</div>
          <div className="ml-auto flex items-center gap-2">
            {MODE === 'demo' && (
              <>
                <Badge tone="info">Demo · resets when you reload</Badge>
                <button
                  onClick={() => resetDemo()}
                  className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-sub hover:bg-surface-2 hover:text-ink"
                >
                  <RotateCcw size={13} /> Reset
                </button>
              </>
            )}
          </div>
        </header>
        <main className="flex-1 overflow-y-auto">
          <div className="enter mx-auto max-w-7xl px-4 py-6 lg:px-8 lg:py-8" key={loc.pathname}>
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
