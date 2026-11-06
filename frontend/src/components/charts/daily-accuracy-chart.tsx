import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
} from 'recharts'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Activity } from 'lucide-react'
import { formatDate, formatNumber } from '@/lib/formatters'
import type { DailyAccuracyItem } from '@/types/api'

interface DailyAccuracyChartProps {
  items: DailyAccuracyItem[]
}

interface CustomTooltipProps {
  active?: boolean
  payload?: Array<{
    name: string
    value: number
    color: string
    payload: DailyAccuracyItem
  }>
  label?: string
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload || !payload.length) return null

  const row = payload[0]?.payload
  return (
    <div className="rounded-lg bg-slate-900/95 border border-slate-700 p-3 shadow-xl text-xs space-y-2 backdrop-blur-md">
      <div className="border-b border-slate-800 pb-1.5">
        <span className="font-semibold text-slate-100">
          Delivery: {formatDate(label)}
        </span>
        {row && (
          <span className="text-[10px] text-slate-400 block font-mono">
            Decision: {formatDate(row.decision_date)} (09:00 UK cutoff)
          </span>
        )}
      </div>

      <div className="space-y-1">
        {payload.map((entry) => (
          <div key={entry.name} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-slate-300">
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: entry.color }}
              />
              {entry.name}:
            </span>
            <span className="font-mono font-semibold text-slate-100">
              {formatNumber(entry.value, 1)} MW
            </span>
          </div>
        ))}
      </div>

      {row && (
        <div className="border-t border-slate-800 pt-1.5 text-[10px] text-slate-400 flex justify-between gap-3">
          <span>MAPE: {formatNumber(row.mape_pct, 1)}%</span>
          <span>Bias: {formatNumber(row.bias_mw, 1)} MW</span>
        </div>
      )}
    </div>
  )
}

export function DailyAccuracyChart({ items }: DailyAccuracyChartProps) {
  const chartData = items.map((item) => ({
    ...item,
    formattedDate: item.delivery_date.slice(5), // MM-DD for clean x-axis
  }))

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xs">
            <Activity className="w-4 h-4 text-cyan-400" />
            <span>Daily Forecast Error Trends (MAE & RMSE)</span>
          </CardTitle>
          <span className="text-[11px] text-slate-400 font-mono">
            31 Delivery Days (Jan 2026)
          </span>
        </div>
      </CardHeader>

      <CardContent className="flex-1 min-h-[280px] pt-2">
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
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
            <Legend
              verticalAlign="top"
              align="right"
              iconType="circle"
              wrapperStyle={{ fontSize: '11px', paddingBottom: '8px' }}
            />
            <Line
              type="monotone"
              dataKey="mae_mw"
              name="MAE (Linear Error)"
              stroke="#06b6d4"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, stroke: '#22d3ee', strokeWidth: 2 }}
            />
            <Line
              type="monotone"
              dataKey="rmse_mw"
              name="RMSE (Penalized Error)"
              stroke="#f59e0b"
              strokeWidth={1.5}
              strokeDasharray="4 4"
              dot={false}
              activeDot={{ r: 4, stroke: '#fbbf24', strokeWidth: 2 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}

