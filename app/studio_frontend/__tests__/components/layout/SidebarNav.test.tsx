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

function expectNoPrefetch() {
  expect(mockPrefetchInfiniteQuery).not.toHaveBeenCalled()
  expect(mockPrefetchQuery).not.toHaveBeenCalled()
}

beforeEach(() => {
  mockPrefetchInfiniteQuery.mockReset()
  mockPrefetchQuery.mockReset()
})

describe('SidebarNavGroup prefetch', () => {
  it('calls prefetchInfiniteQuery with correct key on hover for paginated item', () => {
    const { getByText } = renderGroup(PAGINATED_GROUP)
    fireEvent.mouseEnter(getByText('Effects'))

    expect(mockPrefetchInfiniteQuery).toHaveBeenCalledTimes(1)
    expect(mockPrefetchInfiniteQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ['/session/effects', [{ id: 'effect_name', desc: false }], {}],
        initialPageParam: 0,
        pages: 1,
        staleTime: 30_000,
      })
    )
    expect(mockPrefetchQuery).not.toHaveBeenCalled()
  })

  it('calls prefetchQuery with correct key on hover for non-paginated item', () => {
    const { getByText } = renderGroup(NON_PAGINATED_GROUP)
    fireEvent.mouseEnter(getByText('Effect Types'))

    expect(mockPrefetchQuery).toHaveBeenCalledTimes(1)
    expect(mockPrefetchQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ['/studio/config/effect-types'],
        staleTime: 30_000,
      })
    )
    expect(mockPrefetchInfiniteQuery).not.toHaveBeenCalled()
  })

  it('does not call any prefetch when item has no prefetch metadata', () => {
    const { getByText } = renderGroup(NO_PREFETCH_GROUP)
    fireEvent.mouseEnter(getByText('Backup'))
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
    const { getByText } = renderGroup(group)
    fireEvent.mouseEnter(getByText('Item'))

    expect(mockPrefetchInfiniteQuery).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['/test', [], {}] })
    )
  })
})
