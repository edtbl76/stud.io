/** A sortable field definition — mirrors the BulkEditField pattern. */
export interface SortField {
  /** Field key on the row object (or backend sort_by param for paginated tables). */
  key: string
  /** Human-readable label shown in the sort picker. */
  label: string
}
