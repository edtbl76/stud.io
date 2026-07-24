import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { WORKBENCH_KEY } from '@/lib/useWorkbench'
import type { RuleType } from '@/lib/types'

// U-21: the Acknowledge All affordance on the resolution rule-creation toast.
// A dedicated capability so the Scan Workbench can acknowledge a rule's clean
// records and refresh its list WITHOUT pulling in useRules() (and its rules-list
// fetch) that the workbench never displays (BR-U21-13).
export function useAcknowledgeClean(): (id: string, type: RuleType) => Promise<number> {
  const qc = useQueryClient()

  const acknowledge = useMutation({
    mutationFn: ({ id, type }: { id: string; type: RuleType }) => api.scanner.acknowledgeClean(id, type),
    onSuccess: () => qc.invalidateQueries({ queryKey: WORKBENCH_KEY }),
    onError: () => toast.error('Could not acknowledge the cleaned records. Please try again.'),
  })

  // The sole caller (the "Acknowledge All" toast action) fires this and forgets it,
  // so the returned promise must never reject — a rejection there would be unhandled.
  // The failure is surfaced by onError above; here we resolve to 0 acknowledged.
  return async (id: string, type: RuleType) => {
    try {
      const result = await acknowledge.mutateAsync({ id, type })
      return result.acknowledged
    } catch {
      return 0
    }
  }
}
