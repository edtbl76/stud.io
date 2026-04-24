import * as React from 'react'
import { render, fireEvent } from '@testing-library/react'
import { SidebarNavGroup } from '@/components/layout/SidebarNav'
import type { NavGroup } from '@/components/layout/SidebarNav'

const mockPrefetchInfiniteQuery = jest.fn()
const mockPrefetchQuery = jest.fn()

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    prefetchInfiniteQuery: mockPrefetchInfiniteQuery,
    prefetchQuery: mockPrefetchQuery,
  }),
}))

jest.mock('@/lib/api', () => ({
  api: {
    listPaged: jest.fn(),
    list: jest.fn(),
  },
}))

jest.mock('next/link', () =>
  function MockLink({ href, children, onMouseEnter, className }: {
    href: string; children: React.ReactNode; onMouseEnter?: () => void; className?: string
  }) {
    return <a href={href} onMouseEnter={onMouseEnter} className={className}>{children}</a>
  }
)

const PAGINATED_GROUP: NavGroup = {
  title: 'SESSION',
  items: [
    {
      label: 'Effects',
      href: '/controlroom/session/effects',
      prefetch: {
        endpoint: '/studio/session/effects',
        queryKey: '/session/effects',
        paginated: true,
        defaultSort: 'effect_name',
      },
    },
  ],
}

const NON_PAGINATED_GROUP: NavGroup = {
  title: 'CONFIG',
  items: [
    {
      label: 'Effect Types',
      href: '/studio/config/effect-types',
      prefetch: {
        endpoint: '/studio/config/effect-types',
        queryKey: '/studio/config/effect-types',
        paginated: false,
      },
    },
  ],
}

const NO_PREFETCH_GROUP: NavGroup = {
  title: 'ADMIN',
  items: [{ label: 'Backup', href: '/studio/admin/backup' }],
}

function renderGroup(group: NavGroup, { pathname = '/', isOpen = true } = {}) {
  return render(
    <SidebarNavGroup
      group={group}
      isOpen={isOpen}
      pathname={pathname}
      onToggle={jest.fn()}
    />
  )
}

function hoverItem(group: NavGroup, label: string) {
  const { getByText } = renderGroup(group)
  fireEvent.mouseEnter(getByText(label))
}

function expectNoPrefetch() {
  expect(mockPrefetchInfiniteQuery).not.toHaveBeenCalled()
  expect(mockPrefetchQuery).not.toHaveBeenCalled()
}

function expectOnlyInfiniteQuery(args: Record<string, unknown>) {
  expect(mockPrefetchInfiniteQuery).toHaveBeenCalledTimes(1)
  expect(mockPrefetchInfiniteQuery).toHaveBeenCalledWith(expect.objectContaining(args))
  expect(mockPrefetchQuery).not.toHaveBeenCalled()
}

function expectOnlyQuery(args: Record<string, unknown>) {
  expect(mockPrefetchQuery).toHaveBeenCalledTimes(1)
  expect(mockPrefetchQuery).toHaveBeenCalledWith(expect.objectContaining(args))
  expect(mockPrefetchInfiniteQuery).not.toHaveBeenCalled()
}

beforeEach(() => {
  mockPrefetchInfiniteQuery.mockReset()
  mockPrefetchQuery.mockReset()
})

describe('SidebarNavGroup prefetch', () => {
  it('calls prefetchInfiniteQuery with correct key on hover for paginated item', () => {
    hoverItem(PAGINATED_GROUP, 'Effects')
    expectOnlyInfiniteQuery({
      queryKey: ['/session/effects', [{ id: 'effect_name', desc: false }], {}],
      initialPageParam: 0,
      pages: 1,
      staleTime: 30_000,
    })
  })

  it('calls prefetchQuery with correct key on hover for non-paginated item', () => {
    hoverItem(NON_PAGINATED_GROUP, 'Effect Types')
    expectOnlyQuery({
      queryKey: ['/studio/config/effect-types'],
      staleTime: 30_000,
    })
  })

  it('does not call any prefetch when item has no prefetch metadata', () => {
    hoverItem(NO_PREFETCH_GROUP, 'Backup')
    expectNoPrefetch()
  })

  it('does not prefetch when group is collapsed', () => {
    const { queryByText } = renderGroup(PAGINATED_GROUP, { isOpen: false })
    expect(queryByText('Effects')).toBeNull()
    expectNoPrefetch()
  })

  it('uses empty sorting array when no defaultSort provided', () => {
    const group: NavGroup = {
      title: 'TEST',
      items: [{
        label: 'Item',
        href: '/test',
        prefetch: { endpoint: '/studio/test', queryKey: '/test', paginated: true },
      }],
    }
    hoverItem(group, 'Item')
    expect(mockPrefetchInfiniteQuery).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['/test', [], {}] })
    )
  })
})
