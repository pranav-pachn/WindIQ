import React from 'react'
import { cn } from '@/lib/utils'

export type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral'

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant
  children: React.ReactNode
  size?: 'sm' | 'md'
}

export function Badge({
  variant = 'neutral',
  size = 'md',
  children,
  className,
  ...props
}: BadgeProps) {
  const variantStyles: Record<BadgeVariant, string> = {
    success:
      'bg-emerald-950/60 text-emerald-300 border-emerald-800/60 ring-1 ring-emerald-500/20',
    warning:
      'bg-amber-950/60 text-amber-300 border-amber-800/60 ring-1 ring-amber-500/20',
    danger:
      'bg-rose-950/60 text-rose-300 border-rose-800/60 ring-1 ring-rose-500/20',
    info: 'bg-cyan-950/60 text-cyan-300 border-cyan-800/60 ring-1 ring-cyan-500/20',
    neutral:
      'bg-slate-800/70 text-slate-300 border-slate-700/60 ring-1 ring-slate-600/20',
  }

  const sizeStyles = {
    sm: 'text-[10px] px-1.5 py-0.5 tracking-tight',
    md: 'text-xs px-2 py-0.5 tracking-normal',
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 font-medium rounded border transition-colors',
        sizeStyles[size],
        variantStyles[variant],
        className
      )}
      {...props}
    >
      {children}
    </span>
  )
}

