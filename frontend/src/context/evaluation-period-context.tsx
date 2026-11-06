import React, { useState } from 'react'
import { JANUARY_BENCHMARK_PERIOD } from '@/lib/constants'
import {
  EvaluationPeriodContext,
  type EvaluationPeriodState,
} from './evaluation-period-state'

export function EvaluationPeriodProvider({ children }: { children: React.ReactNode }) {
  const [period, setPeriod] = useState<EvaluationPeriodState>(JANUARY_BENCHMARK_PERIOD)

  const resetToBenchmark = () => {
    setPeriod(JANUARY_BENCHMARK_PERIOD)
  }

  return (
    <EvaluationPeriodContext.Provider value={{ period, setPeriod, resetToBenchmark }}>
      {children}
    </EvaluationPeriodContext.Provider>
  )
}
