import { createContext } from 'react'

export interface EvaluationPeriodState {
  deliveryDateFrom: string
  deliveryDateTo: string
  isBenchmarkPreset: boolean
}

export interface EvaluationPeriodContextType {
  period: EvaluationPeriodState
  setPeriod: (period: EvaluationPeriodState) => void
  resetToBenchmark: () => void
}

export const EvaluationPeriodContext = createContext<EvaluationPeriodContextType | undefined>(undefined)

