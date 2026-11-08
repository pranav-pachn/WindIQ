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
    tagColor: 'bg-[#0E2833] text-[#35B9C8] border-[#183E4C]',
    badgeText: 'Full Analytics',
    email: 'analyst@windiq.local',
    pass: 'AnalystPass123!#',
    icon: Sparkles,
    description: 'Hourly error evaluations, multi-horizon convergence curves, and forecast revision traces.',
    capabilities: ['Hourly Breakdown', 'Multi-Horizon Curves', 'Revision Matrix', 'Settlement Traces'],
  },
  {
    role: 'admin',
    label: 'Admin',
    tag: 'Superuser',
    tagColor: 'bg-[#162337] text-[#9AAABD] border-[#26364A]',
    badgeText: 'System Admin',
    email: 'admin@windiq.local',
    pass: 'AdminPass123!#',
    icon: KeyRound,
    description: 'Platform administration and machine-to-machine API key provisioning.',
    capabilities: ['Provision API Keys', 'Pipeline Controls', 'Security Audit Logs', 'All Scopes'],
  },
  {
    role: 'viewer',
    label: 'Viewer',
    tag: 'Basic Read',
    tagColor: 'bg-[#111C2D] text-[#718198] border-[#1E2B3E]',
    badgeText: 'Read-Only',
    email: 'viewer@windiq.local',
    pass: 'ViewerPass123!#',
    icon: Shield,
    description: 'Executive national KPIs and aggregate daily forecast accuracy metrics.',
    capabilities: ['Executive Overview', 'Daily Error Trends', 'Data Health Status'],
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

  // Completely suppress demo role switcher if disabled in enterprise production
  if (import.meta.env.VITE_ENABLE_DEMO_SWITCHER === 'false') {
    return null
  }

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
        <div className="flex items-center gap-0.5 p-0.5 rounded-md bg-[#111C2D] border border-[#26364A]">
          <span className="text-[10px] font-mono uppercase text-[#718198] px-1.5 flex items-center gap-1 font-semibold">
            <Zap className="w-3 h-3 text-[#35B9C8]" />
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
                className={`px-2 py-0.5 rounded text-[11px] font-mono font-medium transition-colors flex items-center gap-1 disabled:opacity-60 ${
                  isActive
                    ? 'bg-[#162337] text-[#E7EDF5] border border-[#35B9C8] font-semibold'
                    : 'text-[#9AAABD] hover:text-[#E7EDF5] hover:bg-[#162337]/60 border border-transparent'
                }`}
                title={`Switch to ${acc.label} (${acc.email})`}
              >
                {isThisLoading ? (
                  <Loader2 className="w-3 h-3 animate-spin text-[#35B9C8]" />
                ) : isActive ? (
                  <Check className="w-3 h-3 text-[#35B9C8]" />
                ) : null}
                <span>{acc.label}</span>
              </button>
            )
          })}
        </div>

        {switchError && (
          <div className="absolute top-full mt-1.5 right-0 z-50 max-w-xs p-2.5 rounded-md bg-[#3E1A1D] border border-[#5E262B] text-[#E36D73] text-[11px] shadow-xl flex items-start gap-1.5 animate-in fade-in duration-150">
            <AlertCircle className="w-3.5 h-3.5 text-[#E36D73] shrink-0 mt-0.5" />
            <span className="flex-1 leading-tight">{switchError}</span>
            <button
              type="button"
              onClick={() => setSwitchError(null)}
              className="text-[#E36D73] hover:text-[#E7EDF5] ml-1 text-xs"
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
        <div className="p-2.5 rounded-md bg-[#3E1A1D] border border-[#5E262B] text-[#E36D73] text-xs flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-[#E36D73] shrink-0 mt-0.5" />
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
              className={`w-full p-2.5 rounded-lg text-left transition-colors border ${
                isActive
                  ? 'bg-[#162337] border-[#35B9C8] text-[#E7EDF5]'
                  : 'bg-[#0E1726] border-[#1E2B3E] hover:bg-[#162337] hover:border-[#26364A] text-[#9AAABD]'
              } disabled:opacity-60`}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <div
                    className={`p-1.5 rounded ${
                      isActive ? 'bg-[#0E2833] text-[#35B9C8]' : 'bg-[#111C2D] text-[#718198]'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <div className="font-semibold text-xs text-[#E7EDF5] flex items-center gap-1.5">
                      <span>{acc.label}</span>
                      <span className={`text-[9px] font-mono px-1 py-0.2 rounded border ${acc.tagColor}`}>
                        {acc.tag}
                      </span>
                    </div>
                    <div className="text-[10px] font-mono text-[#718198]">{acc.email}</div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  {isThisLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin text-[#35B9C8]" />
                  ) : isActive ? (
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-[#133829] text-[#35B98A] border border-[#1C523B] flex items-center gap-1">
                      <Check className="w-3 h-3" />
                      Active
                    </span>
                  ) : null}
                </div>
              </div>

              <p className="text-[11px] text-[#718198] leading-tight mb-2 pl-8">
                {acc.description}
              </p>

              <div className="flex flex-wrap gap-1 pl-8">
                {acc.capabilities.map((cap) => (
                  <span
                    key={cap}
                    className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-[#111C2D] border border-[#1E2B3E] text-[#9AAABD]"
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
