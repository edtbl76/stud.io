'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

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

export function Sidebar() {
  const pathname = usePathname()

  // Default all groups open; collapse if no item is active
  const [openGroups, setOpenGroups] = React.useState<Set<string>>(() => {
    return new Set(navGroups.map((g) => g.title))
  })

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
      className="fixed left-0 top-0 z-40 h-screen w-56 flex-shrink-0 overflow-y-auto"
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

      {/* Nav groups */}
      <nav className="py-3">
        {navGroups.map((group) => {
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
