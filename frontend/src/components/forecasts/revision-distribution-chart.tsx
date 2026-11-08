import React from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from 'recharts'
import {
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  ExternalLink,
  Flame,
  Minus,
  ShieldCheck,
} from 'lucide-react'
import type { RevisionAnalyticsResponse, ExtremeRevisionItem } from '@/types/api'
import { formatMw, formatPct, formatBias, formatLondonHour, formatUtcDateTime } from '@/lib/formatters'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { CHART_THEME } from '@/lib/chart-theme'

interface RevisionDistributionChartProps {
  data: RevisionAnalyticsResponse
  onSelectDeliveryHour?: (deliveryHourUtc: string) => void
}

export const RevisionDistributionChart: React.FC<RevisionDistributionChartProps> = ({
  data,
  onSelectDeliveryHour,
}) => {
  const chartData = data.histogram.map((bin) => ({
    name: `${bin.bin_start_mw > 0 ? '+' : ''}${bin.bin_start_mw} to ${bin.bin_end_mw > 0 ? '+' : ''}${bin.bin_end_mw}`,
    center: bin.bin_center_mw,
    count: bin.count,
    isNegative: bin.bin_center_mw < 0,
    isZero: bin.bin_start_mw <= 0 && bin.bin_end_mw >= 0,
  }))

  const biasFormatted = formatBias(data.mean_signed_revision_mw)

  return (
    <div className="space-y-6">
      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <Card className="bg-app-surface border-app-border">
          <CardContent className="p-3">
            <div className="flex items-center justify-between text-muted text-xs mb-1">
              <span>Total Revisions</span>
              <Activity className="h-3.5 w-3.5 text-accent" />
            </div>
            <div className="text-xl font-bold text-white font-mono">
              {data.forward_only_revisions.toLocaleString()}
            </div>
            <div className="text-[10px] text-muted mt-0.5">
              Forward-only (lead &gt; 0h)
            </div>
          </CardContent>
        </Card>

        <Card className="bg-app-surface border-app-border">
          <CardContent className="p-3">
            <div className="flex items-center justify-between text-muted text-xs mb-1">
              <span>Mean Step Revision</span>
              <Activity className="h-3.5 w-3.5 text-muted" />
            </div>
            <div
              className={`text-xl font-bold font-mono ${
                biasFormatted.direction === 'positive'
                  ? 'text-emerald-400'
                  : biasFormatted.direction === 'negative'
                    ? 'text-rose-400'
                    : 'text-slate-200'
              }`}
            >
              {biasFormatted.text}
            </div>
            <div className="text-[10px] text-muted mt-0.5">
              Net directional drift
            </div>
          </CardContent>
        </Card>

        <Card className="bg-app-surface border-app-border">
          <CardContent className="p-3">
            <div className="flex items-center justify-between text-muted text-xs mb-1">
              <span>Mean Absolute Rev</span>
              <Flame className="h-3.5 w-3.5 text-amber-400" />
            </div>
            <div className="text-xl font-bold text-amber-300 font-mono">
              {formatMw(data.mean_absolute_revision_mw)}
            </div>
            <div className="text-[10px] text-muted mt-0.5">
              Average step volatility
            </div>
          </CardContent>
        </Card>

        <Card className="bg-app-surface border-app-border">
          <CardContent className="p-3">
            <div className="flex items-center justify-between text-muted text-xs mb-1">
              <span>Upward Revisions</span>
              <ArrowUpRight className="h-3.5 w-3.5 text-emerald-400" />
            </div>
            <div className="text-xl font-bold text-emerald-400 font-mono">
              {data.upward_count.toLocaleString()}
            </div>
            <div className="text-[10px] text-muted mt-0.5">
              {formatPct(data.upward_pct)} of updates
            </div>
          </CardContent>
        </Card>

        <Card className="bg-app-surface border-app-border">
          <CardContent className="p-3">
            <div className="flex items-center justify-between text-muted text-xs mb-1">
              <span>Downward Revisions</span>
              <ArrowDownRight className="h-3.5 w-3.5 text-rose-400" />
            </div>
            <div className="text-xl font-bold text-rose-400 font-mono">
              {data.downward_count.toLocaleString()}
            </div>
            <div className="text-[10px] text-muted mt-0.5">
              {formatPct(data.downward_pct)} of updates
            </div>
          </CardContent>
        </Card>

        <Card className="bg-app-surface border-app-border">
          <CardContent className="p-3">
            <div className="flex items-center justify-between text-muted text-xs mb-1">
              <span>Unchanged (&plusmn;0 MW)</span>
              <Minus className="h-3.5 w-3.5 text-muted" />
            </div>
            <div className="text-xl font-bold text-slate-300 font-mono">
              {data.unchanged_count.toLocaleString()}
            </div>
            <div className="text-[10px] text-muted mt-0.5">
              {formatPct(data.unchanged_pct)} of updates
            </div>
          </CardContent>
        </Card>

        <Card className="bg-app-surface border-app-border">
          <CardContent className="p-3">
            <div className="flex items-center justify-between text-muted text-xs mb-1">
              <span>Max Cadence Gap</span>
              <Clock className="h-3.5 w-3.5 text-accent" />
            </div>
            <div className="text-xl font-bold text-accent font-mono">
              {data.cycle_gap_max_hours.toFixed(1)}h
            </div>
            <div className="text-[10px] text-muted mt-0.5 flex items-center gap-1">
              <ShieldCheck className="h-3 w-3 text-emerald-400 inline" />
              <span>{data.discontinuous_gap_count} gaps &gt;6h</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Revision Distribution Histogram */}
      <Card className="bg-app-surface border-app-border">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-semibold text-slate-200">
                Forecast Revision Distribution (&Delta; MW)
              </CardTitle>
              <p className="text-xs text-muted mt-1">
                Frequency distribution of sequential forecast updates across 200 MW bins. Symmetrical around zero indicates balanced revisions.
              </p>
            </div>
            <Badge variant="outline" className="border-app-border text-muted font-mono">
              {data.histogram.length} Bins | Range [&minus;2500, +2500] MW
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                margin={{ top: 15, right: 20, left: 10, bottom: 25 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_THEME.grid} opacity={0.6} vertical={false} />
                <XAxis
                  dataKey="center"
                  stroke={CHART_THEME.axes}
                  fontSize={11}
                  tickFormatter={(val: number) => `${val > 0 ? '+' : ''}${val}`}
                  label={{
                    value: 'Revision Step Size (MW)',
                    position: 'insideBottom',
                    offset: -15,
                    fill: CHART_THEME.axes,
                    fontSize: 11,
                  }}
                />
                <YAxis
                  stroke={CHART_THEME.axes}
                  fontSize={11}
                  tickFormatter={(val: number) => val.toLocaleString()}
                  label={{
                    value: 'Count of Updates',
                    angle: -90,
                    position: 'insideLeft',
                    fill: CHART_THEME.axes,
                    fontSize: 11,
                  }}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload || !payload.length) return null
                    const bin = payload[0].payload
                    return (
                      <div className="bg-app-surface border border-app-border p-2.5 rounded shadow-xl text-xs space-y-1">
                        <div className="font-semibold text-white">
                          Bin: {bin.name} MW
                        </div>
                        <div className="text-slate-300">
                          Frequency: <span className="font-mono font-medium text-white">{bin.count.toLocaleString()}</span> updates
                        </div>
                        <div className="text-muted text-[10px]">
                          Percentage: {formatPct((bin.count / data.forward_only_revisions) * 100)}
                        </div>
                      </div>
                    )
                  }}
                />
                <ReferenceLine x={0} stroke={CHART_THEME.border} strokeWidth={1.5} strokeDasharray="3 3" />
                <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                  {chartData.map((entry, idx) => {
                    let fill = CHART_THEME.forecast
                    if (entry.isZero) fill = '#718198'
                    else if (entry.isNegative) fill = CHART_THEME.error
                    else fill = CHART_THEME.success
                    return <Cell key={`cell-${idx}`} fill={fill} opacity={0.75} />
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Top 10 Extreme Revisions Leaderboard */}
      <Card className="bg-app-surface border-app-border">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-semibold text-slate-200 flex items-center gap-2">
                <Flame className="h-4 w-4 text-amber-400" />
                Top 10 Extreme Forecast Revisions Leaderboard
              </CardTitle>
              <p className="text-xs text-muted mt-1">
                Largest single-step forecast adjustments observed in the evaluation window. Click Audit to inspect the full trajectory.
              </p>
            </div>
            <Badge variant="outline" className="border-amber-800/40 text-amber-300 bg-amber-950/20 font-mono">
              Ranked by |&Delta; MW|
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-[#0E1726] border-b border-app-border text-muted uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-2.5 px-3 font-semibold text-center w-12">#</th>
                  <th className="py-2.5 px-3 font-semibold">Delivery Hour (UK)</th>
                  <th className="py-2.5 px-3 font-semibold">Publication Time (UTC)</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Lead Time</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Previous MW</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Revised MW</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Step Revision</th>
                  <th className="py-2.5 px-3 font-semibold text-center">Cycle Gap</th>
                  <th className="py-2.5 px-3 font-semibold text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-app-border/40 font-mono">
                {data.top_revisions.map((rev: ExtremeRevisionItem, idx: number) => {
                  const isUpward = rev.revision_mw > 0
                  return (
                    <tr
                      key={`rev-${rev.raw_forecast_id}-${idx}`}
                      className="hover:bg-app-elevated/60 transition-colors"
                    >
                      <td className="py-2.5 px-3 text-center text-muted font-bold">
                        {idx + 1}
                      </td>
                      <td className="py-2.5 px-3 font-sans text-slate-200">
                        <div className="font-medium">
                          {formatLondonHour(rev.delivery_hour_utc)}
                        </div>
                        <div className="text-[10px] text-muted">
                          {rev.delivery_date_london}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-slate-300 font-mono text-[11px]">
                        {formatUtcDateTime(rev.publish_time_utc)}
                      </td>
                      <td className="py-2.5 px-3 text-right text-accent">
                        {rev.lead_time_hours.toFixed(1)}h
                      </td>
                      <td className="py-2.5 px-3 text-right text-muted">
                        {formatMw(rev.previous_forecast_mw, 1)}
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-200 font-medium">
                        {formatMw(rev.revised_forecast_mw, 1)}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <span
                          className={`font-medium px-1.5 py-0.5 rounded text-[11px] ${
                            isUpward
                              ? 'text-emerald-300 bg-emerald-950/40 border border-emerald-800/50'
                              : 'text-rose-300 bg-rose-950/40 border border-rose-800/50'
                          }`}
                        >
                          {isUpward ? '+' : ''}
                          {formatMw(rev.revision_mw, 1)}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center text-muted text-[11px]">
                        {rev.cycle_gap_hours.toFixed(1)}h
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        {onSelectDeliveryHour && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-[10px] text-accent hover:text-accent/80 hover:bg-app-elevated gap-1"
                            onClick={() => onSelectDeliveryHour(rev.delivery_hour_utc)}
                            title="Inspect in Trajectory View"
                          >
                            <span>Inspect</span>
                            <ExternalLink className="h-2.5 w-2.5" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

