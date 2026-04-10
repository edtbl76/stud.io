export interface SearchTableMeta {
  label: string
  path: string
  endpoint: string
}

export const SEARCH_TABLE_META: Record<string, SearchTableMeta> = {
  brands:            { label: 'Brands',            path: '/catalog/brands',        endpoint: '/brands' },
  models:            { label: 'Models',            path: '/catalog/models',        endpoint: '/models' },
  effects:           { label: 'Effects',           path: '/session/effects',       endpoint: '/effects' },
  instruments:       { label: 'Instruments',       path: '/session/instruments',   endpoint: '/instruments' },
  libraries:         { label: 'Libraries',         path: '/session/libraries',     endpoint: '/libraries' },
  workstations:      { label: 'Workstations',      path: '/session/workstations',  endpoint: '/workstations' },
  workflow_tools:    { label: 'Workflow Tools',    path: '/tools/workflow',         endpoint: '/tools/workflow' },
  measurement_tools: { label: 'Measurement Tools', path: '/tools/measurement',     endpoint: '/tools/measurement' },
  reference_tools:   { label: 'Reference Tools',   path: '/tools/reference',       endpoint: '/tools/reference' },
  composition_tools: { label: 'Composition Tools', path: '/tools/composition',     endpoint: '/tools/composition' },
  admin_tools:       { label: 'Admin Tools',       path: '/tools/admin',           endpoint: '/tools/admin' },
}
