'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { ChevronDown, LogOut, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/lib/auth'

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
      { label: 'Brands', href: '/catalog/brands' },
      { label: 'Models', href: '/catalog/models' },
    ],
  },
  {
    title: 'SESSION',
    items: [
      { label: 'Effects', href: '/session/effects' },
      { label: 'Instruments', href: '/session/instruments' },
      { label: 'Libraries', href: '/session/libraries' },
      { label: 'Workstations', href: '/session/workstations' },
    ],
  },
  {
    title: 'TOOLS',
    items: [
      { label: 'Admin', href: '/tools/admin' },
      { label: 'Composition', href: '/tools/composition' },
      { label: 'Measurement', href: '/tools/measurement' },
      { label: 'Reference', href: '/tools/reference' },
      { label: 'Workflow', href: '/tools/workflow' },
    ],
  },
  {
    title: 'ADMIN',
    items: [
      { label: 'Backup & Restore', href: '/admin/backup' },
      { label: 'Change Review',    href: '/admin/change-review' },
      { label: 'Import / Export',  href: '/admin/import-export' },
      { label: 'Stats',            href: '/admin/stats' },
      { label: 'Users',            href: '/admin/users' },
    ],
  },
  {
    title: 'CONFIG',
    items: [
      { label: 'Effect Types', href: '/config/effect-types' },
      { label: 'Entity Types', href: '/config/entity-types' },
      { label: 'Instrument Types', href: '/config/instrument-types' },
      { label: 'Model Types', href: '/config/model-types' },
      { label: 'Plugin Formats', href: '/config/plugin-formats' },
      { label: 'Tag Types', href: '/config/tag-types' },
      { label: 'Tool Types', href: '/config/tool-types' },
    ],
  },
]

function getInitialOpenGroups(pathname: string): Set<string> {
  const active = navGroups.find((g) =>
    g.items.some((item) => pathname === item.href || pathname.startsWith(item.href + '/'))
  )
  return active ? new Set([active.title]) : new Set()
}

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { username, role, logout } = useAuth()

  const [openGroups, setOpenGroups] = React.useState<Set<string>>(
    () => getInitialOpenGroups(pathname)
  )
  const [searchQuery, setSearchQuery] = React.useState('')

  function handleSignOut() {
    if (globalThis.confirm('Sign out?')) logout()
  }

  function handleSearch(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault()
    const q = searchQuery.trim()
    if (q.length < 2) return
    router.push(`/search?q=${encodeURIComponent(q)}`)
  }

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
    <aside
      className="fixed left-0 top-0 z-40 h-screen w-56 shrink-0 overflow-y-auto"
      style={{
        backgroundColor: 'hsl(var(--sidebar-bg))',
        borderRight: '1px solid hsl(var(--sidebar-border))',
      }}
    >
      {/* App name */}
      <div className="px-4 py-5 border-b border-sidebar-border">
        <div className="text-xs font-bold tracking-widest text-muted-foreground uppercase">
          STUD.io
        </div>
        <div className="text-sm font-semibold text-foreground mt-0.5">
          ControlRoom
        </div>
      </div>

      {/* User / logout */}
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

      {/* Search */}
      <div className="px-3 py-2.5 border-b border-sidebar-border">
        <form onSubmit={handleSearch}>
          <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-md bg-muted/40 border border-border/50">
            <Search className="h-3 w-3 text-muted-foreground shrink-0" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Global search..."
              className="w-full bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none"
            />
          </div>
        </form>
      </div>

      {/* Nav groups */}
      <nav className="py-3">
        {navGroups.filter((g) => g.title !== 'ADMIN' || role === 'admin').map((group) => {
          const isOpen = openGroups.has(group.title)
          return (
            <div key={group.title} className="mb-1">
              {/* Group header — clickable */}
              <button
                onClick={() => toggleGroup(group.title)}
                className="w-full flex items-center justify-between px-4 py-1.5 text-xs font-semibold tracking-widest text-foreground uppercase hover:text-foreground transition-colors"
              >
                {group.title}
                <ChevronDown
                  className={cn(
                    'h-3 w-3 transition-transform duration-150',
                    !isOpen && '-rotate-90'
                  )}
                />
              </button>

              {/* Items */}
              {isOpen && (
                <ul>
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
        })}
      </nav>
    </aside>
  )
}
