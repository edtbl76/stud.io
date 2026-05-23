import { fireRuleToasts } from '@/components/scanner/RuleToastManager'
import type { RuleType } from '@/lib/types'

const mockToastSuccess = jest.fn()
const mockToastInfo = jest.fn()
jest.mock('sonner', () => ({ toast: { success: (...a: unknown[]) => mockToastSuccess(...a), info: (...a: unknown[]) => mockToastInfo(...a) } }))

const acknowledgeClean = jest.fn().mockResolvedValue(3)

const base = { ruleLabel: 'ikmultimedia → IK Multimedia', ruleId: 'v1', ruleType: 'vendor' as RuleType, acknowledgeClean }

beforeEach(() => { jest.clearAllMocks() })

// Step 18
it('calls toast.success with the rule label', () => {
  fireRuleToasts({ ...base, cleanCount: 0, needsReviewCount: 0 })
  expect(mockToastSuccess).toHaveBeenCalledWith(expect.stringContaining('ikmultimedia → IK Multimedia'))
})

// Step 19
it('calls toast.info with clean and needs-review counts when non-zero', () => {
  fireRuleToasts({ ...base, cleanCount: 5, needsReviewCount: 3 })
  expect(mockToastInfo).toHaveBeenCalledWith(expect.stringContaining('5'), expect.anything())
})

// Step 20
it('suppresses toast.info when both counts are zero', () => {
  fireRuleToasts({ ...base, cleanCount: 0, needsReviewCount: 0 })
  expect(mockToastInfo).not.toHaveBeenCalled()
})

// Step 21
it('includes Acknowledge All action in toast.info when cleanCount > 0', () => {
  fireRuleToasts({ ...base, cleanCount: 5, needsReviewCount: 0 })
  const [, options] = mockToastInfo.mock.calls[0]
  expect(options?.action?.label).toBe('Acknowledge All')
})

// Step 22
it('clicking Acknowledge All calls acknowledgeClean with ruleId and ruleType', () => {
  fireRuleToasts({ ...base, cleanCount: 5, needsReviewCount: 0 })
  const [, options] = mockToastInfo.mock.calls[0]
  options.action.onClick()
  expect(acknowledgeClean).toHaveBeenCalledWith('v1', 'vendor')
})
