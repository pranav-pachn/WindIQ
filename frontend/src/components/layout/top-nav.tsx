import { Menu, Wifi, WifiOff, Clock, Database, Calendar } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { formatUtcDateTime, formatLondonDateTime } from '@/lib/formatters'
import { useApiHealth } from '@/hooks/use-api-health'
import { UserMenu } from '@/components/layout/user-menu'

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
  isBenchmarkPreset,
  databaseCoverageLabel,
  onOpenMobileSidebar,
}: TopNavProps) {
  const { data: apiHealth, isPending: isCheckingHealth } = useApiHealth()

  const isConnected = apiHealth?.isConnected ?? false
  const latency = apiHealth?.latencyMs

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between h-16 px-4 sm:px-6 bg-[#080d1a]/90 backdrop-blur-md border-b border-slate-800/80">
      {/* Left: Mobile hamburger + Page Title */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onOpenMobileSidebar}
          aria-label="Open navigation menu"
          className="lg:hidden p-2 text-slate-400 hover:text-white rounded-md hover:bg-slate-800 focus:outline-none focus:ring-1 focus:ring-cyan-500"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div>
          <h1 className="text-base sm:text-lg font-bold text-slate-100 tracking-tight flex items-center gap-2">
            {pageTitle}
          </h1>
          {subtitle && (
            <p className="text-xs text-slate-400 hidden sm:block">
              {subtitle}
            </p>
          )}
        </div>
      </div>

      {/* Right: Operational Status Elements */}
      <div className="flex items-center gap-3 sm:gap-4 text-xs">
        {/* Selected Evaluation Period (Distinct from Available Data Coverage) */}
        {selectedPeriodLabel && (
          <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-900/90 border border-slate-700/80 text-slate-300">
            <Calendar className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-400">
              Selected Period:
            </span>
            <span className="font-mono text-[11px] text-cyan-300 font-semibold">
              {selectedPeriodLabel}
            </span>
            {isBenchmarkPreset && (
              <span className="text-[9px] font-mono font-medium px-1.5 py-0.2 rounded bg-emerald-950/80 border border-emerald-800/60 text-emerald-300 ml-1">
                Jan 2026 Benchmark
              </span>
            )}
          </div>
        )}

        {/* Total Database Coverage Separately Labeled */}
        {databaseCoverageLabel && (
          <div
            className="hidden xl:flex items-center gap-1.5 px-2 py-1 rounded-md bg-[#0b1120] border border-slate-800 text-[11px] text-slate-400"
            title="Complete database archive range currently available in PostgreSQL"
          >
            <Database className="w-3 h-3 text-slate-400" />
            <span className="text-slate-400">Available Data:</span>
            <span className="font-mono text-slate-300 font-medium">
              {databaseCoverageLabel}
            </span>
          </div>
        )}

        {/* Ingestion Freshness */}
        {lastIngestionUtc && (
          <div
            className="hidden xl:flex items-center gap-1.5 text-slate-400 text-[11px]"
            title={`Last automated ingestion: ${formatUtcDateTime(lastIngestionUtc)} / ${formatLondonDateTime(lastIngestionUtc)}`}
          >
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-400">Ingested:</span>
            <span className="font-mono text-slate-300 font-medium">
              {formatUtcDateTime(lastIngestionUtc)}
            </span>
          </div>
        )}

        {/* API Connection Indicator */}
        <div className="flex items-center gap-1.5">
          {isCheckingHealth ? (
            <Badge variant="neutral" size="sm">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-pulse" />
              <span className="hidden sm:inline">Checking API</span>
            </Badge>
          ) : isConnected ? (
            <Badge variant="success" size="sm" title="Connected to WindIQ Backend API">
              <Wifi className="w-3 h-3 text-emerald-400" />
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span className="hidden sm:inline">API Online</span>
              {latency !== null && latency !== undefined && (
                <span className="font-mono text-[10px] text-emerald-300/80 hidden lg:inline">
                  {latency}ms
                </span>
              )}
            </Badge>
          ) : (
            <Badge variant="danger" size="sm" title="Backend connection failed">
              <WifiOff className="w-3 h-3 text-rose-400" />
              <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-ping" />
              <span>API Offline</span>
            </Badge>
          )}
        </div>

        {/* User Account & Role Badge */}
        <UserMenu />
      </div>
    </header>
  )
}
