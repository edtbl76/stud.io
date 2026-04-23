'use client'

import { usePathname } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { SidebarShell } from '@/components/layout/SidebarShell'
import { NavGroup, SidebarNavGroup, useSidebarGroups } from '@/components/layout/SidebarNav'

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

export function UsersSidebar() {
  const pathname = usePathname()
  const { role } = useAuth()
  const { openGroups, toggleGroup } = useSidebarGroups(navGroups, pathname)

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
