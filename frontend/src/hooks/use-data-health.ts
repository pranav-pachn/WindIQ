import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import type { DataHealthResponse } from '@/types/api'

export function useDataHealth() {
  return useQuery<DataHealthResponse>({
    queryKey: ['data-health'],
    queryFn: () => api.getDataHealth(),
  })
}

