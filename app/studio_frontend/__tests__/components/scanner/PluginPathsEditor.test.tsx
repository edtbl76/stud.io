import * as React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { PluginPathsEditor } from '@/components/tables/scanner/PluginPathsEditor'
import type { PluginPathEntry } from '@/lib/types'

const ENTRY: PluginPathEntry = { path: '/Library/VST3/Reverb.vst3', format: 'vst3', version: '2.0' }

describe('PluginPathsEditor', () => {
  it('renders empty state with Add Path button when value is []', () => {
    render(<PluginPathsEditor value={[]} onChange={() => {}} />)
    expect(screen.getByTestId('plugin-paths-add')).toBeInTheDocument()
    expect(screen.queryByTestId('plugin-paths-entry-0')).not.toBeInTheDocument()
  })

  it('renders existing entries', () => {
    render(<PluginPathsEditor value={[ENTRY]} onChange={() => {}} />)
    expect(screen.getByTestId('plugin-paths-entry-0')).toBeInTheDocument()
    expect(screen.getByDisplayValue(ENTRY.path)).toBeInTheDocument()
    expect(screen.getByDisplayValue(ENTRY.version)).toBeInTheDocument()
  })

  it('clicking Add Path calls onChange with a blank entry appended', () => {
    const onChange = jest.fn()
    render(<PluginPathsEditor value={[ENTRY]} onChange={onChange} />)
    fireEvent.click(screen.getByTestId('plugin-paths-add'))
    expect(onChange).toHaveBeenCalledTimes(1)
    const updated: PluginPathEntry[] = onChange.mock.calls[0][0]
    expect(updated).toHaveLength(2)
    expect(updated[1]).toEqual({ path: '', format: 'vst3', version: '' })
  })

  it('editing path field keeps focus and calls onChange with updated entry', () => {
    const onChange = jest.fn()
    render(<PluginPathsEditor value={[ENTRY]} onChange={onChange} />)
    const input = screen.getByTestId('plugin-paths-path-0')
    input.focus()
    fireEvent.change(input, { target: { value: '/new/path' } })
    expect(document.activeElement).toBe(input)
    expect(onChange).toHaveBeenCalledWith([{ ...ENTRY, path: '/new/path' }])
  })

  it('editing version field calls onChange with updated entry', () => {
    const onChange = jest.fn()
    render(<PluginPathsEditor value={[ENTRY]} onChange={onChange} />)
    fireEvent.change(screen.getByTestId('plugin-paths-version-0'), { target: { value: '3.0' } })
    expect(onChange).toHaveBeenCalledWith([{ ...ENTRY, version: '3.0' }])
  })

  it('editing format field calls onChange with updated entry', () => {
    const onChange = jest.fn()
    render(<PluginPathsEditor value={[ENTRY]} onChange={onChange} />)
    fireEvent.change(screen.getByTestId('plugin-paths-format-0'), { target: { value: 'au' } })
    expect(onChange).toHaveBeenCalledWith([{ ...ENTRY, format: 'au' }])
  })

  it('clicking remove on an entry calls onChange without that entry', () => {
    const onChange = jest.fn()
    const entries = [ENTRY, { path: '/other.au', format: 'au' as const, version: '1.0' }]
    render(<PluginPathsEditor value={entries} onChange={onChange} />)
    fireEvent.click(screen.getByTestId('plugin-paths-remove-0'))
    expect(onChange).toHaveBeenCalledWith([entries[1]])
  })

  it('readOnly hides add and remove controls', () => {
    render(<PluginPathsEditor value={[ENTRY]} onChange={() => {}} readOnly />)
    expect(screen.queryByTestId('plugin-paths-add')).not.toBeInTheDocument()
    expect(screen.queryByTestId('plugin-paths-remove-0')).not.toBeInTheDocument()
  })
})
