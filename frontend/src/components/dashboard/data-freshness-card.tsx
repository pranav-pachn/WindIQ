import { Database, Clock, RefreshCw, Cpu, CheckCircle2 } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatUtcDateTime, formatLondonDateTime } from '@/lib/formatters'
import type { DatasetHealthInfo, DataHealthResponse } from '@/types/api'

interface DataFreshnessCardProps {
  datasetHealth: DatasetHealthInfo
  detailedHealth?: DataHealthResponse
}

export function DataFreshnessCard({
  datasetHealth,
  detailedHealth,
}: DataFreshnessCardProps) {
  const scheduler = detailedHealth?.scheduler
  const isSchedulerRunning = scheduler?.status === 'RUNNING'
  const isLeader = scheduler?.is_leader ?? true

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xs">
            <Database className="w-4 h-4 text-cyan-400" />
            <span>Data Freshness & Pipeline Status</span>
          </CardTitle>
          <Badge variant="neutral" size="sm">
            <RefreshCw className="w-2.5 h-2.5 text-cyan-400" />
            <span>Scheduled Polling (15m / 30m)</span>
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 flex-1 flex flex-col justify-between">
        {/* Timestamp Info */}
        <div className="rounded-lg p-3 bg-slate-900/80 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              Latest Ingestion
            </span>
            <Badge variant="success" size="sm">
              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
              <span>Pipeline Active</span>
            </Badge>
          </div>

          <div className="space-y-0.5">
            <div className="font-mono text-sm font-semibold text-slate-100">
              {formatUtcDateTime(datasetHealth.last_successful_ingestion_utc)}
            </div>
            <div className="text-[11px] font-mono text-slate-400">
              {formatLondonDateTime(datasetHealth.last_successful_ingestion_utc)}
            </div>
          </div>
        </div>

        {/* Dataset Storage Statistics */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="p-2.5 rounded bg-[#0b1120] border border-slate-800/80">
            <span className="text-[11px] text-slate-400 block mb-0.5">
              WINDFOR Publications
            </span>
            <span className="font-mono text-base font-bold text-cyan-300">
              {datasetHealth.raw_windfor_records.toLocaleString()}
            </span>
            <span className="text-[10px] text-slate-400 block mt-0.5">
              Source: Elexon BMRS
            </span>
          </div>

          <div className="p-2.5 rounded bg-[#0b1120] border border-slate-800/80">
            <span className="text-[11px] text-slate-400 block mb-0.5">
              FUELHH Half-Hours
            </span>
            <span className="font-mono text-base font-bold text-emerald-300">
              {datasetHealth.raw_fuelhh_readings.toLocaleString()}
            </span>
            <span className="text-[10px] text-slate-400 block mt-0.5">
              Settlement readings
            </span>
          </div>
        </div>

        {/* Scheduler Architecture Status */}
        <div className="rounded bg-[#0b1120] p-2.5 border border-slate-800/80 flex items-start gap-2 text-[11px] text-slate-400">
          <Cpu className="w-3.5 h-3.5 text-cyan-400 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <strong className="text-slate-300">Orchestrator: </strong>
              <span className="font-mono text-slate-200">
                {isSchedulerRunning ? 'Running' : 'Standby'}
              </span>
              {isLeader && (
                <span className="text-[9px] font-mono text-cyan-400 bg-cyan-950/80 border border-cyan-800/50 px-1 rounded">
                  Postgres Advisory Lock Elected
                </span>
              )}
            </div>
            <p className="text-[10px] text-slate-400 leading-snug">
              Automated scheduler polls BMRS endpoints asynchronously. Evaluations are locked at 09:00 UK cutoff without fabricated real-time streaming.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

