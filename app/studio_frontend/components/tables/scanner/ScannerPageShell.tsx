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
import { ViewRecordModal } from './ViewRecordModal'

const HIGH_CONFIDENCE = new Set(['exact', 'high'])

const isHighConfidence = (r: ScanResult) =>
  !!(r.match?.confidence && HIGH_CONFIDENCE.has(r.match.confidence))

const isLowConfidence = (r: ScanResult) => !isHighConfidence(r)

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

function isScanInProgress(latestRun: import('@/lib/types').ScanRun | undefined): boolean {
  if (!latestRun || latestRun.total_count === 0) return false
  return latestRun.status_counts.matched === 0 && latestRun.status_counts.unconfirmed === 0
}

function getSectionResults(section: ScanSection, report: ScanReport | undefined): ScanResult[] {
  if (section === 'exclusions') return []
  const key = REPORT_KEY_MAP[section]
  return report?.[key] ?? []
}

interface CreateModalState { result: ScanResult }

function useScannerActions(effectiveScanId: string | null) {
  const queryClient = useQueryClient()
  const invalidateReport = () => queryClient.invalidateQueries({ queryKey: ['scanner', 'report', effectiveScanId] })

  const confirmMutation = useMutation({
    mutationFn: (decisions: ConfirmDecision[]) => api.scanner.confirm(decisions),
    onError: () => toast.error('Failed to apply decisions. Please try again.'),
    onSuccess: invalidateReport,
  })
  const dismissMutation = useMutation({
    mutationFn: (resultId: string) => api.scanner.dismiss(resultId),
    onError: () => toast.error('Failed to dismiss result. Please try again.'),
    onSuccess: invalidateReport,
  })
  const keepMutation = useMutation({
    mutationFn: (linkId: string) => api.scanner.keep(linkId),
    onError: () => toast.error('Failed to mark as permanent. Please try again.'),
    onSuccess: invalidateReport,
  })

  return {
    handleConfirm: (resultId: string) => confirmMutation.mutate([{ result_id: resultId, action: 'confirm' }]),
    handleReject:  (resultId: string) => confirmMutation.mutate([{ result_id: resultId, action: 'reject' }]),
    handleIgnore:  (resultId: string) => confirmMutation.mutate([{ result_id: resultId, action: 'ignore' }]),
    handleConfirmAll: (results: ScanResult[]) => {
      const high = results.filter(isHighConfidence)
      if (high.length > 0) confirmMutation.mutate(high.map(r => ({ result_id: r.result_id, action: 'confirm' as const })))
    },
    handleDismiss: (id: string) => dismissMutation.mutate(id),
    handleKeep:    (id: string) => keepMutation.mutate(id),
    handleRemove:  (result: ScanResult) => confirmMutation.mutate([{ result_id: result.result_id, action: 'ignore' }]),
  }
}

function useScannerData(section: ScanSection, selectedScanId: string | null) {
  const { data: runs = [] } = useQuery({
    queryKey: ['scanner', 'runs'],
    queryFn: api.scanner.runs,
  })
  const latestRun = runs[0]
  const effectiveScanId = selectedScanId ?? latestRun?.scan_id ?? null
  const isScanning = latestRun?.status
    ? latestRun.status === 'in_progress'
    : isScanInProgress(latestRun)
  const { data: report, isError: reportError, refetch: refetchReport } = useQuery({
    queryKey: ['scanner', 'report', effectiveScanId],
    queryFn: () => api.scanner.report(effectiveScanId ?? undefined),
    enabled: !!effectiveScanId,
  })
  const sectionResults = getSectionResults(section, report)
  return { runs, latestRun, isScanning, effectiveScanId, reportError, refetchReport, sectionResults }
}

function useScannerPageHandlers(
  effectiveScanId: string | null,
  setSelectedScanId: (id: string | null) => void,
  setCreateModal: (m: CreateModalState | null) => void,
) {
  const queryClient = useQueryClient()

  async function handlePurge(days: Parameters<typeof api.scanner.purge>[0]) {
    try {
      await api.scanner.purge(days)
      await queryClient.invalidateQueries({ queryKey: ['scanner', 'runs'] })
      setSelectedScanId(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to purge scan history. Please try again.')
    }
  }

  async function handleCreateRecordSubmit(table: string, data: Record<string, string>) {
    try {
      await api.create(`/studio/${table}`, data)
      await queryClient.invalidateQueries({ queryKey: ['scanner', 'report', effectiveScanId] })
      setCreateModal(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create record. Please try again.')
      throw err
    }
  }

  return { handlePurge, handleCreateRecordSubmit }
}

export function ScannerPageShell({ section }: Readonly<{ section: ScanSection }>) {
  const [selectedScanId, setSelectedScanId] = React.useState<string | null>(null)
  const [createModal, setCreateModal] = React.useState<CreateModalState | null>(null)
  const [viewRecord, setViewRecord] = React.useState<ScanResult | null>(null)
  const { runs, latestRun, isScanning, effectiveScanId, reportError, refetchReport, sectionResults } = useScannerData(section, selectedScanId)
  const actions = useScannerActions(effectiveScanId)
  const { handlePurge, handleCreateRecordSubmit } = useScannerPageHandlers(effectiveScanId, setSelectedScanId, setCreateModal)

  if (section === 'exclusions') {
    return (
      <div className="flex flex-col h-full">
        <ScanSectionHeader title="Exclusions" count={0} />
        <ExclusionsSection />
      </div>
    )
  }

  function handleCreateRecord(result: ScanResult) {
    setCreateModal({ result })
  }

  return (
    <div className="flex flex-col h-full">
      {runs.length === 0 ? (
        <EmptyState />
      ) : (
        <ScannerSectionContent
          runs={runs}
          effectiveScanId={effectiveScanId}
          section={section}
          sectionResults={sectionResults}
          isScanning={isScanning}
          latestRunScanId={latestRun?.scan_id}
          reportError={reportError}
          actions={actions}
          onScanIdChange={setSelectedScanId}
          onPurge={handlePurge}
          onCreateRecord={handleCreateRecord}
          onViewRecord={(result) => setViewRecord(result)}
          onRefetch={refetchReport}
        />
      )}

      {viewRecord && (
        <ViewRecordModal
          result={viewRecord}
          onClose={() => setViewRecord(null)}
        />
      )}

      {createModal && (
        <CreateRecordModal
          initialData={{
            name: createModal.result.name,
            vendor: createModal.result.vendor,
            version: createModal.result.version,
            format: createModal.result.format,
          }}
          onSubmit={handleCreateRecordSubmit}
          onClose={() => setCreateModal(null)}
        />
      )}
    </div>
  )
}

interface ScannerSectionContentProps {
  runs: import('@/lib/types').ScanRun[]
  effectiveScanId: string | null
  section: Exclude<ScanSection, 'exclusions'>
  sectionResults: ScanResult[]
  isScanning: boolean
  latestRunScanId: string | undefined
  reportError: boolean
  actions: ReturnType<typeof useScannerActions>
  onScanIdChange: (id: string) => void
  onPurge: (days: Parameters<typeof api.scanner.purge>[0]) => Promise<void>
  onCreateRecord: (result: ScanResult) => void
  onViewRecord: (result: ScanResult) => void
  onRefetch: () => void
}

function ScannerSectionContent({
  runs, effectiveScanId, section, sectionResults, isScanning, latestRunScanId,
  reportError, actions, onScanIdChange, onPurge, onCreateRecord, onViewRecord, onRefetch,
}: Readonly<ScannerSectionContentProps>) {
  return (
    <>
      <div className="px-4 pt-4 pb-2">
        <ScanRunPicker runs={runs} selectedId={effectiveScanId} onChange={onScanIdChange} onPurge={onPurge} />
      </div>
      {isScanning && latestRunScanId && <ScanInProgressBanner scannedAt={latestRunScanId} />}
      <ScanSectionHeader title={SECTION_TITLES[section]} count={sectionResults.length} />
      {section === 'unconfirmed' && (
        <BulkActionBar
          highConfidenceCount={sectionResults.filter(isHighConfidence).length}
          onConfirmAll={() => actions.handleConfirmAll(sectionResults)}
        />
      )}
      {reportError ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-3 text-sm text-muted-foreground">
          <p>Failed to load scan results.</p>
          <button onClick={onRefetch} className="text-primary underline" data-testid="scanner-retry-button">Retry</button>
        </div>
      ) : (
        <div className="flex-1 overflow-hidden">
          <VirtualSectionList
            items={buildListItems(section, sectionResults)}
            estimatedItemHeight={estimatedHeight(section)}
            renderItem={(item) => renderRow(item, section, {
              onConfirm: actions.handleConfirm, onReject: actions.handleReject, onIgnore: actions.handleIgnore,
              onDismiss: actions.handleDismiss, onKeep: actions.handleKeep, onRemove: actions.handleRemove,
              onCreateRecord,
              onViewRecord,
            })}
            emptyState={<SectionEmptyState section={section} />}
          />
        </div>
      )}
    </>
  )
}

type DividerSentinel = { type: 'divider' }
type ListItem = ScanResult | DividerSentinel

function buildListItems(section: ScanSection, results: ScanResult[]): ListItem[] {
  if (section !== 'unconfirmed') return results
  const high = results.filter(isHighConfidence)
  const low = results.filter(isLowConfidence)
  if (high.length === 0 || low.length === 0) return results
  return [...high, { type: 'divider' as const }, ...low]
}

const ROW_HEIGHT_DEFAULT = 56
const ROW_HEIGHT_WITH_SUBTITLE = 64
const ROW_HEIGHT_WITH_ACTIONS = 72

function estimatedHeight(section: ScanSection): number {
  const heights: Record<ScanSection, number> = {
    matched: ROW_HEIGHT_DEFAULT,
    'version-mismatches': ROW_HEIGHT_WITH_SUBTITLE,
    unconfirmed: ROW_HEIGHT_WITH_ACTIONS,
    untracked: ROW_HEIGHT_DEFAULT,
    orphaned: ROW_HEIGHT_WITH_SUBTITLE,
    exclusions: ROW_HEIGHT_DEFAULT,
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

function ConfidenceDivider() {
  return (
    <div className="px-4 py-2 flex items-center gap-2 text-xs text-muted-foreground">
      <div className="flex-1 border-t border-border" />
      <span>Medium / Low confidence</span>
      <div className="flex-1 border-t border-border" />
    </div>
  )
}

type RowRenderer = (result: ScanResult, h: RowHandlers) => React.ReactNode

const ROW_RENDERERS: Partial<Record<ScanSection, RowRenderer>> = {
  matched:              (r) => <MatchedRow result={r} />,
  'version-mismatches': (r) => <VersionMismatchRow result={r} />,
  unconfirmed:          (r, h) => <UnconfirmedRow result={r} onConfirm={h.onConfirm} onReject={h.onReject} onIgnore={h.onIgnore} />,
  untracked:            (r, h) => <UntrackedRow result={r} onCreateRecord={h.onCreateRecord} onIgnore={h.onIgnore} />,
  orphaned:             (r, h) => <OrphanedRow result={r} onDismiss={h.onDismiss} onKeepPermanently={h.onKeep} onRemoveFromCatalog={h.onRemove} onViewRecord={h.onViewRecord} />,
}

function renderRow(item: ListItem, section: ScanSection, h: RowHandlers): React.ReactNode {
  if ('type' in item && item.type === 'divider') return <ConfidenceDivider />
  const render = ROW_RENDERERS[section]
  return render ? render(item as ScanResult, h) : null
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
