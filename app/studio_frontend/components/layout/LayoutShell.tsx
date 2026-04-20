'use client'

import { usePathname } from 'next/navigation'

export function LayoutShell({ children }: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname()
  if (pathname === '/login') return <>{children}</>
  return <div className="min-h-screen bg-background">{children}</div>
}
