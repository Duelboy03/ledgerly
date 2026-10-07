/**
 * Calendar dates are plain 'YYYY-MM-DD' strings. They are parsed as UTC so that
 * results never depend on the machine's timezone or on daylight saving.
 */
export type ISODate = string

const MS_DAY = 86_400_000

export function parseDate(d: ISODate): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d)
  if (!m) throw new Error(`Invalid date: ${d}`)
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3])
  // reject 2026-02-31 style dates that Date.UTC silently rolls over
  if (formatDate(t) !== d) throw new Error(`Invalid date: ${d}`)
  return t
}

export function formatDate(t: number): ISODate {
  return new Date(t).toISOString().slice(0, 10)
}

export const addDays = (d: ISODate, n: number): ISODate => formatDate(parseDate(d) + n * MS_DAY)

export const diffDays = (a: ISODate, b: ISODate): number => Math.round((parseDate(b) - parseDate(a)) / MS_DAY)

/** 0 = Sunday ... 6 = Saturday */
export const dayOfWeek = (d: ISODate): number => new Date(parseDate(d)).getUTCDay()

export const isWeekend = (d: ISODate): boolean => {
  const w = dayOfWeek(d)
  return w === 0 || w === 6
}

export const year = (d: ISODate): number => +d.slice(0, 4)
export const month = (d: ISODate): number => +d.slice(5, 7)

export function* eachDay(start: ISODate, end: ISODate): Generator<ISODate> {
  for (let t = parseDate(start); t <= parseDate(end); t += MS_DAY) yield formatDate(t)
}

/** Monday of the week containing the date, used to bucket hours into work weeks. */
export function weekStart(d: ISODate): ISODate {
  const w = dayOfWeek(d)
  return addDays(d, -((w + 6) % 7))
}

/** Weekdays in the range that are not listed holidays. */
export function countBusinessDays(start: ISODate, end: ISODate, holidays: ReadonlySet<ISODate> = new Set()): number {
  if (parseDate(end) < parseDate(start)) return 0
  let n = 0
  for (const d of eachDay(start, end)) if (!isWeekend(d) && !holidays.has(d)) n++
  return n
}

export const rangesOverlap = (aStart: ISODate, aEnd: ISODate, bStart: ISODate, bEnd: ISODate): boolean =>
  parseDate(aStart) <= parseDate(bEnd) && parseDate(bStart) <= parseDate(aEnd)
