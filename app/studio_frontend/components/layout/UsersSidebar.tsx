'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LogOut, Users, Home } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/lib/auth'

const navItems = [{ label: 'Users', href: '/users', icon: Users }]

export function UsersSidebar() {
  const pathname = usePathname()
  const { username, logout } = useAuth()

  function handleSignOut() {
    if (globalThis.confirm('Sign out?')) logout()
  }

  return (
    <aside
      className="fixed left-0 top-0 z-40 h-screen w-56 shrink-0 overflow-y-auto"
      style={{
        backgroundColor: 'hsl(var(--sidebar-bg))',
        borderRight: '1px solid hsl(var(--sidebar-border))',
      }}
    >
      <div className="px-4 py-5 border-b border-sidebar-border">
        <Link href="/" className="block text-xs font-bold tracking-widest text-muted-foreground uppercase hover:text-foreground transition-colors">
          STUD.io
        </Link>
        <div className="text-sm font-semibold text-foreground mt-0.5">User Management</div>
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

      <nav className="py-3">
        {navItems.map(({ label, href, icon: Icon }) => {
          const isActive = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-2 px-4 py-1.5 text-xs transition-colors',
                isActive
                  ? 'border-l-2 border-primary bg-primary/10 text-primary font-medium pl-[14px]'
                  : 'border-l-2 border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50 pl-[14px]'
              )}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              {label}
            </Link>
          )
        })}
      </nav>

      <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-sidebar-border">
        <Link
          href="/"
          className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <Home className="h-3.5 w-3.5" />
          Home
        </Link>
      </div>
    </aside>
  )
}
