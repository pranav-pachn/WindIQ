import React, { useState } from 'react'
import { Info } from 'lucide-react'
import { cn } from '@/lib/utils'

interface TooltipProps {
  content: string
  title?: string
  children?: React.ReactNode
  className?: string
}

export function Tooltip({ content, title, children, className }: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false)

  return (
    <div
      className={cn('relative inline-flex items-center group', className)}
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
      onFocus={() => setIsVisible(true)}
      onBlur={() => setIsVisible(false)}
    >
      {children || (
        <button
          type="button"
          aria-label={title || 'More information'}
          className="text-slate-400 hover:text-slate-200 transition-colors p-0.5 rounded focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
        >
          <Info className="w-3.5 h-3.5" />
        </button>
      )}

      {isVisible && (
        <div
          role="tooltip"
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 w-64 p-2.5 bg-slate-900/95 border border-slate-700/80 rounded-md shadow-xl text-left backdrop-blur-md pointer-events-none transition-all duration-150 animate-in fade-in"
        >
          {title && (
            <div className="text-xs font-semibold text-slate-200 mb-1 border-b border-slate-800 pb-1">
              {title}
            </div>
          )}
          <div className="text-[11px] leading-relaxed text-slate-300">
            {content}
          </div>
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px border-4 border-transparent border-t-slate-750" />
        </div>
      )}
    </div>
  )
}

