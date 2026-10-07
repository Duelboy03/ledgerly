import { expect, type Page } from '@playwright/test'

export const PERSONAS = { hr: 'Priya Raman', manager: 'Arjun Mehta', employee: 'Meera Kapoor' } as const

/** Loads the demo (the in-browser database seeds itself) and signs in as one of the demo personas. */
export async function open(page: Page, who: keyof typeof PERSONAS) {
  await page.goto('/')
  await signIn(page, who)
}

export async function signIn(page: Page, who: keyof typeof PERSONAS) {
  await page.getByRole('button', { name: new RegExp(PERSONAS[who]) }).click({ timeout: 60_000 })
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible()
}

export async function signOut(page: Page) {
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
}

/** A weekday at least `daysAhead` days from now, as YYYY-MM-DD (UTC, like the app). */
export function weekdayAhead(daysAhead: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + daysAhead)
  while ([0, 6].includes(d.getUTCDay())) d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

/** Click an item in the sidebar (scoped, because pages also contain links with the same names). */
export async function go(page: Page, name: string | RegExp) {
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name }).click()
}
