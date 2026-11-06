import { lazy, Suspense } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import {
  PeriodSelector,
} from '@/components/dashboard/period-selector'
import { KpiGrid } from '@/components/dashboard/kpi-grid'
import { ForecastDirectionCard } from '@/components/dashboard/forecast-direction-card'
import { DataFreshnessCard } from '@/components/dashboard/data-freshness-card'
import { PerformanceExtremes } from '@/components/dashboard/performance-extremes'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { CardSkeleton } from '@/components/ui/skeleton'
import { usePlatformOverview } from '@/hooks/use-overview'
import { useAccuracySummary, useDailyAccuracy } from '@/hooks/use-accuracy'
import { useDataHealth } from '@/hooks/use-data-health'
import { useEvaluationPeriod } from '@/hooks/use-evaluation-period'

// Lazy load chart components for route-level code splitting & bundle reduction
const DailyAccuracyChart = lazy(() =>
  import('@/components/charts/daily-accuracy-chart').then((m) => ({
    default: m.DailyAccuracyChart,
  }))
)

const DailyGenerationChart = lazy(() =>
  import('@/components/charts/daily-generation-chart').then((m) => ({
    default: m.DailyGenerationChart,
  }))
)

const ForecastBiasChart = lazy(() =>
  import('@/components/charts/forecast-bias-chart').then((m) => ({
    default: m.ForecastBiasChart,
  }))
)

function ChartSkeleton({ height = 280 }: { height?: number }) {
  return (
    <div
      style={{ height }}
      className="w-full rounded-lg bg-slate-900/60 animate-pulse border border-slate-800 flex items-center justify-center text-xs text-slate-500 font-mono"
    >
      Loading chart telemetry...
    </div>
  )
}

export function OverviewPage() {
  const { period, setPeriod, resetToBenchmark } = useEvaluationPeriod()

  // API Queries
  const overviewQuery = usePlatformOverview()
  const summaryQuery = useAccuracySummary(
    period.deliveryDateFrom,
    period.deliveryDateTo
  )
  const dailyQuery = useDailyAccuracy(
    period.deliveryDateFrom,
    period.deliveryDateTo
  )
  const dataHealthQuery = useDataHealth()

  const isPending =
    summaryQuery.isPending || dailyQuery.isPending || overviewQuery.isPending
  const isError = summaryQuery.isError || dailyQuery.isError || overviewQuery.isError
  const error = summaryQuery.error || dailyQuery.error || overviewQuery.error

  const handleRetryAll = () => {
    summaryQuery.refetch()
    dailyQuery.refetch()
    overviewQuery.refetch()
    dataHealthQuery.refetch()
  }

  // Derive bounds from overview if available
  const availableMinDate =
    overviewQuery.data?.evaluation_period?.delivery_start_date || '2026-01-02'
  const availableMaxDate =
    overviewQuery.data?.evaluation_period?.delivery_end_date || '2026-11-04'

  return (
    <div className="space-y-6 pb-12">
      {/* 1. Evaluation Period Filter & Market Cutoff Rules */}
      <PeriodSelector
        currentPeriod={period}
        onPeriodChange={setPeriod}
        availableMinDate={availableMinDate}
        availableMaxDate={availableMaxDate}
      />

      {/* Error State Banner */}
      {isError && (
        <Alert
          variant="danger"
          title="Failed to Load Forecast Accuracy Data"
          onRetry={handleRetryAll}
          isRetrying={summaryQuery.isFetching || dailyQuery.isFetching}
        >
          {error instanceof Error
            ? error.message
            : 'Could not communicate with the WindIQ analytics API service. Please verify that the backend container is running.'}
        </Alert>
      )}

      {/* Loading Skeletons */}
      {isPending && !isError && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="h-64 rounded-lg bg-slate-900/60 animate-pulse border border-slate-800" />
            <div className="h-64 rounded-lg bg-slate-900/60 animate-pulse border border-slate-800" />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="h-80 rounded-lg bg-slate-900/60 animate-pulse border border-slate-800" />
            <div className="h-80 rounded-lg bg-slate-900/60 animate-pulse border border-slate-800" />
          </div>
        </div>
      )}

      {/* Content Rendered when Data Ready */}
      {!isPending && !isError && summaryQuery.data && (
        <>
          {/* Empty State */}
          {summaryQuery.data.metrics.valid_comparisons === 0 ? (
            <div className="rounded-lg border border-slate-800 bg-[#0f172a]/60 p-8 text-center space-y-3">
              <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto" />
              <h3 className="text-sm font-semibold text-slate-100">
                No Forecast Evaluations in Selected Date Range
              </h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                No valid day-ahead forecast and actual generation pairs were found for{' '}
                {period.deliveryDateFrom} to {period.deliveryDateTo}.
              </p>
              <Button
                variant="primary"
                size="sm"
                onClick={resetToBenchmark}
              >
                Reset to January 2026 Benchmark
              </Button>
            </div>
          ) : (
            <>
              {/* 2. Core KPI Cards Grid */}
              <KpiGrid
                metrics={summaryQuery.data.metrics}
                isBenchmarkPreset={period.isBenchmarkPreset}
              />

              {/* 3. Operational Analysis Split: Direction Ratio & Pipeline Freshness */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <ForecastDirectionCard
                  overforecastHours={summaryQuery.data.metrics.overforecast_count}
                  underforecastHours={summaryQuery.data.metrics.underforecast_count}
                  zeroErrorHours={summaryQuery.data.metrics.zero_error_count}
                  totalHours={summaryQuery.data.metrics.valid_comparisons}
                />

                {overviewQuery.data && (
                  <DataFreshnessCard
                    datasetHealth={overviewQuery.data.dataset_health}
                    detailedHealth={dataHealthQuery.data}
                  />
                )}
              </div>

              {/* 4. Best & Worst Day Performance Highlights */}
              {dailyQuery.data?.summary && (
                <PerformanceExtremes summary={dailyQuery.data.summary} />
              )}

              {/* 5. Daily Visualizations: Error Trends & Generation Baseline (Code-split) */}
              {dailyQuery.data && dailyQuery.data.items.length > 0 && (
                <>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <Suspense fallback={<ChartSkeleton height={280} />}>
                      <DailyAccuracyChart items={dailyQuery.data.items} />
                    </Suspense>
                    <Suspense fallback={<ChartSkeleton height={280} />}>
                      <DailyGenerationChart items={dailyQuery.data.items} />
                    </Suspense>
                  </div>

                  {/* 6. Daily Signed Bias Distribution */}
                  <Suspense fallback={<ChartSkeleton height={240} />}>
                    <ForecastBiasChart items={dailyQuery.data.items} />
                  </Suspense>
                </>
              )}
            </>
          )}
        </>
      )}

      {/* Manual Refresh Action in Footer */}
      <div className="pt-4 border-t border-slate-800/60 flex items-center justify-between text-xs text-slate-400">
        <span className="font-mono text-[11px]">
          WindIQ Engine: Modular Monolith v2.1 • GB BMRS WINDFOR & FUELHH
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleRetryAll}
          disabled={summaryQuery.isFetching || dailyQuery.isFetching}
          className="text-slate-400 hover:text-slate-200"
        >
          <RefreshCw
            className={`w-3.5 h-3.5 mr-1.5 ${
              summaryQuery.isFetching || dailyQuery.isFetching
                ? 'animate-spin text-cyan-400'
                : ''
            }`}
          />
          <span>Refresh Analytics</span>
        </Button>
      </div>
    </div>
  )
}
