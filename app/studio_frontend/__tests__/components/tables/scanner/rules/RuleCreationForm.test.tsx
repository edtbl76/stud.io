import * as React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { RuleCreationForm } from '@/components/tables/scanner/rules/RuleCreationForm'

const onClose = jest.fn()

beforeEach(() => jest.clearAllMocks())

// Step 23
describe('vendor type', () => {
  it('renders disk-vendor and catalog-vendor inputs', () => {
    render(<RuleCreationForm ruleType="vendor" onSubmit={jest.fn()} onClose={onClose} />)
    expect(screen.getByTestId('input-disk-vendor')).toBeInTheDocument()
    expect(screen.getByTestId('input-catalog-vendor')).toBeInTheDocument()
  })

  // Step 24
  it('calls onSubmit with disk_vendor and catalog_vendor values', async () => {
    const onSubmit = jest.fn().mockResolvedValue({})
    render(<RuleCreationForm ruleType="vendor" onSubmit={onSubmit} onClose={onClose} />)
    fireEvent.change(screen.getByTestId('input-disk-vendor'), { target: { value: 'ikmultimedia' } })
    fireEvent.change(screen.getByTestId('input-catalog-vendor'), { target: { value: 'IK Multimedia' } })
    fireEvent.click(screen.getByTestId('rule-form-submit'))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ disk_vendor: 'ikmultimedia', catalog_vendor: 'IK Multimedia' }))
  })

  // Step 25
  it('disables submit button while onSubmit is pending', async () => {
    const onSubmit = jest.fn().mockReturnValue(new Promise(() => {}))
    render(<RuleCreationForm ruleType="vendor" onSubmit={onSubmit} onClose={onClose} />)
    fireEvent.change(screen.getByTestId('input-disk-vendor'), { target: { value: 'x' } })
    fireEvent.change(screen.getByTestId('input-catalog-vendor'), { target: { value: 'X' } })
    fireEvent.click(screen.getByTestId('rule-form-submit'))
    await waitFor(() => expect(screen.getByTestId('rule-form-submit')).toBeDisabled())
  })

  // Step 26
  it('shows field-level error when onSubmit rejects with 409 message', async () => {
    const onSubmit = jest.fn().mockRejectedValue(new Error('Vendor rule for this disk_vendor already exists'))
    render(<RuleCreationForm ruleType="vendor" onSubmit={onSubmit} onClose={onClose} />)
    fireEvent.change(screen.getByTestId('input-disk-vendor'), { target: { value: 'x' } })
    fireEvent.change(screen.getByTestId('input-catalog-vendor'), { target: { value: 'X' } })
    fireEvent.click(screen.getByTestId('rule-form-submit'))
    await waitFor(() => expect(screen.getByTestId('rule-form-error')).toBeInTheDocument())
  })

  // Step 27
  it('calls onClose after successful submit', async () => {
    const onSubmit = jest.fn().mockResolvedValue({})
    render(<RuleCreationForm ruleType="vendor" onSubmit={onSubmit} onClose={onClose} />)
    fireEvent.change(screen.getByTestId('input-disk-vendor'), { target: { value: 'x' } })
    fireEvent.change(screen.getByTestId('input-catalog-vendor'), { target: { value: 'X' } })
    fireEvent.click(screen.getByTestId('rule-form-submit'))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })
})

// Step 28
describe('name type', () => {
  it('renders disk-name and catalog-name inputs', () => {
    render(<RuleCreationForm ruleType="name" onSubmit={jest.fn()} onClose={onClose} />)
    expect(screen.getByTestId('input-disk-name')).toBeInTheDocument()
    expect(screen.getByTestId('input-catalog-name')).toBeInTheDocument()
  })

  it('calls onSubmit with disk_name and catalog_name values', async () => {
    const onSubmit = jest.fn().mockResolvedValue({})
    render(<RuleCreationForm ruleType="name" onSubmit={onSubmit} onClose={onClose} />)
    fireEvent.change(screen.getByTestId('input-disk-name'), { target: { value: 'Reverb' } })
    fireEvent.change(screen.getByTestId('input-catalog-name'), { target: { value: 'Reverb Pro' } })
    fireEvent.click(screen.getByTestId('rule-form-submit'))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ disk_name: 'Reverb', catalog_name: 'Reverb Pro' }))
  })
})

// Step 29
describe('pattern type', () => {
  it('renders label, pattern, match-fields, action, and enabled inputs', () => {
    render(<RuleCreationForm ruleType="pattern" onSubmit={jest.fn()} onClose={onClose} />)
    expect(screen.getByTestId('input-label')).toBeInTheDocument()
    expect(screen.getByTestId('input-pattern')).toBeInTheDocument()
    expect(screen.getByTestId('checkbox-match-vendor')).toBeInTheDocument()
    expect(screen.getByTestId('select-action')).toBeInTheDocument()
    expect(screen.getByTestId('toggle-enabled')).toBeInTheDocument()
  })

  it('calls onSubmit with label, pattern, match_fields array, action, and enabled', async () => {
    const onSubmit = jest.fn().mockResolvedValue({})
    render(<RuleCreationForm ruleType="pattern" onSubmit={onSubmit} onClose={onClose} />)
    fireEvent.change(screen.getByTestId('input-label'), { target: { value: 'My Pattern' } })
    fireEvent.change(screen.getByTestId('input-pattern'), { target: { value: 'test.*' } })
    fireEvent.click(screen.getByTestId('checkbox-match-vendor'))
    fireEvent.change(screen.getByTestId('select-action'), { target: { value: 'alias_to_match' } })
    fireEvent.click(screen.getByTestId('toggle-enabled'))
    fireEvent.click(screen.getByTestId('rule-form-submit'))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({
      label: 'My Pattern',
      pattern: 'test.*',
      match_fields: ['vendor'],
      action: 'alias_to_match',
      enabled: true,
    }))
  })
})
