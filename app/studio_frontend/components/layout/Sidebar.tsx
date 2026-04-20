'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { ChevronDown, LogOut, Search, Home } from 'lucide-react'
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
      { label: 'Brands', href: '/controlroom/catalog/brands' },
      { label: 'Models', href: '/controlroom/catalog/models' },
    ],
  },
  {
    title: 'SESSION',
    items: [
      { label: 'Effects', href: '/controlroom/session/effects' },
      { label: 'Instruments', href: '/controlroom/session/instruments' },
      { label: 'Libraries', href: '/controlroom/session/libraries' },
      { label: 'Workstations', href: '/controlroom/session/workstations' },
    ],
  },
  {
    title: 'TOOLS',
    items: [
      { label: 'Admin', href: '/controlroom/tools/admin' },
      { label: 'Composition', href: '/controlroom/tools/composition' },
      { label: 'Measurement', href: '/controlroom/tools/measurement' },
      { label: 'Reference', href: '/controlroom/tools/reference' },
      { label: 'Workflow', href: '/controlroom/tools/workflow' },
    ],
  },
  {
    title: 'ADMIN',
    items: [
      { label: 'Backup & Restore', href: '/controlroom/admin/backup' },
      { label: 'Change Review',    href: '/controlroom/admin/change-review' },
      { label: 'Import / Export',  href: '/controlroom/admin/import-export' },
      { label: 'Stats',            href: '/controlroom/admin/stats' },
    ],
  },
  {
    title: 'CONFIG',
    items: [
      { label: 'Effect Types', href: '/controlroom/config/effect-types' },
      { label: 'Entity Types', href: '/controlroom/config/entity-types' },
      { label: 'Instrument Types', href: '/controlroom/config/instrument-types' },
      { label: 'Model Types', href: '/controlroom/config/model-types' },
      { label: 'Plugin Formats', href: '/controlroom/config/plugin-formats' },
      { label: 'Tag Types', href: '/controlroom/config/tag-types' },
      { label: 'Tool Types', href: '/controlroom/config/tool-types' },
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
        className="w-full flex items-center justify-between px-4 py-1.5 text-xs font-semibold tracking-widest text-foreground uppercase hover:text-foreground transition-colors"
      >
        {group.title}
        <ChevronDown className={cn('h-3 w-3 transition-transform duration-150', !isOpen && '-rotate-90')} />
      </button>
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
}

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
    router.push(`/controlroom/search?q=${encodeURIComponent(q)}`)
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
        <Link href="/" className="block text-xs font-bold tracking-widest text-muted-foreground uppercase hover:text-foreground transition-colors">
          STUD.io
        </Link>
        <div className="text-sm font-semibold text-foreground mt-0.5">ControlRoom</div>
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
