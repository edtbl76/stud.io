import * as React from 'react'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

jest.mock('@/components/tables/scanner/workbench/ScanWorkbenchPage', () => ({
  ScanWorkbenchPage: () => <div data-testid="scan-workbench-page" />,
}))

// Step 79
it('renders ScanWorkbenchPage', async () => {
  const { default: Page } = await import('@/app/controlroom/scanner/workbench/page')
  const qc = new QueryClient()
  render(<QueryClientProvider client={qc}><Page /></QueryClientProvider>)
  expect(screen.getByTestId('scan-workbench-page')).toBeInTheDocument()
})
