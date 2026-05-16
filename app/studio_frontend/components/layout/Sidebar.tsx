'use client'

import { usePathname } from 'next/navigation'
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
  {
    title: 'PLUGIN SCANNER',
    items: [
      { label: 'Known',       href: '/controlroom/scanner/known' },
      { label: 'Matched',     href: '/controlroom/scanner/matched' },
      { label: 'Conflicted',  href: '/controlroom/scanner/conflicted' },
      { label: 'Unconfirmed', href: '/controlroom/scanner/unconfirmed' },
      { label: 'Untracked',   href: '/controlroom/scanner/untracked' },
      { label: 'Orphaned',    href: '/controlroom/scanner/orphaned' },
      { label: 'Exclusions',  href: '/controlroom/scanner/exclusions' },
    ],
  },
]

export function Sidebar() {
  const pathname = usePathname()
  const { openGroups, toggleGroup } = useSidebarGroups(navGroups, pathname)

  return (
    <SidebarShell subtitle="ControlRoom">
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
