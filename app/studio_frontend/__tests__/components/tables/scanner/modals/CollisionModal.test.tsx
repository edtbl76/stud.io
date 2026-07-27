import * as React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CollisionModal } from '@/components/tables/scanner/modals/CollisionModal'
import type { WorkbenchRow } from '@/lib/types'

jest.mock('@/lib/api', () => ({
  api: { scanner: { resolveCollision: jest.fn(), exclude: jest.fn() } },
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

// Arrange a resolve that succeeds, render, and hand back the onResolved spy.
function renderResolving(result: { acknowledged: number; dismissed: number }): jest.Mock {
  ;(mockApi.scanner.resolveCollision as jest.Mock).mockResolvedValue(result)
  const onResolved = jest.fn()
  renderModal(onResolved)
  return onResolved
}

// Assert the modal made exactly one atomic resolve call with the given body, then resolved.
async function expectResolvedOnceWith(onResolved: jest.Mock, body: Record<string, unknown>) {
  await waitFor(() => expect(onResolved).toHaveBeenCalled())
  expect(mockApi.scanner.resolveCollision).toHaveBeenCalledTimes(1)
  expect(mockApi.scanner.resolveCollision).toHaveBeenCalledWith(body)
}

it('renders the shared catalog record and every duplicate copy', () => {
  renderModal()
  expect(screen.getByText(/Resolve Collision/)).toBeInTheDocument()
  expect(screen.getByText('/lib/proq.vst3')).toBeInTheDocument()
  expect(screen.getByText('/users/ed/proq.vst3')).toBeInTheDocument()
})

it('keep all resolves the whole collision in one atomic call', async () => {
  const onResolved = renderResolving({ acknowledged: 2, dismissed: 0 })
  fireEvent.click(screen.getByTestId('collision-keep-all'))
  await expectResolvedOnceWith(onResolved, { action: 'keep_all', copy_ids: ['r1', 'r2'] })
})

it('remove straggler is disabled until a keeper is chosen', () => {
  renderModal()
  expect(screen.getByTestId('collision-remove-straggler')).toBeDisabled()
  fireEvent.click(screen.getByTestId('collision-copy-r1'))
  expect(screen.getByTestId('collision-remove-straggler')).not.toBeDisabled()
})

it('remove straggler resolves with the chosen keeper in one atomic call', async () => {
  const onResolved = renderResolving({ acknowledged: 1, dismissed: 1 })
  fireEvent.click(screen.getByTestId('collision-copy-r1'))
  fireEvent.click(screen.getByTestId('collision-remove-straggler'))
  await expectResolvedOnceWith(onResolved, {
    action: 'remove_straggler',
    copy_ids: ['r1', 'r2'],
    keeper_id: 'r1',
  })
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
  expect(mockApi.scanner.resolveCollision).not.toHaveBeenCalled()
})

it('shows an inline error and does not resolve when the resolve call fails', async () => {
  ;(mockApi.scanner.resolveCollision as jest.Mock).mockRejectedValue(new Error('Invalid collision resolution'))
  const onResolved = jest.fn()
  renderModal(onResolved)
  fireEvent.click(screen.getByTestId('collision-keep-all'))
  await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
  expect(onResolved).not.toHaveBeenCalled()
})
