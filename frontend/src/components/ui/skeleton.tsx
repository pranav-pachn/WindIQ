import React from 'react'
import { cn } from '@/lib/utils'

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string
}

export function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      className={cn(
        'animate-pulse rounded bg-[#162337]',
        className
      )}
      {...props}
    />
  )
}

export function CardSkeleton() {
  return (
    <div className="rounded-lg border border-[#26364A] bg-[#111C2D] p-4 sm:p-5 space-y-3">
      <div className="flex justify-between items-center">
        <Skeleton className="h-3.5 w-24" />
        <Skeleton className="h-3.5 w-3.5 rounded" />
      </div>
      <Skeleton className="h-7 w-32" />
      <Skeleton className="h-3 w-40" />
    </div>
  )
}
