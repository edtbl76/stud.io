'use client'

import * as React from 'react'
import Link from 'next/link'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface NavItem {
  label: string
  href: string
}

export interface NavGroup {
  title: string
  items: NavItem[]
}

interface SidebarNavGroupProps {
  group: NavGroup
  isOpen: boolean
  pathname: string
  onToggle: (title: string) => void
}

export function SidebarNavGroup({ group, isOpen, pathname, onToggle }: Readonly<SidebarNavGroupProps>) {
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

export function getInitialOpenGroups(navGroups: NavGroup[], pathname: string): Set<string> {
  const active = navGroups.find((g) =>
    g.items.some((item) => pathname === item.href || pathname.startsWith(item.href + '/'))
  )
  return active ? new Set([active.title]) : new Set()
}

export function useSidebarGroups(navGroups: NavGroup[], pathname: string) {
  const [openGroups, setOpenGroups] = React.useState<Set<string>>(
    () => getInitialOpenGroups(navGroups, pathname)
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

  return { openGroups, toggleGroup }
}
