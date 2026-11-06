import { useState } from 'react'
import {
  Activity,
  Layers,
  Percent,
  TrendingUp,
  Compass,
  ArrowUpRight,
  ArrowDownRight,
  SlidersHorizontal,
} from 'lucide-react'
import { KpiCard } from './kpi-card'
import { Button } from '@/components/ui/button'
import {
  formatNumber,
  formatPct,
  formatBias,
  METRIC_DESCRIPTIONS,
} from '@/lib/formatters'
import type { AccuracySummaryMetrics } from '@/types/api'

interface KpiGridProps {
  metrics: AccuracySummaryMetrics
  isBenchmarkPreset?: boolean
}

export function KpiGrid({ metrics, isBenchmarkPreset = false }: KpiGridProps) {
  const [highPrecision, setHighPrecision] = useState(false)
  const decimals = highPrecision ? 4 : 2

  const biasInfo = formatBias(metrics.forecast_bias_mw, decimals, false)

  return (
    <div className="space-y-3">
      {/* Precision Toggle Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-cyan-400" />
          <h2 className="text-sm font-semibold tracking-wide text-slate-100">
            Forecast Accuracy Core Metrics
          </h2>
          {isBenchmarkPreset && (
            <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded bg-emerald-950/80 border border-emerald-800/50 text-emerald-300">
              Validated January 2026 Benchmark
            </span>
          )}
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => setHighPrecision(!highPrecision)}
          className="text-[11px] h-7 px-2.5 text-slate-300 hover:text-white border-slate-700"
          title="Toggle between 2 decimal places and 4 decimal places (high precision audit mode)"
        >
          <SlidersHorizontal className="w-3 h-3 text-cyan-400 mr-1" />
          <span>{highPrecision ? 'Standard (2 Decimals)' : 'Audit (4 Decimals)'}</span>
        </Button>
      </div>

      {/* Grid of 6 Main Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        {/* 1. Valid Comparisons */}
        <KpiCard
          title="Evaluated Hours"
          value={metrics.valid_comparisons.toLocaleString()}
          unit="hrs"
          icon={Layers}
          tooltip={METRIC_DESCRIPTIONS.comparisons.description}
          subtitle={`Coverage: ${formatPct(metrics.forecast_coverage_pct, 1)} | Actuals: ${formatPct(metrics.actual_completeness_pct, 1)}`}
          trend="accent"
        />

        {/* 2. MAE */}
        <KpiCard
          title="Mean Absolute Error"
          value={formatNumber(metrics.mae_mw, decimals)}
          unit="MW"
          badgeText="MAE"
          icon={Activity}
          tooltip={METRIC_DESCRIPTIONS.mae.description}
          subtitle="Average linear forecast deviation across hours"
          trend="neutral"
        />

        {/* 3. RMSE */}
        <KpiCard
          title="Root Mean Sq. Error"
          value={formatNumber(metrics.rmse_mw, decimals)}
          unit="MW"
          badgeText="RMSE"
          icon={TrendingUp}
          tooltip={METRIC_DESCRIPTIONS.rmse.description}
          subtitle="Heavily penalizes large forecast deviations"
          trend="neutral"
        />

        {/* 4. MAPE */}
        <KpiCard
          title="Mean Abs. % Error"
          value={formatNumber(metrics.mape_pct, decimals)}
          unit="%"
          badgeText="MAPE"
          icon={Percent}
          tooltip={METRIC_DESCRIPTIONS.mape.description}
          subtitle={`Relative error across ${metrics.mape_denominator} active hours`}
          trend="neutral"
        />

        {/* 5. Forecast Bias */}
        <KpiCard
          title="Forecast Bias"
          value={biasInfo.text}
          unit="MW"
          badgeText="Signed"
          icon={Compass}
          tooltip={METRIC_DESCRIPTIONS.bias.description}
          subtitle={
            metrics.forecast_bias_mw > 0
              ? 'Positive bias: systematic generation overprediction'
              : metrics.forecast_bias_mw < 0
              ? 'Negative bias: systematic generation underprediction'
              : 'Zero bias: balanced over/under predictions'
          }
          trend={metrics.forecast_bias_mw > 0 ? 'negative' : 'positive'}
        />

        {/* 6. Direction Balance */}
        <KpiCard
          title="Over vs Under"
          value={`${metrics.overforecast_count} : ${metrics.underforecast_count}`}
          unit="hrs"
          badgeText={
            metrics.valid_comparisons > 0
              ? `${Math.round((metrics.overforecast_count / metrics.valid_comparisons) * 100)}% Over`
              : undefined
          }
          icon={metrics.overforecast_count > metrics.underforecast_count ? ArrowUpRight : ArrowDownRight}
          tooltip="Count of hours where forecast was higher than actual vs hours where forecast was lower than actual"
          subtitle={`${metrics.overforecast_count} overforecast vs ${metrics.underforecast_count} underforecast hours`}
          trend={metrics.overforecast_count > metrics.underforecast_count ? 'negative' : 'positive'}
        />
      </div>

      {/* Average Power Generation Context Bar */}
      {(metrics.avg_forecast_mw !== null && metrics.avg_actual_mw !== null && metrics.avg_forecast_mw !== undefined && metrics.avg_actual_mw !== undefined) && (
        <div className="bg-[#0b1120] border border-slate-800/80 rounded-lg px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-300">
          <div className="flex items-center gap-2">
            <span className="text-slate-400">Average Generation Baseline:</span>
            <span className="font-semibold text-slate-200">
              Forecast: <span className="font-mono text-cyan-300">{formatNumber(metrics.avg_forecast_mw, 1)} MW</span>
            </span>
            <span className="text-slate-600">vs</span>
            <span className="font-semibold text-slate-200">
              Actual: <span className="font-mono text-emerald-300">{formatNumber(metrics.avg_actual_mw, 1)} MW</span>
            </span>
          </div>

          <div className="flex items-center gap-4 text-[11px] text-slate-400">
            <span>
              Delta:{' '}
              <span className="font-mono font-medium text-slate-200">
                {formatNumber((metrics.avg_forecast_mw || 0) - (metrics.avg_actual_mw || 0), 1)} MW
              </span>
            </span>
            <span>
              Forecast Ratio:{' '}
              <span className="font-mono font-medium text-slate-200">
                {metrics.avg_actual_mw ? ((metrics.avg_forecast_mw / metrics.avg_actual_mw) * 100).toFixed(1) : 0}% of actual
              </span>
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

