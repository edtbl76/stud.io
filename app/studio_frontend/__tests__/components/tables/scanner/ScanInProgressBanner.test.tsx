import * as React from 'react'
import { render, screen } from '@testing-library/react'
import { ScanInProgressBanner } from '@/components/tables/scanner/ScanInProgressBanner'

describe('ScanInProgressBanner', () => {
  it('renders the banner with data-testid', () => {
    render(<ScanInProgressBanner scannedAt="2026-05-18T10:00:00Z" />)
    expect(screen.getByTestId('scan-in-progress-banner')).toBeInTheDocument()
  })

  it('renders the formatted scan time', () => {
    render(<ScanInProgressBanner scannedAt="2026-05-18T10:00:00Z" />)
    const banner = screen.getByTestId('scan-in-progress-banner')
    expect(banner.textContent).toContain('Scan in progress since')
  })

  it('renders the pulse indicator', () => {
    const { container } = render(<ScanInProgressBanner scannedAt="2026-05-18T10:00:00Z" />)
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument()
  })
})
