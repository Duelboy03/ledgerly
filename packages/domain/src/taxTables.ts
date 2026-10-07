import type { Cents } from './money'
import { dollars } from './money'

export type FilingStatus = 'single' | 'married'

export interface Bracket {
  /** upper bound of the bracket in annual taxable income, null for the top bracket */
  upTo: Cents | null
  rate: number
}

export interface TaxYear {
  year: number
  standardDeduction: Record<FilingStatus, Cents>
  brackets: Record<FilingStatus, Bracket[]>
  socialSecurityRate: number
  socialSecurityWageBase: Cents
  medicareRate: number
  additionalMedicareRate: number
  additionalMedicareThreshold: Cents
  futaRate: number
  futaWageBase: Cents
  limit401k: Cents
  /** employer matches this share of employee deferrals ... */
  matchRate: number
  /** ... up to this share of gross pay */
  matchCap: number
}

const b = (rows: [number | null, number][]): Bracket[] =>
  rows.map(([upTo, rate]) => ({ upTo: upTo === null ? null : dollars(upTo), rate }))

/**
 * Federal figures follow the IRS annualised percentage method with the standard
 * deduction only (no W-4 steps 2-4). They are a simplified model for this
 * project. Check IRS Publication 15-T before using any number for real payroll.
 */
export const TAX_2026: TaxYear = {
  year: 2026,
  standardDeduction: { single: dollars(16_100), married: dollars(32_200) },
  brackets: {
    single: b([
      [12_400, 0.1],
      [50_400, 0.12],
      [105_700, 0.22],
      [201_775, 0.24],
      [256_225, 0.32],
      [640_600, 0.35],
      [null, 0.37],
    ]),
    married: b([
      [24_800, 0.1],
      [100_800, 0.12],
      [211_400, 0.22],
      [403_550, 0.24],
      [512_450, 0.32],
      [768_700, 0.35],
      [null, 0.37],
    ]),
  },
  socialSecurityRate: 0.062,
  socialSecurityWageBase: dollars(184_500),
  medicareRate: 0.0145,
  additionalMedicareRate: 0.009,
  additionalMedicareThreshold: dollars(200_000),
  futaRate: 0.006,
  futaWageBase: dollars(7_000),
  limit401k: dollars(24_500),
  matchRate: 0.5,
  matchCap: 0.06,
}

export const TAX_YEARS: Record<number, TaxYear> = { 2026: TAX_2026 }

/**
 * Effective flat state income-tax rates, for illustration only. Real state
 * withholding is progressive and has its own forms.
 */
export const STATE_RATES: Record<string, number> = {
  TX: 0,
  FL: 0,
  WA: 0,
  NY: 0.055,
  CA: 0.06,
  IL: 0.0495,
  CO: 0.044,
  GA: 0.0519,
  NC: 0.0425,
  MA: 0.05,
}

export const taxYearFor = (year: number): TaxYear => TAX_YEARS[year] ?? TAX_2026

export function bracketTax(annualTaxable: Cents, brackets: Bracket[]): Cents {
  let tax = 0
  let lower = 0
  for (const br of brackets) {
    if (annualTaxable <= lower) break
    const top = br.upTo === null ? annualTaxable : Math.min(annualTaxable, br.upTo)
    tax += (top - lower) * br.rate
    if (br.upTo === null) break
    lower = br.upTo
  }
  return Math.round(tax)
}
