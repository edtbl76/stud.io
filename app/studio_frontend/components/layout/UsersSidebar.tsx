'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SidebarShell } from '@/components/layout/SidebarShell'

const navItems = [{ label: 'Users', href: '/users', icon: Users }]

export function UsersSidebar() {
  const pathname = usePathname()

  return (
    <SidebarShell subtitle="User Management">
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
    </SidebarShell>
  )
}
