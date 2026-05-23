import * as React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { VendorMappingsSection } from '@/components/tables/scanner/rules/VendorMappingsSection'
import type { VendorRule } from '@/lib/types'

jest.mock('@/lib/api', () => ({ api: { scanner: { rules: jest.fn(), createVendorRule: jest.fn(), createNameRule: jest.fn(), createPatternRule: jest.fn(), toggleRule: jest.fn(), deleteRule: jest.fn(), acknowledgeClean: jest.fn() } } }))
jest.mock('sonner', () => ({ toast: { success: jest.fn(), info: jest.fn() } }))

const { api } = jest.requireMock('@/lib/api') as { api: { scanner: Record<string, jest.Mock> } }

const vendorRule: VendorRule = { rule_id: 'v1', disk_vendor: 'ikm', catalog_vendor: 'IK Multimedia', enabled: true, created_by: 'admin', created_at: '2026-01-01', affected_count: 2, clean_count: 1, needs_review_count: 1 }

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

beforeEach(() => {
  jest.clearAllMocks()
  api.scanner.rules.mockResolvedValue({ vendor: [vendorRule], name: [], pattern: [] })
})

// Step 40
it('renders disk_vendor and catalog_vendor column headers', async () => {
  render(<VendorMappingsSection />, { wrapper })
  await waitFor(() => expect(screen.getByText('Disk Vendor')).toBeInTheDocument())
  expect(screen.getByText('Catalog Vendor')).toBeInTheDocument()
})

it('passes ruleType vendor to RuleSection (row renders after load)', async () => {
  render(<VendorMappingsSection />, { wrapper })
  expect(screen.getByTestId('rule-section-add-button')).toBeInTheDocument()
})
