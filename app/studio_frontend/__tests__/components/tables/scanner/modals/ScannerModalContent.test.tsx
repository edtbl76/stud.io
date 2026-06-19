import * as React from 'react'
import { render, screen } from '@testing-library/react'
import { Dialog } from '@/components/ui/dialog'
import { ScannerModalContent } from '@/components/tables/scanner/modals/ScannerModalContent'

it('renders its children inside a shared Dialog content', () => {
  render(
    <Dialog open>
      <ScannerModalContent>
        <p>scanner modal body</p>
      </ScannerModalContent>
    </Dialog>
  )
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  expect(screen.getByText('scanner modal body')).toBeInTheDocument()
})

it('forwards props (className) to the underlying DialogContent', () => {
  render(
    <Dialog open>
      <ScannerModalContent className="max-w-md">
        <p>body</p>
      </ScannerModalContent>
    </Dialog>
  )
  expect(screen.getByRole('dialog')).toHaveClass('max-w-md')
})
