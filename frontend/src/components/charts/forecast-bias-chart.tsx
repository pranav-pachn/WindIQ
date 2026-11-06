import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ReferenceLine,
  Cell,
} from 'recharts'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Compass } from 'lucide-react'
import { formatDate, formatNumber } from '@/lib/formatters'
import type { DailyAccuracyItem } from '@/types/api'

interface ForecastBiasChartProps {
  items: DailyAccuracyItem[]
}

interface CustomTooltipProps {
  active?: boolean
  payload?: Array<{
    value: number
    payload: DailyAccuracyItem
  }>
  label?: string
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload || !payload.length) return null

  const row = payload[0]?.payload
  const bias = payload[0]?.value ?? 0
  const isOver = bias > 0

  return (
    <div className="rounded-lg bg-slate-900/95 border border-slate-700 p-3 shadow-xl text-xs space-y-1.5 backdrop-blur-md">
      <div className="border-b border-slate-800 pb-1">
        <span className="font-semibold text-slate-100">
          Delivery: {formatDate(label)}
        </span>
      </div>

      <div className="flex items-center justify-between gap-3">
        <span className="text-slate-300">Daily Forecast Bias:</span>
        <span
          className={`font-mono font-bold ${
            isOver ? 'text-amber-300' : 'text-emerald-300'
          }`}
        >
          {bias > 0 ? `+${formatNumber(bias, 1)}` : formatNumber(bias, 1)} MW
        </span>
      </div>

      <div className="text-[10px] text-slate-400">
        {isOver
          ? 'Systematic overforecast (Forecast > Actual)'
          : bias < 0
          ? 'Systematic underforecast (Forecast < Actual)'
          : 'Zero net daily bias'}
      </div>

      {row && (
        <div className="border-t border-slate-800 pt-1 text-[10px] text-slate-400 flex justify-between gap-3">
          <span>{row.overforecast_hours}h Over</span>
          <span>{row.underforecast_hours}h Under</span>
        </div>
      )}
    </div>
  )
}

export function ForecastBiasChart({ items }: ForecastBiasChartProps) {
  const chartData = items.map((item) => ({
    ...item,
    formattedDate: item.delivery_date.slice(5),
  }))

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xs">
            <Compass className="w-4 h-4 text-cyan-400" />
            <span>Daily Signed Forecast Bias (Forecast − Actual)</span>
          </CardTitle>
          <div className="flex items-center gap-3 text-[11px]">
            <span className="flex items-center gap-1 text-amber-300">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              + Overforecast
            </span>
            <span className="flex items-center gap-1 text-emerald-300">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              − Underforecast
            </span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1 min-h-[240px] pt-2">
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
            <XAxis
              dataKey="formattedDate"
              stroke="#64748b"
              fontSize={10}
              tickLine={false}
              axisLine={{ stroke: '#334155' }}
            />
            <YAxis
              stroke="#64748b"
              fontSize={10}
              tickLine={false}
              axisLine={{ stroke: '#334155' }}
              tickFormatter={(v: number) => `${v / 1000}k`}
              unit=" MW"
            />
            <RechartsTooltip content={<CustomTooltip />} />
            <ReferenceLine y={0} stroke="#475569" strokeWidth={1} />
            <Bar dataKey="bias_mw" name="Signed Bias (MW)" radius={[2, 2, 0, 0]}>
              {chartData.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={entry.bias_mw >= 0 ? '#f59e0b' : '#10b981'}
                  opacity={0.85}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}

