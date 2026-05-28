export const CATALOG_ROUTES: Record<string, string> = {
  effects:           '/controlroom/session/effects',
  instruments:       '/controlroom/session/instruments',
  libraries:         '/controlroom/session/libraries',
  workstations:      '/controlroom/session/workstations',
  workflow_tools:    '/controlroom/tools/workflow',
  measurement_tools: '/controlroom/tools/measurement',
  reference_tools:   '/controlroom/tools/reference',
  composition_tools: '/controlroom/tools/composition',
  admin_tools:       '/controlroom/tools/admin',
  brands:            '/studio/catalog/brands',
  models:            '/studio/catalog/models',
}

export function catalogRecordPath(table: string, id: string): string | null {
  if (!Object.hasOwn(CATALOG_ROUTES, table)) return null
  return `${CATALOG_ROUTES[table]}?open=${id}`
}
