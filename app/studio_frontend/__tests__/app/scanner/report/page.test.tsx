import React from 'react'
import { render, screen } from '@testing-library/react'
import Page from '@/app/controlroom/scanner/report/page'

jest.mock('@/components/tables/scanner/report/ScanReportPage', () => ({
  ScanReportPage: () => <div data-testid="scan-report-page" />,
}))

describe('scanner report page shell', () => {
  it('renders ScanReportPage', () => {
    render(<Page />)
    expect(screen.getByTestId('scan-report-page')).toBeInTheDocument()
  })
})
