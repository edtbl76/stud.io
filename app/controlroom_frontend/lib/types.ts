export interface TypeRef { id: string; name: string }
export interface ModelRef { id: string; name: string }
export interface ParentRef { table_name: string; id: string; name: string | null }

export interface LookupOut {
  type_id: string
  type_name: string
  type_description: string | null
}

export interface Brand {
  brand_id: string
  legal_name: string | null
  brand_name: string | null
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
  attributes: Record<string, unknown> | null
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
  attributes: Record<string, unknown> | null
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
  created_at: string
  updated_at: string
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
