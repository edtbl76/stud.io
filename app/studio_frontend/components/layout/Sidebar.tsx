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
      { label: 'Effects',      href: '/controlroom/session/effects',      prefetch: { endpoint: '/studio/session/effects',      queryKey: '/session/effects',      paginated: true, defaultSort: 'effect_name' } },
      { label: 'Instruments',  href: '/controlroom/session/instruments',  prefetch: { endpoint: '/studio/session/instruments',  queryKey: '/session/instruments',  paginated: true, defaultSort: 'instrument_name' } },
      { label: 'Libraries',    href: '/controlroom/session/libraries',    prefetch: { endpoint: '/studio/session/libraries',    queryKey: '/session/libraries',    paginated: true, defaultSort: 'library_name' } },
      { label: 'Workstations', href: '/controlroom/session/workstations', prefetch: { endpoint: '/studio/session/workstations', queryKey: '/session/workstations', paginated: true, defaultSort: 'full_tool_name' } },
    ],
  },
  {
    title: 'TOOLS',
    items: [
      { label: 'Admin',       href: '/controlroom/tools/admin',       prefetch: { endpoint: '/studio/tools/admin',       queryKey: '/tools/admin',       paginated: true, defaultSort: 'full_tool_name' } },
      { label: 'Composition', href: '/controlroom/tools/composition', prefetch: { endpoint: '/studio/tools/composition', queryKey: '/tools/composition', paginated: true, defaultSort: 'full_tool_name' } },
      { label: 'Measurement', href: '/controlroom/tools/measurement', prefetch: { endpoint: '/studio/tools/measurement', queryKey: '/tools/measurement', paginated: true, defaultSort: 'full_tool_name' } },
      { label: 'Reference',   href: '/controlroom/tools/reference',   prefetch: { endpoint: '/studio/tools/reference',   queryKey: '/tools/reference',   paginated: true, defaultSort: 'full_tool_name' } },
      { label: 'Workflow',    href: '/controlroom/tools/workflow',    prefetch: { endpoint: '/studio/tools/workflow',    queryKey: '/tools/workflow',    paginated: true, defaultSort: 'full_tool_name' } },
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
