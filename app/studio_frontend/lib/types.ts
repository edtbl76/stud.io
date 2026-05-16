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
  model_id: string | null
  serial_number: string | null
  year: number | null
  owner_id: string | null
  photo_key: string | null
  notes: string | null
  num_strings: number | null
  tuning: string | null
  pickup_config: string | null
  pickup_neck_model_id: string | null
  pickup_middle_model_id: string | null
  pickup_bridge_model_id: string | null
  strings_model_id: string | null
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

export interface ScanRun {
  scan_id: string
  scanned_at: string
  source_machine: string
  total_count: number
  status?: 'in_progress' | 'completed'
  status_counts: StatusCounts
  confirmation_counts: { confirmed: number; rejected: number; ignored: number }
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

export interface ScanReport {
  scan_id: string
  scanned_at: string
  known: ScanResult[]
  matched: ScanResult[]
  conflicted: ScanResult[]
  unconfirmed: ScanResult[]
  untracked: ScanResult[]
  orphaned: ScanResult[]
  ignored: ScanResult[]
  absent: AbsentRecord[]
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
}

export type ScanSection = 'known' | 'matched' | 'conflicted' | 'unconfirmed' | 'untracked' | 'orphaned' | 'absent' | 'exclusions'

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
