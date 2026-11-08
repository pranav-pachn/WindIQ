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
          <Activity className="w-4 h-4 text-[#35B9C8]" />
          <h2 className="text-xs font-semibold tracking-wider uppercase text-[#9AAABD] font-mono">
            Core Forecast Accuracy Metrics
          </h2>
          {isBenchmarkPreset && (
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#133829] border border-[#1C523B] text-[#35B98A]">
              Validated January 2026 Benchmark
            </span>
          )}
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => setHighPrecision(!highPrecision)}
          className="text-[11px] h-7 px-2.5 text-[#9AAABD] hover:text-[#E7EDF5]"
          title="Toggle between 2 decimal places and 4 decimal places"
        >
          <SlidersHorizontal className="w-3 h-3 text-[#35B9C8] mr-1" />
          <span>{highPrecision ? 'Standard (2 Decimals)' : 'Audit (4 Decimals)'}</span>
        </Button>
      </div>

      {/* Grid of 6 Core KPI Cards (compact 2-column mobile, 3-column desktop) */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-3.5">
        {/* 1. Evaluated Hours */}
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
          title="MAE"
          value={formatNumber(metrics.mae_mw, decimals)}
          unit="MW"
          icon={Activity}
          tooltip="Mean Absolute Error: Average linear forecast deviation across active delivery hours."
          subtitle="Mean Absolute Error"
          trend="neutral"
        />

        {/* 3. RMSE */}
        <KpiCard
          title="RMSE"
          value={formatNumber(metrics.rmse_mw, decimals)}
          unit="MW"
          icon={TrendingUp}
          tooltip="Root Mean Squared Error: Penalizes large hourly deviations more heavily than MAE."
          subtitle="Root Mean Squared Error"
          trend="neutral"
        />

        {/* 4. MAPE */}
        <KpiCard
          title="MAPE"
          value={formatNumber(metrics.mape_pct, decimals)}
          unit="%"
          icon={Percent}
          tooltip={`Mean Absolute Percentage Error: Relative error across ${metrics.mape_denominator} hours with non-zero actuals.`}
          subtitle="Mean Absolute % Error"
          trend="neutral"
        />

        {/* 5. Forecast Bias */}
        <KpiCard
          title="Forecast Bias"
          value={biasInfo.text}
          unit="MW"
          badgeText="Signed"
          icon={Compass}
          tooltip="Mean signed error (Forecast − Actual). Positive = average forecast exceeded actual generation. Historical Jan 2026 result; not a guaranteed future pattern."
          subtitle={
            metrics.forecast_bias_mw > 0
              ? 'Average forecast exceeded actual generation'
              : metrics.forecast_bias_mw < 0
              ? 'Average actual generation exceeded forecast'
              : 'Zero bias across evaluated hours'
          }
          trend={metrics.forecast_bias_mw > 0 ? 'negative' : 'positive'}
        />

        {/* 6. Directional Split — compact summary; detail lives in the panel below */}
        <KpiCard
          title="Overforecast vs Underforecast"
          value={`${metrics.overforecast_count} : ${metrics.underforecast_count}`}
          unit="hrs"
          badgeText={
            metrics.valid_comparisons > 0
              ? `${Math.round((metrics.overforecast_count / metrics.valid_comparisons) * 100)}% Over`
              : undefined
          }
          icon={metrics.overforecast_count > metrics.underforecast_count ? ArrowUpRight : ArrowDownRight}
          tooltip="Hours where forecast exceeded actuals vs actuals exceeded forecast. See the Forecast Direction Analysis panel below for the full distribution."
          subtitle="Overforecast : Underforecast split"
          trend={metrics.overforecast_count > metrics.underforecast_count ? 'negative' : 'positive'}
        />
      </div>

      {/* Generation Baseline Financial Comparison Component */}
      {metrics.avg_forecast_mw !== null &&
        metrics.avg_actual_mw !== null &&
        metrics.avg_forecast_mw !== undefined &&
        metrics.avg_actual_mw !== undefined && (
          <div className="bg-[#111C2D] border border-[#26364A] rounded-lg p-3 sm:p-3.5 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1E2B3E] pb-2">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono uppercase tracking-wider text-[#9AAABD] font-semibold">
                  Generation Baseline (January 2026 Benchmark)
                </span>
                <span className="hidden sm:inline text-[10px] text-[#718198]">
                  Mean hourly generation volume across 744 evaluated hours
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-[#718198]">
                <span>Forecast-to-Actual Ratio:</span>
                <span
                  className="font-mono text-xs font-semibold px-1.5 py-0.5 rounded bg-[#162337] border border-[#26364A] text-[#E7EDF5] tabular-nums"
                  title="Historical ratio during the January 2026 evaluation period. Reflects winter wind outturn conditions."
                >
                  {metrics.avg_actual_mw
                    ? ((metrics.avg_forecast_mw / metrics.avg_actual_mw) * 100).toFixed(1)
                    : 0}%
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
              {/* Stat Block 1: Day-Ahead Forecast */}
              <div className="p-2.5 rounded bg-[#162337] border border-[#26364A] flex flex-col justify-between">
                <span className="text-[10px] font-mono uppercase tracking-wide text-[#718198]">
                  Mean Day-Ahead Forecast
                </span>
                <div className="mt-1">
                  <span className="font-mono text-base sm:text-lg font-bold text-[#35B9C8] tabular-nums">
                    {formatNumber(metrics.avg_forecast_mw, 1)} MW
                  </span>
                </div>
                <span className="text-[10px] text-[#718198] mt-0.5">
                  Locked at 09:00 UK cutoff
                </span>
              </div>

              {/* Stat Block 2: Settlement Actual */}
              <div className="p-2.5 rounded bg-[#162337] border border-[#26364A] flex flex-col justify-between">
                <span className="text-[10px] font-mono uppercase tracking-wide text-[#718198]">
                  Mean Settlement Actual
                </span>
                <div className="mt-1">
                  <span className="font-mono text-base sm:text-lg font-bold text-[#E7EDF5] tabular-nums">
                    {formatNumber(metrics.avg_actual_mw, 1)} MW
                  </span>
                </div>
                <span className="text-[10px] text-[#718198] mt-0.5">
                  Elexon BMRS FUELHH outturn
                </span>
              </div>

              {/* Stat Block 3: Mean Forecast Error (Forecast − Actual) */}
              <div className="p-2.5 rounded bg-[#162337] border border-[#26364A] flex flex-col justify-between">
                <span className="text-[10px] font-mono uppercase tracking-wide text-[#718198]">
                  Mean Forecast Error (Forecast − Actual)
                </span>
                <div className="mt-1">
                  <span className="font-mono text-base sm:text-lg font-bold text-[#E7AD4A] tabular-nums">
                    +{formatNumber((metrics.avg_forecast_mw || 0) - (metrics.avg_actual_mw || 0), 1)} MW
                  </span>
                </div>
                <span className="text-[10px] text-[#718198] mt-0.5">
                  Mean hourly forecast overestimation
                </span>
              </div>
            </div>
          </div>
        )}
    </div>
  )
}
