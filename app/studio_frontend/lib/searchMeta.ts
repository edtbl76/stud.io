export interface SearchTableMeta {
  label: string
  path: string
  endpoint: string
}

export const SEARCH_TABLE_META: Record<string, SearchTableMeta> = {
  brands:            { label: 'Brands',            path: '/studio/catalog/brands',        endpoint: '/studio/catalog/brands' },
  models:            { label: 'Models',            path: '/studio/catalog/models',        endpoint: '/studio/catalog/models' },
  effects:           { label: 'Effects',           path: '/controlroom/session/effects',       endpoint: '/studio/session/effects' },
  instruments:       { label: 'Instruments',       path: '/controlroom/session/instruments',   endpoint: '/studio/session/instruments' },
  libraries:         { label: 'Libraries',         path: '/controlroom/session/libraries',     endpoint: '/studio/session/libraries' },
  workstations:      { label: 'Workstations',      path: '/controlroom/session/workstations',  endpoint: '/studio/session/workstations' },
  workflow_tools:    { label: 'Workflow Tools',    path: '/controlroom/tools/workflow',         endpoint: '/studio/tools/workflow' },
  measurement_tools: { label: 'Measurement Tools', path: '/controlroom/tools/measurement',     endpoint: '/studio/tools/measurement' },
  reference_tools:   { label: 'Reference Tools',   path: '/controlroom/tools/reference',       endpoint: '/studio/tools/reference' },
  composition_tools: { label: 'Composition Tools', path: '/controlroom/tools/composition',     endpoint: '/studio/tools/composition' },
  admin_tools:       { label: 'Admin Tools',       path: '/controlroom/tools/admin',           endpoint: '/studio/tools/admin' },
}
