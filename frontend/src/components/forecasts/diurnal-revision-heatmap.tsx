import React, { useMemo } from 'react'
import type { DiurnalRevisionCell } from '@/types/api'
import { formatMw } from '@/lib/formatters'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

interface DiurnalRevisionHeatmapProps {
  cells: DiurnalRevisionCell[]
}

const HORIZON_BUCKETS = [
  '0-6h',
  '6-12h',
  '12-24h',
  '24-36h',
  '36-48h',
  '48-72h',
]

export const DiurnalRevisionHeatmap: React.FC<DiurnalRevisionHeatmapProps> = ({ cells }) => {
  // Build lookup: hour -> bucket -> cell
  const matrix = useMemo(() => {
    const map = new Map<string, DiurnalRevisionCell>()
    let maxVal = 0

    cells.forEach((cell) => {
      const key = `${cell.hour_of_day_london}-${cell.horizon_bucket}`
      map.set(key, cell)
      if (cell.mean_abs_revision_mw > maxVal) {
        maxVal = cell.mean_abs_revision_mw
      }
    })

    return { map, maxVal: Math.max(maxVal, 100) }
  }, [cells])

  const hours = Array.from({ length: 24 }, (_, i) => i)

  // Color interpolation helper
  const getCellColor = (val: number | undefined) => {
    if (val === undefined || val === 0) return 'bg-app-bg text-muted'
    const intensity = Math.min(val / matrix.maxVal, 1)

    if (intensity < 0.25) {
      return 'bg-app-elevated text-slate-300 border border-app-border'
    } else if (intensity < 0.5) {
      return 'bg-accent/15 text-accent border border-accent/30'
    } else if (intensity < 0.75) {
      return 'bg-amber-950/40 text-amber-200 border border-amber-800/40'
    } else {
      return 'bg-rose-950/60 text-rose-200 border border-rose-800/50 font-bold'
    }
  }

  return (
    <Card className="bg-app-surface border-app-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base font-semibold text-slate-200">
              Diurnal Revision Volatility Matrix (24h &times; 6 Horizons)
            </CardTitle>
            <p className="text-xs text-muted mt-1">
              Mean absolute revision (|&Delta; MW|) segmented by UK local hour of day and lead time horizon. Highlights when forecast updates are most turbulent.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted">Scale:</span>
            <div className="flex items-center gap-1 text-[10px]">
              <span className="px-1.5 py-0.5 rounded bg-app-elevated text-slate-300 border border-app-border font-mono">
                Low
              </span>
              <span className="px-1.5 py-0.5 rounded bg-accent/15 text-accent border border-accent/30 font-mono">
                Moderate
              </span>
              <span className="px-1.5 py-0.5 rounded bg-amber-950/40 text-amber-200 border border-amber-800/40 font-mono">
                Elevated
              </span>
              <span className="px-1.5 py-0.5 rounded bg-rose-950/60 text-rose-200 border border-rose-800/50 font-mono">
                High Volatility
              </span>
            </div>
            <Badge variant="outline" className="border-app-border text-muted text-[10px] font-mono">
              Peak: {formatMw(matrix.maxVal, 0)}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-3">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-center">
            <thead>
              <tr className="text-[11px] text-muted border-b border-app-border bg-[#0E1726]">
                <th className="p-2 text-left font-semibold w-24">UK Hour</th>
                {HORIZON_BUCKETS.map((bucket) => (
                  <th key={bucket} className="p-2 font-semibold">
                    {bucket}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-app-border/40">
              {hours.map((hour) => {
                const hourFormatted = `${hour.toString().padStart(2, '0')}:00`
                return (
                  <tr key={hour} className="hover:bg-app-elevated/40">
                    <td className="p-1.5 text-left text-xs font-mono text-muted font-medium bg-[#0E1726]/60 border-r border-app-border/60">
                      {hourFormatted}
                    </td>
                    {HORIZON_BUCKETS.map((bucket) => {
                      const cell = matrix.map.get(`${hour}-${bucket}`)
                      const val = cell?.mean_abs_revision_mw
                      const count = cell?.revision_count ?? 0

                      return (
                        <td key={`${hour}-${bucket}`} className="p-1">
                          <div
                            className={`p-1.5 rounded transition-all text-xs font-mono group relative cursor-help ${getCellColor(
                              val
                            )}`}
                            title={`Hour ${hourFormatted} | ${bucket}: ${
                              val ? formatMw(val, 1) : 'No data'
                            } (${count} revisions)`}
                          >
                            <div>{val ? formatMw(val, 0) : '—'}</div>
                            <div className="text-[9px] opacity-70">
                              n={count}
                            </div>
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}

