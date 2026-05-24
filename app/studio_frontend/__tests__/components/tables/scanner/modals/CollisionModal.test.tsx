import * as React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CollisionModal } from '@/components/tables/scanner/modals/CollisionModal'
import type { WorkbenchRow, RuleCreationResult } from '@/lib/types'

jest.mock('@/lib/api', () => ({
  api: {
    create: jest.fn(),
    update: jest.fn(),
    scanner: {
      createVendorRule: jest.fn(),
      createNameRule: jest.fn(),
      createPatternRule: jest.fn(),
      createLink: jest.fn(),
    },
  },
}))

import { api } from '@/lib/api'
const mockApi = api as jest.Mocked<typeof api>

function makeRow(id: string, name: string, vendor: string, overrides: Partial<WorkbenchRow> = {}): WorkbenchRow {
  return {
    result_id: id, disk_name: name, disk_vendor: vendor, disk_version: '1.0', disk_format: 'VST3',
    disk_path: '/p', display_name: name, display_vendor: vendor,
    catalog_record_id: 'c1', catalog_record_table: 'instruments',
    catalog_record_name: 'CatalogName', catalog_record_vendor: 'CatalogVendor', catalog_record_version: '1.0',
    bucket: 'needs_review', confidence: null, confirmed_at: null, confirmed_by: null,
    ...overrides,
  }
}

const rowA = makeRow('rA', 'Plugin A', 'VendorA')
const rowB = makeRow('rB', 'Plugin B', 'VendorB')
const noop = jest.fn()

afterEach(() => jest.resetAllMocks())

// Step 64
it('renders Result A, Result B, Catalog column headers', () => {
  render(<CollisionModal rowA={rowA} rowB={rowB} onClose={noop} onSaved={noop} onFireRuleToasts={noop} />)
  expect(screen.getByText('Result A')).toBeInTheDocument()
  expect(screen.getByText('Result B')).toBeInTheDocument()
  expect(screen.getByText('Catalog')).toBeInTheDocument()
})

// Step 65
it('renders 3 radio buttons (A, B, Catalog) for each differing field row', () => {
  render(<CollisionModal rowA={rowA} rowB={rowB} onClose={noop} onSaved={noop} onFireRuleToasts={noop} />)
  // name and vendor differ across A/B; all three options per field
  const radios = screen.getAllByRole('radio')
  // at least name row: 3 radios; vendor row: 3 radios = 6+
  expect(radios.length).toBeGreaterThanOrEqual(6)
})

// Step 66 — radios: [name-A, name-B, name-Cat, vendor-A, vendor-B, vendor-Cat, ver-A, ver-B, ver-Cat]
it('calls api.update with values from chosen sources on Save', async () => {
  ;(mockApi.update as jest.Mock).mockResolvedValue({})
  ;(mockApi.scanner.createVendorRule as jest.Mock).mockResolvedValue({
    rule: { rule_id: 'rv1', disk_vendor: 'VendorA', catalog_vendor: 'CatalogVendor', enabled: true, created_by: 'test', created_at: '2026-01-01T00:00:00Z', affected_count: 1, clean_count: 1, needs_review_count: 0 },
    affected_count: 1, clean_count: 1, needs_review_count: 0,
  } satisfies RuleCreationResult)
  render(<CollisionModal rowA={rowA} rowB={rowB} onClose={noop} onSaved={noop} onFireRuleToasts={noop} />)
  const radios = screen.getAllByRole('radio')
  fireEvent.click(radios[0]) // name → A
  fireEvent.click(radios[5]) // vendor → Catalog
  fireEvent.click(radios[6]) // version → A
  fireEvent.click(screen.getByRole('button', { name: /save/i }))
  await waitFor(() => expect(mockApi.update).toHaveBeenCalledWith(
    '/catalog/instruments', 'c1',
    expect.objectContaining({ name: 'Plugin A', vendor: 'CatalogVendor' })
  ))
})

it('creates vendor rule when Catalog chosen for vendor', async () => {
  ;(mockApi.update as jest.Mock).mockResolvedValue({})
  ;(mockApi.scanner.createVendorRule as jest.Mock).mockResolvedValue({
    rule: { rule_id: 'rv1', disk_vendor: 'VendorA', catalog_vendor: 'CatalogVendor', enabled: true, created_by: 'test', created_at: '2026-01-01T00:00:00Z', affected_count: 1, clean_count: 1, needs_review_count: 0 },
    affected_count: 1, clean_count: 1, needs_review_count: 0,
  } satisfies RuleCreationResult)
  render(<CollisionModal rowA={rowA} rowB={rowB} onClose={noop} onSaved={noop} onFireRuleToasts={noop} />)
  const radios = screen.getAllByRole('radio')
  fireEvent.click(radios[0]) // name → A
  fireEvent.click(radios[5]) // vendor → Catalog
  fireEvent.click(radios[6]) // version → A
  fireEvent.click(screen.getByRole('button', { name: /save/i }))
  await waitFor(() => expect(mockApi.scanner.createVendorRule).toHaveBeenCalled())
})

// Step 67
it('enables Set Name Alias when only names differ and all other fields match', () => {
  const a = makeRow('rA', 'Plugin A', 'SharedVendor', { catalog_record_vendor: 'SharedVendor', disk_version: '1.0', catalog_record_version: '1.0' })
  const b = makeRow('rB', 'Plugin B', 'SharedVendor', { catalog_record_vendor: 'SharedVendor', disk_version: '1.0', catalog_record_version: '1.0' })
  render(<CollisionModal rowA={a} rowB={b} onClose={noop} onSaved={noop} onFireRuleToasts={noop} />)
  expect(screen.getByRole('button', { name: /set name alias/i })).not.toBeDisabled()
})

it('disables Set Name Alias when vendor also differs', () => {
  render(<CollisionModal rowA={rowA} rowB={rowB} onClose={noop} onSaved={noop} onFireRuleToasts={noop} />)
  expect(screen.getByRole('button', { name: /set name alias/i })).toBeDisabled()
})

// Step 68
it('calls createPatternRule with action alias_to_match on Set Name Alias', async () => {
  ;(mockApi.scanner.createPatternRule as jest.Mock).mockResolvedValue({
    rule: { rule_id: 'rp1', label: 'alias', pattern: '*', match_fields: ['name'], action: 'alias_to_match', enabled: true, is_seeded: false, created_by: 'test', created_at: '2026-01-01T00:00:00Z' },
    affected_count: 0, clean_count: 0, needs_review_count: 0,
  } satisfies RuleCreationResult)
  const a = makeRow('rA', 'Plugin A', 'SharedVendor', { catalog_record_vendor: 'SharedVendor', disk_version: '1.0', catalog_record_version: '1.0' })
  const b = makeRow('rB', 'Plugin B', 'SharedVendor', { catalog_record_vendor: 'SharedVendor', disk_version: '1.0', catalog_record_version: '1.0' })
  render(<CollisionModal rowA={a} rowB={b} onClose={noop} onSaved={noop} onFireRuleToasts={noop} />)
  fireEvent.click(screen.getByRole('button', { name: /set name alias/i }))
  await waitFor(() =>
    expect(mockApi.scanner.createPatternRule).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'alias_to_match' })
    )
  )
})

// Step 69
it('transitions to inline form with disk values when Create New Record clicked', () => {
  render(<CollisionModal rowA={rowA} rowB={rowB} onClose={noop} onSaved={noop} onFireRuleToasts={noop} />)
  fireEvent.click(screen.getByRole('button', { name: /create new record/i }))
  expect(screen.getByDisplayValue('Plugin A')).toBeInTheDocument()
  expect(screen.getByDisplayValue('VendorA')).toBeInTheDocument()
})

// Step 70
it('POSTs catalog then link when Create New Record form submitted', async () => {
  ;(mockApi.create as jest.Mock).mockResolvedValue({ id: 'newCat1' })
  ;(mockApi.scanner.createLink as jest.Mock).mockResolvedValue({ created: 1, errors: [] })
  const onSaved = jest.fn()
  render(<CollisionModal rowA={rowA} rowB={rowB} onClose={noop} onSaved={onSaved} onFireRuleToasts={noop} />)
  fireEvent.click(screen.getByRole('button', { name: /create new record/i }))
  fireEvent.change(screen.getByRole('combobox', { name: /catalog type/i }), { target: { value: 'instruments' } })
  fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
  await waitFor(() => expect(mockApi.create).toHaveBeenCalledWith(
    '/catalog/instruments', expect.objectContaining({ name: 'Plugin A' })
  ))
  await waitFor(() => expect(mockApi.scanner.createLink).toHaveBeenCalledWith(
    expect.objectContaining({ catalog_record_id: 'newCat1', catalog_record_table: 'instruments' })
  ))
})
