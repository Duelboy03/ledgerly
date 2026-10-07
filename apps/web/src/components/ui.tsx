import clsx from 'clsx'
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react'
import { createPortal } from 'react-dom'
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { hueFor, initials } from '../lib/format'

export const cn = clsx

/* ---------- buttons ---------- */
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand text-brand-ink hover:brightness-110 shadow-sm',
  secondary: 'bg-surface text-ink border border-line hover:bg-surface-2',
  ghost: 'text-sub hover:bg-surface-2 hover:text-ink',
  danger: 'bg-bad text-white hover:brightness-110',
}

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  loading,
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md'; loading?: boolean }) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' ? 'px-2.5 py-1.5 text-[13px]' : 'px-3.5 py-2 text-sm',
        VARIANTS[variant],
        className,
      )}
    >
      {loading && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />}
      {children}
    </button>
  )
}

/* ---------- surfaces ---------- */
export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cn('print-card rounded-xl border border-line bg-surface shadow-card', className)}>{children}</section>
}

export function CardHeader({ title, subtitle, action }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
      <div>
        <h2 className="text-[15px] font-semibold leading-tight">{title}</h2>
        {subtitle && <p className="mt-0.5 text-[13px] text-sub">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-sub">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}

/* ---------- badges ---------- */
type Tone = 'neutral' | 'good' | 'warn' | 'bad' | 'info' | 'brand'
const TONES: Record<Tone, string> = {
  neutral: 'bg-surface-2 text-sub',
  good: 'bg-good-soft text-good',
  warn: 'bg-warn-soft text-warn',
  bad: 'bg-bad-soft text-bad',
  info: 'bg-info-soft text-info',
  brand: 'bg-brand-soft text-brand',
}
export function Badge({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium', TONES[tone], className)}>{children}</span>
}

const STATUS_TONE: Record<string, Tone> = { pending: 'warn', approved: 'good', rejected: 'bad', cancelled: 'neutral' }
export const StatusBadge = ({ status }: { status: string }) => (
  <Badge tone={STATUS_TONE[status] ?? 'neutral'}>
    <span className="h-1.5 w-1.5 rounded-full bg-current" />
    {status[0].toUpperCase() + status.slice(1)}
  </Badge>
)

export function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  const h = hueFor(name)
  return (
    <span
      aria-hidden
      className="inline-grid shrink-0 place-items-center rounded-full font-semibold"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.38,
        background: `hsl(${h} 70% 50% / 0.16)`,
        color: `hsl(${h} 60% 38%)`,
      }}
    >
      {initials(name)}
    </span>
  )
}

/* ---------- forms ---------- */
const fieldBase =
  'w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted transition-colors focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25 disabled:bg-surface-2 disabled:text-sub'

export function Field({ label, hint, error, children }: { label: string; hint?: ReactNode; error?: string; children: (id: string) => ReactNode }) {
  const id = useId()
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-medium">
        {label}
      </label>
      {children(id)}
      {error ? <p className="mt-1 text-xs text-bad">{error}</p> : hint ? <p className="mt-1 text-xs text-sub">{hint}</p> : null}
    </div>
  )
}
export const Input = ({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={cn(fieldBase, className)} />
export const Select = ({ className, ...p }: SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={cn(fieldBase, 'pr-8', className)} />
export const Textarea = ({ className, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...p} className={cn(fieldBase, 'min-h-20 resize-y', className)} />

/* ---------- feedback ---------- */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-surface-2', className)} />
}

export function EmptyState({ title, hint, icon }: { title: string; hint?: string; icon?: ReactNode }) {
  return (
    <div className="grid place-items-center px-6 py-12 text-center">
      {icon && <div className="mb-3 grid h-11 w-11 place-items-center rounded-full bg-surface-2 text-sub">{icon}</div>}
      <p className="text-sm font-medium">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-[13px] text-sub">{hint}</p>}
    </div>
  )
}

export function Alert({ tone = 'info', children }: { tone?: 'info' | 'warn' | 'bad' | 'good'; children: ReactNode }) {
  const Icon = tone === 'good' ? CheckCircle2 : tone === 'info' ? Info : AlertTriangle
  return (
    <div className={cn('flex items-start gap-2.5 rounded-lg px-3 py-2.5 text-[13px]', TONES[tone])} role={tone === 'bad' ? 'alert' : 'status'}>
      <Icon size={16} className="mt-0.5 shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  )
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: Tone }) {
  return (
    <Card className="p-5">
      <p className="text-[13px] font-medium text-sub">{label}</p>
      <p className={cn('num mt-1.5 text-[28px] font-semibold leading-none tracking-tight', tone === 'bad' && 'text-bad', tone === 'good' && 'text-good')}>{value}</p>
      {sub && <p className="mt-2 text-xs text-sub">{sub}</p>}
    </Card>
  )
}

/* ---------- dialog ---------- */
export function Modal({ open, onClose, title, children, footer, width = 'max-w-lg' }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; width?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const prev = document.activeElement as HTMLElement | null
    ref.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      prev?.focus()
    }
  }, [open, onClose])
  if (!open) return null
  // rendered into <body> so no ancestor (animation, overflow, transform) can clip or offset the overlay
  return createPortal(
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className={cn('enter relative max-h-[90vh] w-full overflow-auto rounded-2xl border border-line bg-surface shadow-pop outline-none', width)}>
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-base font-semibold">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="rounded-md p-1 text-sub hover:bg-surface-2">
            <X size={18} />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line bg-surface-2/50 px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

/* ---------- toasts ---------- */
interface Toast {
  id: number
  tone: 'good' | 'bad' | 'info'
  text: string
}
const ToastCtx = createContext<(text: string, tone?: Toast['tone']) => void>(() => {})
export const useToast = () => useContext(ToastCtx)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([])
  const push = useCallback((text: string, tone: Toast['tone'] = 'good') => {
    const id = Date.now() + Math.random()
    setItems((x) => [...x, { id, tone, text }])
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), 4200)
  }, [])
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="no-print fixed bottom-4 right-4 z-[60] flex w-80 flex-col gap-2" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className="enter flex items-start gap-2.5 rounded-xl border border-line bg-surface px-3.5 py-3 text-sm shadow-pop">
            {t.tone === 'good' ? <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-good" /> : t.tone === 'bad' ? <AlertTriangle size={17} className="mt-0.5 shrink-0 text-bad" /> : <Info size={17} className="mt-0.5 shrink-0 text-info" />}
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

/* ---------- data viz ---------- */
export function Ring({ value, max, size = 76, stroke = 8, label, sub, tone = 'brand' }: { value: number; max: number; size?: number; stroke?: number; label: ReactNode; sub?: ReactNode; tone?: 'brand' | 'warn' | 'info' | 'bad' }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const frac = max <= 0 ? 0 : Math.max(0, Math.min(1, value / max))
  const color = { brand: 'var(--brand)', warn: 'var(--warn)', info: 'var(--info)', bad: 'var(--bad)' }[tone]
  return (
    <div className="flex items-center gap-3.5">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={stroke} />
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${c * frac} ${c}`} />
        </svg>
        <div className="num absolute inset-0 grid place-items-center text-[17px] font-semibold">{label}</div>
      </div>
      {sub && <div className="min-w-0 text-[13px]">{sub}</div>}
    </div>
  )
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { id: T; label: string; count?: number }[] }) {
  return (
    <div role="tablist" className="inline-flex rounded-lg bg-surface-2 p-1">
      {items.map((i) => (
        <button
          key={i.id}
          role="tab"
          aria-selected={value === i.id}
          onClick={() => onChange(i.id)}
          className={cn('rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors', value === i.id ? 'bg-surface text-ink shadow-sm' : 'text-sub hover:text-ink')}
        >
          {i.label}
          {i.count !== undefined && <span className="ml-1.5 text-xs text-muted">{i.count}</span>}
        </button>
      ))}
    </div>
  )
}

export const Table = ({ children, className }: { children: ReactNode; className?: string }) => (
  <div className={cn('overflow-x-auto', className)}>
    <table className="w-full text-sm">{children}</table>
  </div>
)
export const Th = ({ children, right, className }: { children?: ReactNode; right?: boolean; className?: string }) => (
  <th className={cn('whitespace-nowrap px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-sub', right ? 'text-right' : 'text-left', className)}>{children}</th>
)
export const Td = ({ children, right, className, ...p }: { children?: ReactNode; right?: boolean; className?: string } & React.TdHTMLAttributes<HTMLTableCellElement>) => (
  <td {...p} className={cn('px-4 py-3 align-middle', right && 'num text-right', className)}>
    {children}
  </td>
)
