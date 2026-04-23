'use client'

import * as React from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Search } from 'lucide-react'
import { SidebarShell } from '@/components/layout/SidebarShell'
import { NavGroup, SidebarNavGroup, useSidebarGroups } from '@/components/layout/SidebarNav'

const navGroups: NavGroup[] = [
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
]

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { openGroups, toggleGroup } = useSidebarGroups(navGroups, pathname)
  const [searchQuery, setSearchQuery] = React.useState('')

  function handleSearch(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault()
    const q = searchQuery.trim()
    if (q.length < 2) return
    router.push(`/controlroom/search?q=${encodeURIComponent(q)}`)
  }

  return (
    <SidebarShell subtitle="ControlRoom">
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
      <nav className="py-3">
        {navGroups.map((group) => (
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
