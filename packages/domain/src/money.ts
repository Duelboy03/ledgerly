/** All money in the domain is an integer number of cents. */
export type Cents = number

/** Round half away from zero, the usual payroll convention for a single line item. */
export const roundCents = (x: number): Cents => (x < 0 ? -Math.round(-x) : Math.round(x))

export const dollars = (d: number): Cents => roundCents(d * 100)

export function formatMoney(c: Cents, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(c / 100)
}
