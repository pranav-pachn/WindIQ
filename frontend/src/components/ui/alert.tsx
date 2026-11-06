import React from 'react'
import { AlertCircle, CheckCircle2, AlertTriangle, Info, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from './button'

export type AlertVariant = 'danger' | 'warning' | 'success' | 'info'

interface AlertProps {
  variant?: AlertVariant
  title?: string
  children: React.ReactNode
  onRetry?: () => void
  isRetrying?: boolean
  className?: string
}

export function Alert({
  variant = 'info',
  title,
  children,
  onRetry,
  isRetrying = false,
  className,
}: AlertProps) {
  const config = {
    danger: {
      container: 'bg-rose-950/40 border-rose-900/60 text-rose-200',
      icon: AlertCircle,
      iconColor: 'text-rose-400',
    },
    warning: {
      container: 'bg-amber-950/40 border-amber-900/60 text-amber-200',
      icon: AlertTriangle,
      iconColor: 'text-amber-400',
    },
    success: {
      container: 'bg-emerald-950/40 border-emerald-900/60 text-emerald-200',
      icon: CheckCircle2,
      iconColor: 'text-emerald-400',
    },
    info: {
      container: 'bg-slate-900/70 border-slate-800 text-slate-300',
      icon: Info,
      iconColor: 'text-cyan-400',
    },
  }[variant]

  const IconComponent = config.icon

  return (
    <div
      role="alert"
      className={cn(
        'flex items-start gap-3 p-4 rounded-lg border text-xs leading-relaxed backdrop-blur-sm',
        config.container,
        className
      )}
    >
      <IconComponent className={cn('w-4 h-4 mt-0.5 shrink-0', config.iconColor)} />
      <div className="flex-1 space-y-1">
        {title && <div className="font-semibold text-slate-100">{title}</div>}
        <div>{children}</div>
      </div>
      {onRetry && (
        <Button
          variant="outline"
          size="sm"
          onClick={onRetry}
          disabled={isRetrying}
          className="shrink-0 ml-2"
        >
          <RefreshCw className={cn('w-3 h-3', isRetrying && 'animate-spin')} />
          <span>{isRetrying ? 'Retrying...' : 'Retry'}</span>
        </Button>
      )}
    </div>
  )
}

