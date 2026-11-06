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
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="text-xs">
          <Scale className="w-4 h-4 text-cyan-400" />
          <span>Forecast Direction Analysis (Over vs Under)</span>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4 flex-1 flex flex-col justify-between">
        {/* Top summary figures */}
        <div className="grid grid-cols-2 gap-3 pt-1">
          {/* Overforecast */}
          <div className="rounded-lg p-3 bg-amber-950/20 border border-amber-900/40 space-y-1">
            <div className="flex items-center justify-between text-xs text-amber-300">
              <span className="font-medium flex items-center gap-1">
                <ArrowUpRight className="w-3.5 h-3.5 text-amber-400" />
                Overforecast
              </span>
              <span className="font-mono font-bold">{formatPct(overPct, 1)}</span>
            </div>
            <div className="text-2xl font-bold font-mono text-amber-200">
              {overforecastHours.toLocaleString()}{' '}
              <span className="text-xs font-normal text-amber-400/80">hrs</span>
            </div>
            <div className="text-[11px] text-slate-400">
              Predicted generation exceeded measured actuals
            </div>
          </div>

          {/* Underforecast */}
          <div className="rounded-lg p-3 bg-emerald-950/20 border border-emerald-900/40 space-y-1">
            <div className="flex items-center justify-between text-xs text-emerald-300">
              <span className="font-medium flex items-center gap-1">
                <ArrowDownRight className="w-3.5 h-3.5 text-emerald-400" />
                Underforecast
              </span>
              <span className="font-mono font-bold">{formatPct(underPct, 1)}</span>
            </div>
            <div className="text-2xl font-bold font-mono text-emerald-200">
              {underforecastHours.toLocaleString()}{' '}
              <span className="text-xs font-normal text-emerald-400/80">hrs</span>
            </div>
            <div className="text-[11px] text-slate-400">
              Measured actuals exceeded day-ahead prediction
            </div>
          </div>
        </div>

        {/* Proportional Segmented Progress Bar */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-[11px] text-slate-400 font-mono">
            <span>Forecast &gt; Actual ({overforecastHours}h)</span>
            <span>Forecast &lt; Actual ({underforecastHours}h)</span>
          </div>

          <div className="h-3 w-full rounded-full bg-slate-900 overflow-hidden flex border border-slate-800">
            <div
              style={{ width: `${overPct}%` }}
              className="bg-amber-500/80 hover:bg-amber-400 transition-all"
              title={`Overforecast: ${overforecastHours} hrs (${overPct.toFixed(1)}%)`}
            />
            {zeroPct > 0 && (
              <div
                style={{ width: `${zeroPct}%` }}
                className="bg-slate-500 hover:bg-slate-400 transition-all"
                title={`Zero error: ${zeroErrorHours} hrs (${zeroPct.toFixed(1)}%)`}
              />
            )}
            <div
              style={{ width: `${underPct}%` }}
              className="bg-emerald-500/80 hover:bg-emerald-400 transition-all"
              title={`Underforecast: ${underforecastHours} hrs (${underPct.toFixed(1)}%)`}
            />
          </div>
        </div>

        {/* Domain Integrity Notice */}
        <div className="rounded bg-[#0b1120] p-2.5 border border-slate-800/80 flex items-start gap-2 text-[11px] text-slate-400">
          <Info className="w-3.5 h-3.5 text-cyan-400 shrink-0 mt-0.5" />
          <p className="leading-snug">
            <strong className="text-slate-300">Analytical Boundary:</strong> Overforecasting means the national wind fleet produced less power than predicted at day-ahead cutoff. This metric evaluates wind generation forecasts and does not represent the utility&apos;s total portfolio electricity procurement position or customer demand.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

