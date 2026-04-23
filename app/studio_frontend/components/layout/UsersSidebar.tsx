'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/lib/auth'
import { SidebarShell } from '@/components/layout/SidebarShell'

interface NavItem {
  label: string
  href: string
}

interface NavGroup {
  title: string
  items: NavItem[]
}

const navGroups: NavGroup[] = [
  {
    title: 'CATALOG',
    items: [
      { label: 'Brands', href: '/studio/catalog/brands' },
      { label: 'Models', href: '/studio/catalog/models' },
    ],
  },
  {
    title: 'CONFIG',
    items: [
      { label: 'Effect Types',     href: '/studio/config/effect-types' },
      { label: 'Entity Types',     href: '/studio/config/entity-types' },
      { label: 'Instrument Types', href: '/studio/config/instrument-types' },
      { label: 'Model Types',      href: '/studio/config/model-types' },
      { label: 'Plugin Formats',   href: '/studio/config/plugin-formats' },
      { label: 'Tag Types',        href: '/studio/config/tag-types' },
      { label: 'Tool Types',       href: '/studio/config/tool-types' },
    ],
  },
  {
    title: 'ADMIN',
    items: [
      { label: 'Backup & Restore',  href: '/studio/admin/backup' },
      { label: 'Change Review',     href: '/studio/admin/change-review' },
      { label: 'Import / Export',   href: '/studio/admin/import-export' },
      { label: 'Stats',             href: '/studio/admin/stats' },
      { label: 'Users',             href: '/studio/admin/users' },
    ],
  },
]

interface SidebarNavGroupProps {
  group: NavGroup
  isOpen: boolean
  pathname: string
  onToggle: (title: string) => void
}

function SidebarNavGroup({ group, isOpen, pathname, onToggle }: Readonly<SidebarNavGroupProps>) {
  return (
    <div className="mb-1">
      <button
        onClick={() => onToggle(group.title)}
        aria-expanded={isOpen}
        aria-controls={`nav-group-${group.title.toLowerCase()}`}
        className="w-full flex items-center justify-between px-4 py-1.5 text-xs font-semibold tracking-widest text-foreground uppercase hover:text-foreground transition-colors"
      >
        {group.title}
        <ChevronDown className={cn('h-3 w-3 transition-transform duration-150', !isOpen && '-rotate-90')} />
      </button>
      {isOpen && (
        <ul id={`nav-group-${group.title.toLowerCase()}`}>
          {group.items.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    'flex items-center px-4 py-1.5 text-xs transition-colors',
                    isActive
                      ? 'border-l-2 border-primary bg-primary/10 text-primary font-medium pl-[14px]'
                      : 'border-l-2 border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50 pl-[14px]'
                  )}
                >
                  {item.label}
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function getInitialOpenGroups(pathname: string): Set<string> {
  const active = navGroups.find((g) =>
    g.items.some((item) => pathname === item.href || pathname.startsWith(item.href + '/'))
  )
  return active ? new Set([active.title]) : new Set()
}

export function UsersSidebar() {
  const pathname = usePathname()
  const { role } = useAuth()

  const [openGroups, setOpenGroups] = React.useState<Set<string>>(
    () => getInitialOpenGroups(pathname)
  )

  function toggleGroup(title: string) {
    setOpenGroups((prev) => {
      const next = new Set(prev)
      if (next.has(title)) {
        next.delete(title)
      } else {
        next.add(title)
      }
      return next
    })
  }

  return (
    <SidebarShell subtitle="Studio Management">
      <nav className="py-3">
        {navGroups.filter((g) => g.title !== 'ADMIN' || role === 'admin').map((group) => (
          <SidebarNavGroup
            key={group.title}
            group={group}
            isOpen={openGroups.has(group.title)}
            pathname={pathname}
            onToggle={toggleGroup}
          />
        ))}
      </nav>
    </SidebarShell>
  )
}
