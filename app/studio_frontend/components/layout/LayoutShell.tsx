'use client'

import * as React from 'react'
import { usePathname } from 'next/navigation'
import { TopBar } from '@/components/layout/TopBar'

export function LayoutShell({ children }: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname()
  if (pathname === '/login') return <>{children}</>
  return (
    <div className="min-h-screen bg-background">
      <TopBar />
      <div className="pt-12">{children}</div>
    </div>
  )
}
