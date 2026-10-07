import { describe, expect, it } from 'vitest'
import { addDays, countBusinessDays, dayOfWeek, diffDays, parseDate, rangesOverlap, weekStart } from './dates'

describe('dates', () => {
  it('parses strictly and rejects impossible dates', () => {
    expect(() => parseDate('2026-02-31')).toThrow()
    expect(() => parseDate('26-1-1')).toThrow()
    expect(() => parseDate('2026-02-28')).not.toThrow()
  })
  it('adds days across month and leap-year boundaries', () => {
    expect(addDays('2026-02-27', 2)).toBe('2026-03-01')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
    expect(diffDays('2026-01-01', '2026-12-31')).toBe(364)
  })
  it('finds weekday and week start (Monday)', () => {
    expect(dayOfWeek('2026-10-07')).toBe(3) // Wednesday
    expect(weekStart('2026-10-07')).toBe('2026-10-05')
    expect(weekStart('2026-10-11')).toBe('2026-10-05') // Sunday belongs to the week that began Monday
  })
  it('counts business days, skipping weekends and holidays', () => {
    expect(countBusinessDays('2026-10-05', '2026-10-09')).toBe(5)
    expect(countBusinessDays('2026-10-05', '2026-10-11')).toBe(5)
    expect(countBusinessDays('2026-10-05', '2026-10-09', new Set(['2026-10-07']))).toBe(4)
    expect(countBusinessDays('2026-10-10', '2026-10-11')).toBe(0)
    expect(countBusinessDays('2026-10-09', '2026-10-05')).toBe(0)
  })
  it('detects overlap including shared boundary days', () => {
    expect(rangesOverlap('2026-01-01', '2026-01-05', '2026-01-05', '2026-01-09')).toBe(true)
    expect(rangesOverlap('2026-01-01', '2026-01-04', '2026-01-05', '2026-01-09')).toBe(false)
  })
})
