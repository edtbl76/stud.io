export interface BulkEditField {
  /** Field key on the record row, used to read existing values for merge. */
  key: string
  /** Human-readable label shown in the field picker. */
  label: string
  /**
   * multiselect  — multi-value lookup; merges with existing IDs on apply (non-destructive).
   * singleselect — single-value lookup; overwrites on apply.
   * text         — free-text input; overwrites on apply.
   */
  type: 'multiselect' | 'singleselect' | 'text' | 'parentsearch'
  /** Config slug for MultiSelect — required when type is multiselect or singleselect. */
  configSlug?: string
}
