'use client'

import * as React from 'react'
import { useSearchParams } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, AlertCircle, Search } from 'lucide-react'
import { api } from '@/lib/api'
import { SEARCH_TABLE_META } from '@/lib/searchMeta'
import { SearchRecordModal } from '@/components/SearchRecordModal'
import { RecordModalNavigation } from '@/components/RecordModal'
import { useRecordNavigation } from '@/lib/useRecordNavigation'
import type { SearchResult } from '@/lib/types'

// IDs are only unique within a table, so use a compound key for navigation.
function getSearchResultId(r: SearchResult): string {
  return `${r.table}:${r.id}`
}

const SEARCH_LIMIT = 100

const ALL_TAB = 'all'

function buildCountLabel(total: number, resultsLength: number): string {
  if (total > SEARCH_LIMIT) return `Top ${resultsLength} of ${total} results`
  return `${total} result${total === 1 ? '' : 's'}`
}

function filterResults(results: SearchResult[], tab: string): SearchResult[] {
  if (tab === ALL_TAB) return results
  return results.filter((r) => r.table === tab)
}

function SearchCountLabel({
  data, total, resultsLength,
}: Readonly<{ data: unknown; total: number; resultsLength: number }>): React.ReactElement | null {
  if (!data) return null
  return <p className="text-xs text-muted-foreground">{buildCountLabel(total, resultsLength)}</p>
}

function SearchErrorMessage({ error }: Readonly<{ error: unknown }>): React.ReactElement | null {
  if (!error) return null
  return (
    <div className="flex items-center gap-2 text-xs text-destructive mb-4">
      <AlertCircle className="h-3.5 w-3.5" />
      {error instanceof Error ? error.message : 'Search failed'}
    </div>
  )
}

interface Tab { key: string; label: string; count: number }

function buildTabs(results: SearchResult[], total: number): Tab[] {
  const counts = new Map<string, number>()
  for (const r of results) {
    counts.set(r.table, (counts.get(r.table) ?? 0) + 1)
  }
  const tableTabs = [...counts.entries()].map(([key, count]) => ({
    key,
    label: SEARCH_TABLE_META[key]?.label ?? key,
    count,
  }))
  return [{ key: ALL_TAB, label: 'All', count: total }, ...tableTabs]
}

function NotesToggle({
  checked,
  onChange,
}: Readonly<{ checked: boolean; onChange: (v: boolean) => void }>) {
  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    onChange(e.target.checked)
  }
  return (
    <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
      <input type="checkbox" checked={checked} onChange={handleChange} className="accent-primary" />
      <span>Include notes &amp; descriptions</span>
    </label>
  )
}

function TabBar({
  activeTab,
  tabs,
  onSelect,
}: Readonly<{ activeTab: string; tabs: Tab[]; onSelect: (key: string) => void }>) {
  return (
    <div className="flex gap-1 flex-wrap border-b border-border mb-4">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onSelect(tab.key)}
          className={`px-3 py-2 text-xs font-medium transition-colors ${
            activeTab === tab.key
              ? 'border-b-2 border-primary text-foreground -mb-px'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {tab.label}
          {tab.count > 0 && (
            <span className="ml-1.5 px-1.5 py-0.5 rounded text-[10px] bg-muted text-muted-foreground">
              {tab.count}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}

function SearchResultItem({
  result,
  onOpen,
}: Readonly<{ result: SearchResult; onOpen: (r: SearchResult) => void }>) {
  const meta = SEARCH_TABLE_META[result.table]
  if (!meta) return null
  return (
    <button
      onClick={() => onOpen(result)}
      className="w-full flex items-center justify-between px-4 py-3 rounded-md hover:bg-muted/50 transition-colors text-left"
    >
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{result.name}</p>
        {result.brand_name && (
          <p className="text-xs text-muted-foreground truncate">{result.brand_name}</p>
        )}
      </div>
      <span className="text-xs text-muted-foreground ml-4 shrink-0">{meta.label}</span>
    </button>
  )
}

interface SearchResultsBodyProps {
  activeTab: string
  tabs: Tab[]
  visibleResults: SearchResult[]
  onTabSelect: (key: string) => void
  onOpen: (r: SearchResult) => void
}

function SearchResultsBody({
  activeTab, tabs, visibleResults, onTabSelect, onOpen,
}: Readonly<SearchResultsBodyProps>): React.ReactElement {
  return (
    <>
      <TabBar activeTab={activeTab} tabs={tabs} onSelect={onTabSelect} />
      <div className="flex flex-col gap-0.5">
        {visibleResults.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">No results</p>
        ) : (
          visibleResults.map((r) => (
            <SearchResultItem key={getSearchResultId(r)} result={r} onOpen={onOpen} />
          ))
        )}
      </div>
    </>
  )
}

function SearchContent(): React.ReactElement | null {
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()
  const q = searchParams.get('q') ?? ''
  const [notes, setNotes] = React.useState(false)
  const [activeTab, setActiveTab] = React.useState(ALL_TAB)
  const [activeRecord, setActiveRecord] = React.useState<SearchResult | null>(null)

  const { data, isLoading, error } = useQuery({
    queryKey: ['global-search', q, notes],
    queryFn: () => api.searchGlobal(q, notes),
    enabled: q.length >= 2,
  })

  // Reset modal and tab filter when the search query changes
  React.useEffect(() => { setActiveRecord(null); setActiveTab(ALL_TAB) }, [q])

  const results = data?.results ?? []
  const total = data?.total ?? 0
  const visibleResults = filterResults(results, activeTab)
  const tabs = buildTabs(results, total)

  const navValue = useRecordNavigation({
    data: visibleResults,
    currentRecord: activeRecord,
    getRecordId: getSearchResultId,
    onNavigate: setActiveRecord,
  })

  function handleNotesChange(v: boolean) {
    setActiveRecord(null)
    setNotes(v)
    setActiveTab(ALL_TAB)
  }

  function handleTabSelect(key: string) {
    setActiveRecord(null)
    setActiveTab(key)
  }

  function handleOpen(result: SearchResult) {
    setActiveRecord(result)
  }

  function handleClose() {
    setActiveRecord(null)
  }

  function handleMutate() {
    queryClient.invalidateQueries({ queryKey: ['global-search'] }).catch(() => {})
  }

  if (q.length < 2) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
        <Search className="h-8 w-8 mb-2" />
        <p className="text-sm">Enter at least 2 characters to search</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full px-6 py-6 max-w-2xl">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-foreground mb-1">
          Search: <span className="text-primary">{q}</span>
        </h2>
        <div className="flex items-center justify-between gap-4">
          <SearchCountLabel data={data} total={total} resultsLength={results.length} />
          <NotesToggle checked={notes} onChange={handleNotesChange} />
        </div>
      </div>

      <SearchErrorMessage error={error} />

      {isLoading && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-4">
          <Loader2 className="h-4 w-4 animate-spin" />
          Searching...
        </div>
      )}

      {data && (
        <SearchResultsBody
          activeTab={activeTab}
          tabs={tabs}
          visibleResults={visibleResults}
          onTabSelect={handleTabSelect}
          onOpen={handleOpen}
        />
      )}

      {activeRecord && (
        <RecordModalNavigation.Provider key={getSearchResultId(activeRecord)} value={navValue}>
          <SearchRecordModal
            result={activeRecord}
            onClose={handleClose}
            onMutate={handleMutate}
          />
        </RecordModalNavigation.Provider>
      )}
    </div>
  )
}

export default function SearchPage() {
  return (
    <React.Suspense
      fallback={
        <div className="flex items-center gap-2 px-6 py-6 text-xs text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading...
        </div>
      }
    >
      <SearchContent />
    </React.Suspense>
  )
}
