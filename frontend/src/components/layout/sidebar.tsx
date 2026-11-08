import React from 'react'
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Target,
  Wind,
  ChevronLeft,
  ChevronRight,
  Info,
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
}

const NAV_ITEMS: NavItem[] = [
  {
    title: 'Executive Overview',
    path: '/',
    icon: LayoutDashboard,
  },
  {
    title: 'Forecast Accuracy',
    path: '/accuracy',
    icon: Target,
  },
  {
    title: 'Forecast Explorer',
    path: '/forecasts',
    icon: Wind,
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
      {/* Mobile Backdrop */}
      {isMobileOpen && (
        <div
          role="presentation"
          onClick={onCloseMobile}
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
        />
      )}

      {/* Main Sidebar */}
      <aside
        className={cn(
          'fixed top-0 bottom-0 left-0 z-50 flex flex-col bg-[#0A101C] border-r border-[#26364A] transition-all duration-200 select-none lg:static shrink-0',
          collapsed ? 'w-16' : 'w-60',
          isMobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        {/* Brand / Logo Header */}
        <div className="flex items-center justify-between h-14 px-3.5 border-b border-[#1E2B3E]">
          <NavLink
            to="/"
            onClick={onCloseMobile}
            className="flex items-center gap-2.5 overflow-hidden group"
          >
            {/* Minimalist WindIQ Wind Energy Compass Emblem */}
            <div className="w-8 h-8 rounded-md bg-[#111C2D] border border-[#26364A] flex items-center justify-center text-[#35B9C8] shrink-0">
              <svg
                className="w-4 h-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2" />
                <path d="M9.6 4.6A2 2 0 1 1 11 8H2" />
                <path d="M12.6 19.4A2 2 0 1 0 14 16H2" />
              </svg>
            </div>

            {!collapsed && (
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-bold tracking-tight text-[#E7EDF5] font-sans">
                  WindIQ
                </span>
                <span className="text-[10px] text-[#718198] tracking-wider uppercase font-mono truncate">
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
            className="hidden lg:flex items-center justify-center w-6 h-6 text-[#718198] hover:text-[#E7EDF5] rounded hover:bg-[#162337] transition-colors"
          >
            {collapsed ? (
              <ChevronRight className="w-3.5 h-3.5" />
            ) : (
              <ChevronLeft className="w-3.5 h-3.5" />
            )}
          </button>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 px-2 py-3 space-y-1 overflow-y-auto">
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
                    'group flex items-center gap-2.5 px-2.5 py-2 rounded-md text-xs font-medium transition-colors',
                    isActive
                      ? 'bg-[#162337] text-[#E7EDF5] border-l-2 border-[#35B9C8] font-semibold'
                      : 'text-[#9AAABD] hover:text-[#E7EDF5] hover:bg-[#111C2D] border-l-2 border-transparent'
                  )
                }
                title={collapsed ? item.title : undefined}
              >
                <Icon className="w-4 h-4 shrink-0 text-[#718198] group-hover:text-[#35B9C8] group-[.font-semibold]:text-[#35B9C8] transition-colors" />
                {!collapsed && (
                  <span className="flex-1 truncate">{item.title}</span>
                )}
              </NavLink>
            )
          })}
        </nav>

        {/* Methodology Note */}
        {!collapsed && (
          <div className="p-3 m-2.5 rounded-md bg-[#111C2D] border border-[#1E2B3E] text-[11px] text-[#718198] space-y-1.5">
            <div className="flex items-center gap-1.5 text-[#9AAABD] font-medium text-[10px] uppercase tracking-wider">
              <Info className="w-3 h-3 text-[#35B9C8]" />
              <span>Evaluation Methodology</span>
            </div>
            <p className="text-[10px] text-[#718198] leading-tight">
              Day-ahead forecast accuracy evaluated against configured cutoff: <span className="font-mono text-[#E7EDF5]">09:00 Europe/London</span>.
            </p>
          </div>
        )}
      </aside>
    </>
  )
}
