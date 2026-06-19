'use client'

import * as React from 'react'
import { DialogContent } from '@/components/ui/dialog'

/**
 * DialogContent for scanner modals — enforces the U-17 close policy (Q1=B):
 * ESC and the built-in X close, but an outside/backdrop click does NOT dismiss.
 *
 * The `onInteractOutside` guard is applied AFTER the spread props, so it is the
 * single enforced source of truth and cannot be accidentally overridden (or
 * dropped) by an individual modal. Outside-click prevention is covered end-to-end
 * by the scanner-workbench e2e (jsdom cannot simulate Radix's pointer detection).
 */
export const ScannerModalContent = React.forwardRef<
  React.ComponentRef<typeof DialogContent>,
  React.ComponentPropsWithoutRef<typeof DialogContent>
>(({ children, ...props }, ref) => (
  <DialogContent ref={ref} {...props} onInteractOutside={(e) => e.preventDefault()}>
    {children}
  </DialogContent>
))
ScannerModalContent.displayName = 'ScannerModalContent'
