import * as React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { RuleSection } from '@/components/tables/scanner/rules/RuleSection'
import type { RuleType } from '@/lib/types'

jest.mock('@/components/tables/scanner/rules/RuleCreationForm', () => ({
  RuleCreationForm: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="rule-creation-form"><button onClick={onClose}>close</button></div>
  ),
}))

const onToggle = jest.fn()
const onDelete = jest.fn()
const onEdit   = jest.fn()
const onAdd    = jest.fn().mockResolvedValue({})

const rows = [
  { rule_id: 'r1', label: 'Rule One', is_seeded: false },
  { rule_id: 'r2', label: 'Rule Two', is_seeded: true },
]

const columns = [{ key: 'label', header: 'Label' }]

function renderSection(overrides = {}) {
  return render(
    <RuleSection
      title="Vendor Mappings"
      description="Map disk vendors to catalog vendors"
      rules={rows as never[]}
      columns={columns}
      ruleType={'vendor' as RuleType}
      onToggle={onToggle}
      onDelete={onDelete}
      onEdit={onEdit}
      onAdd={onAdd}
      isLoading={false}
      {...overrides}
    />
  )
}

beforeEach(() => jest.clearAllMocks())

// Step 30
it('renders section title and description', () => {
  renderSection()
  expect(screen.getByText('Vendor Mappings')).toBeInTheDocument()
  expect(screen.getByText('Map disk vendors to catalog vendors')).toBeInTheDocument()
})

// Step 31
it('renders Add Rule button', () => {
  renderSection()
  expect(screen.getByTestId('rule-section-add-button')).toBeInTheDocument()
})

// Step 32
it('clicking Add Rule opens the creation form', () => {
  renderSection()
  fireEvent.click(screen.getByTestId('rule-section-add-button'))
  expect(screen.getByTestId('rule-creation-form')).toBeInTheDocument()
})

// Step 33
it('renders a row for each rule', () => {
  renderSection()
  expect(screen.getByTestId('rule-row-r1')).toBeInTheDocument()
  expect(screen.getByTestId('rule-row-r2')).toBeInTheDocument()
})

// Step 34
it('clicking toggle calls onToggle with id and new state', () => {
  renderSection()
  fireEvent.click(screen.getByTestId('rule-toggle-r1'))
  expect(onToggle).toHaveBeenCalledWith('r1', expect.any(Boolean))
})

// Step 35
it('delete button is visible for non-seeded rows', () => {
  renderSection()
  expect(screen.getByTestId('rule-delete-r1')).toBeInTheDocument()
})

// Step 36
it('delete shows confirmation before calling onDelete', async () => {
  renderSection()
  fireEvent.click(screen.getByTestId('rule-delete-r1'))
  expect(screen.getByTestId('rule-delete-confirm-r1')).toBeInTheDocument()
  fireEvent.click(screen.getByTestId('rule-delete-confirm-r1'))
  await waitFor(() => expect(onDelete).toHaveBeenCalledWith('r1'))
})

// Step 37
it('delete button is absent for seeded rows', () => {
  renderSection()
  expect(screen.queryByTestId('rule-delete-r2')).not.toBeInTheDocument()
})

// Step 38
it('edit action calls onEdit with id and new value', async () => {
  renderSection()
  fireEvent.click(screen.getByTestId('rule-edit-r1'))
  const input = screen.getByTestId('rule-edit-input-r1')
  fireEvent.change(input, { target: { value: 'New Value' } })
  fireEvent.click(screen.getByTestId('rule-edit-save-r1'))
  await waitFor(() => expect(onEdit).toHaveBeenCalledWith('r1', 'New Value'))
})

// Step 39
it('shows loading skeleton and hides rows when isLoading is true', () => {
  renderSection({ isLoading: true })
  expect(screen.getByTestId('rule-section-skeleton')).toBeInTheDocument()
  expect(screen.queryByTestId('rule-row-r1')).not.toBeInTheDocument()
})
