import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { dollars } from './money'
import {
  addToYtd,
  computePaycheck,
  EMPTY_YTD,
  PERIODS_PER_YEAR,
  periodsFor,
  proration,
  splitHours,
  type PayEmployee,
  type PayPeriod,
} from './payroll'
import { bracketTax, TAX_2026 } from './taxTables'

const period: PayPeriod = { start: '2026-01-05', end: '2026-01-18', payDate: '2026-01-23' }

const salaried = (over: Partial<PayEmployee> = {}): PayEmployee => ({
  id: 'e1',
  payType: 'salary',
  annualSalaryCents: dollars(104_000),
  hourlyRateCents: 0,
  payFrequency: 'biweekly',
  filingStatus: 'single',
  state: 'TX',
  k401Pct: 0,
  healthPremiumCents: 0,
  hireDate: '2020-01-01',
  ...over,
})

const line = (p: ReturnType<typeof computePaycheck>, code: string) =>
  [...p.earnings, ...p.preTax, ...p.taxes, ...p.employer].find((l) => l.code === code)?.cents

describe('federal bracket maths', () => {
  it('taxes each slice at its own rate', () => {
    // 10% of 12,400 + 12% of 38,000 + 22% of 37,500
    expect(bracketTax(dollars(87_900), TAX_2026.brackets.single)).toBe(dollars(14_050))
  })
  it('is zero at zero and handles the open top bracket', () => {
    expect(bracketTax(0, TAX_2026.brackets.single)).toBe(0)
    expect(bracketTax(dollars(1_000_000), TAX_2026.brackets.single)).toBeGreaterThan(dollars(300_000))
  })
})

describe('salaried paycheck', () => {
  it('matches a hand-worked biweekly example', () => {
    const p = computePaycheck({ employee: salaried(), period })
    expect(p.grossCents).toBe(400000)
    expect(line(p, 'FIT')).toBe(54038) // 14,050 / 26 = 540.38
    expect(line(p, 'SS')).toBe(24800)
    expect(line(p, 'MED')).toBe(5800)
    expect(p.netCents).toBe(400000 - 54038 - 24800 - 5800)
  })

  it('applies pre-tax deductions before income tax but not before FICA', () => {
    const base = computePaycheck({ employee: salaried(), period })
    const p = computePaycheck({ employee: salaried({ k401Pct: 10, healthPremiumCents: 20000 }), period })
    expect(line(p, '401K')).toBe(40000)
    expect(line(p, 'HEALTH')).toBe(20000)
    expect(line(p, 'FIT')!).toBeLessThan(line(base, 'FIT')!)
    // health premium is excluded from FICA wages, the 401(k) deferral is not
    expect(line(p, 'SS')).toBe(Math.round((400000 - 20000) * 0.062))
  })

  it('prorates a mid-period hire by business days', () => {
    expect(proration('2026-01-12', period)).toBe(0.5)
    expect(proration('2025-06-01', period)).toBe(1)
    expect(proration('2026-02-01', period)).toBe(0)
    const p = computePaycheck({ employee: salaried({ hireDate: '2026-01-12' }), period })
    expect(p.grossCents).toBe(200000)
    expect(p.notes.join(' ')).toMatch(/Prorated to 50%/)
  })

  it('deducts unpaid leave at the daily rate', () => {
    const p = computePaycheck({ employee: salaried(), period, unpaidLeaveDays: 2 })
    expect(p.grossCents).toBe(400000 - 80000) // 4,000 / 10 days = 400 a day
    expect(p.earnings.some((l) => l.code === 'UNPAID')).toBe(true)
  })

  it('caps the 401(k) at the annual limit and says so', () => {
    const ytd = { ...EMPTY_YTD, k401Cents: TAX_2026.limit401k - 10000 }
    const p = computePaycheck({ employee: salaried({ k401Pct: 15 }), period, ytd })
    expect(line(p, '401K')).toBe(10000)
    expect(p.notes.join(' ')).toMatch(/capped/)
  })

  it('stops Social Security at the wage base but keeps Medicare going', () => {
    const ytd = { ...EMPTY_YTD, socialSecurityWagesCents: TAX_2026.socialSecurityWageBase - 100000, medicareWagesCents: 18_000_000 }
    const p = computePaycheck({ employee: salaried({ annualSalaryCents: dollars(260_000) }), period, ytd })
    expect(line(p, 'SS')).toBe(Math.round(100000 * 0.062)) // only the last $1,000 of room is taxed
    expect(line(p, 'MED')).toBe(Math.round(1_000_000 * 0.0145))
  })

  it('adds the additional Medicare tax only on wages above $200,000', () => {
    const ytd = { ...EMPTY_YTD, medicareWagesCents: dollars(199_000) }
    const p = computePaycheck({ employee: salaried({ annualSalaryCents: dollars(260_000) }), period, ytd })
    const gross = Math.round(dollars(260_000) / 26) // 10,000
    expect(line(p, 'MEDX')).toBe(Math.round((199_000_00 + gross - 200_000_00) * 0.009))
  })

  it('uses the state rate and notes an unknown state', () => {
    expect(line(computePaycheck({ employee: salaried({ state: 'NY' }), period }), 'SIT')).toBe(Math.round(400000 * 0.055))
    expect(line(computePaycheck({ employee: salaried({ state: 'TX' }), period }), 'SIT')).toBeUndefined()
    expect(computePaycheck({ employee: salaried({ state: 'ZZ' }), period }).notes.join(' ')).toMatch(/No state rate/)
  })

  it('computes employer cost with FUTA and the 401(k) match', () => {
    const p = computePaycheck({ employee: salaried({ k401Pct: 8 }), period })
    expect(line(p, 'ER_401K')).toBe(Math.round(Math.min(32000, 24000) * 0.5)) // match stops at 6% of pay
    expect(line(p, 'ER_FUTA')).toBe(Math.round(400000 * 0.006))
    expect(p.employerCostCents).toBeGreaterThan(p.grossCents)
  })
})

describe('hourly paycheck', () => {
  const hourly = salaried({ payType: 'hourly', hourlyRateCents: 2000, annualSalaryCents: 0 })

  it('pays time and a half only past 40 hours in a work week', () => {
    // one 45-hour week, one 30-hour week
    const hoursByDate = {
      '2026-01-05': 9, '2026-01-06': 9, '2026-01-07': 9, '2026-01-08': 9, '2026-01-09': 9,
      '2026-01-12': 6, '2026-01-13': 6, '2026-01-14': 6, '2026-01-15': 6, '2026-01-16': 6,
    }
    expect(splitHours(hoursByDate)).toEqual({ regular: 70, overtime: 5 })
    const p = computePaycheck({ employee: hourly, period, hoursByDate })
    expect(line(p, 'REG')).toBe(70 * 2000)
    expect(line(p, 'OT')).toBe(5 * 3000)
    expect(p.grossCents).toBe(140000 + 15000)
  })

  it('does not average overtime across weeks', () => {
    const light = { '2026-01-05': 20, '2026-01-12': 20 }
    expect(splitHours(light).overtime).toBe(0)
    expect(splitHours({ '2026-01-05': 30, '2026-01-06': 30 })).toEqual({ regular: 40, overtime: 20 })
  })

  it('pays nothing and withholds nothing for no hours', () => {
    const p = computePaycheck({ employee: hourly, period, hoursByDate: {} })
    expect(p.grossCents).toBe(0)
    expect(p.netCents).toBe(0)
    expect(p.taxCents).toBe(0)
  })
})

describe('year to date', () => {
  it('accumulates wages and deferrals', () => {
    const p = computePaycheck({ employee: salaried({ k401Pct: 5, healthPremiumCents: 10000 }), period })
    const ytd = addToYtd(EMPTY_YTD, p)
    expect(ytd.grossCents).toBe(400000)
    expect(ytd.socialSecurityWagesCents).toBe(390000)
    expect(ytd.k401Cents).toBe(20000)
  })
})

describe('pay periods', () => {
  it('produces 26 biweekly, 24 semimonthly and 12 monthly periods', () => {
    expect(periodsFor('biweekly', 2026).length).toBeGreaterThanOrEqual(26)
    expect(periodsFor('semimonthly', 2026)).toHaveLength(24)
    expect(periodsFor('monthly', 2026)).toHaveLength(12)
    expect(periodsFor('weekly', 2026)[0].start).toBe('2026-01-05')
  })
  it('has contiguous, non-overlapping biweekly periods', () => {
    const ps = periodsFor('biweekly', 2026)
    for (let i = 1; i < ps.length; i++) expect(Date.parse(ps[i].start) - Date.parse(ps[i - 1].end)).toBe(86_400_000)
  })
  it('knows how many periods a year has', () => {
    expect(PERIODS_PER_YEAR.biweekly).toBe(26)
  })
})

describe('invariants (property based)', () => {
  const emp = fc.record({
    salary: fc.integer({ min: 20_000, max: 600_000 }),
    freq: fc.constantFrom('weekly', 'biweekly', 'semimonthly', 'monthly' as const),
    status: fc.constantFrom('single', 'married' as const),
    state: fc.constantFrom('TX', 'NY', 'CA', 'IL'),
    k401: fc.integer({ min: 0, max: 100 }),
    health: fc.integer({ min: 0, max: 200_000 }),
    ytdMed: fc.integer({ min: 0, max: 40_000_000 }),
    ytd401k: fc.integer({ min: 0, max: 3_000_000 }),
  })

  it('net + deductions + taxes always equals gross, and nothing is negative', () => {
    fc.assert(
      fc.property(emp, (x) => {
        const p = computePaycheck({
          employee: salaried({
            annualSalaryCents: dollars(x.salary),
            payFrequency: x.freq as PayEmployee['payFrequency'],
            filingStatus: x.status as PayEmployee['filingStatus'],
            state: x.state,
            k401Pct: x.k401,
            healthPremiumCents: x.health,
          }),
          period,
          ytd: { ...EMPTY_YTD, medicareWagesCents: x.ytdMed, socialSecurityWagesCents: x.ytdMed, k401Cents: x.ytd401k },
        })
        const all = [...p.earnings, ...p.preTax, ...p.taxes, ...p.employer]
        expect(all.filter((l) => l.code !== 'UNPAID').every((l) => l.cents >= 0)).toBe(true)
        expect(p.netCents).toBeGreaterThanOrEqual(0)
        if (!p.notes.some((n) => /exceeded/.test(n))) {
          expect(p.netCents + p.preTaxCents + p.taxCents).toBe(p.grossCents)
        }
        expect(Number.isInteger(p.netCents)).toBe(true)
        expect(p.preTaxCents).toBeLessThanOrEqual(p.grossCents)
      }),
      { numRuns: 300 },
    )
  })

  it('a higher salary never reduces federal withholding', () => {
    fc.assert(
      fc.property(fc.integer({ min: 20_000, max: 400_000 }), fc.integer({ min: 1, max: 50_000 }), (s, bump) => {
        const a = computePaycheck({ employee: salaried({ annualSalaryCents: dollars(s) }), period })
        const b = computePaycheck({ employee: salaried({ annualSalaryCents: dollars(s + bump) }), period })
        expect(line(b, 'FIT')!).toBeGreaterThanOrEqual(line(a, 'FIT')!)
        expect(b.netCents).toBeGreaterThanOrEqual(a.netCents - 1)
      }),
      { numRuns: 200 },
    )
  })
})
