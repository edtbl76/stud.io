import * as React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { NameMappingsSection } from '@/components/tables/scanner/rules/NameMappingsSection'

jest.mock('@/lib/api', () => ({ api: { scanner: { rules: jest.fn(), createVendorRule: jest.fn(), createNameRule: jest.fn(), createPatternRule: jest.fn(), toggleRule: jest.fn(), deleteRule: jest.fn(), acknowledgeClean: jest.fn() } } }))
jest.mock('sonner', () => ({ toast: { success: jest.fn(), info: jest.fn() } }))

const { api } = jest.requireMock('@/lib/api') as { api: { scanner: Record<string, jest.Mock> } }

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

beforeEach(() => { jest.clearAllMocks(); api.scanner.rules.mockResolvedValue({ vendor: [], name: [], pattern: [] }) })

// Step 41
it('renders disk_name and catalog_name column headers', async () => {
  render(<NameMappingsSection />, { wrapper })
  await waitFor(() => expect(screen.getByText('Disk Name')).toBeInTheDocument())
  expect(screen.getByText('Catalog Name')).toBeInTheDocument()
})
