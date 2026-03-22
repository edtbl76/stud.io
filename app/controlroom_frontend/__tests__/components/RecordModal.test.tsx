import * as React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { RecordModal } from '@/components/RecordModal'

const defaultProps = {
  title: 'Test Record',
  isEditing: false,
  isAdmin: true,
  onEdit: jest.fn(),
  onSave: jest.fn(),
  onDelete: jest.fn(),
  onClose: jest.fn(),
}

function renderModal(overrides: Partial<React.ComponentProps<typeof RecordModal>> = {}) {
  return render(
    <RecordModal {...defaultProps} {...overrides}>
      <div>content</div>
    </RecordModal>
  )
}

describe('RecordModal — view mode', () => {
  beforeEach(() => jest.clearAllMocks())

  it('renders the title', () => {
    renderModal()
    expect(screen.getByText('Test Record')).toBeInTheDocument()
  })

  it('shows Delete, Edit, and Close buttons for admin in view mode', () => {
    renderModal()
    expect(screen.getByRole('button', { name: /^delete$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^edit$/i })).toBeInTheDocument()
    const closeButtons = screen.getAllByRole('button', { name: 'Close' })
    expect(closeButtons.find(b => b.textContent?.trim() === 'Close')).toBeDefined()
  })

  it('hides Delete and Edit buttons for non-admin in view mode', () => {
    renderModal({ isAdmin: false })
    expect(screen.queryByRole('button', { name: /^delete$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^edit$/i })).not.toBeInTheDocument()
  })

  it('shows Close button in footer for admin in view mode', () => {
    renderModal()
    // The footer Close button has direct text content "Close" (unlike the dialog X with sr-only span)
    const closeButtons = screen.getAllByRole('button', { name: 'Close' })
    const footerClose = closeButtons.find(b => b.textContent?.trim() === 'Close')
    expect(footerClose).toBeDefined()
  })

  it('calls onEdit when Edit is clicked', () => {
    const onEdit = jest.fn()
    renderModal({ onEdit })
    fireEvent.click(screen.getByRole('button', { name: /^edit$/i }))
    expect(onEdit).toHaveBeenCalled()
  })

  it('calls onClose when Close is clicked', () => {
    const onClose = jest.fn()
    renderModal({ onClose })
    // Find the footer Close button (direct text "Close", not the X button with sr-only span)
    const closeButtons = screen.getAllByRole('button', { name: 'Close' })
    const footerClose = closeButtons.find(b => b.textContent?.trim() === 'Close')!
    fireEvent.click(footerClose)
    expect(onClose).toHaveBeenCalled()
  })

  it('shows delete confirmation in view mode after Delete click', () => {
    renderModal()
    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }))
    expect(screen.getByText('Are you sure?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /confirm delete/i })).toBeInTheDocument()
  })

  it('calls onDelete after confirming in view mode', () => {
    const onDelete = jest.fn()
    renderModal({ onDelete })
    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }))
    fireEvent.click(screen.getByRole('button', { name: /confirm delete/i }))
    expect(onDelete).toHaveBeenCalled()
  })

  it('cancels view mode delete confirmation and restores Delete button', () => {
    renderModal()
    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }))
    const areYouSure = screen.getByText('Are you sure?').closest('div')!
    const cancelBtn = Array.from(areYouSure.querySelectorAll('button')).find(
      b => b.textContent?.trim() === 'Cancel'
    )!
    fireEvent.click(cancelBtn)
    expect(screen.queryByText('Are you sure?')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^delete$/i })).toBeInTheDocument()
  })
})

describe('RecordModal — edit mode', () => {
  beforeEach(() => jest.clearAllMocks())

  it('shows Delete, Cancel, and Save buttons in edit mode', () => {
    renderModal({ isEditing: true })
    expect(screen.getByRole('button', { name: /^delete$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^save$/i })).toBeInTheDocument()
  })

  it('calls onSave when Save is clicked', () => {
    const onSave = jest.fn()
    renderModal({ isEditing: true, onSave })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    expect(onSave).toHaveBeenCalled()
  })

  it('calls onClose when Cancel is clicked', () => {
    const onClose = jest.fn()
    renderModal({ isEditing: true, onClose })
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onClose).toHaveBeenCalled()
  })
})

describe('RecordModal — two-stage delete', () => {
  beforeEach(() => jest.clearAllMocks())

  it('shows confirmation prompt after first Delete click', () => {
    renderModal({ isEditing: true })
    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }))
    expect(screen.getByText('Are you sure?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /confirm delete/i })).toBeInTheDocument()
  })

  it('calls onDelete after confirming', () => {
    const onDelete = jest.fn()
    renderModal({ isEditing: true, onDelete })
    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }))
    fireEvent.click(screen.getByRole('button', { name: /confirm delete/i }))
    expect(onDelete).toHaveBeenCalled()
  })

  it('cancels delete confirmation and returns to delete button', () => {
    renderModal({ isEditing: true })
    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }))
    expect(screen.getByText('Are you sure?')).toBeInTheDocument()
    // The confirmation Cancel is inside the "Are you sure?" section
    const areYouSure = screen.getByText('Are you sure?').closest('div')!
    const cancelConfirmBtn = Array.from(areYouSure.querySelectorAll('button')).find(
      b => b.textContent?.trim() === 'Cancel'
    )!
    fireEvent.click(cancelConfirmBtn)
    expect(screen.queryByText('Are you sure?')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^delete$/i })).toBeInTheDocument()
  })

  it('does not call onDelete on first delete click', () => {
    const onDelete = jest.fn()
    renderModal({ isEditing: true, onDelete })
    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }))
    expect(onDelete).not.toHaveBeenCalled()
  })
})

describe('RecordModal — history mode', () => {
  beforeEach(() => jest.clearAllMocks())

  it('shows History button when onHistory is provided', () => {
    renderModal({ onHistory: jest.fn() })
    expect(screen.getByRole('button', { name: /^history$/i })).toBeInTheDocument()
  })

  it('hides History button when onHistory is not provided', () => {
    renderModal()
    expect(screen.queryByRole('button', { name: /^history$/i })).not.toBeInTheDocument()
  })

  it('renders only Close button when isHistory is true', () => {
    renderModal({ isHistory: true })
    const closeButtons = screen.getAllByRole('button', { name: 'Close' })
    const footerClose = closeButtons.find(b => b.textContent?.trim() === 'Close')
    expect(footerClose).toBeDefined()
    expect(screen.queryByRole('button', { name: /^edit$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^history$/i })).not.toBeInTheDocument()
  })

  it('calls onHistory when History is clicked', () => {
    const onHistory = jest.fn()
    renderModal({ onHistory })
    fireEvent.click(screen.getByRole('button', { name: /^history$/i }))
    expect(onHistory).toHaveBeenCalled()
  })
})

describe('RecordModal — loading states', () => {
  beforeEach(() => jest.clearAllMocks())

  it('disables Save and Cancel while saving', () => {
    renderModal({ isEditing: true, isSaving: true })
    expect(screen.getByRole('button', { name: /saving/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /cancel/i })).toBeDisabled()
  })

  it('shows Deleting... state and disables buttons when isDeleting is true', () => {
    renderModal({ isEditing: true, isDeleting: true })
    // Trigger confirmation state first (initial Delete is not blocked by isDeleting)
    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }))
    // Button text changes to "Deleting..." and is disabled
    expect(screen.getByRole('button', { name: /deleting/i })).toBeDisabled()
    // The confirmation Cancel is also disabled
    const areYouSure = screen.getByText('Are you sure?').closest('div')!
    const cancelBtn = Array.from(areYouSure.querySelectorAll('button')).find(
      b => b.textContent?.trim() === 'Cancel'
    )!
    expect(cancelBtn).toBeDisabled()
  })
})
