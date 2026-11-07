import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Zap } from 'lucide-react'
import { Sidebar } from './sidebar'
import { TopNav } from './top-nav'
import { usePlatformOverview } from '@/hooks/use-overview'
import { useEvaluationPeriod } from '@/hooks/use-evaluation-period'
import { useAuth } from '@/context/auth-context'
import { formatDate } from '@/lib/formatters'

export function AppShell() {
  const [collapsed, setCollapsed] = useState(false)
  const [isMobileOpen, setIsMobileOpen] = useState(false)
  const [isBannerDismissed, setIsBannerDismissed] = useState(false)
  const location = useLocation()
  const { data: overview } = usePlatformOverview()
  const { period } = useEvaluationPeriod()
  const { isAuthenticated, isLoading, login } = useAuth()

  // Determine page title based on path
  const getPageInfo = () => {
    switch (location.pathname) {
      case '/':
      case '/overview':
        return {
          title: 'Executive Overview',
          subtitle: 'National GB Wind Generation Day-Ahead Forecast Accuracy & Benchmarks',
        }
      case '/accuracy':
        return {
          title: 'Forecast Accuracy Analysis',
          subtitle: 'Granular evaluation metrics and error trends',
        }
      case '/forecasts':
        return {
          title: 'Forecast Explorer',
          subtitle: 'WINDFOR publication cycle traceability & cutoff audit',
        }
      case '/data-health':
        return {
          title: 'Data Health & Pipeline Audit',
          subtitle: 'Stream ingestion, scheduler state & data quality logs',
        }
      case '/settings':
        return {
          title: 'System Settings',
          subtitle: 'Market cutoff parameters & platform configuration',
        }
      default:
        return {
          title: 'WindIQ Platform',
          subtitle: 'UK Wind Generation Intelligence',
        }
    }
  }

  const pageInfo = getPageInfo()

  // Selected period formatting (reflects active user selection)
  const selectedPeriodLabel = `${formatDate(period.deliveryDateFrom)} – ${formatDate(period.deliveryDateTo)}`

  // Complete database coverage formatting (reflects full historical range stored in DB)
  const databaseCoverageLabel = overview?.evaluation_period
    ? `${formatDate(overview.evaluation_period.delivery_start_date)} – ${formatDate(overview.evaluation_period.delivery_end_date)}`
    : undefined

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#080d1a] text-slate-100">
      <Sidebar
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed(!collapsed)}
        isMobileOpen={isMobileOpen}
        onCloseMobile={() => setIsMobileOpen(false)}
      />

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <TopNav
          pageTitle={pageInfo.title}
          subtitle={pageInfo.subtitle}
          lastIngestionUtc={overview?.dataset_health?.last_successful_ingestion_utc}
          selectedPeriodLabel={selectedPeriodLabel}
          isBenchmarkPreset={period.isBenchmarkPreset}
          databaseCoverageLabel={databaseCoverageLabel}
          onOpenMobileSidebar={() => setIsMobileOpen(true)}
        />

        {!isAuthenticated && !isLoading && !isBannerDismissed && (
          <div className="bg-gradient-to-r from-cyan-950/90 via-slate-900/90 to-amber-950/40 border-b border-cyan-800/50 px-4 py-2.5 sm:px-6 shrink-0">
            <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2.5 text-slate-200">
                <span className="flex h-2.5 w-2.5 relative shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-cyan-500"></span>
                </span>
                <div>
                  <span className="font-bold text-slate-100">Live Demo Mode: </span>
                  <span className="text-slate-300">
                    Viewing as Guest. Switch to <strong className="text-cyan-300 font-semibold">Analyst</strong> to explore all 744 benchmark evaluation hours, multi-horizon error convergence, and publication audits.
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => login('analyst@windiq.local', 'AnalystPass123!#')}
                  className="px-3 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition-all shadow-sm shadow-cyan-500/30"
                >
                  <Zap className="w-3.5 h-3.5 fill-current" />
                  <span>Instant Login as Analyst</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsBannerDismissed(true)}
                  className="px-2 py-1 text-slate-400 hover:text-slate-200 text-xs"
                  title="Dismiss banner"
                >
                  ✕
                </button>
              </div>
            </div>
          </div>
        )}

        <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8 max-w-7xl w-full mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
