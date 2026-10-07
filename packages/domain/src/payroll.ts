import { countBusinessDays, type ISODate, parseDate, weekStart, year } from './dates'
import { type Cents, roundCents } from './money'
import { bracketTax, type FilingStatus, STATE_RATES, taxYearFor } from './taxTables'

export type PayFrequency = 'weekly' | 'biweekly' | 'semimonthly' | 'monthly'
export type PayType = 'salary' | 'hourly'

export const PERIODS_PER_YEAR: Record<PayFrequency, number> = {
  weekly: 52,
  biweekly: 26,
  semimonthly: 24,
  monthly: 12,
}

export interface PayEmployee {
  id: string
  payType: PayType
  annualSalaryCents: Cents
  hourlyRateCents: Cents
  payFrequency: PayFrequency
  filingStatus: FilingStatus
  state: string
  /** employee 401(k) deferral as a percentage of gross, 0-100 */
  k401Pct: number
  /** pre-tax health premium taken every pay period */
  healthPremiumCents: Cents
  extraWithholdingCents?: Cents
  hireDate: ISODate
}

export interface PayPeriod {
  start: ISODate
  end: ISODate
  payDate: ISODate
}

export interface Ytd {
  grossCents: Cents
  socialSecurityWagesCents: Cents
  medicareWagesCents: Cents
  k401Cents: Cents
}

export const EMPTY_YTD: Ytd = { grossCents: 0, socialSecurityWagesCents: 0, medicareWagesCents: 0, k401Cents: 0 }

export interface PayInput {
  employee: PayEmployee
  period: PayPeriod
  /** hourly employees: hours worked on each date in the period */
  hoursByDate?: Record<ISODate, number>
  /** salaried employees: business days of unpaid leave taken in the period */
  unpaidLeaveDays?: number
  holidays?: ReadonlySet<ISODate>
  ytd?: Ytd
}

export interface Line {
  code: string
  label: string
  cents: Cents
}

export interface Paycheck {
  employeeId: string
  period: PayPeriod
  earnings: Line[]
  preTax: Line[]
  taxes: Line[]
  employer: Line[]
  grossCents: Cents
  preTaxCents: Cents
  taxCents: Cents
  netCents: Cents
  employerCostCents: Cents
  hours: { regular: number; overtime: number }
  notes: string[]
}

export const OVERTIME_THRESHOLD = 40
export const OVERTIME_MULTIPLIER = 1.5

const sum = (lines: Line[]) => lines.reduce((a, l) => a + l.cents, 0)

/** Share of the period's business days the employee was on payroll, for mid-period hires. */
export function proration(hire: ISODate, period: PayPeriod, holidays: ReadonlySet<ISODate> = new Set()): number {
  if (parseDate(hire) <= parseDate(period.start)) return 1
  if (parseDate(hire) > parseDate(period.end)) return 0
  const total = countBusinessDays(period.start, period.end, holidays)
  if (total === 0) return 0
  return countBusinessDays(hire, period.end, holidays) / total
}

export function splitHours(hoursByDate: Record<ISODate, number>): { regular: number; overtime: number } {
  const weeks = new Map<ISODate, number>()
  for (const [d, h] of Object.entries(hoursByDate)) {
    const w = weekStart(d)
    weeks.set(w, (weeks.get(w) ?? 0) + h)
  }
  let regular = 0
  let overtime = 0
  for (const h of weeks.values()) {
    regular += Math.min(h, OVERTIME_THRESHOLD)
    overtime += Math.max(0, h - OVERTIME_THRESHOLD)
  }
  return { regular, overtime }
}

export function computePaycheck(input: PayInput): Paycheck {
  const { employee: e, period } = input
  const ytd = input.ytd ?? EMPTY_YTD
  const holidays = input.holidays ?? new Set<ISODate>()
  const tax = taxYearFor(year(period.payDate))
  const periods = PERIODS_PER_YEAR[e.payFrequency]
  const notes: string[] = []

  // ---- earnings
  const earnings: Line[] = []
  let hours = { regular: 0, overtime: 0 }
  if (e.payType === 'salary') {
    const base = roundCents(e.annualSalaryCents / periods)
    const share = proration(e.hireDate, period, holidays)
    const prorated = roundCents(base * share)
    if (share < 1) notes.push(`Prorated to ${(share * 100).toFixed(0)}% for a mid-period start`)
    earnings.push({ code: 'SALARY', label: 'Salary', cents: prorated })
    const unpaid = input.unpaidLeaveDays ?? 0
    if (unpaid > 0) {
      const workdays = countBusinessDays(period.start, period.end, holidays)
      const deduction = roundCents(Math.min(prorated, (base / workdays) * unpaid))
      earnings.push({ code: 'UNPAID', label: `Unpaid leave (${unpaid} day${unpaid === 1 ? '' : 's'})`, cents: -deduction })
    }
  } else {
    hours = splitHours(input.hoursByDate ?? {})
    earnings.push({
      code: 'REG',
      label: `Regular (${hours.regular.toFixed(2)} h)`,
      cents: roundCents(e.hourlyRateCents * hours.regular),
    })
    if (hours.overtime > 0) {
      earnings.push({
        code: 'OT',
        label: `Overtime (${hours.overtime.toFixed(2)} h at ${OVERTIME_MULTIPLIER}x)`,
        cents: roundCents(e.hourlyRateCents * OVERTIME_MULTIPLIER * hours.overtime),
      })
    }
  }
  const gross = Math.max(0, sum(earnings))

  // ---- pre-tax deductions
  const preTax: Line[] = []
  const health = Math.min(e.healthPremiumCents, gross)
  if (health > 0) preTax.push({ code: 'HEALTH', label: 'Health premium', cents: health })
  const wanted = roundCents((gross * e.k401Pct) / 100)
  const room = Math.max(0, tax.limit401k - ytd.k401Cents)
  const k401 = Math.min(wanted, room, gross - health)
  if (k401 < wanted) notes.push('401(k) deferral capped at the annual limit')
  if (k401 > 0) preTax.push({ code: '401K', label: `401(k) (${e.k401Pct}%)`, cents: k401 })

  // ---- taxes
  const federalTaxable = Math.max(0, gross - health - k401)
  const ficaWages = Math.max(0, gross - health) // 401(k) deferrals are still subject to FICA
  const annualTaxable = Math.max(0, federalTaxable * periods - tax.standardDeduction[e.filingStatus])
  const federal =
    roundCents(bracketTax(annualTaxable, tax.brackets[e.filingStatus]) / periods) + (e.extraWithholdingCents ?? 0)

  const ssRoom = Math.max(0, tax.socialSecurityWageBase - ytd.socialSecurityWagesCents)
  const socialSecurity = roundCents(Math.min(ficaWages, ssRoom) * tax.socialSecurityRate)

  const medicare = roundCents(ficaWages * tax.medicareRate)
  const overBefore = Math.max(0, ytd.medicareWagesCents - tax.additionalMedicareThreshold)
  const overAfter = Math.max(0, ytd.medicareWagesCents + ficaWages - tax.additionalMedicareThreshold)
  const additionalMedicare = roundCents((overAfter - overBefore) * tax.additionalMedicareRate)

  const stateRate = STATE_RATES[e.state]
  if (stateRate === undefined) notes.push(`No state rate configured for ${e.state}; state tax set to zero`)
  const state = roundCents(federalTaxable * (stateRate ?? 0))

  const taxes: Line[] = [
    { code: 'FIT', label: 'Federal income tax', cents: federal },
    { code: 'SS', label: 'Social Security', cents: socialSecurity },
    { code: 'MED', label: 'Medicare', cents: medicare },
  ]
  if (additionalMedicare > 0) taxes.push({ code: 'MEDX', label: 'Additional Medicare', cents: additionalMedicare })
  if (state > 0) taxes.push({ code: 'SIT', label: `State income tax (${e.state})`, cents: state })

  const preTaxTotal = sum(preTax)
  const taxTotal = sum(taxes)
  // a paycheck cannot go negative: shave withholding rather than pay out less than zero
  const net = Math.max(0, gross - preTaxTotal - taxTotal)
  if (gross - preTaxTotal - taxTotal < 0) notes.push('Deductions exceeded gross pay; net set to zero')

  // ---- employer side
  const futaRoom = Math.max(0, tax.futaWageBase - ytd.grossCents)
  const matchBase = Math.min(k401, roundCents(gross * tax.matchCap))
  const employer: Line[] = [
    { code: 'ER_SS', label: 'Employer Social Security', cents: socialSecurity },
    { code: 'ER_MED', label: 'Employer Medicare', cents: medicare },
    { code: 'ER_FUTA', label: 'FUTA', cents: roundCents(Math.min(gross, futaRoom) * tax.futaRate) },
    { code: 'ER_401K', label: '401(k) match', cents: roundCents(matchBase * tax.matchRate) },
  ].filter((l) => l.cents > 0)

  return {
    employeeId: e.id,
    period,
    earnings,
    preTax,
    taxes,
    employer,
    grossCents: gross,
    preTaxCents: preTaxTotal,
    taxCents: taxTotal,
    netCents: net,
    employerCostCents: gross + sum(employer),
    hours,
    notes,
  }
}

/** Fold a finished paycheck into the running year-to-date totals. */
export function addToYtd(ytd: Ytd, p: Paycheck): Ytd {
  const health = p.preTax.find((l) => l.code === 'HEALTH')?.cents ?? 0
  const wages = Math.max(0, p.grossCents - health)
  return {
    grossCents: ytd.grossCents + p.grossCents,
    socialSecurityWagesCents: ytd.socialSecurityWagesCents + wages,
    medicareWagesCents: ytd.medicareWagesCents + wages,
    k401Cents: ytd.k401Cents + (p.preTax.find((l) => l.code === '401K')?.cents ?? 0),
  }
}

/** Pay periods for a year, used by the payroll run screen. Anchored to the first Friday for week-based schedules. */
export function periodsFor(frequency: PayFrequency, y: number): PayPeriod[] {
  const out: PayPeriod[] = []
  const pad = (n: number) => String(n).padStart(2, '0')
  const lastDay = (m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate()
  if (frequency === 'monthly') {
    for (let m = 1; m <= 12; m++) out.push({ start: `${y}-${pad(m)}-01`, end: `${y}-${pad(m)}-${lastDay(m)}`, payDate: `${y}-${pad(m)}-${lastDay(m)}` })
  } else if (frequency === 'semimonthly') {
    for (let m = 1; m <= 12; m++) {
      out.push({ start: `${y}-${pad(m)}-01`, end: `${y}-${pad(m)}-15`, payDate: `${y}-${pad(m)}-15` })
      out.push({ start: `${y}-${pad(m)}-16`, end: `${y}-${pad(m)}-${lastDay(m)}`, payDate: `${y}-${pad(m)}-${lastDay(m)}` })
    }
  } else {
    const step = frequency === 'weekly' ? 7 : 14
    // first Monday of the year
    let start: ISODate = `${y}-01-01`
    while (new Date(parseDate(start)).getUTCDay() !== 1) start = new Date(parseDate(start) + 86_400_000).toISOString().slice(0, 10)
    for (let t = parseDate(start); new Date(t).getUTCFullYear() === y; t += step * 86_400_000) {
      const s = new Date(t).toISOString().slice(0, 10)
      const e = new Date(t + (step - 1) * 86_400_000).toISOString().slice(0, 10)
      const pay = new Date(t + (step + 4) * 86_400_000).toISOString().slice(0, 10) // the Friday after the period closes
      out.push({ start: s, end: e, payDate: pay })
    }
  }
  return out
}
