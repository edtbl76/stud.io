'use client'

import { usePathname } from 'next/navigation'
import { SidebarShell } from '@/components/layout/SidebarShell'
import { NavGroup, SidebarNavGroup, useSidebarGroups } from '@/components/layout/SidebarNav'
import { GUITAR_TYPE_ID } from '@/lib/gearlist'

const navGroups: NavGroup[] = [
  {
    title: 'GEAR',
    items: [
      {
        label: 'Guitars',
        href: '/gearlist/guitars',
        prefetch: {
          endpoint: `/gearlist/gear?type_id=${GUITAR_TYPE_ID}`,
          queryKey: '/gearlist/guitars',
          paginated: true,
          defaultSort: 'gear_name',
        },
      },
      {
        label: 'Other Gear',
        href: '/gearlist/other-gear',
        prefetch: {
          endpoint: '/gearlist/gear',
          queryKey: '/gearlist/other-gear',
          paginated: true,
          defaultSort: 'gear_name',
        },
      },
    ],
  },
]

export function GearListSidebar() {
  const pathname = usePathname()
  const { openGroups, toggleGroup } = useSidebarGroups(navGroups, pathname)

  return (
    <SidebarShell subtitle="GearList">
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
