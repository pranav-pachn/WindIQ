import React from 'react'
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Target,
  Wind,
  ShieldCheck,
  Settings,
  ChevronLeft,
  ChevronRight,
  Zap,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface SidebarProps {
  collapsed: boolean
  onToggleCollapse: () => void
  isMobileOpen: boolean
  onCloseMobile: () => void
}

interface NavItem {
  title: string
  path: string
  icon: React.ComponentType<{ className?: string }>
  badge?: string
  isImplemented: boolean
}

const NAV_ITEMS: NavItem[] = [
  {
    title: 'Executive Overview',
    path: '/',
    icon: LayoutDashboard,
    isImplemented: true,
  },
  {
    title: 'Forecast Accuracy',
    path: '/accuracy',
    icon: Target,
    isImplemented: true,
  },
  {
    title: 'Forecast Explorer',
    path: '/forecasts',
    icon: Wind,
    isImplemented: true,
  },
]

export function Sidebar({
  collapsed,
  onToggleCollapse,
  isMobileOpen,
  onCloseMobile,
}: SidebarProps) {
  return (
    <>
      {/* Mobile backdrop */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}

      {/* Persistent Sidebar */}
      <aside
        className={cn(
          'fixed top-0 bottom-0 left-0 z-50 flex flex-col bg-[#070b14] border-r border-slate-800/80 transition-all duration-200 select-none lg:static',
          collapsed ? 'w-18' : 'w-64',
          isMobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        {/* Brand Header */}
        <div className="flex items-center justify-between h-16 px-4 border-b border-slate-800/80">
          <NavLink
            to="/"
            className="flex items-center gap-3 overflow-hidden"
            onClick={onCloseMobile}
          >
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-gradient-to-br from-cyan-500 to-teal-700 text-white shadow-md shadow-cyan-950 shrink-0">
              <Zap className="w-5 h-5 text-cyan-100" />
            </div>
            {!collapsed && (
              <div className="flex flex-col min-w-0">
                <span className="font-bold text-base tracking-tight text-white leading-tight flex items-center gap-1.5">
                  WindIQ
                  <span className="text-[10px] font-mono font-medium text-cyan-400 bg-cyan-950/80 border border-cyan-800/50 rounded px-1 py-0.2">
                    UK
                  </span>
                </span>
                <span className="text-[11px] text-slate-400 truncate">
                  Forecast Intelligence
                </span>
              </div>
            )}
          </NavLink>

          {/* Collapse Toggle (Desktop only) */}
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="hidden lg:flex items-center justify-center w-7 h-7 text-slate-400 hover:text-white rounded-md hover:bg-slate-800/80 transition-colors"
          >
            {collapsed ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <ChevronLeft className="w-4 h-4" />
            )}
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 px-2.5 py-4 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={onCloseMobile}
                end={item.path === '/'}
                className={({ isActive }) =>
                  cn(
                    'group flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-medium transition-all',
                    isActive
                      ? 'bg-cyan-950/40 text-cyan-300 border border-cyan-800/60 shadow-sm shadow-cyan-950/40'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent'
                  )
                }
                title={collapsed ? item.title : undefined}
              >
                <Icon className="w-4 h-4 shrink-0 transition-transform group-hover:scale-105" />
                {!collapsed && (
                  <span className="flex-1 truncate">{item.title}</span>
                )}
                {!collapsed && item.badge && (
                  <span
                    className={cn(
                      'text-[9px] font-mono px-1.5 py-0.5 rounded border',
                      item.isImplemented
                        ? 'bg-emerald-950/80 text-emerald-400 border-emerald-800/40'
                        : 'bg-slate-800/80 text-slate-400 border-slate-700/50'
                    )}
                  >
                    {item.badge}
                  </span>
                )}
              </NavLink>
            )
          })}
        </nav>

        {/* Footer Meta */}
        {!collapsed && (
          <div className="p-3.5 m-2.5 rounded-lg bg-[#0c1322] border border-slate-800/80 text-[11px] text-slate-400 space-y-2">
            <div className="flex items-center justify-between text-slate-300 font-medium">
              <span>GB Market Rules</span>
              <span className="font-mono text-[10px] text-cyan-400">09:00 UK</span>
            </div>
            <p className="text-[10px] text-slate-400 leading-snug">
              Day-ahead forecasts evaluate latest publication strictly locked in at 09:00 Europe/London.
            </p>
          </div>
        )}
      </aside>
    </>
  )
}

