import * as React from 'react'
import { renderHook, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useRecordModal } from '@/lib/useRecordModal'

const mockCreate = jest.fn()
const mockUpdate = jest.fn()
const mockDelete = jest.fn()

jest.mock('@/lib/auth', () => ({
  useAuth: () => ({ role: 'admin' }),
}))

jest.mock('@/lib/api', () => ({
  api: {
    create: (...args: unknown[]) => mockCreate(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
  },
}))

interface TestRecord { id: string; name: string }
interface TestForm { name: string }

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

const baseOptions = {
  endpoint: '/test',
  getRecordId: (r: TestRecord) => r.id,
  getHistoryUrl: (r: TestRecord) => `/test/${r.id}/history`,
  getTitle: (mode: string, r: TestRecord | null) =>
    mode === 'history' ? 'History' : r ? r.name : 'New',
  toForm: (r: TestRecord | null): TestForm => ({ name: r?.name ?? '' }),
  buildPayload: (f: TestForm) => ({ name: f.name }),
  onClose: jest.fn(),
  onMutate: jest.fn(),
}

const mockRecord: TestRecord = { id: 'abc', name: 'Test Item' }

describe('useRecordModal', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('starts in edit mode when record is null (create)', () => {
    const { result } = renderHook(
      () => useRecordModal({ ...baseOptions, record: null }),
      { wrapper },
    )
    expect(result.current.mode).toBe('edit')
    expect(result.current.isCreate).toBe(true)
  })

  it('starts in view mode when record exists', () => {
    const { result } = renderHook(
      () => useRecordModal({ ...baseOptions, record: mockRecord }),
      { wrapper },
    )
    expect(result.current.mode).toBe('view')
    expect(result.current.isCreate).toBe(false)
  })

  it('initialises form from toForm', () => {
    const { result } = renderHook(
      () => useRecordModal({ ...baseOptions, record: mockRecord }),
      { wrapper },
    )
    expect(result.current.form).toEqual({ name: 'Test Item' })
  })

  it('set() updates a form field', () => {
    const { result } = renderHook(
      () => useRecordModal({ ...baseOptions, record: mockRecord }),
      { wrapper },
    )
    act(() => { result.current.set('name', 'Updated') })
    expect(result.current.form.name).toBe('Updated')
  })

  it('recordModalProps.isAdmin reflects admin role', () => {
    const { result } = renderHook(
      () => useRecordModal({ ...baseOptions, record: mockRecord }),
      { wrapper },
    )
    expect(result.current.recordModalProps.isAdmin).toBe(true)
    expect(result.current.isAdmin).toBe(true)
  })

  it('recordModalProps.onHistory is undefined when record is null', () => {
    const { result } = renderHook(
      () => useRecordModal({ ...baseOptions, record: null }),
      { wrapper },
    )
    expect(result.current.recordModalProps.onHistory).toBeUndefined()
  })

  it('recordModalProps.onHistory is defined when record exists', () => {
    const { result } = renderHook(
      () => useRecordModal({ ...baseOptions, record: mockRecord }),
      { wrapper },
    )
    expect(result.current.recordModalProps.onHistory).toBeDefined()
  })

  it('onEdit sets mode to edit', () => {
    const { result } = renderHook(
      () => useRecordModal({ ...baseOptions, record: mockRecord }),
      { wrapper },
    )
    act(() => { result.current.recordModalProps.onEdit() })
    expect(result.current.mode).toBe('edit')
    expect(result.current.recordModalProps.isEditing).toBe(true)
  })

  it('onHistory sets mode to history', () => {
    const { result } = renderHook(
      () => useRecordModal({ ...baseOptions, record: mockRecord }),
      { wrapper },
    )
    act(() => { result.current.recordModalProps.onHistory!() })
    expect(result.current.mode).toBe('history')
    expect(result.current.recordModalProps.isHistory).toBe(true)
  })

  it('historyUrl uses getHistoryUrl when record exists', () => {
    const { result } = renderHook(
      () => useRecordModal({ ...baseOptions, record: mockRecord }),
      { wrapper },
    )
    expect(result.current.historyUrl).toBe('/test/abc/history')
  })

  it('historyUrl is empty string when record is null', () => {
    const { result } = renderHook(
      () => useRecordModal({ ...baseOptions, record: null }),
      { wrapper },
    )
    expect(result.current.historyUrl).toBe('')
  })

  it('onSave calls api.update for existing record', async () => {
    mockUpdate.mockResolvedValue({})
    const onClose = jest.fn()
    const onMutate = jest.fn()
    const { result } = renderHook(
      () => useRecordModal({ ...baseOptions, record: mockRecord, onClose, onMutate }),
      { wrapper },
    )
    await act(async () => { result.current.recordModalProps.onSave() })
    expect(mockUpdate).toHaveBeenCalledWith('/test', 'abc', { name: 'Test Item' })
    expect(onMutate).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('onSave calls api.create for new record', async () => {
    mockCreate.mockResolvedValue({})
    const onClose = jest.fn()
    const onMutate = jest.fn()
    const { result } = renderHook(
      () => useRecordModal({ ...baseOptions, record: null, onClose, onMutate }),
      { wrapper },
    )
    act(() => { result.current.set('name', 'New Item') })
    await act(async () => { result.current.recordModalProps.onSave() })
    expect(mockCreate).toHaveBeenCalledWith('/test', { name: 'New Item' })
    expect(onMutate).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('onSave sets error message on failure', async () => {
    mockUpdate.mockRejectedValue(new Error('Network error'))
    const { result } = renderHook(
      () => useRecordModal({ ...baseOptions, record: mockRecord }),
      { wrapper },
    )
    await act(async () => { result.current.recordModalProps.onSave() })
    expect(result.current.error).toBe('Network error')
  })

  it('onSave clears previous error before mutating', async () => {
    mockUpdate.mockResolvedValue({})
    const { result } = renderHook(
      () => useRecordModal({ ...baseOptions, record: mockRecord }),
      { wrapper },
    )
    // Seed an error first
    mockUpdate.mockRejectedValueOnce(new Error('First error'))
    await act(async () => { result.current.recordModalProps.onSave() })
    expect(result.current.error).toBe('First error')
    // Second save should clear it
    mockUpdate.mockResolvedValue({})
    await act(async () => { result.current.recordModalProps.onSave() })
    expect(result.current.error).toBeNull()
  })

  it('onDelete calls api.delete and closes on success', async () => {
    mockDelete.mockResolvedValue(undefined)
    const onClose = jest.fn()
    const onMutate = jest.fn()
    const { result } = renderHook(
      () => useRecordModal({ ...baseOptions, record: mockRecord, onClose, onMutate }),
      { wrapper },
    )
    await act(async () => { result.current.recordModalProps.onDelete() })
    expect(mockDelete).toHaveBeenCalledWith('/test', 'abc')
    expect(onMutate).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('onDelete sets error message on failure', async () => {
    mockDelete.mockRejectedValue(new Error('Delete failed'))
    const { result } = renderHook(
      () => useRecordModal({ ...baseOptions, record: mockRecord }),
      { wrapper },
    )
    await act(async () => { result.current.recordModalProps.onDelete() })
    expect(result.current.error).toBe('Delete failed')
  })

  it('onSave uses fallback message when rejection is not an Error', async () => {
    mockUpdate.mockRejectedValue('plain string rejection')
    const { result } = renderHook(
      () => useRecordModal({ ...baseOptions, record: mockRecord }),
      { wrapper },
    )
    await act(async () => { result.current.recordModalProps.onSave() })
    expect(result.current.error).toBe('Save failed')
  })

  it('onDelete uses fallback message when rejection is not an Error', async () => {
    mockDelete.mockRejectedValue({ code: 500 })
    const { result } = renderHook(
      () => useRecordModal({ ...baseOptions, record: mockRecord }),
      { wrapper },
    )
    await act(async () => { result.current.recordModalProps.onDelete() })
    expect(result.current.error).toBe('Delete failed')
  })

  it('title reflects getTitle result', () => {
    const { result } = renderHook(
      () => useRecordModal({ ...baseOptions, record: mockRecord }),
      { wrapper },
    )
    expect(result.current.recordModalProps.title).toBe('Test Item')
  })
})
