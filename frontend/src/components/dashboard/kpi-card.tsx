import React from 'react'
import { Card } from '@/components/ui/card'
import { Tooltip } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

export type KpiTrend = 'positive' | 'negative' | 'neutral' | 'accent'

interface KpiCardProps {
  title: string
  value: string
  unit?: string
  tooltip?: string
  subtitle?: string
  badgeText?: string
  trend?: KpiTrend
  icon?: React.ComponentType<{ className?: string }>
  className?: string
}

export function KpiCard({
  title,
  value,
  unit,
  tooltip,
  subtitle,
  badgeText,
  trend = 'neutral',
  icon: Icon,
  className,
}: KpiCardProps) {
  const trendConfig: Record<KpiTrend, { border: string; valueColor: string; bgBadge: string }> = {
    positive: {
      border: 'border-emerald-800/40 hover:border-emerald-700/60',
      valueColor: 'text-emerald-400',
      bgBadge: 'bg-emerald-950/60 text-emerald-300 border-emerald-800/40',
    },
    negative: {
      border: 'border-amber-800/40 hover:border-amber-700/60',
      valueColor: 'text-amber-400',
      bgBadge: 'bg-amber-950/60 text-amber-300 border-amber-800/40',
    },
    accent: {
      border: 'border-cyan-800/50 hover:border-cyan-700/70',
      valueColor: 'text-cyan-300',
      bgBadge: 'bg-cyan-950/60 text-cyan-300 border-cyan-800/40',
    },
    neutral: {
      border: 'border-slate-800 hover:border-slate-700',
      valueColor: 'text-slate-100',
      bgBadge: 'bg-slate-800/60 text-slate-300 border-slate-700/40',
    },
  }

  const currentTrend = trendConfig[trend]

  return (
    <Card
      className={cn(
        'p-4 transition-all duration-150',
        currentTrend.border,
        className
      )}
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
          {Icon && <Icon className="w-3.5 h-3.5 text-slate-400" />}
          <span>{title}</span>
          {tooltip && <Tooltip title={title} content={tooltip} />}
        </span>

        {badgeText && (
          <span
            className={cn(
              'text-[10px] font-mono px-1.5 py-0.5 rounded border',
              currentTrend.bgBadge
            )}
          >
            {badgeText}
          </span>
        )}
      </div>

      <div className="flex items-baseline gap-1.5 mt-1">
        <span className={cn('text-2xl font-bold font-mono tracking-tight', currentTrend.valueColor)}>
          {value}
        </span>
        {unit && (
          <span className="text-xs font-semibold text-slate-400 font-mono">
            {unit}
          </span>
        )}
      </div>

      {subtitle && (
        <p className="mt-2 text-[11px] text-slate-400 leading-tight">
          {subtitle}
        </p>
      )}
    </Card>
  )
}

