import { CATALOG_ROUTES } from '@/lib/catalogNavigation'

export interface SearchTableMeta {
  label: string
  path: string
  endpoint: string
}

export const SEARCH_TABLE_META: Record<string, SearchTableMeta> = {
  brands:            { label: 'Brands',            path: CATALOG_ROUTES.brands,            endpoint: '/studio/catalog/brands' },
  models:            { label: 'Models',            path: CATALOG_ROUTES.models,            endpoint: '/studio/catalog/models' },
  effects:           { label: 'Effects',           path: CATALOG_ROUTES.effects,           endpoint: '/studio/session/effects' },
  instruments:       { label: 'Instruments',       path: CATALOG_ROUTES.instruments,       endpoint: '/studio/session/instruments' },
  libraries:         { label: 'Libraries',         path: CATALOG_ROUTES.libraries,         endpoint: '/studio/session/libraries' },
  workstations:      { label: 'Workstations',      path: CATALOG_ROUTES.workstations,      endpoint: '/studio/session/workstations' },
  workflow_tools:    { label: 'Workflow Tools',    path: CATALOG_ROUTES.workflow_tools,    endpoint: '/studio/tools/workflow' },
  measurement_tools: { label: 'Measurement Tools', path: CATALOG_ROUTES.measurement_tools, endpoint: '/studio/tools/measurement' },
  reference_tools:   { label: 'Reference Tools',   path: CATALOG_ROUTES.reference_tools,   endpoint: '/studio/tools/reference' },
  composition_tools: { label: 'Composition Tools', path: CATALOG_ROUTES.composition_tools, endpoint: '/studio/tools/composition' },
  admin_tools:       { label: 'Admin Tools',       path: CATALOG_ROUTES.admin_tools,       endpoint: '/studio/tools/admin' },
}
