import { Menu, WifiOff, Clock, Calendar } from 'lucide-react'
import { formatUtcDateTime } from '@/lib/formatters'
import { useApiHealth } from '@/hooks/use-api-health'
import { UserMenu } from '@/components/layout/user-menu'
import { QuickRoleSwitcher } from '@/components/layout/quick-role-switcher'
import { Tooltip } from '@/components/ui/tooltip'

interface TopNavProps {
  pageTitle: string
  subtitle?: string
  lastIngestionUtc?: string | null
  selectedPeriodLabel?: string
  isBenchmarkPreset?: boolean
  databaseCoverageLabel?: string
  onOpenMobileSidebar: () => void
}

export function TopNav({
  pageTitle,
  subtitle,
  lastIngestionUtc,
  selectedPeriodLabel,
  isBenchmarkPreset: _isBenchmarkPreset,
  databaseCoverageLabel,
  onOpenMobileSidebar,
}: TopNavProps) {
  const { data: apiHealth, isPending: isCheckingHealth } = useApiHealth()

  const isConnected = apiHealth?.isConnected ?? false
  const latency = apiHealth?.latencyMs

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between h-14 px-4 sm:px-6 bg-[#0B1220] border-b border-[#26364A] shrink-0">
      {/* 1. Primary Region: Title & Context */}
      <div className="flex items-center gap-2.5 sm:gap-3 shrink-0 min-w-0">
        <button
          type="button"
          onClick={onOpenMobileSidebar}
          aria-label="Open navigation menu"
          className="lg:hidden p-1.5 text-[#718198] hover:text-[#E7EDF5] rounded hover:bg-[#162337] focus:outline-none shrink-0"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 min-w-0">
          <h1 className="text-sm sm:text-base font-semibold text-[#E7EDF5] tracking-tight whitespace-nowrap">
            {pageTitle}
          </h1>
          {subtitle && (
            <span className="text-[11px] text-[#718198] hidden 2xl:inline whitespace-nowrap">
              &bull; {subtitle}
            </span>
          )}
        </div>
      </div>

      {/* 2. Context Region: Selected Period & Data Bounds */}
      <div className="hidden xl:flex items-center gap-2 shrink-0">
        {selectedPeriodLabel && (
          <div
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#111C2D] border border-[#26364A] text-xs text-[#9AAABD] whitespace-nowrap"
            title={databaseCoverageLabel ? `Historical Database Archive: ${databaseCoverageLabel}` : undefined}
          >
            <Calendar className="w-3.5 h-3.5 text-[#35B9C8] shrink-0" />
            <span className="font-mono text-[11px] text-[#E7EDF5] font-medium tabular-nums">
              {selectedPeriodLabel}
            </span>
            {_isBenchmarkPreset && (
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[#0E2833] text-[#35B9C8] border border-[#183E4C]">
                Jan 2026 Benchmark
              </span>
            )}
          </div>
        )}

        {lastIngestionUtc && (
          <div
            className="hidden 2xl:flex items-center gap-1.5 px-2 py-1 text-[11px] text-[#718198] whitespace-nowrap"
            title={`Last automated ingestion: ${formatUtcDateTime(lastIngestionUtc)}`}
          >
            <Clock className="w-3.5 h-3.5 text-[#718198]" />
            <span>Ingested:</span>
            <span className="font-mono text-[#9AAABD]">
              {formatUtcDateTime(lastIngestionUtc)}
            </span>
          </div>
        )}
      </div>

      {/* 3. System Region: API Health + Latency + Quick Role Switcher + User Profile */}
      <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
        {/* API Connectivity & Latency Indicators */}
        <div className="flex items-center gap-1.5 shrink-0">
          {isCheckingHealth ? (
            <div className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono bg-[#162337] text-[#718198] border border-[#26364A]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#718198] animate-pulse" />
              <span className="hidden sm:inline">Checking</span>
            </div>
          ) : isConnected ? (
            <>
              {/* API Connectivity Status */}
              <div
                className="flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono bg-[#133829] text-[#35B98A] border border-[#1C523B]"
                title="API Gateway Connected and reachable"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-[#35B98A]" />
                <span className="hidden sm:inline">Online</span>
              </div>

              {/* Measured Response Time (Separated SLA/Latency Metric with Accessible Tooltip) */}
              {latency !== null && latency !== undefined && (
                <Tooltip
                  title="API Response Latency"
                  content={
                    latency < 500
                      ? `${latency}ms round-trip latency. Operating within optimal SLA performance targets (<500ms).`
                      : latency < 2000
                      ? `${latency}ms round-trip latency. Service response time is currently elevated (500ms–2000ms).`
                      : `${latency}ms round-trip latency. Extended delay typical of free-tier cloud container cold starts (≥2000ms).`
                  }
                >
                  <div
                    role="status"
                    aria-label={`API Latency: ${latency}ms (${
                      latency < 500 ? 'Optimal SLA' : latency < 2000 ? 'Elevated' : 'Cold Start'
                    })`}
                    className={`hidden sm:flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono border cursor-help ${
                      latency < 500
                        ? 'bg-[#162337] text-[#9AAABD] border-[#26364A]'
                        : latency < 2000
                        ? 'bg-[#332514] text-[#E7AD4A] border-[#5A3E1B]'
                        : 'bg-[#3A2218] text-[#E7AD4A] border-[#653723]'
                    }`}
                  >
                    <span className="text-[#718198] text-[9px] uppercase tracking-wider font-sans hidden md:inline">
                      Latency:
                    </span>
                    <span className="tabular-nums">{latency}ms</span>
                    {latency >= 2000 && (
                      <span className="text-[9px] text-[#E7AD4A]/80 hidden md:inline font-sans">
                        (Cold Start)
                      </span>
                    )}
                  </div>
                </Tooltip>
              )}
            </>
          ) : (
            <div
              className="flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono bg-[#3E1A1D] text-[#E36D73] border border-[#5E262B]"
              title="Backend API unreachable"
            >
              <WifiOff className="w-3 h-3 text-[#E36D73]" />
              <span>Offline</span>
            </div>
          )}
        </div>

        {/* Quick Role Switcher (Compact Header Variant) */}
        <div className="hidden md:block shrink-0">
          <QuickRoleSwitcher variant="compact" />
        </div>

        {/* User Account & Role Dropdown */}
        <div className="shrink-0">
          <UserMenu />
        </div>
      </div>
    </header>
  )
}
