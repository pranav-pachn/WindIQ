import { Database, Clock, Cpu, CheckCircle2, AlertTriangle } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatUtcDateTime, formatLondonDateTime } from '@/lib/formatters'
import type { DatasetHealthInfo, DataHealthResponse } from '@/types/api'

interface DataFreshnessCardProps {
  datasetHealth: DatasetHealthInfo
  detailedHealth?: DataHealthResponse
}

function formatDataAge(utcTimestamp?: string | null): string {
  if (!utcTimestamp) return 'No timestamp'
  const date = new Date(utcTimestamp.endsWith('Z') ? utcTimestamp : `${utcTimestamp}Z`)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  if (isNaN(diffMs) || diffMs < 0) return 'Recent'

  const diffMinutes = Math.floor(diffMs / (1000 * 60))
  if (diffMinutes < 60) return `${diffMinutes}m ago`

  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours}h ago`

  const diffDays = Math.floor(diffHours / 24)
  return `${diffDays}d ago`
}

export function DataFreshnessCard({
  datasetHealth,
  detailedHealth,
}: DataFreshnessCardProps) {
  const scheduler = detailedHealth?.scheduler
  // Strictly require enabled === true AND status === 'RUNNING' to claim running scheduler
  const isSchedulerActive = Boolean(scheduler?.enabled) && scheduler?.status === 'RUNNING'
  // Only claim leader lock if scheduler is actually active and enabled
  const isLeader = isSchedulerActive && Boolean(scheduler?.is_leader)

  const dataAge = formatDataAge(datasetHealth.last_successful_ingestion_utc)

  return (
    <Card className="h-full flex flex-col bg-[#111C2D] border-[#26364A]">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xs">
            <Database className="w-4 h-4 text-[#35B9C8]" />
            <span>Data Freshness</span>
          </CardTitle>

          {isSchedulerActive ? (
            <Badge variant="success" size="sm">
              <CheckCircle2 className="w-3 h-3 text-[#35B98A]" />
              <span>Background Scheduler Active</span>
            </Badge>
          ) : (
            <Badge variant="neutral" size="sm">
              <AlertTriangle className="w-3 h-3 text-[#E7AD4A]" />
              <span>Scheduler Disabled — Cloud Demo Mode</span>
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4 flex-1 flex flex-col justify-between">
        {/* Latest Successful Ingestion Timestamp */}
        <div className="rounded-lg p-3 bg-[#162337] border border-[#26364A] space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-[#9AAABD] flex items-center gap-1.5 font-medium">
              <Clock className="w-3.5 h-3.5 text-[#718198]" />
              Latest Successful Ingestion
            </span>
            <span className="text-[10px] font-mono text-[#E7AD4A] px-1.5 py-0.5 rounded bg-[#2A2015] border border-[#48331E]">
              Data Age: {dataAge}
            </span>
          </div>

          <div className="space-y-0.5">
            <div className="font-mono text-sm font-semibold text-[#E7EDF5] tabular-nums">
              {formatUtcDateTime(datasetHealth.last_successful_ingestion_utc)}
            </div>
            <div className="text-[11px] font-mono text-[#718198] flex items-center justify-between">
              <span>Local UK: {formatLondonDateTime(datasetHealth.last_successful_ingestion_utc)}</span>
              <span className="text-[10px] text-[#718198]">Elexon BMRS Verified</span>
            </div>
          </div>
        </div>

        {/* Dataset Storage Statistics */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="p-2.5 rounded bg-[#0E1726] border border-[#1E2B3E]">
            <span className="text-[10px] font-mono text-[#718198] uppercase tracking-wide block mb-0.5">
              WINDFOR Publications
            </span>
            <span className="font-mono text-base font-bold text-[#35B9C8] tabular-nums">
              {datasetHealth.raw_windfor_records.toLocaleString()}
            </span>
            <span className="text-[10px] text-[#718198] block mt-0.5">
              Multi-cycle forecast stream
            </span>
          </div>

          <div className="p-2.5 rounded bg-[#0E1726] border border-[#1E2B3E]">
            <span className="text-[10px] font-mono text-[#718198] uppercase tracking-wide block mb-0.5">
              FUELHH Readings
            </span>
            <span className="font-mono text-base font-bold text-[#E7EDF5] tabular-nums">
              {datasetHealth.raw_fuelhh_readings.toLocaleString()}
            </span>
            <span className="text-[10px] text-[#718198] block mt-0.5">
              Half-hourly outturn readings
            </span>
          </div>
        </div>

        {/* Scheduler & Orchestration State */}
        <div className="rounded bg-[#0E1726] p-2.5 border border-[#1E2B3E] flex items-start gap-2 text-[11px] text-[#718198]">
          <Cpu className="w-3.5 h-3.5 text-[#35B9C8] shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <strong className="text-[#9AAABD]">Ingestion Engine: </strong>
              <span className="font-mono text-[#E7EDF5]">
                {isSchedulerActive ? 'Active Polling' : 'Static Benchmark Mode'}
              </span>
              {isLeader && (
                <span className="text-[9px] font-mono text-[#35B98A] bg-[#0E2833] border border-[#183E4C] px-1 rounded">
                  Leader Lock
                </span>
              )}
            </div>
            <p className="text-[10px] leading-tight text-[#718198]">
              {isSchedulerActive
                ? 'Continuous background polling enabled with PostgreSQL advisory lock coordination.'
                : 'Background polling is paused in free-tier cloud demonstration mode. Serving verified canonical January 2026 Forecast Accuracy benchmark data.'}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
