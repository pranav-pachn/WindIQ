import { Award, AlertTriangle, Calendar } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { formatNumber, formatDate } from '@/lib/formatters'
import type { DailyAccuracySummary } from '@/types/api'

interface PerformanceExtremesProps {
  summary: DailyAccuracySummary
}

export function PerformanceExtremes({ summary }: PerformanceExtremesProps) {
  return (
    <Card className="bg-[#111C2D] border-[#26364A]">
      <CardHeader className="pb-2">
        <CardTitle className="text-xs">
          <Award className="w-4 h-4 text-[#35B9C8]" />
          <span>Period Performance Extremes (Best &amp; Worst Delivery Days)</span>
        </CardTitle>
      </CardHeader>

      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          {/* Best Day MAE */}
          {summary.best_day_mae && (
            <div className="p-3 rounded-lg bg-[#162337] border border-[#26364A] space-y-1">
              <span className="text-[10px] font-semibold tracking-wider uppercase font-mono text-[#35B98A] block">
                Lowest Error (Best MAE)
              </span>
              <div className="flex items-baseline justify-between">
                <span className="font-mono text-lg font-bold text-[#E7EDF5] tabular-nums">
                  {formatNumber(summary.best_day_mae.value, 1)} <span className="text-xs font-normal text-[#718198]">MW</span>
                </span>
                <span className="text-[11px] font-mono text-[#9AAABD] flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-[#718198]" />
                  {formatDate(summary.best_day_mae.delivery_date)}
                </span>
              </div>
              <p className="text-[10px] text-[#718198] leading-tight">Peak forecast fidelity across hours (19 Jan)</p>
            </div>
          )}

          {/* Worst Day MAE */}
          {summary.worst_day_mae && (
            <div className="p-3 rounded-lg bg-[#162337] border border-[#26364A] space-y-1">
              <span className="text-[10px] font-semibold tracking-wider uppercase font-mono text-[#E7AD4A] block">
                Highest Error (Worst MAE)
              </span>
              <div className="flex items-baseline justify-between">
                <span className="font-mono text-lg font-bold text-[#E7EDF5] tabular-nums">
                  {formatNumber(summary.worst_day_mae.value, 1)} <span className="text-xs font-normal text-[#718198]">MW</span>
                </span>
                <span className="text-[11px] font-mono text-[#9AAABD] flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3 text-[#E7AD4A]" />
                  {formatDate(summary.worst_day_mae.delivery_date)}
                </span>
              </div>
              <p className="text-[10px] text-[#718198] leading-tight">Maximum day-ahead divergence (28 Jan)</p>
            </div>
          )}

          {/* Best Day MAPE */}
          {summary.best_day_mape && (
            <div className="p-3 rounded-lg bg-[#162337] border border-[#26364A] space-y-1">
              <span className="text-[10px] font-semibold tracking-wider uppercase font-mono text-[#35B98A] block">
                Lowest Relative Error (Best MAPE)
              </span>
              <div className="flex items-baseline justify-between">
                <span className="font-mono text-lg font-bold text-[#E7EDF5] tabular-nums">
                  {formatNumber(summary.best_day_mape.value, 1)} <span className="text-xs font-normal text-[#718198]">%</span>
                </span>
                <span className="text-[11px] font-mono text-[#9AAABD] flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-[#718198]" />
                  {formatDate(summary.best_day_mape.delivery_date)}
                </span>
              </div>
              <p className="text-[10px] text-[#718198] leading-tight">Optimal relative generation match (20 Jan)</p>
            </div>
          )}

          {/* Worst Day MAPE */}
          {summary.worst_day_mape && (
            <div className="p-3 rounded-lg bg-[#162337] border border-[#26364A] space-y-1">
              <span className="text-[10px] font-semibold tracking-wider uppercase font-mono text-[#E7AD4A] block">
                Highest Relative Error (Worst MAPE)
              </span>
              <div className="flex items-baseline justify-between">
                <span className="font-mono text-lg font-bold text-[#E7EDF5] tabular-nums">
                  {formatNumber(summary.worst_day_mape.value, 1)} <span className="text-xs font-normal text-[#718198]">%</span>
                </span>
                <span className="text-[11px] font-mono text-[#9AAABD] flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3 text-[#E7AD4A]" />
                  {formatDate(summary.worst_day_mape.delivery_date)}
                </span>
              </div>
              <p className="text-[10px] text-[#718198] leading-tight">Low generation magnifies % error (28 Jan)</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
