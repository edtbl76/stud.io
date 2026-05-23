'use client'

import * as React from 'react'
import { RuleSection } from '@/components/tables/scanner/rules/RuleSection'
import { fireRuleToasts } from '@/components/scanner/RuleToastManager'
import { useRules } from '@/lib/useRules'
import type { NameRuleInput } from '@/lib/types'

const COLUMNS = [
  { key: 'disk_name',    header: 'Disk Name' },
  { key: 'catalog_name', header: 'Catalog Name' },
  { key: 'affected_count', header: 'Affected' },
]

export function NameMappingsSection() {
  const { nameRules, isLoading, createNameRule, toggleRule, deleteRule, updateRule, acknowledgeClean } = useRules()

  async function handleAdd(input: NameRuleInput) {
    const result = await createNameRule(input)
    fireRuleToasts({
      ruleLabel: `${input.disk_name} → ${input.catalog_name}`,
      cleanCount: result.clean_count,
      needsReviewCount: result.needs_review_count,
      ruleId: (result.rule as { rule_id: string }).rule_id,
      ruleType: 'name',
      acknowledgeClean,
    })
    return result
  }

  return (
    <RuleSection
      title="Name Mappings"
      description="Normalize disk plugin names to catalog names."
      rules={nameRules}
      columns={COLUMNS}
      ruleType="name"
      onToggle={(id, enabled) => toggleRule(id, 'name', enabled)}
      onDelete={(id) => deleteRule(id, 'name')}
      onEdit={(id, value) => updateRule(id, 'name', value)}
      onAdd={handleAdd as never}
      isLoading={isLoading}
    />
  )
}
