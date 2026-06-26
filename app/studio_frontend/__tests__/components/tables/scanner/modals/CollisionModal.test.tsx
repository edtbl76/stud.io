import * as React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CollisionModal } from '@/components/tables/scanner/modals/CollisionModal'
import type { WorkbenchRow } from '@/lib/types'

jest.mock('@/lib/api', () => ({
  api: { scanner: { confirm: jest.fn(), acknowledge: jest.fn(), dismiss: jest.fn(), exclude: jest.fn() } },
}))

import { api } from '@/lib/api'
const mockApi = api as jest.Mocked<typeof api>

function makeRow(): WorkbenchRow {
  return {
    result_id: 'r1', disk_name: 'Pro-Q 3', disk_vendor: 'FabFilter', disk_version: '3.0', disk_format: 'vst3',
    disk_path: '/lib/proq.vst3', display_name: 'Pro-Q 3', display_vendor: 'FabFilter',
    catalog_record_id: 'c1', catalog_record_table: 'effects',
    catalog_record_name: 'Pro-Q 3', catalog_record_vendor: 'FabFilter', catalog_record_version: '3.0',
    bucket: 'collision', confidence: 'exact', confirmed_at: null, confirmed_by: null,
    collision: {
      shared_catalog_record: { id: 'c1', table: 'effects', name: 'Pro-Q 3', vendor: 'FabFilter', version: '3.0' },
      copies: [
        { result_id: 'r1', path: '/lib/proq.vst3', version: '3.0', format: 'vst3' },
        { result_id: 'r2', path: '/users/ed/proq.vst3', version: '3.0', format: 'vst3' },
      ],
    },
  }
}

const noop = jest.fn()
afterEach(() => jest.resetAllMocks())

function renderModal(onResolved: jest.Mock = noop, onClose: jest.Mock = noop) {
  render(<CollisionModal row={makeRow()} onClose={onClose} onResolved={onResolved} />)
}

it('renders the shared catalog record and every duplicate copy', () => {
  renderModal()
  expect(screen.getByText(/Resolve Collision/)).toBeInTheDocument()
  expect(screen.getByText('/lib/proq.vst3')).toBeInTheDocument()
  expect(screen.getByText('/users/ed/proq.vst3')).toBeInTheDocument()
})

it('keep all confirms every copy in one batched request then resolves', async () => {
  ;(mockApi.scanner.confirm as jest.Mock).mockResolvedValue({ applied: 2, errors: [] })
  const onResolved = jest.fn()
  renderModal(onResolved)
  fireEvent.click(screen.getByTestId('collision-keep-all'))
  await waitFor(() => expect(onResolved).toHaveBeenCalled())
  expect(mockApi.scanner.confirm).toHaveBeenCalledTimes(1)
  expect(mockApi.scanner.confirm).toHaveBeenCalledWith([
    { result_id: 'r1', action: 'acknowledge' },
    { result_id: 'r2', action: 'acknowledge' },
  ])
})

it('remove straggler is disabled until a keeper is chosen', () => {
  renderModal()
  expect(screen.getByTestId('collision-remove-straggler')).toBeDisabled()
  fireEvent.click(screen.getByTestId('collision-copy-r1'))
  expect(screen.getByTestId('collision-remove-straggler')).not.toBeDisabled()
})

it('remove straggler acknowledges the keeper and dismisses the rest', async () => {
  ;(mockApi.scanner.acknowledge as jest.Mock).mockResolvedValue({ applied: 1, errors: [] })
  ;(mockApi.scanner.dismiss as jest.Mock).mockResolvedValue(undefined)
  const onResolved = jest.fn()
  renderModal(onResolved)
  fireEvent.click(screen.getByTestId('collision-copy-r1'))
  fireEvent.click(screen.getByTestId('collision-remove-straggler'))
  await waitFor(() => expect(onResolved).toHaveBeenCalled())
  expect(mockApi.scanner.acknowledge).toHaveBeenCalledWith('r1')
  expect(mockApi.scanner.dismiss).toHaveBeenCalledWith('r2')
})

it('exclude excludes the plugin then resolves', async () => {
  ;(mockApi.scanner.exclude as jest.Mock).mockResolvedValue(undefined)
  const onResolved = jest.fn()
  renderModal(onResolved)
  fireEvent.click(screen.getByTestId('collision-exclude'))
  await waitFor(() => expect(onResolved).toHaveBeenCalled())
  expect(mockApi.scanner.exclude).toHaveBeenCalledWith('FabFilter', 'Pro-Q 3', 'vst3')
})

it('cancel closes without any api call', () => {
  const onClose = jest.fn()
  renderModal(noop, onClose)
  fireEvent.click(screen.getByTestId('collision-cancel'))
  expect(onClose).toHaveBeenCalled()
  expect(mockApi.scanner.acknowledge).not.toHaveBeenCalled()
})

it('shows an inline error and does not resolve when keep all reports per-copy errors', async () => {
  ;(mockApi.scanner.confirm as jest.Mock).mockResolvedValue({ applied: 1, errors: [{ result_id: 'r2', error: 'nope' }] })
  const onResolved = jest.fn()
  renderModal(onResolved)
  fireEvent.click(screen.getByTestId('collision-keep-all'))
  await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
  expect(onResolved).not.toHaveBeenCalled()
})
