import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { WORKBENCH_KEY } from '@/lib/useWorkbench'
import type { NameRuleInput, PatternRuleInput, RuleType, VendorRuleInput } from '@/lib/types'

const RULES_KEY = ['scanner', 'rules'] as const

export function useRules() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: RULES_KEY, queryFn: api.scanner.rules })

  function invalidateBoth() {
    qc.invalidateQueries({ queryKey: RULES_KEY })
    qc.invalidateQueries({ queryKey: WORKBENCH_KEY })
  }

  const createVendorRule = useMutation({
    mutationFn: (input: VendorRuleInput) => api.scanner.createVendorRule(input),
    onSuccess: invalidateBoth,
  })

  const createNameRule = useMutation({
    mutationFn: (input: NameRuleInput) => api.scanner.createNameRule(input),
    onSuccess: invalidateBoth,
  })

  const createPatternRule = useMutation({
    mutationFn: (input: PatternRuleInput) => api.scanner.createPatternRule(input),
    onSuccess: invalidateBoth,
  })

  const toggleRule = useMutation({
    mutationFn: ({ id, type, enabled }: { id: string; type: RuleType; enabled: boolean }) =>
      api.scanner.toggleRule(id, type, enabled),
    onSuccess: invalidateBoth,
  })

  const deleteRule = useMutation({
    mutationFn: ({ id, type }: { id: string; type: RuleType }) => api.scanner.deleteRule(id, type),
    onSuccess: invalidateBoth,
  })

  const updateRule = useMutation({
    mutationFn: ({ id, type, catalogValue }: { id: string; type: 'vendor' | 'name'; catalogValue: string }) =>
      api.scanner.updateRule({ id, type, catalogValue }),
    onSuccess: invalidateBoth,
  })

  const acknowledgeClean = useMutation({
    mutationFn: ({ id, type }: { id: string; type: RuleType }) => api.scanner.acknowledgeClean(id, type),
    onSuccess: () => qc.invalidateQueries({ queryKey: WORKBENCH_KEY }),
  })

  return {
    vendorRules: data?.vendor ?? [],
    nameRules: data?.name ?? [],
    patternRules: data?.pattern ?? [],
    isLoading,
    createVendorRule: (input: VendorRuleInput) => createVendorRule.mutateAsync(input),
    createNameRule: (input: NameRuleInput) => createNameRule.mutateAsync(input),
    createPatternRule: (input: PatternRuleInput) => createPatternRule.mutateAsync(input),
    updateRule: (id: string, type: 'vendor' | 'name', catalogValue: string) => updateRule.mutateAsync({ id, type, catalogValue }),
    toggleRule: (id: string, type: RuleType, enabled: boolean) => toggleRule.mutateAsync({ id, type, enabled }),
    deleteRule: (id: string, type: RuleType) => deleteRule.mutateAsync({ id, type }),
    acknowledgeClean: async (id: string, type: RuleType) => {
      const result = await acknowledgeClean.mutateAsync({ id, type })
      return result.acknowledged
    },
  }
}
