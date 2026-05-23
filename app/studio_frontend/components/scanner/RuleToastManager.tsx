import { toast } from 'sonner'
import type { RuleType } from '@/lib/types'

interface FireRuleToastsParams {
  ruleLabel: string
  cleanCount: number
  needsReviewCount: number
  ruleId: string
  ruleType: RuleType
  acknowledgeClean: (id: string, type: RuleType) => Promise<number>
}

export function fireRuleToasts({ ruleLabel, cleanCount, needsReviewCount, ruleId, ruleType, acknowledgeClean }: FireRuleToastsParams): void {
  toast.success(`Rule added: ${ruleLabel}`)

  if (cleanCount === 0 && needsReviewCount === 0) return

  const message = `${cleanCount} records fully resolved · ${needsReviewCount} others need review`
  const options = cleanCount > 0
    ? { action: { label: 'Acknowledge All', onClick: () => acknowledgeClean(ruleId, ruleType) } }
    : undefined

  toast.info(message, options)
}
