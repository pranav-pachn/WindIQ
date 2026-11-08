import { Menu, WifiOff, Clock, Calendar } from 'lucide-react'
import { formatUtcDateTime } from '@/lib/formatters'
import { useApiHealth } from '@/hooks/use-api-health'
import { UserMenu } from '@/components/layout/user-menu'
import { QuickRoleSwitcher } from '@/components/layout/quick-role-switcher'

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
    <header className="sticky top-0 z-30 flex items-center justify-between h-14 px-4 sm:px-6 bg-[#0B1220] border-b border-[#26364A]">
      {/* 1. Primary Region: Title & Context */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onOpenMobileSidebar}
          aria-label="Open navigation menu"
          className="lg:hidden p-1.5 text-[#718198] hover:text-[#E7EDF5] rounded hover:bg-[#162337] focus:outline-none"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="min-w-0">
          <h1 className="text-sm sm:text-base font-semibold text-[#E7EDF5] tracking-tight truncate">
            {pageTitle}
          </h1>
          {subtitle && (
            <p className="text-[11px] text-[#718198] hidden md:block truncate">
              {subtitle}
            </p>
          )}
        </div>
      </div>

      {/* 2. Context Region: Selected Period & Data Bounds */}
      <div className="hidden lg:flex items-center gap-2">
        {selectedPeriodLabel && (
          <div
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#111C2D] border border-[#26364A] text-xs text-[#9AAABD] whitespace-nowrap"
            title={databaseCoverageLabel ? `Historical Database Archive: ${databaseCoverageLabel}` : undefined}
          >
            <Calendar className="w-3.5 h-3.5 text-[#35B9C8]" />
            <span className="text-[10px] uppercase tracking-wider text-[#718198] font-semibold">
              Period:
            </span>
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

      {/* 3. System Region: API Health + Quick Role Switcher + User Profile */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        {/* API Connectivity Indicator */}
        <div className="flex items-center">
          {isCheckingHealth ? (
            <div className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono bg-[#162337] text-[#718198] border border-[#26364A]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#718198] animate-pulse" />
              <span className="hidden sm:inline">Checking</span>
            </div>
          ) : isConnected ? (
            <div
              className="flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono bg-[#133829] text-[#35B98A] border border-[#1C523B]"
              title={`API Connected • Latency: ${latency ?? '—'}ms`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[#35B98A]" />
              <span className="hidden sm:inline">Online</span>
              {latency !== null && latency !== undefined && (
                <span className="text-[#35B98A]/80 hidden xl:inline">
                  {latency}ms
                </span>
              )}
            </div>
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
        <div className="hidden sm:block">
          <QuickRoleSwitcher variant="compact" />
        </div>

        {/* User Account & Role Dropdown */}
        <UserMenu />
      </div>
    </header>
  )
}
