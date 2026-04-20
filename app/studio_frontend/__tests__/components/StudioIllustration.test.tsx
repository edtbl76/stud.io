import * as React from 'react'
import { render, screen } from '@testing-library/react'
import { StudioIllustration } from '@/components/StudioIllustration'

describe('StudioIllustration', () => {
  it('renders an SVG with the correct aria-label', () => {
    render(<StudioIllustration />)
    expect(screen.getByLabelText(/music studio illustration/i)).toBeInTheDocument()
  })

  it('forwards className to the svg element', () => {
    render(<StudioIllustration className="my-custom-class" />)
    expect(screen.getByLabelText(/music studio illustration/i)).toHaveClass('my-custom-class')
  })
})
