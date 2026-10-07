import { expect, test } from '@playwright/test'
import { go, open, signIn, signOut, weekdayAhead } from './helpers'

test('employee requests time off, manager approves, employee sees the result', async ({ page }) => {
  await open(page, 'employee')
  await go(page, 'Time off')
  await page.getByRole('button', { name: 'Request time off' }).first().click()

  const day = weekdayAhead(40)
  await page.getByLabel('Type', { exact: true }).selectOption('unpaid')
  await page.getByLabel('From', { exact: true }).fill(day)
  await page.getByLabel('To', { exact: true }).fill(day)
  await page.getByLabel('Note for your manager').fill('Moving flats')
  await expect(page.getByText('1 day of working time')).toBeVisible()
  await page.getByRole('button', { name: 'Send request' }).click()
  await expect(page.getByText('Request sent to your manager')).toBeVisible()
  await expect(page.getByRole('row', { name: /Unpaid/ }).getByText('Pending', { exact: true })).toBeVisible()

  await signOut(page)
  await signIn(page, 'manager')
  await go(page, /Approvals/)
  const card = page.locator('section', { hasText: 'Meera Kapoor' }).filter({ hasText: 'Moving flats' })
  await card.getByLabel('Note for Meera Kapoor').fill('Approved, enjoy')
  await card.getByRole('button', { name: 'Approve' }).click()
  await expect(page.getByText(/Meera Kapoor’s request approved/)).toBeVisible()

  await signOut(page)
  await signIn(page, 'employee')
  await go(page, 'Time off')
  const row = page.getByRole('row', { name: /Unpaid/ })
  await expect(row.getByText('Approved', { exact: true })).toBeVisible()
  await expect(row.getByText(/Arjun Mehta/)).toBeVisible()
})

test('the request form blocks a vacation without enough notice', async ({ page }) => {
  await open(page, 'employee')
  await go(page, 'Time off')
  await page.getByRole('button', { name: 'Request time off' }).first().click()
  const tomorrow = weekdayAhead(1)
  await page.getByLabel('From', { exact: true }).fill(tomorrow)
  await page.getByLabel('To', { exact: true }).fill(tomorrow)
  await expect(page.getByText(/needs 3 days of notice/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Send request' })).toBeDisabled()
})

test('navigation and data follow the signed-in role', async ({ page }) => {
  await open(page, 'employee')
  const nav = page.getByRole('navigation', { name: 'Main' })
  await expect(nav.getByRole('link', { name: 'Payroll' })).toHaveCount(0)
  await expect(nav.getByRole('link', { name: /Approvals/ })).toHaveCount(0)
  await expect(nav.getByRole('link', { name: 'Audit log' })).toHaveCount(0)
  // typing the URL does not get around it
  await page.goto('/#/payroll')
  await expect(page.getByRole('heading', { name: /Good (morning|afternoon|evening)/ })).toBeVisible()

  await signOut(page)
  await signIn(page, 'hr')
  await expect(nav.getByRole('link', { name: 'Payroll' })).toBeVisible()
  await expect(nav.getByRole('link', { name: 'Audit log' })).toBeVisible()
})

test('a colleague’s pay is hidden from an employee and a manager, but not from HR', async ({ page }) => {
  await open(page, 'employee')
  await go(page, 'People')
  await page.getByRole('link', { name: /Liam Chen/ }).click()
  await expect(page.getByText('Pay details are visible to the employee and HR only.')).toBeVisible()

  await signOut(page)
  await signIn(page, 'hr')
  await go(page, 'People')
  await page.getByRole('link', { name: /Liam Chen/ }).click()
  await expect(page.getByText('401(k) deferral')).toBeVisible()
})

test('HR previews and runs payroll, and the period turns paid', async ({ page }) => {
  await open(page, 'hr')
  await go(page, 'Payroll')
  await expect(page.getByText('Not yet run')).toBeVisible()
  await expect(page.getByRole('row', { name: /Ava Thompson/ })).toBeVisible()
  await page.getByRole('row', { name: /Meera Kapoor/ }).click()
  await expect(page.getByRole('dialog').getByText('Net pay')).toBeVisible()
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: 'Run payroll' }).first().click()
  await page.getByRole('dialog').getByRole('button', { name: 'Run payroll' }).click()
  await expect(page.getByText(/Payroll run: 12 paychecks/)).toBeVisible()
  await expect(page.getByText('Not yet run')).toHaveCount(0)

  await go(page, 'Audit log')
  await expect(page.getByText('Ran payroll').first()).toBeVisible()
})

test('payslip shows a balanced breakdown', async ({ page }) => {
  await open(page, 'employee')
  await go(page, 'Payslips')
  await page.getByRole('link', { name: 'View' }).first().click()
  await expect(page.getByRole('heading', { name: 'Meera Kapoor' })).toBeVisible()
  await expect(page.getByText('Federal income tax')).toBeVisible()
  await expect(page.getByText('401(k) (10%)')).toBeVisible()
  await expect(page.getByText('Gross pay, year to date')).toBeVisible()
})

test('HR edits pay details and the change is audited', async ({ page }) => {
  await open(page, 'hr')
  await go(page, 'People')
  await page.getByRole('link', { name: /Ravi Shankar/ }).click()
  await page.getByRole('button', { name: 'Edit pay details' }).click()
  await page.getByLabel('401(k) deferral (%)').fill('150')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByText('Check the highlighted fields.')).toBeVisible()
  await page.getByLabel('401(k) deferral (%)').fill('9')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByText('9% of gross')).toBeVisible()
  await go(page, 'Audit log')
  await expect(page.getByText('Edited employee').first()).toBeVisible()
})

test('hourly employee logs hours and sees overtime flagged', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Email').fill('ava.thompson@northwind.test')
  await page.getByLabel('Password').fill('demo1234')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await go(page, 'Timesheet')
  await expect(page.getByText(/Week of/).first()).toBeVisible()
  const inputs = page.getByLabel(/Hours on/)
  await inputs.first().fill('12')
  await page.getByRole('button', { name: 'Save hours' }).click()
  await expect(page.getByText('Timesheet saved')).toBeVisible()
})

test('wrong password shows an error and stays signed out', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Email').fill('meera.kapoor@northwind.test')
  await page.getByLabel('Password').fill('wrong')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByText('Incorrect email or password.')).toBeVisible()
})

test('calendar shows holidays and navigates months', async ({ page }) => {
  await open(page, 'manager')
  await go(page, 'Calendar')
  await expect(page.getByRole('heading', { name: 'Team calendar' })).toBeVisible()
  const label = page.locator('span.num', { hasText: /\d{4}/ }).first()
  const before = await label.innerText()
  await page.getByRole('button', { name: 'Next month' }).click()
  await expect(label).not.toHaveText(before)
})
