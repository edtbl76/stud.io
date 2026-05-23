'use client'

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { RuleCreationForm } from '@/components/tables/scanner/rules/RuleCreationForm'
import type { NameRuleInput, PatternRuleInput, RuleCreationResult, RuleType, VendorRuleInput } from '@/lib/types'

interface Column { key: string; header: string }
interface BaseRule { rule_id: string; is_seeded?: boolean; enabled?: boolean }

interface Props {
  readonly title: string
  readonly description: string
  readonly rules: BaseRule[]
  readonly columns: Column[]
  readonly ruleType: RuleType
  readonly onToggle: (id: string, enabled: boolean) => void
  readonly onDelete: (id: string) => void
  readonly onEdit: (id: string, value: string) => void
  readonly onAdd: (input: VendorRuleInput | NameRuleInput | PatternRuleInput) => Promise<RuleCreationResult>
  readonly isLoading: boolean
}

export function RuleSection({ title, description, rules, columns, ruleType, onToggle, onDelete, onEdit, onAdd, isLoading }: Props) {
  const [addOpen, setAddOpen] = React.useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = React.useState<string | null>(null)
  const [editId, setEditId] = React.useState<string | null>(null)
  const [editValue, setEditValue] = React.useState('')

  function handleToggle(rule: BaseRule) {
    onToggle(rule.rule_id, !(rule.enabled ?? true))
  }

  function handleEditSave(id: string) {
    onEdit(id, editValue)
    setEditId(null)
    setEditValue('')
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <Button data-testid="rule-section-add-button" size="sm" onClick={() => setAddOpen(true)}>
          Add Rule
        </Button>
      </div>

      {isLoading ? (
        <div data-testid="rule-section-skeleton" className="h-16 animate-pulse rounded bg-muted" />
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr>{columns.map(c => <th key={c.key} className="text-left py-1">{c.header}</th>)}<th /></tr>
          </thead>
          <tbody>
            {rules.map(rule => (
              <tr key={rule.rule_id} data-testid={`rule-row-${rule.rule_id}`}>
                {columns.map(c => (
                  <td key={c.key} className="py-1 pr-4">
                    {editId === rule.rule_id && c === columns[0]
                      ? <Input data-testid={`rule-edit-input-${rule.rule_id}`} value={editValue} onChange={e => setEditValue(e.target.value)} autoFocus />
                      : String((rule as unknown as Record<string, string | number | boolean | null | undefined>)[c.key] ?? '')}
                  </td>
                ))}
                <td className="py-1">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      data-testid={`rule-toggle-${rule.rule_id}`}
                      checked={rule.enabled ?? true}
                      onChange={() => handleToggle(rule)}
                    />
                    {editId === rule.rule_id ? (
                      <Button size="sm" data-testid={`rule-edit-save-${rule.rule_id}`} onClick={() => handleEditSave(rule.rule_id)}>Save</Button>
                    ) : (
                      <Button size="sm" variant="ghost" data-testid={`rule-edit-${rule.rule_id}`} onClick={() => { setEditId(rule.rule_id); setEditValue(String((rule as unknown as Record<string, string | number | boolean | null | undefined>)[columns[0].key] ?? '')) }}>
                        Edit
                      </Button>
                    )}
                    {!rule.is_seeded && (
                      confirmDeleteId === rule.rule_id ? (
                        <Button size="sm" variant="destructive" data-testid={`rule-delete-confirm-${rule.rule_id}`} onClick={() => { onDelete(rule.rule_id); setConfirmDeleteId(null) }}>
                          Confirm
                        </Button>
                      ) : (
                        <Button size="sm" variant="ghost" data-testid={`rule-delete-${rule.rule_id}`} onClick={() => setConfirmDeleteId(rule.rule_id)}>
                          Delete
                        </Button>
                      )
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Rule</DialogTitle></DialogHeader>
          <RuleCreationForm ruleType={ruleType} onSubmit={onAdd} onClose={() => setAddOpen(false)} />
        </DialogContent>
      </Dialog>
    </section>
  )
}
