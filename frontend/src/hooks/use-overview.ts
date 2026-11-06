import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import type { OverviewResponse } from '@/types/api'

export function usePlatformOverview() {
  return useQuery<OverviewResponse>({
    queryKey: ['overview'],
    queryFn: () => api.getOverview(),
  })
}

