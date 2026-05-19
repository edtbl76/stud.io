'use client'

import * as React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import type { AbsentRecord, ConfirmDecision, ScanReport, ScanResult, ScanSection } from '@/lib/types'
import { SEARCH_TABLE_META } from '@/lib/searchMeta'
import { ScanRunPicker } from './ScanRunPicker'
import { ScanInProgressBanner } from './ScanInProgressBanner'
import { ScanSectionHeader } from './ScanSectionHeader'
import { BulkActionBar } from './BulkActionBar'
import { VirtualSectionList } from './VirtualSectionList'
import { ExclusionsSection } from './ExclusionsSection'
import { ConflictedSectionHeader } from './ConflictedSectionHeader'
import { MatchedRow } from './rows/MatchedRow'
import { ConflictedRow } from './rows/ConflictedRow'
import { UnconfirmedRow } from './rows/UnconfirmedRow'
import { UntrackedRow } from './rows/UntrackedRow'
import { OrphanedRow } from './rows/OrphanedRow'
import { AbsentRow } from './rows/AbsentRow'
import { CreateRecordModal } from './CreateRecordModal'
import { ViewRecordModal } from './ViewRecordModal'
import { ManualMappingModal } from './ManualMappingModal'

const HIGH_CONFIDENCE = new Set(['exact', 'high'])

const isHighConfidence = (r: ScanResult) =>
  !!(r.match?.confidence && HIGH_CONFIDENCE.has(r.match.confidence))

const isLowConfidence = (r: ScanResult) => !isHighConfidence(r)

const SECTION_TITLES: Record<Exclude<ScanSection, 'exclusions'>, string> = {
  known:       'Known',
  matched:     'Matched',
  conflicted:  'Conflicted',
  unconfirmed: 'Unconfirmed',
  untracked:   'Untracked',
  orphaned:    'Orphaned',
  absent:      'Absent',
}

type ScanArrayKey = keyof Pick<ScanReport, 'known' | 'matched' | 'conflicted' | 'unconfirmed' | 'untracked' | 'orphaned' | 'ignored'>

const REPORT_KEY_MAP: Record<Exclude<ScanSection, 'exclusions' | 'absent'>, ScanArrayKey> = {
  known:       'known',
  matched:     'matched',
  conflicted:  'conflicted',
  unconfirmed: 'unconfirmed',
  untracked:   'untracked',
  orphaned:    'orphaned',
}

function isScanInProgress(latestRun: import('@/lib/types').ScanRun | undefined): boolean {
  if (!latestRun || latestRun.total_count === 0) return false
  return latestRun.status_counts.matched === 0 && latestRun.status_counts.unconfirmed === 0
}

function getSectionResults(section: ScanSection, report: ScanReport | undefined): ScanResult[] {
  if (section === 'exclusions' || section === 'absent') return []
  const key = REPORT_KEY_MAP[section]
  return report?.[key] ?? []
}

function getAbsentResults(report: ScanReport | undefined): AbsentRecord[] {
  return report?.absent ?? []
}

interface CreateModalState { result: ScanResult }
interface ManualMappingState { result: ScanResult }

function useScannerActions(effectiveScanId: string | null) {
  const queryClient = useQueryClient()
  const invalidateReport = () => queryClient.invalidateQueries({ queryKey: ['scanner', 'report', effectiveScanId] })

  const confirmMutation = useMutation({
    mutationFn: (decisions: ConfirmDecision[]) => api.scanner.confirm(decisions),
    onError: () => toast.error('Failed to apply decisions. Please try again.'),
    onSuccess: invalidateReport,
  })
  const acknowledgeMutation = useMutation({
    mutationFn: (resultId: string) => api.scanner.acknowledge(resultId),
    onError: () => toast.error('Failed to acknowledge. Please try again.'),
    onSuccess: invalidateReport,
  })
  const forceMutation = useMutation({
    mutationFn: (args: { resultId: string; targetId: string; targetTable: string }) =>
      api.scanner.force(args),
    onError: () => toast.error('Failed to override mapping. Please try again.'),
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

  const saveConflictMutation = useMutation({
    mutationFn: async ({ result, values }: { result: ScanResult; values: import('@/components/tables/scanner/ViewRecordModal').ConflictResolution }) => {
      const endpoint = SEARCH_TABLE_META[result.match!.record_table!]?.endpoint
      await api.update(endpoint, result.match!.record_id!, values)
      await api.scanner.acknowledge(result.result_id)
    },
    onError: () => toast.error('Failed to save conflict resolution. Please try again.'),
    onSuccess: invalidateReport,
  })

  return {
    handleConfirm: (resultId: string) => confirmMutation.mutate([{ result_id: resultId, action: 'confirm' }]),
    handleReject:  (resultId: string) => confirmMutation.mutate([{ result_id: resultId, action: 'reject' }]),
    handleIgnore:  (resultId: string) => confirmMutation.mutate([{ result_id: resultId, action: 'ignore' }]),
    handleSaveConflict: (result: ScanResult, values: import('@/components/tables/scanner/ViewRecordModal').ConflictResolution) =>
      saveConflictMutation.mutate({ result, values }),
    handleBulkAcceptDisk: async (results: ScanResult[]) => {
      let succeeded = 0
      for (const r of results) {
        const endpoint = SEARCH_TABLE_META[r.match?.record_table ?? '']?.endpoint
        if (!endpoint || !r.match?.record_id) continue
        try {
          await api.update(endpoint, r.match.record_id, { version: r.version })
          succeeded++
        } catch {
          toast.error(`Updated ${succeeded} of ${results.length} — stopped at "${r.name}"`)
          invalidateReport()
          return
        }
      }
      toast.success(`Updated ${succeeded} record${succeeded === 1 ? '' : 's'}`)
      invalidateReport()
    },

    handleConfirmAll: (results: ScanResult[]) => {
      const high = results.filter(isHighConfidence)
      if (high.length > 0) confirmMutation.mutate(high.map(r => ({ result_id: r.result_id, action: 'confirm' as const })))
    },
    handleAcknowledge: (resultId: string) => acknowledgeMutation.mutate(resultId),
    handleBulkAcknowledge: (results: ScanResult[]) =>
      Promise.all(results.map(r => acknowledgeMutation.mutateAsync(r.result_id))),
    handleForce: (resultId: string, targetId: string, targetTable: string) =>
      forceMutation.mutate({ resultId, targetId, targetTable }),
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
  const absentResults = getAbsentResults(report)
  return { runs, latestRun, isScanning, effectiveScanId, reportError, refetchReport, sectionResults, absentResults }
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
  const [manualMapping, setManualMapping] = React.useState<ManualMappingState | null>(null)
  const [viewRecord, setViewRecord] = React.useState<ScanResult | null>(null)
  const [selectedConflicted, setSelectedConflicted] = React.useState<Set<string>>(new Set())
  const { runs, latestRun, isScanning, effectiveScanId, reportError, refetchReport, sectionResults, absentResults } = useScannerData(section, selectedScanId)
  const actions = useScannerActions(effectiveScanId)
  React.useEffect(() => { setSelectedConflicted(new Set()) }, [effectiveScanId])
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

  function handleOverride(result: ScanResult) {
    setManualMapping({ result })
  }

  function handleManualMappingConfirm(targetId: string, targetTable: string) {
    if (manualMapping) {
      actions.handleForce(manualMapping.result.result_id, targetId, targetTable)
      setManualMapping(null)
    }
  }

  function handleConflictedSelect(resultId: string) {
    setSelectedConflicted(prev => {
      const next = new Set(prev)
      if (next.has(resultId)) next.delete(resultId)
      else next.add(resultId)
      return next
    })
  }

  async function handleBulkConflictedUpdate() {
    const selected = sectionResults.filter(r => selectedConflicted.has(r.result_id))
    await actions.handleBulkAcceptDisk(selected)
    setSelectedConflicted(new Set())
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
          absentResults={absentResults}
          isScanning={isScanning}
          latestRunScanId={latestRun?.scan_id}
          reportError={reportError}
          actions={actions}
          selectedConflicted={selectedConflicted}
          onScanIdChange={setSelectedScanId}
          onPurge={handlePurge}
          onCreateRecord={handleCreateRecord}
          onViewRecord={(result) => setViewRecord(result)}
          onRefetch={refetchReport}
          onOverride={handleOverride}
          onConflictedSelect={handleConflictedSelect}
          onBulkConflictedUpdate={handleBulkConflictedUpdate}
        />
      )}

      {viewRecord && (
        <ViewRecordModal
          result={viewRecord}
          onClose={() => setViewRecord(null)}
          onAcknowledge={actions.handleAcknowledge}
          onSaveConflict={(resultId, values) => {
            const r = sectionResults.find(x => x.result_id === resultId) ?? viewRecord
            actions.handleSaveConflict(r, values)
            setViewRecord(null)
          }}
          onSaved={() => refetchReport()}
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

      {manualMapping && (
        <ManualMappingModal
          initialName={manualMapping.result.name}
          onConfirm={handleManualMappingConfirm}
          onClose={() => setManualMapping(null)}
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
  absentResults: AbsentRecord[]
  isScanning: boolean
  latestRunScanId: string | undefined
  reportError: boolean
  actions: ReturnType<typeof useScannerActions>
  selectedConflicted: Set<string>
  onScanIdChange: (id: string) => void
  onPurge: (days: Parameters<typeof api.scanner.purge>[0]) => Promise<void>
  onCreateRecord: (result: ScanResult) => void
  onViewRecord: (result: ScanResult) => void
  onRefetch: () => void
  onOverride: (result: ScanResult) => void
  onConflictedSelect: (resultId: string) => void
  onBulkConflictedUpdate: () => void
}

function SectionHeader({ section, sectionResults, visibleResults, selectedConflicted, hideConfirmed, onToggleHideConfirmed, onBulkConflictedUpdate, actions }: Readonly<{
  section: Exclude<ScanSection, 'exclusions'>
  sectionResults: ScanResult[]
  visibleResults: ScanResult[]
  selectedConflicted: Set<string>
  hideConfirmed: boolean
  onToggleHideConfirmed: () => void
  onBulkConflictedUpdate: () => void
  actions: ReturnType<typeof useScannerActions>
}>) {
  if (section === 'conflicted') {
    return (
      <ConflictedSectionHeader
        count={visibleResults.length}
        selectedCount={selectedConflicted.size}
        hideConfirmed={hideConfirmed}
        onToggleHideConfirmed={onToggleHideConfirmed}
        onBulkUpdate={onBulkConflictedUpdate}
      />
    )
  }
  return (
    <>
      <ScanSectionHeader title={SECTION_TITLES[section]} count={visibleResults.length} />
      {section === 'unconfirmed' && (
        <BulkActionBar
          highConfidenceCount={sectionResults.filter(isHighConfidence).length}
          onConfirmAll={() => actions.handleConfirmAll(sectionResults)}
        />
      )}
    </>
  )
}

function SectionResultsArea({ section, absentResults, visibleResults, reportError, onRefetch, actions, onCreateRecord, onViewRecord, onOverride, onConflictedSelect, selectedConflicted }: Readonly<{
  section: Exclude<ScanSection, 'exclusions'>
  absentResults: AbsentRecord[]
  visibleResults: ScanResult[]
  reportError: boolean
  onRefetch: () => void
  actions: ReturnType<typeof useScannerActions>
  onCreateRecord: (result: ScanResult) => void
  onViewRecord: (result: ScanResult) => void
  onOverride: (result: ScanResult) => void
  onConflictedSelect: (resultId: string) => void
  selectedConflicted: Set<string>
}>) {
  if (reportError) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 gap-3 text-sm text-muted-foreground">
        <p>Failed to load scan results.</p>
        <button onClick={onRefetch} className="text-primary underline" data-testid="scanner-retry-button">Retry</button>
      </div>
    )
  }
  const items = section === 'absent'
    ? absentResults
    : buildListItems(section, visibleResults)
  const renderItem = section === 'absent'
    ? (r: AbsentRecord) => <AbsentRow record={r} />
    : (item: ScanResult | { type: 'divider' }) => renderRow(item, section, {
        onConfirm: actions.handleConfirm, onReject: actions.handleReject, onIgnore: actions.handleIgnore,
        onAcknowledge: actions.handleAcknowledge,
        onDismiss: actions.handleDismiss, onKeep: actions.handleKeep, onRemove: actions.handleRemove,
        onCreateRecord, onViewRecord, onOverride, onConflictedSelect, selectedConflicted,
      })
  return (
    <div className="flex-1 overflow-hidden">
      <VirtualSectionList
        items={items}
        estimatedItemHeight={section === 'absent' ? ROW_HEIGHT_WITH_SUBTITLE : estimatedHeight(section)}
        renderItem={renderItem as (item: unknown) => React.ReactNode}
        emptyState={<SectionEmptyState section={section} />}
      />
    </div>
  )
}

function ScannerSectionContent({
  runs, effectiveScanId, section, sectionResults, absentResults, isScanning, latestRunScanId,
  reportError, actions, selectedConflicted, onScanIdChange, onPurge, onCreateRecord,
  onViewRecord, onRefetch, onOverride, onConflictedSelect, onBulkConflictedUpdate,
}: Readonly<ScannerSectionContentProps>) {
  const [hideConfirmed, setHideConfirmed] = React.useState(true)
  const visibleResults = section === 'conflicted' && hideConfirmed
    ? sectionResults.filter(r => !r.confirmed_at)
    : sectionResults

  return (
    <>
      <div className="px-4 pt-4 pb-2">
        <ScanRunPicker runs={runs} selectedId={effectiveScanId} onChange={onScanIdChange} onPurge={onPurge} />
      </div>
      {isScanning && latestRunScanId && <ScanInProgressBanner scannedAt={latestRunScanId} />}
      <SectionHeader
        section={section} sectionResults={sectionResults} visibleResults={visibleResults}
        selectedConflicted={selectedConflicted} hideConfirmed={hideConfirmed}
        onToggleHideConfirmed={() => setHideConfirmed(prev => !prev)}
        onBulkConflictedUpdate={onBulkConflictedUpdate} actions={actions}
      />
      <SectionResultsArea
        section={section} absentResults={absentResults} visibleResults={visibleResults}
        reportError={reportError} onRefetch={onRefetch} actions={actions}
        onCreateRecord={onCreateRecord} onViewRecord={onViewRecord} onOverride={onOverride}
        onConflictedSelect={onConflictedSelect} selectedConflicted={selectedConflicted}
      />
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
    known:       ROW_HEIGHT_DEFAULT,
    matched:     ROW_HEIGHT_DEFAULT,
    conflicted:  ROW_HEIGHT_WITH_SUBTITLE,
    unconfirmed: ROW_HEIGHT_WITH_ACTIONS,
    untracked:   ROW_HEIGHT_DEFAULT,
    orphaned:    ROW_HEIGHT_WITH_SUBTITLE,
    absent:      ROW_HEIGHT_WITH_SUBTITLE,
    exclusions:  ROW_HEIGHT_DEFAULT,
  }
  return heights[section]
}

interface RowHandlers {
  onConfirm: (id: string) => void
  onReject: (id: string) => void
  onIgnore: (id: string) => void
  onAcknowledge: (id: string) => void
  onDismiss: (id: string) => void
  onKeep: (id: string) => void
  onRemove: (result: ScanResult) => void
  onCreateRecord: (result: ScanResult) => void
  onViewRecord: (result: ScanResult) => void
  onOverride: (result: ScanResult) => void
  onConflictedSelect: (resultId: string) => void
  selectedConflicted: Set<string>
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
  known:       (r, h) => <MatchedRow result={r} onViewRecord={h.onViewRecord} onAcknowledge={h.onAcknowledge} />,
  matched:     (r, h) => <MatchedRow result={r} onViewRecord={h.onViewRecord} onAcknowledge={h.onAcknowledge} />,
  conflicted:  (r, h) => <ConflictedRow result={r} selected={h.selectedConflicted.has(r.result_id)} onSelect={h.onConflictedSelect} onViewRecord={h.onViewRecord} />,
  unconfirmed: (r, h) => <UnconfirmedRow result={r} onConfirm={h.onConfirm} onReject={h.onReject} onIgnore={h.onIgnore} onOverride={h.onOverride} />,
  untracked:   (r, h) => <UntrackedRow result={r} onCreateRecord={h.onCreateRecord} onIgnore={h.onIgnore} onOverride={h.onOverride} />,
  orphaned:    (r, h) => <OrphanedRow result={r} onDismiss={h.onDismiss} onKeepPermanently={h.onKeep} onRemoveFromCatalog={h.onRemove} onViewRecord={h.onViewRecord} />,
}

function renderRow(item: ListItem, section: ScanSection, h: RowHandlers): React.ReactNode {
  if ('type' in item && item.type === 'divider') return <ConfidenceDivider />
  const renderer = ROW_RENDERERS[section]
  return renderer ? renderer(item as ScanResult, h) : null
}

function SectionEmptyState({ section }: Readonly<{ section: ScanSection }>) {
  const messages: Record<ScanSection, string> = {
    known:       'No known plugins.',
    matched:     'No matched plugins.',
    conflicted:  'No conflicted plugins.',
    unconfirmed: 'No unconfirmed matches.',
    untracked:   'No untracked plugins.',
    orphaned:    'No orphaned plugins.',
    absent:      'All catalog records with known disk paths were found in this scan.',
    exclusions:  'No plugins excluded.',
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
