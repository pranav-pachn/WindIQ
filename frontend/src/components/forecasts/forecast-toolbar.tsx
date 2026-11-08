import React from 'react'
import {
  Layers,
  TrendingDown,
  Activity,
  GitCommit,
  Clock,
  Calendar,
  Filter,
} from 'lucide-react'
import type { HorizonMode } from '@/types/api'

export type ForecastViewMode = 'single_hour' | 'multi_horizon' | 'revisions' | 'comparison'

interface ForecastToolbarProps {
  viewMode: ForecastViewMode
  onViewModeChange: (view: ForecastViewMode) => void
  // View 1 props
  selectedDeliveryHourUtc: string
  onDeliveryHourChange: (hourUtc: string) => void
  // View 2 props
  horizonMode: HorizonMode
  onHorizonModeChange: (mode: HorizonMode) => void
  // View 3 props
  minRevisionMw: number
  onMinRevisionMwChange: (mw: number) => void
}

export const ForecastToolbar: React.FC<ForecastToolbarProps> = ({
  viewMode,
  onViewModeChange,
  selectedDeliveryHourUtc,
  onDeliveryHourChange,
  horizonMode,
  onHorizonModeChange,
  minRevisionMw,
  onMinRevisionMwChange,
}) => {
  return (
    <div className="bg-[#111C2D] border border-[#26364A] rounded-lg p-3.5 mb-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* View Switcher Tabs */}
        <div className="flex flex-wrap items-center bg-[#0B1220] p-1 rounded-lg border border-[#26364A] gap-1 text-xs">
          <button
            type="button"
            onClick={() => onViewModeChange('single_hour')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
              viewMode === 'single_hour'
                ? 'bg-[#162337] text-[#35B9C8] border border-[#35B9C8]/40 font-semibold shadow-sm'
                : 'text-[#9AAABD] hover:text-[#E7EDF5] hover:bg-[#162337]/50 border border-transparent'
            }`}
          >
            <GitCommit className="w-3.5 h-3.5" />
            <span>1. Publication Evolution</span>
          </button>

          <button
            type="button"
            onClick={() => onViewModeChange('multi_horizon')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
              viewMode === 'multi_horizon'
                ? 'bg-[#162337] text-[#35B9C8] border border-[#35B9C8]/40 font-semibold shadow-sm'
                : 'text-[#9AAABD] hover:text-[#E7EDF5] hover:bg-[#162337]/50 border border-transparent'
            }`}
          >
            <TrendingDown className="w-3.5 h-3.5" />
            <span>2. Multi-Horizon Convergence</span>
          </button>

          <button
            type="button"
            onClick={() => onViewModeChange('revisions')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
              viewMode === 'revisions'
                ? 'bg-[#162337] text-[#35B9C8] border border-[#35B9C8]/40 font-semibold shadow-sm'
                : 'text-[#9AAABD] hover:text-[#E7EDF5] hover:bg-[#162337]/50 border border-transparent'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>3. Revision Trajectory</span>
          </button>

          <button
            type="button"
            onClick={() => onViewModeChange('comparison')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
              viewMode === 'comparison'
                ? 'bg-[#162337] text-[#35B9C8] border border-[#35B9C8]/40 font-semibold shadow-sm'
                : 'text-[#9AAABD] hover:text-[#E7EDF5] hover:bg-[#162337]/50 border border-transparent'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>4. Horizon vs Actual</span>
          </button>
        </div>

        {/* Dynamic Context Controls based on View */}
        <div className="flex flex-wrap items-center gap-3">
          {viewMode === 'single_hour' && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-[#9AAABD] flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-[#35B9C8]" />
                Delivery Hour:
              </span>
              <select
                value={selectedDeliveryHourUtc}
                onChange={(e) => onDeliveryHourChange(e.target.value)}
                className="bg-[#0B1220] border border-[#26364A] rounded-md px-2.5 py-1.5 text-xs font-mono text-[#E7EDF5] focus:outline-none focus:border-[#35B9C8] cursor-pointer"
              >
                <option value="2026-01-28T12:00:00Z">28 Jan 2026 12:00 UTC (Peak Worst Day)</option>
                <option value="2026-01-19T14:00:00Z">19 Jan 2026 14:00 UTC (Best Performance Day)</option>
                <option value="2026-01-20T17:00:00Z">20 Jan 2026 17:00 UTC (Extreme Swing +4,456 MW)</option>
                <option value="2026-01-12T08:00:00Z">12 Jan 2026 08:00 UTC (High Wind Ramp)</option>
                <option value="2026-01-05T00:00:00Z">05 Jan 2026 00:00 UTC (Warmup Baseline)</option>
                <option value="2026-02-01T23:00:00Z">01 Feb 2026 23:00 UTC (Benchmark Closing Hour)</option>
              </select>
            </div>
          )}

          {viewMode === 'multi_horizon' && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-[#9AAABD] flex items-center gap-1">
                <Filter className="w-3.5 h-3.5 text-[#35B9C8]" />
                Population Mode:
              </span>
              <div className="inline-flex rounded-lg border border-[#26364A] bg-[#0B1220] p-0.5">
                <button
                  type="button"
                  onClick={() => onHorizonModeChange('matched')}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                    horizonMode === 'matched'
                      ? 'bg-[#162337] text-[#35B9C8] border border-[#35B9C8]/40 font-semibold'
                      : 'text-[#9AAABD] hover:text-[#E7EDF5] border border-transparent'
                  }`}
                  title="Restricts to 553 delivery hours present across all 6 horizon buckets (eliminates sample selection bias)"
                >
                  Matched (553h)
                </button>
                <button
                  type="button"
                  onClick={() => onHorizonModeChange('publication_weighted')}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                    horizonMode === 'publication_weighted'
                      ? 'bg-[#162337] text-[#35B9C8] border border-[#35B9C8]/40 font-semibold'
                      : 'text-[#9AAABD] hover:text-[#E7EDF5] border border-transparent'
                  }`}
                  title="Evaluates all 14,111 eligible forward publications"
                >
                  Publication-Weighted
                </button>
                <button
                  type="button"
                  onClick={() => onHorizonModeChange('unmatched_representative')}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                    horizonMode === 'unmatched_representative'
                      ? 'bg-[#162337] text-[#35B9C8] border border-[#35B9C8]/40 font-semibold'
                      : 'text-[#9AAABD] hover:text-[#E7EDF5] border border-transparent'
                  }`}
                  title="1 observation per available hour without requiring 6-horizon common intersection"
                >
                  1-per-Hour Available
                </button>
              </div>
            </div>
          )}

          {viewMode === 'revisions' && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-[#9AAABD] flex items-center gap-1">
                <Filter className="w-3.5 h-3.5 text-[#35B9C8]" />
                Min Swing Filter:
              </span>
              <select
                value={minRevisionMw}
                onChange={(e) => onMinRevisionMwChange(Number(e.target.value))}
                className="bg-[#0B1220] border border-[#26364A] rounded-md px-2.5 py-1.5 text-xs font-mono text-[#E7EDF5] focus:outline-none focus:border-[#35B9C8] cursor-pointer"
              >
                <option value={250}>&ge; 250 MW</option>
                <option value={500}>&ge; 500 MW (Standard)</option>
                <option value={1000}>&ge; 1,000 MW (Major)</option>
                <option value={2000}>&ge; 2,000 MW (Extreme)</option>
              </select>
            </div>
          )}

          {viewMode === 'comparison' && (
            <div className="flex items-center gap-2 text-xs text-[#9AAABD]">
              <Calendar className="w-3.5 h-3.5 text-[#35B9C8]" />
              <span>Full Benchmark Delivery Month: 02 Jan – 01 Feb 2026</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

