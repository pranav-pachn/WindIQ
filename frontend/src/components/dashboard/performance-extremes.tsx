import { Award, AlertTriangle, Calendar } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { formatNumber, formatDate } from '@/lib/formatters'
import type { DailyAccuracySummary } from '@/types/api'

interface PerformanceExtremesProps {
  summary: DailyAccuracySummary
}

export function PerformanceExtremes({ summary }: PerformanceExtremesProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs">
          <Award className="w-4 h-4 text-cyan-400" />
          <span>Period Performance Extremes (Best & Worst Days)</span>
        </CardTitle>
      </CardHeader>

      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          {/* Best Day MAE */}
          {summary.best_day_mae && (
            <div className="p-3 rounded-lg bg-emerald-950/20 border border-emerald-900/40 space-y-1">
              <span className="text-[10px] font-semibold tracking-wider uppercase text-emerald-400 block">
                Lowest Error (Best MAE)
              </span>
              <div className="flex items-baseline justify-between">
                <span className="font-mono text-lg font-bold text-emerald-300">
                  {formatNumber(summary.best_day_mae.value, 1)} <span className="text-xs font-normal">MW</span>
                </span>
                <span className="text-[11px] font-mono text-slate-300 flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-slate-400" />
                  {formatDate(summary.best_day_mae.delivery_date)}
                </span>
              </div>
              <p className="text-[10px] text-slate-400">Peak forecast fidelity across delivery hours</p>
            </div>
          )}

          {/* Worst Day MAE */}
          {summary.worst_day_mae && (
            <div className="p-3 rounded-lg bg-rose-950/20 border border-rose-900/40 space-y-1">
              <span className="text-[10px] font-semibold tracking-wider uppercase text-rose-400 block">
                Highest Error (Worst MAE)
              </span>
              <div className="flex items-baseline justify-between">
                <span className="font-mono text-lg font-bold text-rose-300">
                  {formatNumber(summary.worst_day_mae.value, 1)} <span className="text-xs font-normal">MW</span>
                </span>
                <span className="text-[11px] font-mono text-slate-300 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3 text-rose-400" />
                  {formatDate(summary.worst_day_mae.delivery_date)}
                </span>
              </div>
              <p className="text-[10px] text-slate-400">Maximum weather system divergence</p>
            </div>
          )}

          {/* Best Day MAPE */}
          {summary.best_day_mape && (
            <div className="p-3 rounded-lg bg-emerald-950/20 border border-emerald-900/40 space-y-1">
              <span className="text-[10px] font-semibold tracking-wider uppercase text-emerald-400 block">
                Lowest Relative Error
              </span>
              <div className="flex items-baseline justify-between">
                <span className="font-mono text-lg font-bold text-emerald-300">
                  {formatNumber(summary.best_day_mape.value, 1)} <span className="text-xs font-normal">%</span>
                </span>
                <span className="text-[11px] font-mono text-slate-300 flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-slate-400" />
                  {formatDate(summary.best_day_mape.delivery_date)}
                </span>
              </div>
              <p className="text-[10px] text-slate-400">Optimal relative generation match</p>
            </div>
          )}

          {/* Worst Day MAPE */}
          {summary.worst_day_mape && (
            <div className="p-3 rounded-lg bg-rose-950/20 border border-rose-900/40 space-y-1">
              <span className="text-[10px] font-semibold tracking-wider uppercase text-rose-400 block">
                Highest Relative Error
              </span>
              <div className="flex items-baseline justify-between">
                <span className="font-mono text-lg font-bold text-rose-300">
                  {formatNumber(summary.worst_day_mape.value, 1)} <span className="text-xs font-normal">%</span>
                </span>
                <span className="text-[11px] font-mono text-slate-300 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3 text-rose-400" />
                  {formatDate(summary.worst_day_mape.delivery_date)}
                </span>
              </div>
              <p className="text-[10px] text-slate-400">Low generation magnifies % deviation</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

