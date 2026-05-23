import * as React from 'react'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PluginScannerRulesPage } from '@/components/tables/scanner/rules/PluginScannerRulesPage'

jest.mock('@/lib/api', () => ({
  api: { scanner: { rules: jest.fn(), createVendorRule: jest.fn(), createNameRule: jest.fn(), createPatternRule: jest.fn(), updateRule: jest.fn(), toggleRule: jest.fn(), deleteRule: jest.fn(), acknowledgeClean: jest.fn() } },
}))
jest.mock('sonner', () => ({ toast: { success: jest.fn(), info: jest.fn() } }))
jest.mock('@/components/scanner/RuleToastManager', () => ({ fireRuleToasts: jest.fn() }))

const { api } = jest.requireMock('@/lib/api') as { api: { scanner: Record<string, jest.Mock> } }

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

beforeEach(() => {
  jest.clearAllMocks()
  api.scanner.rules.mockResolvedValue({ vendor: [], name: [], pattern: [] })
})

// Step 44
it('renders all three section headings', async () => {
  render(<PluginScannerRulesPage />, { wrapper })
  await waitFor(() => expect(screen.getByText('Vendor Mappings')).toBeInTheDocument())
  expect(screen.getByText('Name Mappings')).toBeInTheDocument()
  expect(screen.getByText('Name Patterns')).toBeInTheDocument()
})

// Step 45
it('shows loading skeleton while fetching', () => {
  api.scanner.rules.mockReturnValue(new Promise(() => {}))
  render(<PluginScannerRulesPage />, { wrapper })
  expect(screen.getAllByTestId('rule-section-skeleton').length).toBeGreaterThan(0)
})

// Step 46
it('calls fireRuleToasts after vendor rule creation via VendorMappingsSection.handleAdd', async () => {
  const { fireRuleToasts } = jest.requireMock('@/components/scanner/RuleToastManager') as { fireRuleToasts: jest.Mock }
  api.scanner.createVendorRule.mockResolvedValue({ rule: { rule_id: 'v1' }, affected_count: 2, clean_count: 1, needs_review_count: 1 })

  render(<PluginScannerRulesPage />, { wrapper })
  await waitFor(() => expect(screen.getAllByTestId('rule-section-add-button')).toHaveLength(3))

  fireEvent.click(screen.getAllByTestId('rule-section-add-button')[0])
  await waitFor(() => expect(screen.getByTestId('input-disk-vendor')).toBeInTheDocument())

  fireEvent.change(screen.getByTestId('input-disk-vendor'), { target: { value: 'ikm' } })
  fireEvent.change(screen.getByTestId('input-catalog-vendor'), { target: { value: 'IK Multimedia' } })
  fireEvent.click(screen.getByTestId('rule-form-submit'))

  await waitFor(() => expect(fireRuleToasts).toHaveBeenCalledWith(expect.objectContaining({
    ruleLabel: 'ikm → IK Multimedia',
    cleanCount: 1,
    needsReviewCount: 1,
    ruleId: 'v1',
    ruleType: 'vendor',
  })))
})
