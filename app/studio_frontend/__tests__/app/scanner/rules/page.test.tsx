import * as React from 'react'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

jest.mock('@/components/tables/scanner/rules/PluginScannerRulesPage', () => ({
  PluginScannerRulesPage: () => <div data-testid="plugin-scanner-rules-page" />,
}))

// Step 47
it('renders PluginScannerRulesPage', async () => {
  const { default: Page } = await import('@/app/controlroom/scanner/rules/page')
  const qc = new QueryClient()
  render(<QueryClientProvider client={qc}><Page /></QueryClientProvider>)
  expect(screen.getByTestId('plugin-scanner-rules-page')).toBeInTheDocument()
})
