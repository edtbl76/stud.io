'use client'

import Link from 'next/link'
import { LogOut } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { ModuleSwitcher } from '@/components/layout/ModuleSwitcher'

interface SidebarShellProps {
  subtitle: string
  children: React.ReactNode
}

export function SidebarShell({ subtitle, children }: Readonly<SidebarShellProps>) {
  const { username, logout } = useAuth()

  function handleSignOut() {
    if (globalThis.confirm('Sign out?')) logout().catch(console.error)
  }

  return (
    <aside
      className="fixed left-0 top-12 z-40 h-[calc(100vh-3rem)] w-56 shrink-0 overflow-y-auto"
      style={{
        backgroundColor: 'hsl(var(--sidebar-bg))',
        borderRight: '1px solid hsl(var(--sidebar-border))',
      }}
    >
      <div className="px-4 py-5 border-b border-sidebar-border">
        <Link href="/" className="block text-xs font-bold tracking-widest text-muted-foreground uppercase hover:text-foreground transition-colors">
          STUD.io
        </Link>
        <div className="text-sm font-semibold text-foreground mt-0.5">{subtitle}</div>
      </div>
      <div className="px-4 py-2.5 border-b border-sidebar-border flex items-center justify-between">
        <span className="text-xs text-muted-foreground truncate">{username}</span>
        <button
          onClick={handleSignOut}
          title="Sign out"
          className="ml-2 shrink-0 text-muted-foreground hover:text-foreground transition-colors"
        >
          <LogOut className="h-3.5 w-3.5" />
        </button>
      </div>
      {children}
      <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-sidebar-border">
        <ModuleSwitcher />
      </div>
    </aside>
  )
}
