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

      // Concurrently probe liveness (pure HTTP round-trip) and readiness (DB connectivity)
      const [liveResult, readyResult] = await Promise.allSettled([
        api.checkLiveness().then((data) => ({
          data,
          latencyMs: Math.round(performance.now() - start),
        })),
        api.checkReadiness(),
      ])

      const isLive = liveResult.status === 'fulfilled'
      const isReady = readyResult.status === 'fulfilled'

      // If neither responds, backend is completely offline
      if (!isLive && !isReady) {
        return {
          isConnected: false,
          isDbReady: false,
          latencyMs: null,
          lastChecked: new Date(),
        }
      }

      // If liveness probe succeeded, use its pure HTTP round-trip latency; otherwise fallback to elapsed
      const latencyMs = isLive
        ? liveResult.value.latencyMs
        : Math.round(performance.now() - start)

      const isDbReady = isReady && readyResult.value.database === 'connected'
      const version =
        (isReady && readyResult.value.version) ||
        (isLive && liveResult.value.data.version) ||
        '2.2.0'

      return {
        isConnected: true,
        isDbReady,
        latencyMs,
        lastChecked: new Date(),
        version,
      }
    },
    refetchInterval: 30000, // Check every 30 seconds
    retry: 1,
  })
}
