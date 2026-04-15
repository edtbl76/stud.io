import * as React from 'react'
import { render } from '@testing-library/react'
import { renderMutedText } from '@/lib/columnUtils'

describe('renderMutedText', () => {
  it('renders the value in a muted span when non-empty', () => {
    const { getByText } = render(<>{renderMutedText('Steinway')}</>)
    const el = getByText('Steinway')
    expect(el.className).toContain('text-muted-foreground')
    expect(el.className).toContain('text-xs')
  })

  it('renders a dash placeholder when value is null', () => {
    const { container } = render(<>{renderMutedText(null)}</>)
    expect(container.textContent).toBe('—')
    expect(container.querySelector('span')?.className).toContain('text-muted-foreground/40')
  })

  it('renders a dash placeholder when value is empty string', () => {
    const { container } = render(<>{renderMutedText('')}</>)
    expect(container.textContent).toBe('—')
  })
})
