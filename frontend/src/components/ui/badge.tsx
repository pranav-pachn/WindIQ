import React from 'react'
import { cn } from '@/lib/utils'

export type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'outline'

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
    success: 'bg-[#133829] text-[#35B98A] border-[#1C523B]',
    warning: 'bg-[#3E2E14] text-[#E7AD4A] border-[#5A431D]',
    danger: 'bg-[#3E1A1D] text-[#E36D73] border-[#5E262B]',
    info: 'bg-[#0E2833] text-[#35B9C8] border-[#183E4C]',
    neutral: 'bg-[#162337] text-[#9AAABD] border-[#26364A]',
    outline: 'bg-transparent text-[#9AAABD] border-[#26364A]',
  }

  const sizeStyles = {
    sm: 'text-[10px] font-mono px-1.5 py-0.5 tracking-tight',
    md: 'text-xs font-mono px-2 py-0.5 tracking-normal',
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 font-medium rounded border',
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
