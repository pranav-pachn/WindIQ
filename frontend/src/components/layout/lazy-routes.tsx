import React, { lazy, Suspense } from 'react'

export function RouteLoadingFallback() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-14 rounded-xl bg-slate-900/40 border border-slate-800" />
      <div className="h-[400px] rounded-xl bg-slate-900/40 border border-slate-800" />
      <div className="h-64 rounded-xl bg-slate-900/40 border border-slate-800" />
    </div>
  )
}

const AccuracyPageImport = lazy(() =>
  import('@/pages/accuracy-page').then((m) => ({ default: m.AccuracyPage }))
)

export function LazyAccuracyPage() {
  return (
    <Suspense fallback={<RouteLoadingFallback />}>
      <AccuracyPageImport />
    </Suspense>
  )
}

const ForecastPageImport = lazy(() =>
  import('@/pages/forecast-page').then((m) => ({ default: m.ForecastPage }))
)

export function LazyForecastPage() {
  return (
    <Suspense fallback={<RouteLoadingFallback />}>
      <ForecastPageImport />
    </Suspense>
  )
}


