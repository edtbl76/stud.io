import * as React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { NamePatternsSection } from '@/components/tables/scanner/rules/NamePatternsSection'
import type { PatternRule } from '@/lib/types'

jest.mock('@/lib/api', () => ({ api: { scanner: { rules: jest.fn(), createVendorRule: jest.fn(), createNameRule: jest.fn(), createPatternRule: jest.fn(), toggleRule: jest.fn(), deleteRule: jest.fn(), acknowledgeClean: jest.fn() } } }))
jest.mock('sonner', () => ({ toast: { success: jest.fn(), info: jest.fn() } }))

const { api } = jest.requireMock('@/lib/api') as { api: { scanner: Record<string, jest.Mock> } }

const seeded: PatternRule = { rule_id: 'p1', label: 'Mono variant', pattern: '{name}(m)', match_fields: ['vendor'], action: 'alias_to_match', enabled: false, is_seeded: true, created_by: 'system', created_at: '2026-01-01' }
const userCreated: PatternRule = { ...seeded, rule_id: 'p2', label: 'Custom', is_seeded: false }

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

beforeEach(() => { jest.clearAllMocks(); api.scanner.rules.mockResolvedValue({ vendor: [], name: [], pattern: [seeded, userCreated] }) })

// Step 42
it('renders label and pattern column headers', async () => {
  render(<NamePatternsSection />, { wrapper })
  await waitFor(() => expect(screen.getByText('Label')).toBeInTheDocument())
  expect(screen.getByText('Pattern')).toBeInTheDocument()
})

// Step 43
it('suppresses delete for seeded rows, shows delete for non-seeded rows', async () => {
  render(<NamePatternsSection />, { wrapper })
  await waitFor(() => screen.getByTestId('rule-row-p1'))
  expect(screen.queryByTestId('rule-delete-p1')).not.toBeInTheDocument()
  expect(screen.getByTestId('rule-delete-p2')).toBeInTheDocument()
})
