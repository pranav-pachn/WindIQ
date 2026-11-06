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
      <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-cyan-950/40 border border-slate-800 rounded-xl p-5 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-cyan-400 flex items-center gap-1.5">
                <TrendingDown className="w-4 h-4 text-cyan-400" />
                Forecast Error Convergence Across Lead Times
              </span>
              <span
                className={`text-[10px] px-2 py-0.5 rounded font-mono font-medium border ${
                  isMatched
                    ? 'bg-amber-950/70 text-amber-300 border-amber-800/80'
                    : 'bg-cyan-950/70 text-cyan-300 border-cyan-800/80'
                }`}
              >
                {isMatched ? 'Strictly Matched Population (553 Common Hours)' : 'Publication-Weighted (All Forward Observations)'}
              </span>
            </div>
            <p className="text-xs text-slate-300 max-w-3xl leading-relaxed">
              Evaluating forecast error from Medium-Range (D-3, 48–72h) down to Very Short (Intraday gate closure, 0–6h).
              {isMatched ? (
                <span className="text-amber-200/90 font-medium ml-1">
                  Matched mode eliminates weather-regime sampling bias by requiring identical delivery-hour populations across all 6 horizon buckets.
                </span>
              ) : (
                <span className="text-cyan-200/90 font-medium ml-1">
                  Publication-weighted mode analyzes all published model iterations to maximize statistical power.
                </span>
              )}
            </p>
          </div>

          <div className="flex items-center gap-4 bg-slate-950/80 border border-slate-800/80 p-3.5 rounded-lg shrink-0">
            <div>
              <div className="text-[10px] uppercase font-mono text-slate-400">MAE Reduction</div>
              <div className="text-2xl font-bold font-mono text-emerald-400">
                {data.proven_convergence_improvement_pct ? `${data.proven_convergence_improvement_pct}%` : 'N/A'}
              </div>
              <div className="text-[10px] text-slate-400 font-mono">
                {maeChangeMw !== null
                  ? `MAE change: −${Math.abs(maeChangeMw).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MW`
                  : (isMatched ? 'Monotonic across 6 horizons' : 'Overall horizon drop')}
              </div>
            </div>
            <div className="h-10 w-px bg-slate-800" />
            <div>
              <div className="text-[10px] uppercase font-mono text-slate-400">Evaluated Hours</div>
              <div className="text-xl font-bold font-mono text-slate-100">
                {data.evaluated_delivery_hours}h
              </div>
              <div className="text-[10px] text-slate-400">
                {data.overall_coverage_pct}% Period Coverage
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Multi-Horizon Convergence Chart */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
            <span>Mean Absolute Error & Root Mean Squared Error Convergence</span>
            <span className="text-xs font-normal text-slate-400">(Bar: MW, Line: MAPE %)</span>
          </h3>
          <div className="text-xs text-slate-400 flex items-center gap-1 font-mono">
            <Info className="w-3.5 h-3.5 text-cyan-400" />
            <span>Target Lead Times: 60h &rarr; 42h &rarr; 30h &rarr; 18h &rarr; 9h &rarr; 3h</span>
          </div>
        </div>

        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
            <ComposedChart
              data={[...chartData].reverse()} // Reverse so lead time goes from 48-72h down to 0-6h left to right
              margin={{ top: 10, right: 30, left: 10, bottom: 20 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
              <XAxis
                dataKey="name"
                stroke="#94a3b8"
                fontSize={11}
                tickLine={false}
              />
              <YAxis
                yAxisId="left"
                stroke="#94a3b8"
                fontSize={11}
                tickFormatter={(v) => `${Math.round(v)} MW`}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                stroke="#f59e0b"
                fontSize={11}
                tickFormatter={(v) => `${v}%`}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const d = payload[0].payload
                    return (
                      <div className="bg-slate-950 border border-slate-700 p-3 rounded-lg shadow-xl text-xs font-mono space-y-1">
                        <div className="font-semibold text-cyan-300 font-sans">{d.fullName}</div>
                        <div className="text-[11px] text-slate-400">Boundary: {d.semantics}</div>
                        <div className="text-[11px] text-slate-400">
                          Observations: {d.obsCount} ({d.uniqueHours} distinct hours, {d.coveragePct}%)
                        </div>
                        <div className="text-cyan-400 font-bold">MAE: {formatNumber(d.mae)} MW</div>
                        <div className="text-indigo-400 font-bold">RMSE: {formatNumber(d.rmse)} MW</div>
                        <div className="text-slate-300">
                          Bias: {d.bias > 0 ? '+' : ''}{formatNumber(d.bias)} MW
                        </div>
                        <div className="text-amber-400 font-bold">MAPE: {d.mape.toFixed(2)}%</div>
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
                fill="#06b6d4"
                radius={[4, 4, 0, 0]}
                barSize={32}
              />
              <Bar
                yAxisId="left"
                dataKey="rmse"
                name="RMSE (MW)"
                fill="#6366f1"
                radius={[4, 4, 0, 0]}
                barSize={32}
                opacity={0.8}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="mape"
                name="MAPE (%)"
                stroke="#f59e0b"
                strokeWidth={2.5}
                dot={{ r: 4, fill: '#f59e0b' }}
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
            className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm hover:border-slate-700 transition-colors"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold text-sm text-slate-100">{b.horizon_bucket}</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                {b.boundary_semantics}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs font-mono mb-3">
              <div className="bg-slate-950/60 p-2 rounded border border-slate-800/80">
                <span className="text-[10px] text-slate-400 block font-sans">MAE</span>
                <span className="text-cyan-400 font-bold text-sm">{formatNumber(b.mae_mw)} MW</span>
              </div>
              <div className="bg-slate-950/60 p-2 rounded border border-slate-800/80">
                <span className="text-[10px] text-slate-400 block font-sans">RMSE</span>
                <span className="text-indigo-400 font-bold text-sm">{formatNumber(b.rmse_mw)} MW</span>
              </div>
              <div className="bg-slate-950/60 p-2 rounded border border-slate-800/80">
                <span className="text-[10px] text-slate-400 block font-sans">Forecast Bias</span>
                <span className={`font-bold text-sm ${b.bias_mw > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                  {b.bias_mw > 0 ? '+' : ''}{formatNumber(b.bias_mw)} MW
                </span>
              </div>
              <div className="bg-slate-950/60 p-2 rounded border border-slate-800/80">
                <span className="text-[10px] text-slate-400 block font-sans">MAPE</span>
                <span className="text-amber-400 font-bold text-sm">
                  {b.mape_pct !== null ? `${b.mape_pct.toFixed(2)}%` : 'N/A'}
                </span>
              </div>
            </div>

            <div className="text-[11px] text-slate-400 flex items-center justify-between border-t border-slate-800 pt-2">
              <span>
                Observations: <strong className="text-slate-200">{b.observation_count}</strong> ({b.unique_delivery_hours}h)
              </span>
              <span>
                Target: <strong className="text-cyan-300 font-mono">{b.target_lead_time_hours}h</strong>
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

