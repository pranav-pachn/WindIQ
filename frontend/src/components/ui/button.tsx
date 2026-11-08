import React from 'react'
import { cn } from '@/lib/utils'

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  children: React.ReactNode
}

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  children,
  ...props
}: ButtonProps) {
  const variantStyles: Record<ButtonVariant, string> = {
    primary:
      'bg-[#35B9C8] hover:bg-[#2DA4B2] text-[#0A101C] font-semibold shadow-sm focus-visible:ring-1 focus-visible:ring-[#35B9C8]',
    secondary:
      'bg-[#162337] hover:bg-[#1E2B3E] text-[#E7EDF5] border border-[#26364A] hover:border-[#374B63] focus-visible:ring-1 focus-visible:ring-slate-500',
    outline:
      'bg-transparent hover:bg-[#162337] text-[#9AAABD] hover:text-[#E7EDF5] border border-[#26364A] hover:border-[#374B63] focus-visible:ring-1 focus-visible:ring-slate-500',
    ghost:
      'bg-transparent hover:bg-[#162337]/60 text-[#9AAABD] hover:text-[#E7EDF5] focus-visible:ring-1 focus-visible:ring-slate-500',
    danger:
      'bg-[#3E1A1D] hover:bg-[#5E262B] text-[#E36D73] border border-[#5E262B] focus-visible:ring-1 focus-visible:ring-[#E36D73]',
  }

  const sizeStyles: Record<ButtonSize, string> = {
    sm: 'text-xs px-2.5 py-1 rounded gap-1.5',
    md: 'text-xs font-medium px-3 py-1.5 rounded-md gap-2',
    lg: 'text-sm font-medium px-4 py-2 rounded-md gap-2.5',
  }

  return (
    <button
      className={cn(
        'inline-flex items-center justify-center font-medium transition-colors focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 select-none cursor-pointer',
        variantStyles[variant],
        sizeStyles[size],
        className
      )}
      {...props}
    >
      {children}
    </button>
  )
}
