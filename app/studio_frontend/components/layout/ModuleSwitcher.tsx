'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, SlidersHorizontal, Users } from 'lucide-react'

const MODULES = [
  { label: 'Home',         href: '/',                          prefix: '/',            icon: Home              },
  { label: 'ControlRoom',  href: '/controlroom/catalog/brands', prefix: '/controlroom', icon: SlidersHorizontal },
  { label: 'Users',        href: '/users',                     prefix: '/users',       icon: Users             },
]

function isCurrent(prefix: string, pathname: string): boolean {
  return prefix === '/' ? pathname === '/' : pathname.startsWith(prefix)
}

export function ModuleSwitcher() {
  const pathname = usePathname()
  const visible = MODULES.filter((m) => !isCurrent(m.prefix, pathname))

  return (
    <div className="flex flex-col gap-1">
      {visible.map(({ label, href, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <Icon className="h-3.5 w-3.5" />
          {label}
        </Link>
      ))}
    </div>
  )
}
