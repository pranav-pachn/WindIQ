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
        // 1. Try full readiness (DB + Redis)
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
        // 2. Fall back to liveness check before claiming offline
        try {
          await api.checkLiveness()
          const latencyMs = Math.round(performance.now() - start)
          return {
            isConnected: true,
            isDbReady: false,
            latencyMs,
            lastChecked: new Date(),
          }
        } catch {
          return {
            isConnected: false,
            isDbReady: false,
            latencyMs: null,
            lastChecked: new Date(),
          }
        }
      }
    },
    refetchInterval: 30000, // Check every 30 seconds
    retry: 1,
  })
}
