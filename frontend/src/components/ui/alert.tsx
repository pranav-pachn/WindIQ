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
      container: 'bg-[#3E1A1D] border-[#5E262B] text-[#E36D73]',
      icon: AlertCircle,
      iconColor: 'text-[#E36D73]',
    },
    warning: {
      container: 'bg-[#3E2E14] border-[#5A431D] text-[#E7AD4A]',
      icon: AlertTriangle,
      iconColor: 'text-[#E7AD4A]',
    },
    success: {
      container: 'bg-[#133829] border-[#1C523B] text-[#35B98A]',
      icon: CheckCircle2,
      iconColor: 'text-[#35B98A]',
    },
    info: {
      container: 'bg-[#111C2D] border-[#26364A] text-[#9AAABD]',
      icon: Info,
      iconColor: 'text-[#35B9C8]',
    },
  }[variant]

  const IconComponent = config.icon

  return (
    <div
      role="alert"
      className={cn(
        'flex items-start gap-3 p-3.5 rounded-lg border text-xs leading-relaxed',
        config.container,
        className
      )}
    >
      <IconComponent className={cn('w-4 h-4 mt-0.5 shrink-0', config.iconColor)} />
      <div className="flex-1 space-y-0.5">
        {title && <div className="font-semibold text-[#E7EDF5]">{title}</div>}
        <div className="text-[11px] opacity-90">{children}</div>
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
