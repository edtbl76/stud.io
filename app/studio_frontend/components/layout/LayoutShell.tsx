'use client'

import * as React from 'react'
import { usePathname } from 'next/navigation'
import { Sidebar } from './Sidebar'

export function LayoutShell({ children }: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname()
  const isLogin = pathname === '/login'

  if (isLogin) {
    return <>{children}</>
  }

  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1 ml-56 overflow-auto bg-background">
        {children}
      </main>
    </div>
  )
}
