import * as React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CreateRecordModal } from '@/components/tables/scanner/CreateRecordModal'

const initialData = { name: 'Reverb Pro', vendor: 'Acme Audio', version: '1.0.0', format: 'vst3' }

describe('CreateRecordModal', () => {
  it('renders pre-filled name, vendor, version and format', () => {
    render(<CreateRecordModal initialData={initialData} onSubmit={jest.fn()} onClose={jest.fn()} />)
    expect(screen.getByTestId('create-record-name-input')).toHaveValue('Reverb Pro')
    expect(screen.getByTestId('create-record-vendor-input')).toHaveValue('Acme Audio')
    expect(screen.getByTestId('create-record-version-input')).toHaveValue('1.0.0')
    expect(screen.getByText('vst3')).toBeInTheDocument()
  })

  it('calls onClose when Cancel is clicked', () => {
    const onClose = jest.fn()
    render(<CreateRecordModal initialData={initialData} onSubmit={jest.fn()} onClose={onClose} />)
    fireEvent.click(screen.getByTestId('create-record-cancel-button'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onSubmit with selected table and form data on submit', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined)
    render(<CreateRecordModal initialData={initialData} onSubmit={onSubmit} onClose={jest.fn()} />)
    fireEvent.click(screen.getByTestId('create-record-submit-button'))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(
      'effects',
      { name: 'Reverb Pro', vendor: 'Acme Audio', version: '1.0.0', format: 'vst3' }
    ))
  })

  it('shows error message when onSubmit rejects', async () => {
    const onSubmit = jest.fn().mockRejectedValue(new Error('Duplicate name'))
    render(<CreateRecordModal initialData={initialData} onSubmit={onSubmit} onClose={jest.fn()} />)
    fireEvent.click(screen.getByTestId('create-record-submit-button'))
    await waitFor(() => expect(screen.getByText('Duplicate name')).toBeInTheDocument())
  })

  it('renders all 9 table options in the picker', () => {
    render(<CreateRecordModal initialData={initialData} onSubmit={jest.fn()} onClose={jest.fn()} />)
    const select = screen.getByTestId('create-record-table-select')
    expect(select.querySelectorAll('option')).toHaveLength(9)
  })
})
