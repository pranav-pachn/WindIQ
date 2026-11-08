import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Zap, Loader2, AlertCircle } from 'lucide-react'
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
  const [isBannerLoggingIn, setIsBannerLoggingIn] = useState(false)
  const [bannerError, setBannerError] = useState<string | null>(null)
  const location = useLocation()
  const { data: overview } = usePlatformOverview()
  const { period } = useEvaluationPeriod()
  const { isAuthenticated, isLoading, login } = useAuth()

  const handleInstantLogin = async () => {
    setIsBannerLoggingIn(true)
    setBannerError(null)
    try {
      await login('analyst@windiq.local', 'AnalystPass123!#')
    } catch (err: any) {
      setBannerError(err?.message || 'Login failed. Please verify API connectivity.')
    } finally {
      setIsBannerLoggingIn(false)
    }
  }

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
          subtitle: 'Granular evaluation metrics, diurnal distributions, and error trends',
        }
      case '/forecasts':
        return {
          title: 'Forecast Explorer',
          subtitle: 'WINDFOR publication cycle traceability, horizon convergence & cutoff audit',
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
    <div className="flex h-screen w-screen overflow-hidden bg-[#0B1220] text-[#E7EDF5]">
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

        {/* Guest Demo Prompt Banner */}
        {!isAuthenticated && !isLoading && !isBannerDismissed && (
          <div className="bg-[#111C2D] border-b border-[#26364A] px-4 py-2 sm:px-6 shrink-0">
            <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 text-[#9AAABD]">
                <span className="w-2 h-2 rounded-full bg-[#35B9C8] shrink-0" />
                <div>
                  <span className="font-semibold text-[#E7EDF5]">Demonstration Mode: </span>
                  <span>
                    Viewing as Guest. Switch to <strong className="text-[#35B9C8] font-medium">Analyst</strong> to explore all 744 benchmark evaluation hours, multi-horizon error curves, and settlement lineage.
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={isBannerLoggingIn}
                  onClick={handleInstantLogin}
                  className="px-2.5 py-1 rounded bg-[#35B9C8] hover:bg-[#2DA4B2] text-[#0A101C] font-semibold text-xs flex items-center gap-1.5 transition-colors disabled:opacity-60"
                >
                  {isBannerLoggingIn ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Zap className="w-3.5 h-3.5 fill-current" />
                  )}
                  <span>{isBannerLoggingIn ? 'Authenticating...' : 'Instant Login as Analyst'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsBannerDismissed(true)}
                  className="px-1.5 py-1 text-[#718198] hover:text-[#E7EDF5] text-xs"
                  title="Dismiss banner"
                >
                  ✕
                </button>
              </div>
            </div>
            {bannerError && (
              <div className="max-w-7xl mx-auto mt-2 p-2 rounded bg-[#3E1A1D] border border-[#5E262B] text-[#E36D73] text-xs flex items-center gap-2">
                <AlertCircle className="w-3.5 h-3.5 text-[#E36D73] shrink-0" />
                <span className="flex-1 font-mono text-[11px]">{bannerError}</span>
                <button
                  type="button"
                  onClick={() => setBannerError(null)}
                  className="text-[#E36D73] hover:text-[#E7EDF5] text-xs"
                >
                  ✕
                </button>
              </div>
            )}
          </div>
        )}

        <main className="flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:px-8 max-w-7xl w-full mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
