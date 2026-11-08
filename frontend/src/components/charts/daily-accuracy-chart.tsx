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
import { CHART_THEME } from '@/lib/chart-theme'
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
    <div className="rounded-md bg-[#111C2D] border border-[#26364A] p-2.5 shadow-xl text-xs space-y-1.5 text-[#E7EDF5]">
      <div className="border-b border-[#1E2B3E] pb-1">
        <span className="font-semibold text-[#E7EDF5]">
          Delivery Date: {formatDate(label)}
        </span>
        {row && (
          <span className="text-[10px] text-[#718198] block font-mono">
            Cutoff: {formatDate(row.decision_date)} 09:00 UK
          </span>
        )}
      </div>

      <div className="space-y-1 font-mono text-[11px] tabular-nums">
        {payload.map((entry) => (
          <div key={entry.name} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-[#9AAABD]">
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: entry.color }}
              />
              {entry.name}:
            </span>
            <span className="font-semibold text-[#E7EDF5]">
              {formatNumber(entry.value, 1)} MW
            </span>
          </div>
        ))}
      </div>

      {row && (
        <div className="border-t border-[#1E2B3E] pt-1 text-[10px] text-[#718198] font-mono flex justify-between gap-3 tabular-nums">
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
    formattedDate: item.delivery_date.slice(5),
  }))

  return (
    <Card className="h-full flex flex-col bg-[#111C2D] border-[#26364A]">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xs">
            <Activity className="w-4 h-4 text-[#35B9C8]" />
            <span>Daily Forecast Error Trends (MAE &amp; RMSE)</span>
          </CardTitle>
          <span className="text-[11px] text-[#718198] font-mono tabular-nums">
            {items.length} Delivery Days
          </span>
        </div>
      </CardHeader>

      <CardContent className="flex-1 min-h-[280px] pt-2">
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray={CHART_THEME.grid.strokeDasharray} stroke={CHART_THEME.grid.stroke} vertical={false} />
            <XAxis
              dataKey="formattedDate"
              stroke={CHART_THEME.xAxis.stroke}
              fontSize={CHART_THEME.xAxis.fontSize}
              tickLine={false}
              axisLine={CHART_THEME.xAxis.axisLine}
            />
            <YAxis
              stroke={CHART_THEME.yAxis.stroke}
              fontSize={CHART_THEME.yAxis.fontSize}
              tickLine={false}
              axisLine={CHART_THEME.yAxis.axisLine}
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
              name="MAE (Linear)"
              stroke={CHART_THEME.colors.mae}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, stroke: CHART_THEME.colors.mae, strokeWidth: 2 }}
            />
            <Line
              type="monotone"
              dataKey="rmse_mw"
              name="RMSE (Penalized)"
              stroke={CHART_THEME.colors.rmse}
              strokeWidth={1.5}
              strokeDasharray="4 4"
              dot={false}
              activeDot={{ r: 4, stroke: CHART_THEME.colors.rmse, strokeWidth: 2 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
