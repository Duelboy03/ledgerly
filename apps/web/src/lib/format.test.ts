import { describe, expect, it } from 'vitest'
import { days, fmtRange, hueFor, initials, money, moneyShort, num, shiftMonth } from './format'

describe('format helpers', () => {
  it('formats cents as dollars', () => {
    expect(money(123456)).toBe('$1,234.56')
    expect(moneyShort(4_100_000)).toBe('$41,000')
    expect(money(0)).toBe('$0.00')
  })
  it('trims decimals sensibly', () => {
    expect(num(5)).toBe('5')
    expect(num(2.25)).toBe('2.25')
    expect(num(2.5)).toBe('2.5')
    expect(days(1)).toBe('1 day')
    expect(days(7.5)).toBe('7.5 days')
  })
  it('formats date ranges without repeating the year', () => {
    expect(fmtRange('2026-07-06', '2026-07-06')).toBe('Jul 6, 2026')
    expect(fmtRange('2026-07-06', '2026-07-10')).toBe('Jul 6 – Jul 10, 2026')
    expect(fmtRange('2026-12-30', '2027-01-02')).toBe('Dec 30, 2026 – Jan 2, 2027')
  })
  it('makes initials and a stable avatar colour', () => {
    expect(initials('Meera Kapoor')).toBe('MK')
    expect(hueFor('Meera Kapoor')).toBe(hueFor('Meera Kapoor'))
  })
  it('moves between months across year boundaries', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
  })
})
