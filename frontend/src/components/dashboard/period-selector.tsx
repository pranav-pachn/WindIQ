import React, { useState } from 'react'
import { Calendar, Filter, Info, Check } from 'lucide-react'
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
    <div className="bg-[#111C2D] border border-[#26364A] rounded-lg p-3.5 sm:p-4 space-y-3">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        {/* Active Window Metadata */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-[#35B9C8]" />
            <span className="font-semibold text-[#E7EDF5] text-xs">
              Market Evaluation Window
            </span>
            <span className="font-mono text-xs text-[#35B9C8] font-medium tabular-nums">
              {formatDate(currentPeriod.deliveryDateFrom)} – {formatDate(currentPeriod.deliveryDateTo)}
            </span>
          </div>

          <div className="flex items-center gap-1.5 text-[#718198]">
            <span>•</span>
            <span>Methodology:</span>
            <span className="font-mono text-[#9AAABD]">
              09:00 UK decision cutoff
            </span>
          </div>

          {currentPeriod.isBenchmarkPreset ? (
            <Badge variant="success" size="sm">
              <Check className="w-3 h-3 text-[#35B98A]" />
              <span>Verified Jan 2026 Benchmark</span>
            </Badge>
          ) : (
            <Badge variant="neutral" size="sm">
              <span>Custom Window</span>
            </Badge>
          )}
        </div>

        {/* Preset & Custom Actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          <Button
            variant={currentPeriod.isBenchmarkPreset ? 'primary' : 'secondary'}
            size="sm"
            onClick={handleSelectJanuary}
          >
            Jan 2026 (744h)
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
            Full Period
          </Button>

          <Button
            variant={isCustomOpen ? 'primary' : 'outline'}
            size="sm"
            onClick={() => setIsCustomOpen(!isCustomOpen)}
          >
            <Filter className="w-3 h-3 mr-1" />
            <span>Custom Dates</span>
          </Button>
        </div>
      </div>

      {/* Custom Date Form Dropdown */}
      {isCustomOpen && (
        <form
          onSubmit={handleApplyCustom}
          className="pt-3 border-t border-[#1E2B3E] flex flex-col sm:flex-row sm:items-end gap-3 text-xs"
        >
          <div>
            <label
              htmlFor="date-from"
              className="block text-[11px] font-medium text-[#9AAABD] mb-1 font-mono"
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
              className="px-2.5 py-1 rounded bg-[#0E1726] border border-[#26364A] text-[#E7EDF5] font-mono text-xs focus:border-[#35B9C8] focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="date-to"
              className="block text-[11px] font-medium text-[#9AAABD] mb-1 font-mono"
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
              className="px-2.5 py-1 rounded bg-[#0E1726] border border-[#26364A] text-[#E7EDF5] font-mono text-xs focus:border-[#35B9C8] focus:outline-none"
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

          {error && <span className="text-[#E36D73] text-xs font-mono">{error}</span>}
        </form>
      )}

      {/* Methodology Statement */}
      <div className="bg-[#0E1726] rounded px-3 py-2 border border-[#1E2B3E] flex items-center gap-2 text-[11px] text-[#718198]">
        <Info className="w-3.5 h-3.5 text-[#35B9C8] shrink-0" />
        <p className="leading-tight">
          <strong className="text-[#9AAABD] font-medium">Evaluation Methodology:</strong> Delivery dates in Great Britain (<code className="text-[#35B9C8] font-mono text-[10px]">Europe/London</code>). Each day is evaluated against the latest BMRS WINDFOR publication available at the configured <span className="text-[#E7EDF5] font-mono">09:00 UK day-ahead cutoff</span>.
        </p>
      </div>
    </div>
  )
}
