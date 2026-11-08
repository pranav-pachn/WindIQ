import { Database, Clock, Cpu, CheckCircle2, AlertTriangle, Calendar } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatUtcDateTime, formatLondonDateTime, formatDate } from '@/lib/formatters'
import type { DatasetHealthInfo, DataHealthResponse, EvaluationPeriodInfo } from '@/types/api'

interface DataFreshnessCardProps {
  datasetHealth: DatasetHealthInfo
  detailedHealth?: DataHealthResponse
  evaluationPeriod?: EvaluationPeriodInfo
}

function formatPipelineAge(utcTimestamp?: string | null): string {
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
  evaluationPeriod,
}: DataFreshnessCardProps) {
  const scheduler = detailedHealth?.scheduler
  // Strictly require enabled === true AND status === 'RUNNING' to claim running scheduler
  const isSchedulerActive = Boolean(scheduler?.enabled) && scheduler?.status === 'RUNNING'
  // Only claim leader lock if scheduler is actually active and enabled
  const isLeader = isSchedulerActive && Boolean(scheduler?.is_leader)

  const pipelineAge = formatPipelineAge(datasetHealth.last_successful_ingestion_utc)
  const isBenchmarkEnd = evaluationPeriod?.delivery_end_date === '2026-02-01'
  const sourceBadgeText = isBenchmarkEnd ? 'Jan 2026 Benchmark' : 'Source Horizon'
  const sourceHorizonDate = evaluationPeriod?.delivery_end_date
    ? `${formatDate(evaluationPeriod.delivery_end_date)} 23:00 UTC`
    : '01 Feb 2026, 23:00 UTC'
  const evalHoursText = evaluationPeriod?.total_evaluation_hours
    ? `${evaluationPeriod.total_evaluation_hours.toLocaleString()} Evaluated Hrs`
    : '744 Evaluated Hrs'

  return (
    <Card className="h-full flex flex-col bg-[#111C2D] border-[#26364A]">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xs">
            <Database className="w-4 h-4 text-[#35B9C8]" />
            <span>Data Freshness &amp; Ingestion</span>
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

      <CardContent className="space-y-3.5 flex-1 flex flex-col justify-between">
        {/* Dual Timestamps: Ingestion Run vs Source Data Boundary */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {/* Latest Pipeline Ingestion Run */}
          <div className="rounded-lg p-2.5 bg-[#162337] border border-[#26364A] space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[#9AAABD] flex items-center gap-1 font-medium text-[11px]">
                <Clock className="w-3 h-3 text-[#718198]" />
                Latest Ingestion Run
              </span>
              <span className="text-[10px] font-mono text-[#35B98A] px-1.5 py-0.2 rounded bg-[#133829] border border-[#1C523B]">
                {pipelineAge}
              </span>
            </div>
            <div className="font-mono text-xs font-semibold text-[#E7EDF5] tabular-nums">
              {formatUtcDateTime(datasetHealth.last_successful_ingestion_utc)}
            </div>
            <div className="text-[10px] font-mono text-[#718198] flex items-center justify-between pt-0.5">
              <span>Local: {formatLondonDateTime(datasetHealth.last_successful_ingestion_utc)}</span>
              <span>BMRS Ingestion</span>
            </div>
          </div>

          {/* Latest Available Source Data */}
          <div className="rounded-lg p-2.5 bg-[#162337] border border-[#26364A] space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[#9AAABD] flex items-center gap-1 font-medium text-[11px]">
                <Calendar className="w-3 h-3 text-[#718198]" />
                Available Source Data
              </span>
              <span className="text-[10px] font-mono text-[#35B9C8] px-1.5 py-0.2 rounded bg-[#0E2833] border border-[#183E4C]">
                {sourceBadgeText}
              </span>
            </div>
            <div className="font-mono text-xs font-semibold text-[#E7EDF5] tabular-nums">
              {sourceHorizonDate}
            </div>
            <div className="text-[10px] font-mono text-[#718198] flex items-center justify-between pt-0.5">
              <span>Elexon Delivery Horizon</span>
              <span>{evalHoursText}</span>
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
                {isSchedulerActive ? 'Active Polling' : 'Static Benchmark Mode (Cloud Demo)'}
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
                : 'Automated background scheduler is paused in cloud demo mode. The platform serves deterministic, verified January 2026 Elexon benchmark data.'}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
