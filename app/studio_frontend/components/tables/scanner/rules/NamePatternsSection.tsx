'use client'

import * as React from 'react'
import { RuleSection } from '@/components/tables/scanner/rules/RuleSection'
import { fireRuleToasts } from '@/components/scanner/RuleToastManager'
import { useRules } from '@/lib/useRules'
import type { PatternRuleInput } from '@/lib/types'

const COLUMNS = [
  { key: 'label',        header: 'Label' },
  { key: 'pattern',      header: 'Pattern' },
  { key: 'match_fields', header: 'Match Fields' },
  { key: 'action',       header: 'Action' },
]

export function NamePatternsSection() {
  const { patternRules, isLoading, createPatternRule, toggleRule, deleteRule, acknowledgeClean } = useRules()

  async function handleAdd(input: PatternRuleInput) {
    const result = await createPatternRule(input)
    fireRuleToasts({
      ruleLabel: input.label,
      cleanCount: result.clean_count,
      needsReviewCount: result.needs_review_count,
      ruleId: (result.rule as { rule_id: string }).rule_id,
      ruleType: 'pattern',
      acknowledgeClean,
    })
    return result
  }

  return (
    <RuleSection
      title="Name Patterns"
      description="Pattern-based rules for aliasing variant plugin names."
      rules={patternRules}
      columns={COLUMNS}
      ruleType="pattern"
      onToggle={(id, enabled) => toggleRule(id, 'pattern', enabled)}
      onDelete={(id) => deleteRule(id, 'pattern')}
      onEdit={(_id, _value) => {}}
      onAdd={handleAdd as never}
      isLoading={isLoading}
    />
  )
}
