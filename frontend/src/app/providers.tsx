import React from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from '@/lib/query-client'
import { EvaluationPeriodProvider } from '@/context/evaluation-period-context'
import { AuthProvider } from '@/context/auth-context'

interface ProvidersProps {
  children: React.ReactNode
}

export function Providers({ children }: ProvidersProps) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <EvaluationPeriodProvider>
          {children}
        </EvaluationPeriodProvider>
      </AuthProvider>
    </QueryClientProvider>
  )
}
