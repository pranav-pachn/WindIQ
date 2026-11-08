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
        'p-3 sm:p-4 flex flex-col justify-between h-full bg-[#111C2D] border-[#26364A] hover:border-[#374B63] transition-colors',
        className
      )}
    >
      <div>
        {/* Metric Header */}
        <div className="flex items-start justify-between gap-1 mb-1.5 sm:mb-2 min-h-[32px] sm:min-h-[36px]">
          <span className="text-[10px] sm:text-[11px] font-medium text-[#9AAABD] uppercase tracking-normal flex items-start gap-1 sm:gap-1.5 min-w-0">
            {Icon && <Icon className="w-3.5 h-3.5 text-[#718198] shrink-0 mt-0.5" />}
            <span className="break-words line-clamp-2 leading-tight">{title}</span>
            {tooltip && (
              <span className="shrink-0 mt-0.5">
                <Tooltip title={title} content={tooltip} />
              </span>
            )}
          </span>

          {badgeText && (
            <span className="text-[9px] sm:text-[10px] font-mono px-1 sm:px-1.5 py-0.5 rounded bg-[#162337] border border-[#26364A] text-[#718198] shrink-0 mt-0.5">
              {badgeText}
            </span>
          )}
        </div>

        {/* Metric Value & Unit */}
        <div className="flex items-baseline gap-1 sm:gap-1.5 my-0.5 sm:my-1 whitespace-nowrap">
          <span
            className={cn(
              'text-lg sm:text-2xl font-bold font-mono tracking-tight tabular-nums',
              valueColorMap[trend]
            )}
          >
            {value}
          </span>
          {unit && (
            <span className="text-[10px] sm:text-xs font-semibold text-[#718198] font-mono shrink-0">
              {unit}
            </span>
          )}
        </div>
      </div>

      {/* Metric Explanation Subtitle */}
      {subtitle && (
        <p className="mt-1.5 sm:mt-2.5 text-[10px] sm:text-[11px] text-[#718198] leading-snug border-t border-[#1E2B3E] pt-1.5 sm:pt-2">
          {subtitle}
        </p>
      )}
    </Card>
  )
}
