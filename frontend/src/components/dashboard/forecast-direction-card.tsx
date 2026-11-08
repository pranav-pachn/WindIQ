import { ArrowUpRight, ArrowDownRight, Scale, Info } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { formatPct } from '@/lib/formatters'

interface ForecastDirectionCardProps {
  overforecastHours: number
  underforecastHours: number
  zeroErrorHours: number
  totalHours: number
}

export function ForecastDirectionCard({
  overforecastHours,
  underforecastHours,
  zeroErrorHours,
  totalHours,
}: ForecastDirectionCardProps) {
  const overPct = totalHours > 0 ? (overforecastHours / totalHours) * 100 : 0
  const underPct = totalHours > 0 ? (underforecastHours / totalHours) * 100 : 0
  const zeroPct = totalHours > 0 ? (zeroErrorHours / totalHours) * 100 : 0

  return (
    <Card className="h-full flex flex-col bg-[#111C2D] border-[#26364A]">
      <CardHeader className="pb-2">
        <CardTitle className="text-xs">
          <Scale className="w-4 h-4 text-[#35B9C8]" />
          <span>Forecast Direction Analysis (Over vs Under)</span>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4 flex-1 flex flex-col justify-between">
        {/* Comparison Metrics */}
        <div className="grid grid-cols-2 gap-3 pt-1">
          {/* Overforecast */}
          <div className="rounded-lg p-3 bg-[#162337] border border-[#26364A] space-y-1">
            <div className="flex items-center justify-between text-xs text-[#E7AD4A]">
              <span className="font-medium flex items-center gap-1 text-[11px] uppercase tracking-wider font-mono">
                <ArrowUpRight className="w-3.5 h-3.5 text-[#E7AD4A]" />
                Overforecast
              </span>
              <span className="font-mono font-bold tabular-nums">{formatPct(overPct, 1)}</span>
            </div>
            <div className="text-2xl font-bold font-mono text-[#E7EDF5] tabular-nums">
              {overforecastHours.toLocaleString()}{' '}
              <span className="text-xs font-normal text-[#718198]">hrs</span>
            </div>
            <div className="text-[11px] text-[#718198] leading-tight">
              Day-ahead forecast exceeded measured settlement actuals during Jan 2026
            </div>
          </div>

          {/* Underforecast */}
          <div className="rounded-lg p-3 bg-[#162337] border border-[#26364A] space-y-1">
            <div className="flex items-center justify-between text-xs text-[#35B98A]">
              <span className="font-medium flex items-center gap-1 text-[11px] uppercase tracking-wider font-mono">
                <ArrowDownRight className="w-3.5 h-3.5 text-[#35B98A]" />
                Underforecast
              </span>
              <span className="font-mono font-bold tabular-nums">{formatPct(underPct, 1)}</span>
            </div>
            <div className="text-2xl font-bold font-mono text-[#E7EDF5] tabular-nums">
              {underforecastHours.toLocaleString()}{' '}
              <span className="text-xs font-normal text-[#718198]">hrs</span>
            </div>
            <div className="text-[11px] text-[#718198] leading-tight">
              Measured settlement actuals exceeded day-ahead forecast during Jan 2026
            </div>
          </div>
        </div>

        {/* Clear Horizontal Proportion Visualization */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-[11px] text-[#9AAABD] font-mono tabular-nums">
            <span>Forecast &gt; Actual: {overforecastHours}h ({overPct.toFixed(1)}%)</span>
            <span>Forecast &lt; Actual: {underforecastHours}h ({underPct.toFixed(1)}%)</span>
          </div>

          <div className="h-2.5 w-full rounded-sm bg-[#0E1726] overflow-hidden flex border border-[#26364A]">
            <div
              style={{ width: `${overPct}%` }}
              className="bg-[#E7AD4A] transition-all"
              title={`Overforecast: ${overforecastHours} hrs (${overPct.toFixed(1)}%)`}
            />
            {zeroPct > 0 && (
              <div
                style={{ width: `${zeroPct}%` }}
                className="bg-[#718198] transition-all"
                title={`Zero error: ${zeroErrorHours} hrs (${zeroPct.toFixed(1)}%)`}
              />
            )}
            <div
              style={{ width: `${underPct}%` }}
              className="bg-[#35B98A] transition-all"
              title={`Underforecast: ${underforecastHours} hrs (${underPct.toFixed(1)}%)`}
            />
          </div>
        </div>

        {/* Analytical Boundary Note */}
        <div className="rounded bg-[#0E1726] p-2.5 border border-[#1E2B3E] flex items-start gap-2 text-[11px] text-[#718198]">
          <Info className="w-3.5 h-3.5 text-[#35B9C8] shrink-0 mt-0.5" />
          <p className="leading-snug">
            <strong className="text-[#9AAABD]">Analytical Boundary:</strong> Evaluates national wind generation forecast deviation against outturn for the historical January 2026 evaluation period. Historical overforecast (+1,747.89 MW bias, 84.9% of hours) reflects observed winter meteorological conditions and does not represent a guaranteed future operating pattern.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
