import React, { useState } from 'react'
import { Calendar, Filter, Info, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatDate } from '@/lib/formatters'
import { JANUARY_BENCHMARK_PERIOD } from '@/lib/constants'

export interface EvaluationPeriodState {
  deliveryDateFrom: string
  deliveryDateTo: string
  isBenchmarkPreset: boolean
}

interface PeriodSelectorProps {
  currentPeriod: EvaluationPeriodState
  onPeriodChange: (period: EvaluationPeriodState) => void
  availableMinDate?: string
  availableMaxDate?: string
}

export { JANUARY_BENCHMARK_PERIOD }

export function PeriodSelector({
  currentPeriod,
  onPeriodChange,
  availableMinDate = '2026-01-02',
  availableMaxDate = '2026-11-04',
}: PeriodSelectorProps) {
  const [isCustomOpen, setIsCustomOpen] = useState(false)
  const [customFrom, setCustomFrom] = useState(currentPeriod.deliveryDateFrom)
  const [customTo, setCustomTo] = useState(currentPeriod.deliveryDateTo)
  const [error, setError] = useState<string | null>(null)

  const handleSelectJanuary = () => {
    setIsCustomOpen(false)
    setError(null)
    onPeriodChange(JANUARY_BENCHMARK_PERIOD)
  }

  const handleSelectFull = () => {
    setIsCustomOpen(false)
    setError(null)
    onPeriodChange({
      deliveryDateFrom: availableMinDate,
      deliveryDateTo: availableMaxDate,
      isBenchmarkPreset: false,
    })
  }

  const handleApplyCustom = (e: React.FormEvent) => {
    e.preventDefault()
    if (!customFrom || !customTo) {
      setError('Both start and end dates are required.')
      return
    }
    if (customFrom > customTo) {
      setError('End date must be greater than or equal to start date.')
      return
    }
    setError(null)
    onPeriodChange({
      deliveryDateFrom: customFrom,
      deliveryDateTo: customTo,
      isBenchmarkPreset:
        customFrom === JANUARY_BENCHMARK_PERIOD.deliveryDateFrom &&
        customTo === JANUARY_BENCHMARK_PERIOD.deliveryDateTo,
    })
    setIsCustomOpen(false)
  }

  return (
    <div className="bg-[#0f172a]/90 border border-slate-800 rounded-lg p-4 sm:p-5 shadow-sm space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Active Window Summary */}
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-cyan-400" />
            <h2 className="text-sm font-semibold text-slate-100 tracking-wide">
              Market Evaluation Window
            </h2>
            {currentPeriod.isBenchmarkPreset ? (
              <Badge variant="success" size="sm">
                <ShieldCheck className="w-3 h-3 text-emerald-400" />
                <span>Verified Jan 2026 Benchmark</span>
              </Badge>
            ) : (
              <Badge variant="neutral" size="sm">
                <span>Custom Date Window</span>
              </Badge>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-300">
            <div>
              <span className="text-slate-400">Delivery Period: </span>
              <span className="font-mono text-cyan-300 font-semibold">
                {formatDate(currentPeriod.deliveryDateFrom)} – {formatDate(currentPeriod.deliveryDateTo)}
              </span>
            </div>
            <div className="hidden sm:inline text-slate-600">•</div>
            <div>
              <span className="text-slate-400">Day-Ahead Decision: </span>
              <span className="font-mono text-slate-300">
                1 day prior (09:00 UK cutoff)
              </span>
            </div>
          </div>
        </div>

        {/* Preset Selector Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={currentPeriod.isBenchmarkPreset ? 'primary' : 'secondary'}
            size="sm"
            onClick={handleSelectJanuary}
          >
            January 2026 (744h)
          </Button>

          <Button
            variant={
              !currentPeriod.isBenchmarkPreset &&
              currentPeriod.deliveryDateTo === availableMaxDate
                ? 'primary'
                : 'secondary'
            }
            size="sm"
            onClick={handleSelectFull}
          >
            Full Period ({formatDate(availableMaxDate)})
          </Button>

          <Button
            variant={isCustomOpen ? 'primary' : 'outline'}
            size="sm"
            onClick={() => setIsCustomOpen(!isCustomOpen)}
          >
            <Filter className="w-3.5 h-3.5" />
            <span>Custom Dates</span>
          </Button>
        </div>
      </div>

      {/* Custom Date Form */}
      {isCustomOpen && (
        <form
          onSubmit={handleApplyCustom}
          className="pt-3 border-t border-slate-800/80 flex flex-col sm:flex-row sm:items-end gap-3 text-xs"
        >
          <div>
            <label
              htmlFor="date-from"
              className="block text-[11px] font-medium text-slate-400 mb-1"
            >
              Delivery Date From (YYYY-MM-DD)
            </label>
            <input
              id="date-from"
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              min={availableMinDate}
              max={availableMaxDate}
              className="px-3 py-1.5 rounded bg-slate-900 border border-slate-700 text-slate-100 font-mono text-xs focus:ring-1 focus:ring-cyan-500 focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="date-to"
              className="block text-[11px] font-medium text-slate-400 mb-1"
            >
              Delivery Date To (YYYY-MM-DD)
            </label>
            <input
              id="date-to"
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              min={availableMinDate}
              max={availableMaxDate}
              className="px-3 py-1.5 rounded bg-slate-900 border border-slate-700 text-slate-100 font-mono text-xs focus:ring-1 focus:ring-cyan-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-2">
            <Button type="submit" variant="primary" size="sm">
              Apply Filter
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setIsCustomOpen(false)}
            >
              Cancel
            </Button>
          </div>

          {error && <span className="text-rose-400 text-xs mt-1">{error}</span>}
        </form>
      )}

      {/* Date Domain Explanation */}
      <div className="bg-[#0b1120] rounded p-2.5 border border-slate-800/80 flex items-start gap-2 text-[11px] text-slate-400">
        <Info className="w-3.5 h-3.5 text-cyan-400 shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <span className="font-semibold text-slate-300">Timezone & Market Cutoff Rigor: </span>
          <span>
            Dates refer to <strong className="text-slate-200">Delivery Dates</strong> in Great Britain local time (<code className="text-cyan-300 font-mono">Europe/London</code>).
            Each delivery day is evaluated against the latest forecast published at or before the day-ahead <strong className="text-slate-200">09:00 UK decision cutoff</strong>.
          </span>
        </div>
      </div>
    </div>
  )
}
