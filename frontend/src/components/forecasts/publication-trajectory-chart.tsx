import React from 'react'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from 'recharts'
import { formatNumber, formatDateTimeUtc } from '@/lib/formatters'
import type { SingleDeliveryHourPublicationResponse, PublicationVersion } from '@/types/api'
import { ShieldCheck, Target, Zap, AlertTriangle } from 'lucide-react'
import { CHART_THEME } from '@/lib/chart-theme'

interface PublicationTrajectoryChartProps {
  data: SingleDeliveryHourPublicationResponse
  onSelectPublication?: (pub: PublicationVersion) => void
  onOpenAuditModal?: () => void
}

export const PublicationTrajectoryChart: React.FC<PublicationTrajectoryChartProps> = ({
  data,
  onSelectPublication,
  onOpenAuditModal,
}) => {
  const selectedPub = data.publications.find((p) => p.is_selected)
  const actualMw = data.actual_generation_mw ?? null
  const errorMw =
    selectedPub && actualMw !== null ? selectedPub.forecast_mw - actualMw : null

  // Chart data: sort chronologically so lead time goes from large to small (55h -> 0.5h)
  const chartPoints = data.publications.map((p) => ({
    id: p.id,
    publishTime: p.publish_time_utc,
    leadTime: p.lead_time_hours ?? 0,
    forecastMw: p.forecast_mw,
    revisionMw: p.revision_mw,
    isEligible: p.is_eligible,
    isSelected: p.is_selected,
    actualMw: actualMw,
    raw: p,
  }))

  return (
    <div className="bg-app-surface border border-app-border rounded-xl p-5 mb-6">
      {/* KPI Cards Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-app-elevated border border-app-border rounded-lg p-3.5">
          <div className="flex items-center justify-between text-xs text-muted mb-1">
            <span className="flex items-center gap-1.5">
              <Target className="w-3.5 h-3.5 text-accent" />
              Selected D-1 Forecast
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.2 bg-app-bg text-accent border border-app-border rounded">
              09:00 Cutoff
            </span>
          </div>
          <div className="text-xl font-bold font-mono text-accent">
            {selectedPub ? `${formatNumber(selectedPub.forecast_mw)} MW` : 'N/A'}
          </div>
          <div className="text-[11px] text-muted mt-1">
            Lead time: <span className="font-mono text-slate-300">{selectedPub?.lead_time_hours}h</span>
          </div>
        </div>

        <div className="bg-app-elevated border border-app-border rounded-lg p-3.5">
          <div className="flex items-center justify-between text-xs text-muted mb-1">
            <span className="flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-emerald-400" />
              Actual Generation
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.2 bg-app-bg text-emerald-300 border border-app-border rounded">
              2 x FUELHH
            </span>
          </div>
          <div className="text-xl font-bold font-mono text-slate-100">
            {actualMw !== null ? `${formatNumber(actualMw)} MW` : 'Missing'}
          </div>
          <div className="text-[11px] text-muted mt-1">
            Status: <span className="text-emerald-400 font-medium">{data.actual_data_status}</span>
          </div>
        </div>

        <div className="bg-app-elevated border border-app-border rounded-lg p-3.5">
          <div className="flex items-center justify-between text-xs text-muted mb-1">
            <span className="flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
              Day-Ahead Error
            </span>
            <span
              className={`text-[10px] font-mono px-1.5 py-0.2 rounded border ${
                errorMw !== null && errorMw > 0
                  ? 'bg-amber-950/40 text-amber-300 border-amber-800/40'
                  : 'bg-accent/10 text-accent border-accent/40'
              }`}
            >
              {errorMw !== null && errorMw > 0 ? 'Overforecast' : 'Underforecast'}
            </span>
          </div>
          <div
            className={`text-xl font-bold font-mono ${
              errorMw !== null && errorMw > 0 ? 'text-amber-300' : 'text-accent'
            }`}
          >
            {errorMw !== null
              ? `${errorMw > 0 ? '+' : ''}${formatNumber(errorMw)} MW`
              : 'N/A'}
          </div>
          <div className="text-[11px] text-muted mt-1">
            Abs Error:{' '}
            <span className="font-mono text-slate-200">
              {errorMw !== null ? `${formatNumber(Math.abs(errorMw))} MW` : 'N/A'}
            </span>
          </div>
        </div>

        <div className="bg-app-elevated border border-app-border rounded-lg p-3.5">
          <div className="flex items-center justify-between text-xs text-muted mb-1">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-accent" />
              Publication Versions
            </span>
            {onOpenAuditModal ? (
              <button
                type="button"
                onClick={onOpenAuditModal}
                className="text-[10px] font-mono px-1.5 py-0.5 bg-app-bg text-accent border border-app-border rounded hover:bg-app-surface cursor-pointer transition-colors"
                title="Inspect decision cutoff and settlement lineage"
              >
                Audit Lineage
              </button>
            ) : (
              <span className="text-[10px] font-mono px-1.5 py-0.2 bg-app-bg text-muted rounded">
                Rolling 3-Day
              </span>
            )}
          </div>
          <div className="text-xl font-bold font-mono text-slate-100">
            {data.total_publications}
          </div>
          <div className="text-[11px] text-muted mt-1">
            Eligible: <span className="text-accent font-medium">{data.eligible_publications}</span> | Forward:{' '}
            <span className="text-slate-300">{data.forward_publications}</span>
          </div>
        </div>
      </div>

      {/* Trajectory Step Line Chart */}
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
          <span>Forecast Evolution Across Lead Times</span>
          <span className="text-xs text-muted font-normal">
            (Target Delivery: {formatDateTimeUtc(data.delivery_hour_utc)})
          </span>
        </h3>
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-accent inline-block" />
            <span className="text-slate-300">WINDFOR Evolution</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-slate-300 border-dashed inline-block" />
            <span className="text-slate-300">Actual ({formatNumber(actualMw ?? 0)} MW)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-[#E7AD4A] inline-block" />
            <span className="text-amber-300 font-medium">09:00 D-1 Cutoff</span>
          </div>
        </div>
      </div>

      <div className="h-72 w-full pt-4">
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
          <LineChart
            data={chartPoints}
            margin={{ top: 10, right: 30, left: 10, bottom: 25 }}
            onClick={(state) => {
              if (state && state.activePayload && state.activePayload.length > 0) {
                const item = state.activePayload[0].payload
                if (onSelectPublication && item.raw) {
                  onSelectPublication(item.raw)
                }
              }
            }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_THEME.grid} opacity={0.6} />
            <XAxis
              dataKey="leadTime"
              stroke={CHART_THEME.axes}
              fontSize={11}
              tickFormatter={(v) => `${v}h`}
              reversed
              label={{
                value: '← Real-Time Delivery (0h) | Lead Time Before Delivery (hours) | Early D-3 →',
                position: 'insideBottom',
                offset: -15,
                fill: CHART_THEME.axes,
                fontSize: 10,
              }}
            />
            <YAxis
              stroke={CHART_THEME.axes}
              fontSize={11}
              tickFormatter={(v) => `${Math.round(v)} MW`}
              domain={['auto', 'auto']}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const p = payload[0].payload
                  return (
                    <div className="bg-app-surface border border-app-border p-3 rounded-lg shadow-xl text-xs font-mono space-y-1">
                      <div className="font-semibold text-slate-200">
                        Published: {formatDateTimeUtc(p.publishTime)}
                      </div>
                      <div className="text-accent font-bold">
                        Forecast: {formatNumber(p.forecastMw)} MW
                      </div>
                      <div className="text-muted">
                        Lead Time: <span className="text-slate-200">{p.leadTime} hours</span>
                      </div>
                      {p.revisionMw !== null && (
                        <div
                          className={`flex items-center gap-1 ${
                            p.revisionMw > 0
                              ? 'text-emerald-400'
                              : p.revisionMw < 0
                              ? 'text-rose-400'
                              : 'text-muted'
                          }`}
                        >
                          Step Revision: {p.revisionMw > 0 ? '+' : ''}
                          {formatNumber(p.revisionMw)} MW
                        </div>
                      )}
                      <div className="pt-1 flex items-center gap-2">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-sans ${
                            p.isEligible
                              ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800'
                              : 'bg-app-elevated text-muted'
                          }`}
                        >
                          {p.isEligible ? 'ELIGIBLE' : 'POST-CUTOFF'}
                        </span>
                        {p.isSelected && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-sans bg-accent/20 text-accent border border-accent/60 font-medium">
                            SELECTED D-1
                          </span>
                        )}
                      </div>
                    </div>
                  )
                }
                return null
              }}
            />

            {/* Actual generation reference line */}
            {actualMw !== null && (
              <ReferenceLine
                y={actualMw}
                stroke={CHART_THEME.actual}
                strokeDasharray="4 4"
                strokeWidth={1.5}
                label={{
                  value: `Actual: ${formatNumber(actualMw)} MW`,
                  position: 'insideTopLeft',
                  fill: CHART_THEME.actual,
                  fontSize: 10,
                }}
              />
            )}

            {/* Decision Cutoff Reference Line */}
            {selectedPub?.lead_time_hours !== undefined && (
              <ReferenceLine
                x={selectedPub.lead_time_hours}
                stroke={CHART_THEME.warning}
                strokeWidth={1.5}
                strokeDasharray="3 3"
                label={{
                  value: '09:00 D-1 Cutoff Winner',
                  position: 'insideTopRight',
                  fill: CHART_THEME.warning,
                  fontSize: 10,
                }}
              />
            )}

            {/* Main Forecast Progression Step Line */}
            <Line
              type="stepAfter"
              dataKey="forecastMw"
              stroke={CHART_THEME.forecast}
              strokeWidth={2}
              dot={(props) => {
                const { cx, cy, payload } = props
                if (payload.isSelected) {
                  return (
                    <polygon
                      key={`diamond-${payload.id}`}
                      points={`${cx},${cy - 7} ${cx + 7},${cy} ${cx},${cy + 7} ${cx - 7},${cy}`}
                      fill={CHART_THEME.warning}
                      stroke="#0B1220"
                      strokeWidth={1.5}
                    />
                  )
                }
                return (
                  <circle
                    key={`dot-${payload.id}`}
                    cx={cx}
                    cy={cy}
                    r={payload.isEligible ? 3 : 2}
                    fill={payload.isEligible ? CHART_THEME.forecast : '#718198'}
                    stroke="#0B1220"
                    strokeWidth={1}
                  />
                )
              }}
              activeDot={{ r: 5, fill: CHART_THEME.forecast, stroke: "#0B1220", strokeWidth: 2 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

