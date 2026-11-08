import React, { useState } from 'react'
import {
  Compass,
  AlertCircle,
  RefreshCw,
  Clock,
} from 'lucide-react'
import { useEvaluationPeriod } from '@/hooks/use-evaluation-period'
import {
  useSingleHourPublications,
  useMultiHorizonAnalysis,
  useRevisionAnalytics,
  useHourlySeriesForTimeline,
} from '@/hooks/use-forecasts'
import type { HorizonMode } from '@/types/api'
import { ForecastToolbar, type ForecastViewMode } from '@/components/forecasts/forecast-toolbar'
import { PublicationTrajectoryChart } from '@/components/forecasts/publication-trajectory-chart'
import { PublicationHistoryTable } from '@/components/forecasts/publication-history-table'
import { MultiHorizonChart } from '@/components/forecasts/multi-horizon-chart'
import { RevisionDistributionChart } from '@/components/forecasts/revision-distribution-chart'
import { DiurnalRevisionHeatmap } from '@/components/forecasts/diurnal-revision-heatmap'
import { ForecastActualComparison } from '@/components/forecasts/forecast-actual-comparison'
import { PublicationTraceModal } from '@/components/forecasts/publication-trace-modal'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

export function ForecastPage() {
  const { period } = useEvaluationPeriod()
  const { deliveryDateFrom, deliveryDateTo } = period

  // View mode and filter states
  const [viewMode, setViewMode] = useState<ForecastViewMode>('single_hour')
  const [selectedDeliveryHourUtc, setSelectedDeliveryHourUtc] = useState<string>(
    '2026-01-28T12:00:00Z'
  )
  const [horizonMode, setHorizonMode] = useState<HorizonMode>('matched')
  const [minRevisionMw, setMinRevisionMw] = useState<number>(500.0)
  const [isAuditModalOpen, setIsAuditModalOpen] = useState<boolean>(false)

  // View 1 Queries
  const {
    data: singleHourData,
    isLoading: isSingleHourLoading,
    isError: isSingleHourError,
    error: singleHourError,
    refetch: refetchSingleHour,
  } = useSingleHourPublications(selectedDeliveryHourUtc)

  // View 2 Queries
  const {
    data: multiHorizonData,
    isLoading: isMultiHorizonLoading,
    isError: isMultiHorizonError,
    error: multiHorizonError,
    refetch: refetchMultiHorizon,
  } = useMultiHorizonAnalysis(deliveryDateFrom, deliveryDateTo, horizonMode)

  // View 3 Queries
  const {
    data: revisionData,
    isLoading: isRevisionLoading,
    isError: isRevisionError,
    error: revisionError,
    refetch: refetchRevisions,
  } = useRevisionAnalytics(deliveryDateFrom, deliveryDateTo, minRevisionMw)

  // View 4 Queries
  const {
    data: timelineData,
    isLoading: isTimelineLoading,
    isError: isTimelineError,
    error: timelineError,
    refetch: refetchTimeline,
  } = useHourlySeriesForTimeline(deliveryDateFrom, deliveryDateTo)

  // Callback to jump to View 1 from other views
  const handleInspectDeliveryHour = (hourUtc: string) => {
    setSelectedDeliveryHourUtc(hourUtc)
    setViewMode('single_hour')
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Page Title & Status Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-app-border">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-app-elevated border border-app-border text-accent">
              <Compass className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-100">
                Forecast Explorer &amp; Multi-Horizon Analysis
              </h1>
              <p className="text-xs text-muted mt-0.5">
                Multi-cycle BMRS WINDFOR publication history, horizon error convergence, and forward revision trajectory analytics.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-app-border bg-app-elevated text-muted text-xs py-1 px-2.5 font-mono">
            <Clock className="w-3.5 h-3.5 text-muted mr-1.5" />
            Window: {deliveryDateFrom} to {deliveryDateTo}
          </Badge>
        </div>
      </div>

      {/* Unified Toolbar */}
      <ForecastToolbar
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        selectedDeliveryHourUtc={selectedDeliveryHourUtc}
        onDeliveryHourChange={setSelectedDeliveryHourUtc}
        horizonMode={horizonMode}
        onHorizonModeChange={setHorizonMode}
        minRevisionMw={minRevisionMw}
        onMinRevisionMwChange={setMinRevisionMw}
      />

      {/* VIEW 1: Single Delivery Hour Evolution */}
      {viewMode === 'single_hour' && (
        <div className="space-y-6">
          {isSingleHourLoading && (
            <Card className="bg-slate-900 border-slate-800">
              <CardContent className="p-12 text-center text-slate-400 space-y-3">
                <RefreshCw className="h-6 w-6 animate-spin mx-auto text-cyan-400" />
                <p className="text-sm">Loading publication evolution for {selectedDeliveryHourUtc}...</p>
              </CardContent>
            </Card>
          )}

          {isSingleHourError && (
            <Card className="bg-rose-950/20 border-rose-900/50">
              <CardContent className="p-6 text-center space-y-3">
                <AlertCircle className="h-6 w-6 text-rose-400 mx-auto" />
                <div className="text-sm text-rose-300 font-medium">
                  Failed to load publication trajectory
                </div>
                <p className="text-xs text-slate-400">
                  {singleHourError instanceof Error ? singleHourError.message : 'Unknown error'}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => refetchSingleHour()}
                  className="border-rose-800 text-rose-300"
                >
                  Retry
                </Button>
              </CardContent>
            </Card>
          )}

          {singleHourData && (
            <>
              <PublicationTrajectoryChart
                data={singleHourData}
                onOpenAuditModal={() => setIsAuditModalOpen(true)}
              />
              <PublicationHistoryTable
                data={singleHourData}
                onOpenAuditModal={() => setIsAuditModalOpen(true)}
              />
            </>
          )}
        </div>
      )}

      {/* VIEW 2: Multi-Horizon Analysis */}
      {viewMode === 'multi_horizon' && (
        <div className="space-y-6">
          {isMultiHorizonLoading && (
            <Card className="bg-slate-900 border-slate-800">
              <CardContent className="p-12 text-center text-slate-400 space-y-3">
                <RefreshCw className="h-6 w-6 animate-spin mx-auto text-cyan-400" />
                <p className="text-sm">Computing multi-horizon error convergence ({horizonMode} mode)...</p>
              </CardContent>
            </Card>
          )}

          {isMultiHorizonError && (
            <Card className="bg-rose-950/20 border-rose-900/50">
              <CardContent className="p-6 text-center space-y-3">
                <AlertCircle className="h-6 w-6 text-rose-400 mx-auto" />
                <div className="text-sm text-rose-300 font-medium">
                  Failed to compute multi-horizon analysis
                </div>
                <p className="text-xs text-slate-400">
                  {multiHorizonError instanceof Error ? multiHorizonError.message : 'Unknown error'}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => refetchMultiHorizon()}
                  className="border-rose-800 text-rose-300"
                >
                  Retry
                </Button>
              </CardContent>
            </Card>
          )}

          {multiHorizonData && <MultiHorizonChart data={multiHorizonData} />}
        </div>
      )}

      {/* VIEW 3: Revision Trajectory & Volatility */}
      {viewMode === 'revisions' && (
        <div className="space-y-6">
          {isRevisionLoading && (
            <Card className="bg-slate-900 border-slate-800">
              <CardContent className="p-12 text-center text-slate-400 space-y-3">
                <RefreshCw className="h-6 w-6 animate-spin mx-auto text-cyan-400" />
                <p className="text-sm">Analyzing forward revision trajectories &amp; diurnal volatility...</p>
              </CardContent>
            </Card>
          )}

          {isRevisionError && (
            <Card className="bg-rose-950/20 border-rose-900/50">
              <CardContent className="p-6 text-center space-y-3">
                <AlertCircle className="h-6 w-6 text-rose-400 mx-auto" />
                <div className="text-sm text-rose-300 font-medium">
                  Failed to load revision analytics
                </div>
                <p className="text-xs text-slate-400">
                  {revisionError instanceof Error ? revisionError.message : 'Unknown error'}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => refetchRevisions()}
                  className="border-rose-800 text-rose-300"
                >
                  Retry
                </Button>
              </CardContent>
            </Card>
          )}

          {revisionData && (
            <>
              <RevisionDistributionChart
                data={revisionData}
                onSelectDeliveryHour={handleInspectDeliveryHour}
              />
              <DiurnalRevisionHeatmap cells={revisionData.diurnal_revision_heatmap} />
            </>
          )}
        </div>
      )}

      {/* VIEW 4: Continuous Horizon vs Actual Comparison */}
      {viewMode === 'comparison' && (
        <div className="space-y-6">
          {isTimelineLoading && (
            <Card className="bg-slate-900 border-slate-800">
              <CardContent className="p-12 text-center text-slate-400 space-y-3">
                <RefreshCw className="h-6 w-6 animate-spin mx-auto text-cyan-400" />
                <p className="text-sm">Loading complete hourly evaluations timeline...</p>
              </CardContent>
            </Card>
          )}

          {isTimelineError && (
            <Card className="bg-rose-950/20 border-rose-900/50">
              <CardContent className="p-6 text-center space-y-3">
                <AlertCircle className="h-6 w-6 text-rose-400 mx-auto" />
                <div className="text-sm text-rose-300 font-medium">
                  Failed to load comparison timeline
                </div>
                <p className="text-xs text-slate-400">
                  {timelineError instanceof Error ? timelineError.message : 'Unknown error'}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => refetchTimeline()}
                  className="border-rose-800 text-rose-300"
                >
                  Retry
                </Button>
              </CardContent>
            </Card>
          )}

          {timelineData && (
            <ForecastActualComparison
              items={timelineData}
              onSelectDeliveryHour={handleInspectDeliveryHour}
            />
          )}
        </div>
      )}

      {/* Modal: Full Audit & Lineage */}
      {isAuditModalOpen && singleHourData && (
        <PublicationTraceModal
          data={singleHourData}
          onClose={() => setIsAuditModalOpen(false)}
        />
      )}
    </div>
  )
}
