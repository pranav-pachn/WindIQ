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
      'bg-cyan-600 hover:bg-cyan-500 text-white shadow-sm focus-visible:ring-cyan-500/50',
    secondary:
      'bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700/60 focus-visible:ring-slate-500/40',
    outline:
      'bg-transparent hover:bg-slate-800/60 text-slate-200 border border-slate-700/80 focus-visible:ring-slate-500/40',
    ghost:
      'bg-transparent hover:bg-slate-800/50 text-slate-300 hover:text-slate-100 focus-visible:ring-slate-500/40',
    danger:
      'bg-rose-900/40 hover:bg-rose-900/60 text-rose-200 border border-rose-800/60 focus-visible:ring-rose-500/40',
  }

  const sizeStyles: Record<ButtonSize, string> = {
    sm: 'text-xs px-2.5 py-1.5 rounded gap-1.5',
    md: 'text-xs font-medium px-3.5 py-2 rounded-md gap-2',
    lg: 'text-sm font-medium px-4 py-2.5 rounded-md gap-2.5',
  }

  return (
    <button
      className={cn(
        'inline-flex items-center justify-center font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50 select-none cursor-pointer',
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

