import { test } from '@playwright/test'
import { go, signIn, signOut, weekdayAhead } from './helpers'

// Run with: npm run screenshots
test.skip(!process.env.SCREENSHOTS, 'screenshot generation only')
test.use({ viewport: { width: 1360, height: 860 }, colorScheme: 'light' })

const shot = (page: import('@playwright/test').Page, name: string, full = false) =>
  page.screenshot({ path: `docs/screenshots/${name}.png`, fullPage: full })

test('capture', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('heading', { name: 'Sign in' }).waitFor({ timeout: 60_000 })
  await page.waitForTimeout(400)
  await shot(page, 'login')

  // HR
  await signIn(page, 'hr')
  await page.waitForTimeout(600)
  await shot(page, 'dashboard-hr')
  await go(page, 'Payroll')
  await page.getByRole('row', { name: /Meera Kapoor/ }).waitFor()
  await page.waitForTimeout(400)
  await shot(page, 'payroll', true)
  await page.getByRole('row', { name: /Ava Thompson/ }).click()
  await page.waitForTimeout(400)
  await shot(page, 'payroll-paycheck')
  await page.keyboard.press('Escape')
  await go(page, 'People')
  await page.getByRole('link', { name: /Meera Kapoor/ }).click()
  await page.waitForTimeout(400)
  await shot(page, 'person')
  await go(page, 'Audit log')
  await page.waitForTimeout(300)
  await shot(page, 'audit')

  // dark mode
  await go(page, 'Dashboard')
  await page.getByRole('button', { name: 'Switch to dark theme' }).click()
  await page.waitForTimeout(400)
  await shot(page, 'dashboard-dark')
  await page.getByRole('button', { name: 'Switch to light theme' }).click()

  // employee
  await signOut(page)
  await signIn(page, 'employee')
  await go(page, 'Time off')
  await page.getByRole('button', { name: 'Request time off' }).first().click()
  const d = weekdayAhead(35)
  await page.getByLabel('Type', { exact: true }).selectOption('vacation')
  await page.getByLabel('From', { exact: true }).fill(d)
  await page.getByLabel('To', { exact: true }).fill(weekdayAhead(37))
  await page.getByText(/of working time/).waitFor()
  await page.waitForTimeout(300)
  await shot(page, 'leave-request')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)
  await shot(page, 'leave')
  await go(page, 'Calendar')
  await page.waitForTimeout(500)
  await shot(page, 'calendar')
  await go(page, 'Payslips')
  await page.getByRole('link', { name: 'View' }).first().click()
  await page.waitForTimeout(400)
  await shot(page, 'payslip', true)

  // manager
  await signOut(page)
  await signIn(page, 'manager')
  await go(page, /Approvals/)
  await page.waitForTimeout(500)
  await shot(page, 'approvals')

})
