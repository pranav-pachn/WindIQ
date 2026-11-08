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
          className="text-[#718198] hover:text-[#9AAABD] transition-colors p-0.5 rounded focus:outline-none"
        >
          <Info className="w-3.5 h-3.5" />
        </button>
      )}

      {isVisible && (
        <div
          role="tooltip"
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 w-64 p-3 bg-[#111C2D] border border-[#26364A] rounded-md shadow-2xl text-left pointer-events-none transition-all duration-150 animate-in fade-in"
        >
          {title && (
            <div className="text-xs font-semibold text-[#E7EDF5] mb-1 border-b border-[#1E2B3E] pb-1">
              {title}
            </div>
          )}
          <div className="text-[11px] leading-relaxed text-[#9AAABD]">
            {content}
          </div>
        </div>
      )}
    </div>
  )
}
