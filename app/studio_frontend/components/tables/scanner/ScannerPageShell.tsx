'use client'

import * as React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import type { ConfirmDecision, ScanReport, ScanResult, ScanSection } from '@/lib/types'
import { ScanRunPicker } from './ScanRunPicker'
import { ScanInProgressBanner } from './ScanInProgressBanner'
import { ScanSectionHeader } from './ScanSectionHeader'
import { BulkActionBar } from './BulkActionBar'
import { VirtualSectionList } from './VirtualSectionList'
import { ExclusionsSection } from './ExclusionsSection'
import { MatchedRow } from './rows/MatchedRow'
import { VersionMismatchRow } from './rows/VersionMismatchRow'
import { UnconfirmedRow } from './rows/UnconfirmedRow'
import { UntrackedRow } from './rows/UntrackedRow'
import { OrphanedRow } from './rows/OrphanedRow'
import { CreateRecordModal } from './CreateRecordModal'

const HIGH_CONFIDENCE = new Set(['exact', 'high'])

const SECTION_TITLES: Record<ScanSection, string> = {
  'matched':            'Matched',
  'version-mismatches': 'Version Mismatches',
  'unconfirmed':        'Unconfirmed',
  'untracked':          'Untracked',
  'orphaned':           'Orphaned',
  'exclusions':         'Exclusions',
}

type ScanArrayKey = keyof Pick<ScanReport, 'matched' | 'version_mismatch' | 'unconfirmed' | 'untracked' | 'orphaned' | 'ignored'>

const REPORT_KEY_MAP: Record<Exclude<ScanSection, 'exclusions'>, ScanArrayKey> = {
  'matched':            'matched',
  'version-mismatches': 'version_mismatch',
  'unconfirmed':        'unconfirmed',
  'untracked':          'untracked',
  'orphaned':           'orphaned',
}

interface CreateModalState { result: ScanResult }

export function ScannerPageShell({ section }: Readonly<{ section: ScanSection }>) {
  const queryClient = useQueryClient()
  const [selectedScanId, setSelectedScanId] = React.useState<string | null>(null)
  const [createModal, setCreateModal] = React.useState<CreateModalState | null>(null)

  const { data: runs = [] } = useQuery({
    queryKey: ['scanner', 'runs'],
    queryFn: api.scanner.runs,
  })

  const latestRun = runs[0]
  const isScanning = latestRun?.matched === undefined // placeholder; real check needs a status field
  const effectiveScanId = selectedScanId ?? latestRun?.scan_id ?? null

  const { data: report, isError: reportError, refetch: refetchReport } = useQuery({
    queryKey: ['scanner', 'report', effectiveScanId],
    queryFn: () => api.scanner.report(effectiveScanId ?? undefined),
    enabled: !!effectiveScanId,
  })

  const confirmMutation = useMutation({
    mutationFn: (decisions: ConfirmDecision[]) => api.scanner.confirm(decisions),
    onError: () => toast.error('Failed to apply decisions. Please try again.'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['scanner', 'report', effectiveScanId] }),
  })

  const dismissMutation = useMutation({
    mutationFn: (resultId: string) => api.scanner.dismiss(resultId),
    onError: () => toast.error('Failed to dismiss result. Please try again.'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['scanner', 'report', effectiveScanId] }),
  })

  const keepMutation = useMutation({
    mutationFn: (linkId: string) => api.scanner.keep(linkId),
    onError: () => toast.error('Failed to mark as permanent. Please try again.'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['scanner', 'report', effectiveScanId] }),
  })

  function handleConfirm(resultId: string) {
    confirmMutation.mutate([{ result_id: resultId, action: 'confirm' }])
  }

  function handleReject(resultId: string) {
    confirmMutation.mutate([{ result_id: resultId, action: 'reject' }])
  }

  function handleIgnore(resultId: string) {
    confirmMutation.mutate([{ result_id: resultId, action: 'ignore' }])
  }

  function handleConfirmAllHighConfidence(results: ScanResult[]) {
    const high = results.filter(r => r.confidence && HIGH_CONFIDENCE.has(r.confidence))
    if (high.length === 0) return
    confirmMutation.mutate(high.map(r => ({ result_id: r.result_id, action: 'confirm' as const })))
  }

  if (section === 'exclusions') {
    return (
      <div className="flex flex-col h-full">
        <ScanSectionHeader title="Exclusions" count={0} />
        <ExclusionsSection />
      </div>
    )
  }

  const sectionResults: ScanResult[] = report ? (report[REPORT_KEY_MAP[section]] ?? []) : []

  return (
    <div className="flex flex-col h-full">
      {runs.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <div className="px-4 pt-4 pb-2">
            <ScanRunPicker
              runs={runs}
              selectedId={effectiveScanId}
              onChange={setSelectedScanId}
              onPurge={async (days) => {
                await api.scanner.purge(days)
                await queryClient.invalidateQueries({ queryKey: ['scanner', 'runs'] })
                setSelectedScanId(null)
              }}
            />
          </div>

          {isScanning && latestRun && (
            <ScanInProgressBanner scannedAt={latestRun.scan_id} />
          )}

          <ScanSectionHeader title={SECTION_TITLES[section]} count={sectionResults.length} />

          {section === 'unconfirmed' && (
            <BulkActionBar
              highConfidenceCount={sectionResults.filter(r => r.confidence && HIGH_CONFIDENCE.has(r.confidence)).length}
              onConfirmAll={() => handleConfirmAllHighConfidence(sectionResults)}
            />
          )}

          {reportError ? (
            <div className="flex flex-col items-center justify-center flex-1 gap-3 text-sm text-muted-foreground">
              <p>Failed to load scan results.</p>
              <button
                onClick={() => refetchReport()}
                className="text-primary underline"
                data-testid="scanner-retry-button"
              >
                Retry
              </button>
            </div>
          ) : (
            <div className="flex-1 overflow-hidden">
              <VirtualSectionList
                items={buildListItems(section, sectionResults)}
                estimatedItemHeight={estimatedHeight(section)}
                renderItem={(item) => renderRow(item, section, {
                  onConfirm: handleConfirm,
                  onReject: handleReject,
                  onIgnore: handleIgnore,
                  onDismiss: (id) => dismissMutation.mutate(id),
                  onKeep: (id) => keepMutation.mutate(id),
                  onRemove: (result) => confirmMutation.mutate([{ result_id: result.result_id, action: 'ignore' }]),
                  onCreateRecord: (result) => setCreateModal({ result }),
                  onViewRecord: () => { /* opens existing record modal — wired in OrphanedRow */ },
                })}
                emptyState={<SectionEmptyState section={section} />}
              />
            </div>
          )}
        </>
      )}

      {createModal && (
        <CreateRecordModal
          initialData={{
            name: createModal.result.name,
            vendor: createModal.result.vendor,
            version: createModal.result.version,
            format: createModal.result.format,
          }}
          onSubmit={async (table, data) => {
            await api.create(`/studio/${table}`, data)
            await queryClient.invalidateQueries({ queryKey: ['scanner', 'report', effectiveScanId] })
            setCreateModal(null)
          }}
          onClose={() => setCreateModal(null)}
        />
      )}
    </div>
  )
}

type DividerSentinel = { type: 'divider' }
type ListItem = ScanResult | DividerSentinel

function buildListItems(section: ScanSection, results: ScanResult[]): ListItem[] {
  if (section !== 'unconfirmed') return results
  const high = results.filter(r => r.confidence && HIGH_CONFIDENCE.has(r.confidence))
  const low = results.filter(r => !r.confidence || !HIGH_CONFIDENCE.has(r.confidence))
  if (high.length === 0 || low.length === 0) return results
  return [...high, { type: 'divider' as const }, ...low]
}

function estimatedHeight(section: ScanSection): number {
  const heights: Record<ScanSection, number> = {
    matched: 56, 'version-mismatches': 64, unconfirmed: 72,
    untracked: 56, orphaned: 64, exclusions: 56,
  }
  return heights[section]
}

interface RowHandlers {
  onConfirm: (id: string) => void
  onReject: (id: string) => void
  onIgnore: (id: string) => void
  onDismiss: (id: string) => void
  onKeep: (id: string) => void
  onRemove: (result: ScanResult) => void
  onCreateRecord: (result: ScanResult) => void
  onViewRecord: (result: ScanResult) => void
}

function renderRow(item: ListItem, section: ScanSection, h: RowHandlers): React.ReactNode {
  if ('type' in item && item.type === 'divider') {
    return (
      <div className="px-4 py-2 flex items-center gap-2 text-xs text-muted-foreground">
        <div className="flex-1 border-t border-border" />
        <span>Medium / Low confidence</span>
        <div className="flex-1 border-t border-border" />
      </div>
    )
  }
  const result = item as ScanResult
  switch (section) {
    case 'matched':            return <MatchedRow result={result} />
    case 'version-mismatches': return <VersionMismatchRow result={result} />
    case 'unconfirmed':        return <UnconfirmedRow result={result} onConfirm={h.onConfirm} onReject={h.onReject} onIgnore={h.onIgnore} />
    case 'untracked':          return <UntrackedRow result={result} onCreateRecord={h.onCreateRecord} onIgnore={h.onIgnore} />
    case 'orphaned':           return <OrphanedRow result={result} onDismiss={h.onDismiss} onKeepPermanently={h.onKeep} onRemoveFromCatalog={h.onRemove} onViewRecord={h.onViewRecord} />
    default:                   return null
  }
}

function SectionEmptyState({ section }: Readonly<{ section: ScanSection }>) {
  const messages: Record<ScanSection, string> = {
    matched: 'No matched plugins.',
    'version-mismatches': 'No version mismatches.',
    unconfirmed: 'No unconfirmed matches.',
    untracked: 'No untracked plugins.',
    orphaned: 'No orphaned plugins.',
    exclusions: 'No plugins excluded.',
  }
  return (
    <div className="flex items-center justify-center h-32 text-sm text-muted-foreground" data-testid="scanner-empty-state">
      {messages[section]}
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center flex-1 gap-4 text-center px-8" data-testid="scanner-no-scans-state">
      <p className="text-lg font-medium text-foreground">No scan data yet</p>
      <p className="text-sm text-muted-foreground max-w-sm">
        Run <code className="font-mono bg-muted px-1 rounded">plugin-scanner scan</code> from your Mac
        to upload your first plugin inventory. Make sure the binary is installed and configured
        with a valid API key.
      </p>
      <a
        href="https://github.com/edtbl76/stud.io/blob/main/docs/plugin-scanner.md"
        target="_blank"
        rel="noreferrer"
        className="text-sm text-primary underline"
        data-testid="scanner-docs-link"
      >
        View setup documentation →
      </a>
    </div>
  )
}
