// Extends TanStack Table's ColumnMeta interface for all column definitions in this project.
// filterParam: the backend filter_* param suffix to use for this column.
//   When absent, the column's id is used as the suffix.
// filterOperators: subset of FilterOperator values available for this column.
//   Omit for EXISTS-subquery columns (types, tags, models) — they only support 'contains'.
//   When absent, all operators are offered.
//
// This import makes the file a TypeScript module, which is required for
// `declare module` to work as an augmentation rather than a global override.
import type { ColumnDef } from '@tanstack/react-table'
import type { FilterOperator } from '@/lib/filterOperators'

type _EnsureModule = ColumnDef<unknown, unknown>

declare module '@tanstack/react-table' {
  interface ColumnMeta<TData, TValue> {
    filterParam?: string
    filterOperators?: FilterOperator[]
    defaultHidden?: boolean
  }
}
