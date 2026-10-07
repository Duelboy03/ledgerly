// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { computePaycheck, dollars, type PayEmployee } from '@ledgerly/domain'
import { describe, expect, it } from 'vitest'
import { PaycheckBreakdown } from './PaycheckBreakdown'

const emp: PayEmployee = {
  id: 'e', payType: 'salary', annualSalaryCents: dollars(104_000), hourlyRateCents: 0, payFrequency: 'biweekly',
  filingStatus: 'single', state: 'NY', k401Pct: 5, healthPremiumCents: 10_000, hireDate: '2020-01-01',
}
const p = computePaycheck({ employee: emp, period: { start: '2026-01-05', end: '2026-01-18', payDate: '2026-01-23' } })

describe('PaycheckBreakdown', () => {
  it('lists every earning, deduction and tax and the net pay', () => {
    render(<PaycheckBreakdown p={p} />)
    expect(screen.getByText('Salary')).toBeInTheDocument()
    expect(screen.getByText('Health premium')).toBeInTheDocument()
    expect(screen.getByText('401(k) (5%)')).toBeInTheDocument()
    expect(screen.getByText('Federal income tax')).toBeInTheDocument()
    expect(screen.getByText('State income tax (NY)')).toBeInTheDocument()
    expect(screen.getAllByText(/\$/).length).toBeGreaterThan(8)
  })
  it('describes the split for screen readers', () => {
    render(<PaycheckBreakdown p={p} />)
    expect(screen.getByRole('img', { name: /Take-home/ }).getAttribute('aria-label')).toMatch(/Take-home \d+%, Taxes \d+%, Pre-tax deductions \d+%/)
  })
  it('only shows employer costs when asked', () => {
    const { rerender } = render(<PaycheckBreakdown p={p} />)
    expect(screen.queryByText(/Employer cost on top of gross/i)).toBeNull()
    rerender(<PaycheckBreakdown p={p} showEmployer />)
    expect(screen.getByText(/Employer cost on top of gross/i)).toBeInTheDocument()
  })
})
