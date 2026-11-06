import { createBrowserRouter, Navigate } from 'react-router-dom'
import { AppShell } from '@/components/layout/app-shell'
import { OverviewPage } from '@/pages/overview-page'
import { LazyAccuracyPage, LazyForecastPage } from '@/components/layout/lazy-routes'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      {
        index: true,
        element: <OverviewPage />,
      },
      {
        path: 'overview',
        element: <OverviewPage />,
      },
      {
        path: 'accuracy',
        element: <LazyAccuracyPage />,
      },
      {
        path: 'forecasts',
        element: <LazyForecastPage />,
      },
      {
        path: 'data-health',
        element: <Navigate to="/" replace />,
      },
      {
        path: 'settings',
        element: <Navigate to="/" replace />,
      },
      {
        path: '*',
        element: <OverviewPage />,
      },
    ],
  },
])

