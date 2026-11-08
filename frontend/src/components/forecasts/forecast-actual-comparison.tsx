import React, { useState, useMemo } from 'react'
import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Brush,
  ReferenceLine,
} from 'recharts'
import {
  Calendar,
  Layers,
  ArrowRight,
} from 'lucide-react'
import type { HourlyAccuracyItem } from '@/types/api'
import { formatMw, formatPct, formatBias, formatLondonHour } from '@/lib/formatters'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface ForecastActualComparisonProps {
  items: HourlyAccuracyItem[]
  onSelectDeliveryHour?: (deliveryHourUtc: string) => void
}

export const ForecastActualComparison: React.FC<ForecastActualComparisonProps> = ({
  items,
  onSelectDeliveryHour,
}) => {
  // Filter for valid items
  const validItems = useMemo(
    () => items.filter((d) => d.forecast_generation_mw !== null && d.actual_generation_mw !== null),
    [items]
  )

  // Quick day filter (empty string = all)
  const [selectedDay, setSelectedDay] = useState<string>('')

  // Unique days list
  const uniqueDays = useMemo(() => {
    const days = Array.from(new Set(items.map((i) => i.delivery_date))).sort()
    return days
  }, [items])

  const filteredItems = useMemo(() => {
    if (!selectedDay) return validItems
    return validItems.filter((i) => i.delivery_date === selectedDay)
  }, [validItems, selectedDay])

  // Summary statistics for displayed items
  const summary = useMemo(() => {
    if (!filteredItems.length) return null
    let sumForecast = 0
    let sumActual = 0
    let sumAbsError = 0
    let sumError = 0

    filteredItems.forEach((d) => {
      const f = d.forecast_generation_mw ?? 0
      const a = d.actual_generation_mw ?? 0
      sumForecast += f
      sumActual += a
      sumAbsError += Math.abs(f - a)
      sumError += (f - a)
    })

    const n = filteredItems.length
    return {
      count: n,
      avgForecast: sumForecast / n,
      avgActual: sumActual / n,
      mae: sumAbsError / n,
      bias: sumError / n,
    }
  }, [filteredItems])

  const chartData = useMemo(() => {
    return filteredItems.map((item) => ({
      delivery_hour_utc: item.delivery_hour_utc,
      timeLabel: `${item.delivery_date.slice(5)} ${formatLondonHour(item.delivery_hour_utc)}`,
      actual_mw: item.actual_generation_mw,
      forecast_mw: item.forecast_generation_mw,
      error_mw: item.forecast_error_mw,
      abs_error_mw: item.absolute_error_mw,
      ape_pct: item.absolute_percentage_error,
    }))
  }, [filteredItems])

  const biasFormatted = formatBias(summary?.bias)

  return (
    <div className="space-y-6">
      {/* Header and Quick Navigation */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <Layers className="h-5 w-5 text-cyan-400" />
            Forecast vs Actual Continuous Timeline Overlay
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Hour-by-hour comparison of Day-Ahead 09:00 D-1 selected forecasts against metered outturn generation across January 2026.
          </p>
        </div>

        {/* Quick Day Jumper */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            size="sm"
            variant={selectedDay === '' ? 'default' : 'outline'}
            onClick={() => setSelectedDay('')}
            className={`text-xs h-7 px-2.5 ${
              selectedDay === '' ? 'bg-app-elevated text-accent border border-accent/40 font-medium' : 'border-app-border text-muted hover:text-slate-200'
            }`}
          >
            All Month ({validItems.length}h)
          </Button>
          <Button
            size="sm"
            variant={selectedDay === '2026-01-19' ? 'default' : 'outline'}
            onClick={() => setSelectedDay('2026-01-19')}
            className={`text-xs h-7 px-2.5 ${
              selectedDay === '2026-01-19' ? 'bg-emerald-950/60 border border-emerald-800/80 text-emerald-300 font-medium' : 'border-app-border text-emerald-400'
            }`}
          >
            Best Day (19 Jan)
          </Button>
          <Button
            size="sm"
            variant={selectedDay === '2026-01-28' ? 'default' : 'outline'}
            onClick={() => setSelectedDay('2026-01-28')}
            className={`text-xs h-7 px-2.5 ${
              selectedDay === '2026-01-28' ? 'bg-rose-950/60 border border-rose-800/80 text-rose-300 font-medium' : 'border-app-border text-rose-400'
            }`}
          >
            Worst Day (28 Jan)
          </Button>

          {/* Day dropdown */}
          <div className="flex items-center gap-1 ml-1">
            <Calendar className="h-3.5 w-3.5 text-muted" />
            <select
              value={selectedDay}
              onChange={(e) => setSelectedDay(e.target.value)}
              className="bg-app-bg border border-app-border text-slate-200 text-xs rounded px-2 py-1 outline-none focus:border-accent font-mono"
            >
              <option value="">Jump to specific day...</option>
              {uniqueDays.map((day) => (
                <option key={day} value={day}>
                  {day}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Summary KPI Ribbon */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Card className="bg-app-surface border-app-border">
            <CardContent className="p-3">
              <div className="text-xs text-muted mb-1">Window Sample</div>
              <div className="text-lg font-bold text-white font-mono">
                {summary.count} Hours
              </div>
              <div className="text-[10px] text-muted">
                {selectedDay ? selectedDay : 'Full January 2026'}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-app-surface border-app-border">
            <CardContent className="p-3">
              <div className="text-xs text-muted mb-1">Mean Forecast</div>
              <div className="text-lg font-bold text-accent font-mono">
                {formatMw(summary.avgForecast, 1)}
              </div>
              <div className="text-[10px] text-muted">Day-Ahead selected</div>
            </CardContent>
          </Card>

          <Card className="bg-app-surface border-app-border">
            <CardContent className="p-3">
              <div className="text-xs text-muted mb-1">Mean Actual</div>
              <div className="text-lg font-bold text-slate-100 font-mono">
                {formatMw(summary.avgActual, 1)}
              </div>
              <div className="text-[10px] text-muted">Settled outturn</div>
            </CardContent>
          </Card>

          <Card className="bg-app-surface border-app-border">
            <CardContent className="p-3">
              <div className="text-xs text-muted mb-1">Window MAE</div>
              <div className="text-lg font-bold text-amber-300 font-mono">
                {formatMw(summary.mae, 1)}
              </div>
              <div className="text-[10px] text-muted">Mean absolute error</div>
            </CardContent>
          </Card>

          <Card className="bg-app-surface border-app-border">
            <CardContent className="p-3">
              <div className="text-xs text-muted mb-1">Window Net Bias</div>
              <div
                className={`text-lg font-bold font-mono ${
                  biasFormatted.direction === 'positive'
                    ? 'text-amber-400'
                    : biasFormatted.direction === 'negative'
                      ? 'text-accent'
                      : 'text-slate-300'
                }`}
              >
                {biasFormatted.text}
              </div>
              <div className="text-[10px] text-muted">Signed forecast bias</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Main Chart */}
      <Card className="bg-app-surface border-app-border">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold text-slate-200">
              Generation Profile &amp; Forecast Error Envelope
            </CardTitle>
            <div className="flex items-center gap-3 text-xs text-muted">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-0.5 bg-slate-300 inline-block" />
                <span className="text-slate-300">Actual Outturn</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-0.5 bg-accent border-t border-dashed border-accent inline-block" />
                <span className="text-slate-300">Day-Ahead Forecast</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 bg-amber-400/50 inline-block rounded-xs" />
                <span className="text-slate-300">Signed Error (MW)</span>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-[420px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={chartData}
                margin={{ top: 10, right: 30, left: 15, bottom: 20 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#26364A" opacity={0.6} />
                <XAxis
                  dataKey="timeLabel"
                  stroke="#718198"
                  fontSize={10}
                  tickMargin={8}
                  interval={selectedDay ? 1 : 24}
                />
                <YAxis
                  yAxisId="generation"
                  stroke="#718198"
                  fontSize={10}
                  tickFormatter={(val: number) => `${Math.round(val).toLocaleString()} MW`}
                  domain={[0, 'auto']}
                />
                <YAxis
                  yAxisId="error"
                  orientation="right"
                  stroke="#718198"
                  fontSize={10}
                  tickFormatter={(val: number) => `${val > 0 ? '+' : ''}${Math.round(val)} MW`}
                  domain={[-6000, 6000]}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload || !payload.length) return null
                    const d = payload[0].payload
                    return (
                      <div className="bg-app-surface border border-app-border p-3 rounded-lg shadow-xl text-xs space-y-1.5 min-w-[220px]">
                        <div className="font-semibold text-white border-b border-app-border pb-1">
                          {d.timeLabel}
                        </div>
                        <div className="flex justify-between items-center text-slate-200">
                          <span>Actual Generation:</span>
                          <span className="font-mono font-medium">{formatMw(d.actual_mw, 1)}</span>
                        </div>
                        <div className="flex justify-between items-center text-accent">
                          <span>Day-Ahead Forecast:</span>
                          <span className="font-mono font-medium">{formatMw(d.forecast_mw, 1)}</span>
                        </div>
                        <div className="flex justify-between items-center text-amber-300">
                          <span>Signed Error:</span>
                          <span className="font-mono font-medium">
                            {d.error_mw > 0 ? '+' : ''}
                            {formatMw(d.error_mw, 1)}
                          </span>
                        </div>
                        <div className="flex justify-between items-center text-slate-300">
                          <span>Absolute Error:</span>
                          <span className="font-mono font-medium">{formatMw(d.abs_error_mw, 1)}</span>
                        </div>
                        {d.ape_pct !== null && (
                          <div className="flex justify-between items-center text-muted">
                            <span>APE (%):</span>
                            <span className="font-mono text-slate-200">{formatPct(d.ape_pct, 1)}</span>
                          </div>
                        )}
                        {onSelectDeliveryHour && (
                          <div className="pt-2 border-t border-app-border">
                            <button
                              type="button"
                              onClick={() => onSelectDeliveryHour(d.delivery_hour_utc)}
                              className="w-full text-center text-accent hover:underline text-[11px] font-sans flex items-center justify-center gap-1"
                            >
                              <span>Inspect in Publication Trajectory</span>
                              <ArrowRight className="h-3 w-3" />
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  }}
                />
                <ReferenceLine yAxisId="error" y={0} stroke="#26364A" strokeDasharray="2 2" />

                {/* Error Bars on secondary axis */}
                <Bar
                  yAxisId="error"
                  dataKey="error_mw"
                  fill="#E7AD4A"
                  opacity={0.4}
                  name="Forecast Error (MW)"
                />

                {/* Actual Line */}
                <Line
                  yAxisId="generation"
                  type="monotone"
                  dataKey="actual_mw"
                  stroke="#CBD5E1"
                  strokeWidth={2}
                  dot={false}
                  name="Actual (MW)"
                />

                {/* Forecast Line */}
                <Line
                  yAxisId="generation"
                  type="monotone"
                  dataKey="forecast_mw"
                  stroke="#35B9C8"
                  strokeWidth={1.75}
                  strokeDasharray="4 4"
                  dot={false}
                  name="Day-Ahead Forecast (MW)"
                />

                {!selectedDay && (
                  <Brush
                    dataKey="timeLabel"
                    height={28}
                    stroke="#475569"
                    fill="#0f172a"
                    tickFormatter={() => ''}
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

