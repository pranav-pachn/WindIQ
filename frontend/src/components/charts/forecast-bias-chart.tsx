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
import { CHART_THEME } from '@/lib/chart-theme'
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
  const bias = row?.bias_mw ?? 0
  const isPositive = bias > 0
  const isZero = bias === 0

  return (
    <div className="rounded-md bg-[#111C2D] border border-[#26364A] p-2.5 shadow-xl text-xs space-y-1.5 text-[#E7EDF5]">
      <div className="border-b border-[#1E2B3E] pb-1">
        <span className="font-semibold text-[#E7EDF5]">
          Delivery Date: {formatDate(label)}
        </span>
      </div>

      <div className="space-y-1 font-mono text-[11px] tabular-nums">
        <div className="flex items-center justify-between gap-4">
          <span className="text-[#9AAABD]">Signed Bias:</span>
          <span
            className={`font-semibold ${
              isPositive
                ? 'text-[#E7AD4A]'
                : isZero
                ? 'text-[#9AAABD]'
                : 'text-[#35B9C8]'
            }`}
          >
            {isPositive ? '+' : ''}
            {formatNumber(bias, 1)} MW
          </span>
        </div>
        <div className="flex items-center justify-between gap-4 text-[#718198]">
          <span>Direction:</span>
          <span>
            {isPositive
              ? 'Overforecast (Predicted > Actual)'
              : isZero
              ? 'Balanced'
              : 'Underforecast (Predicted < Actual)'}
          </span>
        </div>
      </div>
    </div>
  )
}

export function ForecastBiasChart({ items }: ForecastBiasChartProps) {
  const chartData = items.map((item) => ({
    ...item,
    formattedDate: item.delivery_date.slice(5),
  }))

  return (
    <Card className="h-full flex flex-col bg-[#111C2D] border-[#26364A]">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xs">
            <Compass className="w-4 h-4 text-[#35B9C8]" />
            <span>Daily Signed Forecast Bias (Forecast − Actual)</span>
          </CardTitle>
          <div className="flex items-center gap-3 text-[11px] font-mono">
            <span className="flex items-center gap-1 text-[#E7AD4A]">
              <span className="w-2 h-2 rounded-full bg-[#E7AD4A]" />
              + Overforecast
            </span>
            <span className="flex items-center gap-1 text-[#35B9C8]">
              <span className="w-2 h-2 rounded-full bg-[#35B9C8]" />
              − Underforecast
            </span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1 min-h-[240px] pt-2">
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
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
            <ReferenceLine y={0} stroke={CHART_THEME.colors.zeroLine} strokeWidth={1} />
            <Bar dataKey="bias_mw" name="Signed Bias (MW)" radius={[2, 2, 0, 0]}>
              {chartData.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={entry.bias_mw >= 0 ? CHART_THEME.colors.positiveError : CHART_THEME.colors.negativeError}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
