import { formatMoney, type ISODate } from '@ledgerly/domain'

export const money = (cents: number) => formatMoney(cents)

/** whole dollars, for headline numbers */
export const moneyShort = (cents: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(cents / 100)

const parse = (d: ISODate) => new Date(`${d}T00:00:00Z`)

export const fmtDate = (d: ISODate, opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }) =>
  new Intl.DateTimeFormat('en-US', { ...opts, timeZone: 'UTC' }).format(parse(d))

export const fmtDay = (d: ISODate) => fmtDate(d, { weekday: 'short', month: 'short', day: 'numeric' })

export function fmtRange(a: ISODate, b: ISODate): string {
  if (a === b) return fmtDate(a, { month: 'short', day: 'numeric', year: 'numeric' })
  const sameYear = a.slice(0, 4) === b.slice(0, 4)
  return `${fmtDate(a, sameYear ? { month: 'short', day: 'numeric' } : undefined)} – ${fmtDate(b)}`
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** up to two decimals, trailing zeros trimmed: 2.25 stays 2.25, 5 stays 5 */
export const num = (n: number) => String(+n.toFixed(2))

export const days = (n: number) => `${num(n)} ${n === 1 ? 'day' : 'days'}`

export const typeLabel = (t: string) => t[0].toUpperCase() + t.slice(1)

export const initials = (name: string) =>
  name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

// a stable colour per person, so avatars are recognisable across screens
const HUES = [172, 217, 262, 24, 340, 142, 199, 291]
export const hueFor = (s: string) => HUES[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % HUES.length]

export function monthKey(d: ISODate): string {
  return d.slice(0, 7)
}

export function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1 + delta, 1))
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}`
}
