import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
} from 'recharts'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Wind } from 'lucide-react'
import { formatDate, formatNumber } from '@/lib/formatters'
import type { DailyAccuracyItem } from '@/types/api'

interface DailyGenerationChartProps {
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

      {row && row.avg_forecast_mw !== null && row.avg_actual_mw !== null && (
        <div className="border-t border-slate-800 pt-1.5 text-[10px] text-slate-400 flex justify-between gap-3">
          <span>
            Daily Delta:{' '}
            <strong className="text-slate-200">
              {formatNumber((row.avg_forecast_mw || 0) - (row.avg_actual_mw || 0), 1)} MW
            </strong>
          </span>
          <span>{row.overforecast_hours}h Over / {row.underforecast_hours}h Under</span>
        </div>
      )}
    </div>
  )
}

export function DailyGenerationChart({ items }: DailyGenerationChartProps) {
  const chartData = items.map((item) => ({
    ...item,
    formattedDate: item.delivery_date.slice(5),
  }))

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xs">
            <Wind className="w-4 h-4 text-cyan-400" />
            <span>Daily Average Generation: Forecast vs Actual</span>
          </CardTitle>
          <span className="text-[11px] text-slate-400 font-mono">
            National Fleet Mean (MW)
          </span>
        </div>
      </CardHeader>

      <CardContent className="flex-1 min-h-[280px] pt-2">
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="forecastGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0.0} />
              </linearGradient>
              <linearGradient id="actualGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
              </linearGradient>
            </defs>
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
            <Area
              type="monotone"
              dataKey="avg_forecast_mw"
              name="Day-Ahead Forecast"
              stroke="#0ea5e9"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#forecastGrad)"
            />
            <Area
              type="monotone"
              dataKey="avg_actual_mw"
              name="Actual Generation"
              stroke="#10b981"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#actualGrad)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}

