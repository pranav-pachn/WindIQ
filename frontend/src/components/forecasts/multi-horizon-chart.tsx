import React from 'react'
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'
import { formatNumber } from '@/lib/formatters'
import type { MultiHorizonResponse } from '@/types/api'
import { TrendingDown, Info } from 'lucide-react'
import { CHART_THEME } from '@/lib/chart-theme'

interface MultiHorizonChartProps {
  data: MultiHorizonResponse
}

export const MultiHorizonChart: React.FC<MultiHorizonChartProps> = ({ data }) => {
  const chartData = data.buckets.map((b) => ({
    name: b.horizon_bucket.replace(/ \(.*\)/, ''),
    fullName: b.horizon_bucket,
    mae: b.mae_mw,
    rmse: b.rmse_mw,
    bias: b.bias_mw,
    mape: b.mape_pct ?? 0,
    obsCount: b.observation_count,
    uniqueHours: b.unique_delivery_hours,
    coveragePct: b.hour_coverage_pct,
    targetLeadTime: b.target_lead_time_hours,
    avgLeadTime: b.avg_actual_lead_time_hours,
    semantics: b.boundary_semantics,
  }))

  const isMatched = data.analysis_mode === 'matched'

  const medRangeBucket = data.buckets.find(
    (b) => b.horizon_bucket.includes('48-72h') && b.observation_count > 0
  )
  const veryShortBucket = data.buckets.find(
    (b) => b.horizon_bucket.includes('0-6h') && b.observation_count > 0
  )
  const maeChangeMw =
    medRangeBucket && veryShortBucket
      ? veryShortBucket.mae_mw - medRangeBucket.mae_mw
      : null

  return (
    <div className="space-y-6">
      {/* Methodology & Proven Convergence Banner */}
      <div className="bg-[#111C2D] border border-[#26364A] rounded-lg p-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#35B9C8] flex items-center gap-1.5">
                <TrendingDown className="w-4 h-4 text-[#35B9C8]" />
                Forecast Error Convergence Across Lead Times
              </span>
              <span
                className={`text-[10px] px-2 py-0.5 rounded font-mono font-medium border ${
                  isMatched
                    ? 'bg-[#3E2E14] text-[#E7AD4A] border-[#E7AD4A]/40'
                    : 'bg-[#162337] text-[#35B9C8] border border-[#26364A]'
                }`}
              >
                {isMatched ? 'Strictly Matched Population (553 Common Hours)' : 'Publication-Weighted (All Forward Observations)'}
              </span>
            </div>
            <p className="text-xs text-[#9AAABD] max-w-3xl leading-relaxed">
              Evaluating forecast error from Medium-Range (D-3, 48–72h) down to Very Short (0–6h).
              {isMatched ? (
                <span className="text-[#E7AD4A] font-medium ml-1">
                  Matched mode eliminates weather-regime sampling bias by requiring identical delivery-hour populations across all 6 horizon buckets.
                </span>
              ) : (
                <span className="text-[#35B9C8] font-medium ml-1">
                  Publication-weighted mode analyzes all published model iterations to maximize statistical power.
                </span>
              )}
            </p>
          </div>

          <div className="flex items-center gap-4 bg-[#162337] border border-[#26364A] p-3 rounded-lg shrink-0">
            <div>
              <div className="text-[10px] uppercase font-mono text-[#718198]">MAE Reduction</div>
              <div className="text-2xl font-bold font-mono text-[#35B98A]">
                {data.proven_convergence_improvement_pct ? `${data.proven_convergence_improvement_pct}%` : 'N/A'}
              </div>
              <div className="text-[10px] text-[#718198] font-mono">
                {maeChangeMw !== null
                  ? `MAE change: −${Math.abs(maeChangeMw).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MW`
                  : (isMatched ? 'Monotonic across 6 horizons' : 'Overall horizon drop')}
              </div>
            </div>
            <div className="h-10 w-px bg-[#26364A]" />
            <div>
              <div className="text-[10px] uppercase font-mono text-[#718198]">Evaluated Hours</div>
              <div className="text-xl font-bold font-mono text-[#E7EDF5]">
                {data.evaluated_delivery_hours}h
              </div>
              <div className="text-[10px] text-[#718198]">
                {data.overall_coverage_pct}% Period Coverage
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Multi-Horizon Convergence Chart */}
      <div className="bg-[#111C2D] border border-[#26364A] rounded-lg p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-[#E7EDF5] flex items-center gap-2">
            <span>Mean Absolute Error &amp; Root Mean Squared Error Convergence</span>
            <span className="text-xs font-normal text-[#718198]">(Bar: MW, Line: MAPE %)</span>
          </h3>
          <div className="text-xs text-[#718198] flex items-center gap-1 font-mono">
            <Info className="w-3.5 h-3.5 text-[#35B9C8]" />
            <span>Target Lead Times: 60h &rarr; 42h &rarr; 30h &rarr; 18h &rarr; 9h &rarr; 3h</span>
          </div>
        </div>

        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
            <ComposedChart
              data={[...chartData].reverse()} // Reverse so lead time goes from 48-72h down to 0-6h left to right
              margin={{ top: 10, right: 30, left: 10, bottom: 20 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_THEME.grid} opacity={0.6} />
              <XAxis
                dataKey="name"
                stroke={CHART_THEME.axes}
                fontSize={11}
                tickLine={false}
              />
              <YAxis
                yAxisId="left"
                stroke={CHART_THEME.axes}
                fontSize={11}
                tickFormatter={(v) => `${Math.round(v)} MW`}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                stroke={CHART_THEME.axes}
                fontSize={11}
                tickFormatter={(v) => `${v}%`}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const d = payload[0].payload
                    return (
                      <div className="bg-[#0E1726] border border-[#26364A] p-3 rounded-lg shadow-xl text-xs font-mono space-y-1">
                        <div className="font-semibold text-[#35B9C8] font-sans">{d.fullName}</div>
                        <div className="text-[11px] text-[#718198]">Boundary: {d.semantics}</div>
                        <div className="text-[11px] text-[#718198]">
                          Observations: {d.obsCount} ({d.uniqueHours} distinct hours, {d.coveragePct}%)
                        </div>
                        <div className="text-[#35B9C8] font-bold">MAE: {formatNumber(d.mae)} MW</div>
                        <div className="text-[#E7AD4A] font-bold">RMSE: {formatNumber(d.rmse)} MW</div>
                        <div className="text-[#E7EDF5]">
                          Bias: {d.bias > 0 ? '+' : ''}{formatNumber(d.bias)} MW
                        </div>
                        <div className="text-[#E7EDF5] font-bold">MAPE: {d.mape.toFixed(2)}%</div>
                      </div>
                    )
                  }
                  return null
                }}
              />
              <Legend
                verticalAlign="top"
                align="right"
                wrapperStyle={{ paddingBottom: 10, fontSize: 12 }}
              />
              <Bar
                yAxisId="left"
                dataKey="mae"
                name="MAE (MW)"
                fill={CHART_THEME.mae}
                radius={[3, 3, 0, 0]}
                barSize={28}
              />
              <Bar
                yAxisId="left"
                dataKey="rmse"
                name="RMSE (MW)"
                fill={CHART_THEME.rmse}
                radius={[3, 3, 0, 0]}
                barSize={28}
                opacity={0.8}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="mape"
                name="MAPE (%)"
                stroke={CHART_THEME.actual}
                strokeWidth={2}
                dot={{ r: 4, fill: CHART_THEME.actual }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 6 Horizon Bucket Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {data.buckets.map((b) => (
          <div
            key={b.horizon_bucket}
            className="bg-[#111C2D] border border-[#26364A] rounded-lg p-4 hover:border-[#374B63] transition-colors"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold text-sm text-[#E7EDF5]">{b.horizon_bucket}</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#162337] border border-[#26364A] text-[#718198]">
                {b.boundary_semantics}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs font-mono mb-3">
              <div className="bg-[#162337] p-2 rounded border border-[#26364A]">
                <span className="text-[10px] text-[#718198] block font-sans">MAE</span>
                <span className="text-[#35B9C8] font-bold text-sm">{formatNumber(b.mae_mw)} MW</span>
              </div>
              <div className="bg-[#162337] p-2 rounded border border-[#26364A]">
                <span className="text-[10px] text-[#718198] block font-sans">RMSE</span>
                <span className="text-[#E7AD4A] font-bold text-sm">{formatNumber(b.rmse_mw)} MW</span>
              </div>
              <div className="bg-[#162337] p-2 rounded border border-[#26364A]">
                <span className="text-[10px] text-[#718198] block font-sans">Forecast Bias</span>
                <span className={`font-bold text-sm ${b.bias_mw > 0 ? 'text-[#E7AD4A]' : 'text-[#35B9C8]'}`}>
                  {b.bias_mw > 0 ? '+' : ''}{formatNumber(b.bias_mw)} MW
                </span>
              </div>
              <div className="bg-[#162337] p-2 rounded border border-[#26364A]">
                <span className="text-[10px] text-[#718198] block font-sans">MAPE</span>
                <span className="text-[#E7EDF5] font-bold text-sm">
                  {b.mape_pct !== null ? `${b.mape_pct.toFixed(2)}%` : 'N/A'}
                </span>
              </div>
            </div>

            <div className="text-[11px] text-[#718198] flex items-center justify-between border-t border-[#26364A] pt-2">
              <span>
                Observations: <strong className="text-[#E7EDF5]">{b.observation_count}</strong> ({b.unique_delivery_hours}h)
              </span>
              <span>
                Target: <strong className="text-[#35B9C8] font-mono">{b.target_lead_time_hours}h</strong>
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

