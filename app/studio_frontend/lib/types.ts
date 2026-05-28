export type RuleType = 'vendor' | 'name' | 'pattern'

export interface VendorRule {
  rule_id: string; disk_vendor: string; catalog_vendor: string
  enabled: boolean; created_by: string; created_at: string
  affected_count: number; clean_count: number; needs_review_count: number
}

export interface NameRule {
  rule_id: string; disk_name: string; catalog_name: string
  enabled: boolean; created_by: string; created_at: string
  affected_count: number; clean_count: number; needs_review_count: number
}

export interface PatternRule {
  rule_id: string; label: string; pattern: string
  match_fields: string[]; action: string
  enabled: boolean; is_seeded: boolean; created_by: string; created_at: string
}

export interface AllRules { vendor: VendorRule[]; name: NameRule[]; pattern: PatternRule[] }

export interface RuleCreationResult {
  rule: VendorRule | NameRule | PatternRule
  affected_count: number; clean_count: number; needs_review_count: number
}

export interface VendorRuleInput { disk_vendor: string; catalog_vendor: string }
export interface NameRuleInput { disk_name: string; catalog_name: string }
export interface UpdateRuleInput { id: string; type: 'vendor' | 'name'; catalogValue: string }
export interface PatternRuleInput {
  label: string; pattern: string; match_fields: string[]; action: string; enabled: boolean
}

export type AcknowledgeResult = { acknowledged: number }

export interface TypeRef { id: string; name: string }
export interface ModelRef { id: string; name: string }
export interface ParentRef { table_name: string; id: string; name: string | null }

export interface PluginPathEntry {
  path: string
  format: 'vst3' | 'au' | 'vst2'
  version: string
}

export interface LookupOut {
  type_id: string
  type_name: string
  type_description: string | null
}

export interface Brand {
  brand_id: string
  legal_name: string | null
  brand_name: string
  entity_type_id: string | null
  entity_type_name: string | null
  website: string | null
  description: string | null
  founder: string | null
  years: string | null
  created_at: string
  updated_at: string
}

export interface Model {
  model_id: string
  model_name: string
  brand_id: string | null
  brand_name: string | null
  full_model_name: string
  model_type_ids: string[] | null
  model_types: TypeRef[]
  creator: string | null
  years_active: string | null
  links: string | null
  description: string | null
  recording_notes: string | null
  artist_reference: string | null
  attributes: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export interface Effect {
  effect_id: string
  effect_name: string
  brand_id: string | null
  brand_name: string | null
  full_effect_name: string
  version: string | null
  collection: string | null
  model_ids: string[] | null
  models: ModelRef[]
  effect_type_ids: string[] | null
  effect_types: TypeRef[]
  tool_type_ids: string[] | null
  tool_types: TypeRef[]
  plugin_format_ids: string[] | null
  plugin_formats: TypeRef[]
  tag_ids: string[] | null
  tags: TypeRef[]
  parents: ParentRef[]
  description: string | null
  workflow_notes: string | null
  recording_notes: string | null
  artist_reference: string | null
  attributes: Record<string, unknown> | null
  disk_paths: PluginPathEntry[]
  created_at: string
  updated_at: string
}

export interface Instrument {
  instrument_id: string
  instrument_name: string
  brand_id: string | null
  brand_name: string | null
  full_instrument_name: string
  version: string | null
  model_ids: string[] | null
  models: ModelRef[]
  instrument_type_ids: string[] | null
  instrument_types: TypeRef[]
  tool_type_ids: string[] | null
  tool_types: TypeRef[]
  plugin_format_ids: string[] | null
  plugin_formats: TypeRef[]
  tag_ids: string[] | null
  tags: TypeRef[]
  parents: ParentRef[]
  description: string | null
  instrument_notes: string | null
  recording_notes: string | null
  artist_reference: string | null
  attributes: Record<string, unknown> | null
  disk_paths: PluginPathEntry[]
  created_at: string
  updated_at: string
}

export interface Library {
  library_id: string
  library_name: string
  brand_id: string | null
  brand_name: string | null
  full_library_name: string
  model_ids: string[] | null
  models: ModelRef[]
  tag_ids: string[] | null
  tags: TypeRef[]
  parents: ParentRef[]
  description: string | null
  instrument_notes: string | null
  recording_notes: string | null
  workflow_notes: string | null
  attributes: Record<string, unknown> | null
  disk_paths: PluginPathEntry[]
  created_at: string
  updated_at: string
}

export interface Workstation {
  workstation_id: string
  tool_name: string
  brand_id: string | null
  brand_name: string | null
  full_tool_name: string
  version: string | null
  tool_type_ids: string[] | null
  tool_types: TypeRef[]
  plugin_format_ids: string[] | null
  plugin_formats: TypeRef[]
  tag_ids: string[] | null
  tags: TypeRef[]
  description: string | null
  workflow_notes: string | null
  disk_paths: PluginPathEntry[]
  created_at: string
  updated_at: string
}

export interface Tool {
  tool_id: string
  tool_name: string
  brand_id: string | null
  brand_name: string | null
  full_tool_name: string
  version: string | null
  model_ids: string[] | null
  models: ModelRef[]
  tool_type_ids: string[] | null
  tool_types: TypeRef[]
  plugin_format_ids: string[] | null
  plugin_formats: TypeRef[]
  tag_ids: string[] | null
  tags: TypeRef[]
  description: string | null
  workflow_notes: string | null
  disk_paths: PluginPathEntry[]
  created_at: string
  updated_at: string
}

export interface GearType {
  type_id: string
  type_name: string
  type_description: string | null
}

export interface Gear {
  gear_id: string
  gear_name: string
  gear_type_id: string | null
  gear_type_name: string | null
  brand_id: string | null
  brand_name: string | null
  model_id: string | null
  model_name: string | null
  serial_number: string | null
  year: number | null
  owner_id: string | null
  photo_key: string | null
  notes: string | null
  num_strings: number | null
  tuning: string | null
  pickup_config: string | null
  pickup_neck_model_id: string | null
  pickup_neck_model_name: string | null
  pickup_middle_model_id: string | null
  pickup_middle_model_name: string | null
  pickup_bridge_model_id: string | null
  pickup_bridge_model_name: string | null
  strings_model_id: string | null
  strings_model_name: string | null
  created_at: string
  updated_at: string
}

export interface MaintenanceLog {
  log_id: string
  gear_id: string
  event_type: string
  notes: string | null
  event_date: string | null
  created_at: string
}

export interface AuditEntry {
  audit_id: string
  table_name: string
  record_id: string
  operation: string
  performed_by: string
  performed_at: string
  acknowledged_at: string | null
  acknowledged_by: string | null
  undone_at: string | null
  undone_by: string | null
  record_display_name: string | null
}

export interface AuditEntryWithData extends AuditEntry {
  old_data: Record<string, unknown> | null
  new_data: Record<string, unknown> | null
}

export interface ChangeReviewResponse {
  total: number
  page: number
  page_size: number
  entries: AuditEntry[]
}

export interface SearchResult {
  table: string
  id: string
  name: string
  brand_name: string | null
  rank: number
}

export interface SearchResponse {
  results: SearchResult[]
  total: number
}

// ---------------------------------------------------------------------------
// Plugin Scanner — Workbench (U-04)
// ---------------------------------------------------------------------------

export type WorkbenchBucket = 'unlinked' | 'orphaned' | 'needs_review' | 'known' | 'excluded'

export interface WorkbenchRow {
  result_id: string
  disk_name: string
  disk_vendor: string
  disk_version: string
  disk_format: string
  disk_path: string
  display_name: string
  display_vendor: string
  catalog_record_id: string | null
  catalog_record_table: string | null
  catalog_record_name: string | null
  catalog_record_vendor: string | null
  catalog_record_version: string | null
  bucket: WorkbenchBucket
  confidence: string | null
  confirmed_at: string | null
  confirmed_by: string | null
}

export interface OrphanedRecord {
  catalog_record_id: string
  catalog_record_table: string
  name: string
  vendor: string | null
  version: string | null
  disk_paths: Record<string, unknown>[]
}

export interface WorkbenchResponse {
  rows: WorkbenchRow[]
  orphaned: OrphanedRecord[]
  scan_id: string | null
}

export interface WorkbenchServerParams {
  scan_id?: string
  bucket?: string
  show_confirmed?: boolean
}

export type NeedsReviewSubState = 'version mismatch' | 'unconfirmed' | 'collision'

export interface WorkbenchClientFilters {
  bucket: WorkbenchBucket | ''
  needs_review_substate: NeedsReviewSubState | ''
  catalog_type: string
  format: string
}

export interface FindLinkCandidatesResponse {
  type: 'unlinked' | 'orphaned'
  candidates: WorkbenchRow[] | OrphanedRecord[]
  total: number
}

export interface CreateLinkRequest {
  result_id: string
  catalog_record_id: string
  catalog_record_table: string
}

export interface BulkCreateLinkRequest {
  result_ids: string[]
  catalog_record_id: string
  catalog_record_table: string
}

export interface BulkLinkResult {
  links_created: number
}

export interface SoftResetResult {
  type: 'soft'
  rules_disabled: number
}

export interface HardResetRequest {
  confirmation_text: string
}

export interface HardResetResult {
  type: 'hard'
  records_wiped: number
  seeded_rules_restored: number
}

export interface SelectionState {
  selectedIds: Set<string>
  lastClickedIndex: number | null
}

export type FieldSource = 'disk' | 'catalog'

export interface SingleResolutionInput {
  nameSource: FieldSource
  vendorSource: FieldSource
  versionSource: FieldSource
}

export type FieldChoice = 'a' | 'b' | 'catalog'

export interface CollisionResolutionInput {
  nameChoice: FieldChoice
  vendorChoice: FieldChoice
  versionChoice: FieldChoice
}

export interface BulkAuditActionRequest {
  audit_ids: string[]
}

export interface BulkActionResult {
  count: number
}

// ---------------------------------------------------------------------------
// Plugin Scanner
// ---------------------------------------------------------------------------

export interface StatusCounts {
  known: number
  matched: number
  conflicted: number
  unconfirmed: number
  untracked: number
  orphaned: number
  ignored: number
}

export interface ScannerApiKeyResponse {
  key_id: string
  label: string
  key_hint: string
  created_at: string
  revoked_at: string | null
}

export interface ScannerApiKeyCreated extends ScannerApiKeyResponse {
  key: string
}

export interface MatchMeta {
  confidence: string
  score: number | null
  record_id: string | null
  record_table: string | null
  record_name: string | null
  record_vendor: string | null
  record_version: string | null
  catalog_disk_paths: PluginPathEntry[]
}

export interface CatalogSearchResult {
  record_id: string
  record_table: string
  name: string
  vendor: string | null
  version: string | null
}

export interface ScanResult {
  result_id: string
  status: 'known' | 'matched' | 'conflicted' | 'unconfirmed' | 'untracked' | 'orphaned' | 'ignored'
  name: string
  vendor: string
  version: string
  format: string
  path: string
  match: MatchMeta | null
  dismissed_at: string | null
  confirmed_at: string | null
}

export interface AbsentRecord {
  record_id: string
  record_table: string
  name: string
  vendor: string | null
  version: string | null
  disk_paths: PluginPathEntry[]
}

export type ConfirmDecision =
  | { result_id: string; action: 'confirm' | 'reject' | 'ignore' }
  | { result_id: string; action: 'acknowledge' }
  | { result_id: string; action: 'force'; target_id: string; target_table: string }

export interface Exclusion {
  exclusion_id: string
  vendor: string
  name: string
  excluded_at: string
  excluded_by: string | null
  format: string | null
}

export interface ScanListItem {
  scan_id: string
  scanned_at: string
  source_machine: string
  total_count: number
}

export interface RawScanResult {
  result_id: string
  name: string
  vendor: string
  version: string
  format: string
  path: string
  status: string
  confidence: string
}

export interface RawScanReport {
  scan_id: string
  scanned_at: string
  results_by_status: Record<string, RawScanResult[]>
}

export const SCANNER_TABLE_OPTIONS = [
  { value: 'effects',            label: 'Effects' },
  { value: 'instruments',        label: 'Instruments' },
  { value: 'libraries',          label: 'Libraries' },
  { value: 'workstations',       label: 'Workstations' },
  { value: 'admin_tools',        label: 'Admin Tools' },
  { value: 'composition_tools',  label: 'Composition Tools' },
  { value: 'measurement_tools',  label: 'Measurement Tools' },
  { value: 'reference_tools',    label: 'Reference Tools' },
  { value: 'workflow_tools',     label: 'Workflow Tools' },
] as const
