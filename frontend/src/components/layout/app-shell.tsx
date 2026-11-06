import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from './sidebar'
import { TopNav } from './top-nav'
import { usePlatformOverview } from '@/hooks/use-overview'
import { useEvaluationPeriod } from '@/hooks/use-evaluation-period'
import { formatDate } from '@/lib/formatters'

export function AppShell() {
  const [collapsed, setCollapsed] = useState(false)
  const [isMobileOpen, setIsMobileOpen] = useState(false)
  const location = useLocation()
  const { data: overview } = usePlatformOverview()
  const { period } = useEvaluationPeriod()

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

        <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8 max-w-7xl w-full mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
