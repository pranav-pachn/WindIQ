import { useContext } from 'react'
import { EvaluationPeriodContext } from '@/context/evaluation-period-state'

export function useEvaluationPeriod() {
  const context = useContext(EvaluationPeriodContext)
  if (!context) {
    throw new Error('useEvaluationPeriod must be used within an EvaluationPeriodProvider')
  }
  return context
}
