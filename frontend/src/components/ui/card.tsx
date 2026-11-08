import React from 'react'
import { cn } from '@/lib/utils'

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
  variant?: 'default' | 'elevated' | 'panel' | 'surface'
}

export function Card({
  children,
  className,
  variant = 'default',
  ...props
}: CardProps) {
  const variantStyles = {
    default: 'bg-[#111C2D] border-[#26364A]',
    elevated: 'bg-[#162337] border-[#26364A]',
    panel: 'bg-[#0E1726] border-[#1E2B3E]',
    surface: 'bg-[#0E1726] border-[#1E2B3E]',
  }

  return (
    <div
      className={cn(
        'rounded-lg border text-[#E7EDF5] transition-colors',
        variantStyles[variant],
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export function CardHeader({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex flex-col space-y-1.5 p-4 sm:p-5 pb-3', className)}
      {...props}
    >
      {children}
    </div>
  )
}

export function CardTitle({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn(
        'text-xs font-semibold uppercase tracking-wider text-[#9AAABD] flex items-center gap-2',
        className
      )}
      {...props}
    >
      {children}
    </h3>
  )
}

export function CardDescription({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn('text-xs text-[#718198] leading-relaxed', className)} {...props}>
      {children}
    </p>
  )
}

export function CardContent({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('p-4 sm:p-5 pt-0', className)} {...props}>
      {children}
    </div>
  )
}

export function CardFooter({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex items-center p-4 sm:p-5 pt-0 text-xs text-[#718198] border-t border-[#1E2B3E] mt-3', className)}
      {...props}
    >
      {children}
    </div>
  )
}
