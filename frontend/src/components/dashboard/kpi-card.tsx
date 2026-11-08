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
  // Restrained professional color language: value color emphasizes key metrics without garish backgrounds
  const valueColorMap: Record<KpiTrend, string> = {
    positive: 'text-[#35B98A]',
    negative: 'text-[#E7AD4A]',
    accent: 'text-[#35B9C8]',
    neutral: 'text-[#E7EDF5]',
  }

  return (
    <Card
      className={cn(
        'p-3.5 sm:p-4 flex flex-col justify-between h-full bg-[#111C2D] border-[#26364A] hover:border-[#374B63] transition-colors',
        className
      )}
    >
      <div>
        {/* Metric Header */}
        <div className="flex items-center justify-between gap-1.5 mb-2">
          <span className="text-[11px] font-medium text-[#9AAABD] uppercase tracking-wider flex items-center gap-1.5 truncate">
            {Icon && <Icon className="w-3.5 h-3.5 text-[#718198] shrink-0" />}
            <span className="truncate">{title}</span>
            {tooltip && <Tooltip title={title} content={tooltip} />}
          </span>

          {badgeText && (
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[#162337] border border-[#26364A] text-[#718198] shrink-0">
              {badgeText}
            </span>
          )}
        </div>

        {/* Metric Value & Unit */}
        <div className="flex items-baseline gap-1.5 my-1">
          <span className={cn('text-2xl font-bold font-mono tracking-tight tabular-nums', valueColorMap[trend])}>
            {value}
          </span>
          {unit && (
            <span className="text-xs font-semibold text-[#718198] font-mono">
              {unit}
            </span>
          )}
        </div>
      </div>

      {/* Metric Explanation Subtitle */}
      {subtitle && (
        <p className="mt-2 text-[11px] text-[#718198] leading-snug border-t border-[#1E2B3E] pt-2">
          {subtitle}
        </p>
      )}
    </Card>
  )
}
