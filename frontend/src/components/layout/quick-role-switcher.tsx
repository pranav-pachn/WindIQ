import React, { useState } from 'react'
import { Shield, Sparkles, KeyRound, Check, Loader2, AlertCircle, Zap } from 'lucide-react'
import { useAuth } from '@/context/auth-context'

export interface DemoAccount {
  role: 'viewer' | 'analyst' | 'admin'
  label: string
  tag: string
  tagColor: string
  badgeText: string
  email: string
  pass: string
  icon: React.ComponentType<{ className?: string }>
  description: string
  capabilities: string[]
}

export const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    role: 'analyst',
    label: 'Analyst',
    tag: 'Recommended',
    tagColor: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40',
    badgeText: 'Full Analytics',
    email: 'analyst@windiq.local',
    pass: 'AnalystPass123!#',
    icon: Sparkles,
    description: 'Hourly error tables, multi-horizon convergence, forecast revisions, settlement traces.',
    capabilities: ['Hourly Breakdown', 'Multi-Horizon Curves', 'Revision Matrix', 'Settlement Traces'],
  },
  {
    role: 'admin',
    label: 'Admin',
    tag: 'Superuser',
    tagColor: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
    badgeText: 'Full Privileges + API Keys',
    email: 'admin@windiq.local',
    pass: 'AdminPass123!#',
    icon: KeyRound,
    description: 'System administration, programmatic machine-to-machine API key provisioning.',
    capabilities: ['Provision API Keys', 'Pipeline Controls', 'Security Audit Logs', 'All RBAC Scopes'],
  },
  {
    role: 'viewer',
    label: 'Viewer',
    tag: 'Basic Read',
    tagColor: 'bg-slate-500/15 text-slate-300 border-slate-500/40',
    badgeText: 'Read-Only Overview',
    email: 'viewer@windiq.local',
    pass: 'ViewerPass123!#',
    icon: Shield,
    description: 'High-level platform KPIs, national executive overview, summary accuracy charts.',
    capabilities: ['Executive Overview', 'Daily Aggregate Error', 'Data Health Status'],
  },
]

interface QuickRoleSwitcherProps {
  variant?: 'compact' | 'cards'
  onRoleSwitched?: () => void
}

export function QuickRoleSwitcher({ variant = 'compact', onRoleSwitched }: QuickRoleSwitcherProps) {
  const { role, login } = useAuth()
  const [switchingRole, setSwitchingRole] = useState<string | null>(null)
  const [switchError, setSwitchError] = useState<string | null>(null)

  const currentRole = role ? role.toLowerCase() : null

  const handleSwitch = async (account: DemoAccount) => {
    if (switchingRole !== null) return
    if (currentRole === account.role) return

    setSwitchingRole(account.role)
    setSwitchError(null)

    try {
      await login(account.email, account.pass)
      if (onRoleSwitched) {
        onRoleSwitched()
      }
    } catch (err: any) {
      setSwitchError(err?.message || `Failed to switch to ${account.label} role.`)
    } finally {
      setSwitchingRole(null)
    }
  }

  if (variant === 'compact') {
    return (
      <div className="relative inline-flex flex-col items-end">
        <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-900/90 border border-slate-800 shadow-inner">
          <span className="text-[10px] font-mono uppercase text-slate-400 px-1.5 flex items-center gap-1 font-semibold">
            <Zap className="w-3 h-3 text-amber-400 fill-amber-400/20" />
            <span className="hidden md:inline">Demo:</span>
          </span>

          {DEMO_ACCOUNTS.map((acc) => {
            const isActive = currentRole === acc.role
            const isThisLoading = switchingRole === acc.role

            return (
              <button
                key={acc.role}
                type="button"
                disabled={switchingRole !== null}
                onClick={() => handleSwitch(acc)}
                className={`px-2 py-0.5 rounded text-[11px] font-medium transition-all flex items-center gap-1 disabled:opacity-60 ${
                  isActive
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 shadow-sm shadow-cyan-500/20 font-semibold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 border border-transparent'
                }`}
                title={`Switch role to ${acc.label} (${acc.email})`}
              >
                {isThisLoading ? (
                  <Loader2 className="w-3 h-3 animate-spin text-cyan-400" />
                ) : isActive ? (
                  <Check className="w-3 h-3 text-cyan-400 stroke-[3]" />
                ) : null}
                <span>{acc.label}</span>
                {acc.role === 'analyst' && !isActive && (
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                )}
              </button>
            )
          })}
        </div>

        {switchError && (
          <div className="absolute top-full mt-1.5 right-0 z-50 max-w-xs p-2 rounded-lg bg-rose-950/95 border border-rose-800 text-rose-200 text-[11px] shadow-xl flex items-start gap-1.5 backdrop-blur-sm animate-in fade-in slide-in-from-top-1 duration-200">
            <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
            <span className="flex-1 leading-tight">{switchError}</span>
            <button
              type="button"
              onClick={() => setSwitchError(null)}
              className="text-rose-400 hover:text-rose-200 ml-1 text-xs"
            >
              ✕
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {switchError && (
        <div className="p-2.5 rounded-lg bg-rose-950/70 border border-rose-800 text-rose-200 text-xs flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <div className="flex-1 leading-tight">
            <span className="font-semibold">Switch Error: </span>
            <span>{switchError}</span>
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        {DEMO_ACCOUNTS.map((acc) => {
          const isActive = currentRole === acc.role
          const isThisLoading = switchingRole === acc.role
          const Icon = acc.icon

          return (
            <button
              key={acc.role}
              type="button"
              disabled={switchingRole !== null}
              onClick={() => handleSwitch(acc)}
              className={`w-full p-2.5 rounded-xl text-left transition-all border ${
                isActive
                  ? 'bg-cyan-950/70 border-cyan-500/60 text-cyan-100 shadow-md shadow-cyan-950/50'
                  : 'bg-slate-950/60 border-slate-800/80 hover:bg-slate-800/60 hover:border-slate-700 text-slate-300'
              } disabled:opacity-60`}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-6 h-6 rounded-md flex items-center justify-center ${
                      isActive
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {isThisLoading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                    ) : (
                      <Icon className="w-3.5 h-3.5" />
                    )}
                  </div>
                  <div>
                    <span className="font-bold text-slate-100 text-xs">{acc.label}</span>
                    <span className="text-[10px] text-slate-400 font-mono ml-1.5">
                      {acc.email}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <span
                    className={`px-1.5 py-0.5 rounded text-[9px] font-semibold border ${acc.tagColor}`}
                  >
                    {acc.tag}
                  </span>
                  {isActive && (
                    <span className="flex items-center gap-1 text-[10px] text-cyan-400 font-medium">
                      <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                      <span className="hidden sm:inline">Active</span>
                    </span>
                  )}
                </div>
              </div>

              <p className="text-[11px] text-slate-400 mb-1.5 pl-8 leading-tight">
                {acc.description}
              </p>

              <div className="flex flex-wrap gap-1 pl-8">
                {acc.capabilities.map((cap) => (
                  <span
                    key={cap}
                    className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400"
                  >
                    {cap}
                  </span>
                ))}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
