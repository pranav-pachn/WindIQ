import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api-client'

export interface ApiStatus {
  isConnected: boolean
  isDbReady: boolean
  latencyMs: number | null
  lastChecked: Date | null
  version?: string
}

export function useApiHealth() {
  return useQuery<ApiStatus>({
    queryKey: ['api-health'],
    queryFn: async () => {
      const start = performance.now()
      try {
        const readyData = await api.checkReadiness()
        const latencyMs = Math.round(performance.now() - start)
        return {
          isConnected: true,
          isDbReady: readyData.database === 'connected',
          latencyMs,
          lastChecked: new Date(),
          version: readyData.version,
        }
      } catch {
        return {
          isConnected: false,
          isDbReady: false,
          latencyMs: null,
          lastChecked: new Date(),
        }
      }
    },
    refetchInterval: 30000, // Check every 30 seconds
  })
}

