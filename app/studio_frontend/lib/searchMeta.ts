export interface SearchTableMeta {
  label: string
  path: string
  endpoint: string
}

export const SEARCH_TABLE_META: Record<string, SearchTableMeta> = {
  brands:            { label: 'Brands',            path: '/controlroom/catalog/brands',        endpoint: '/brands' },
  models:            { label: 'Models',            path: '/controlroom/catalog/models',        endpoint: '/models' },
  effects:           { label: 'Effects',           path: '/controlroom/session/effects',       endpoint: '/effects' },
  instruments:       { label: 'Instruments',       path: '/controlroom/session/instruments',   endpoint: '/instruments' },
  libraries:         { label: 'Libraries',         path: '/controlroom/session/libraries',     endpoint: '/libraries' },
  workstations:      { label: 'Workstations',      path: '/controlroom/session/workstations',  endpoint: '/workstations' },
  workflow_tools:    { label: 'Workflow Tools',    path: '/controlroom/tools/workflow',         endpoint: '/tools/workflow' },
  measurement_tools: { label: 'Measurement Tools', path: '/controlroom/tools/measurement',     endpoint: '/tools/measurement' },
  reference_tools:   { label: 'Reference Tools',   path: '/controlroom/tools/reference',       endpoint: '/tools/reference' },
  composition_tools: { label: 'Composition Tools', path: '/controlroom/tools/composition',     endpoint: '/tools/composition' },
  admin_tools:       { label: 'Admin Tools',       path: '/controlroom/tools/admin',           endpoint: '/tools/admin' },
}
