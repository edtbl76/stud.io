'use client'

import * as React from 'react'
import { RuleSection } from '@/components/tables/scanner/rules/RuleSection'
import { fireRuleToasts } from '@/components/scanner/RuleToastManager'
import { useRules } from '@/lib/useRules'
import type { VendorRuleInput } from '@/lib/types'

const COLUMNS = [
  { key: 'disk_vendor',    header: 'Disk Vendor' },
  { key: 'catalog_vendor', header: 'Catalog Vendor' },
  { key: 'affected_count', header: 'Affected' },
]

export function VendorMappingsSection() {
  const { vendorRules, isLoading, createVendorRule, toggleRule, deleteRule, updateRule, acknowledgeClean } = useRules()

  async function handleAdd(input: VendorRuleInput) {
    const result = await createVendorRule(input)
    fireRuleToasts({
      ruleLabel: `${input.disk_vendor} → ${input.catalog_vendor}`,
      cleanCount: result.clean_count,
      needsReviewCount: result.needs_review_count,
      ruleId: (result.rule as { rule_id: string }).rule_id,
      ruleType: 'vendor',
      acknowledgeClean,
    })
    return result
  }

  return (
    <RuleSection
      title="Vendor Mappings"
      description="Normalize disk vendor names to catalog vendor names."
      rules={vendorRules}
      columns={COLUMNS}
      ruleType="vendor"
      onToggle={(id, enabled) => toggleRule(id, 'vendor', enabled)}
      onDelete={(id) => deleteRule(id, 'vendor')}
      onEdit={(id, value) => updateRule(id, 'vendor', value)}
      onAdd={handleAdd as never}
      isLoading={isLoading}
    />
  )
}
