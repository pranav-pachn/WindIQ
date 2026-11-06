import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import type {
  AccuracySummaryResponse,
  DailyAccuracyResponse,
  HourlyAccuracyResponse,
  HourlyAccuracyQueryParams,
  HourlyAccuracyItem,
  HourOfDayAggregate,
} from '@/types/api'

export function useAccuracySummary(deliveryDateFrom?: string, deliveryDateTo?: string) {
  return useQuery<AccuracySummaryResponse>({
    queryKey: ['accuracy', 'summary', deliveryDateFrom, deliveryDateTo],
    queryFn: () => api.getAccuracySummary(deliveryDateFrom, deliveryDateTo),
  })
}

export function useDailyAccuracy(
  deliveryDateFrom?: string,
  deliveryDateTo?: string,
  sortBy: string = 'delivery_date',
  order: string = 'asc',
  page: number = 1,
  pageSize: number = 50
) {
  return useQuery<DailyAccuracyResponse>({
    queryKey: ['accuracy', 'daily', deliveryDateFrom, deliveryDateTo, sortBy, order, page, pageSize],
    queryFn: ({ signal }) =>
      api.getDailyAccuracy(deliveryDateFrom, deliveryDateTo, sortBy, order, page, pageSize, signal),
  })
}

/**
 * Server-side paginated evaluations hook for table views.
 */
export function useHourlyAccuracyTable(params: HourlyAccuracyQueryParams) {
  return useQuery<HourlyAccuracyResponse>({
    queryKey: [
      'accuracy',
      'hourly',
      'table',
      params.delivery_date,
      params.delivery_date_from,
      params.delivery_date_to,
      params.hour_of_day,
      params.status,
      params.sort_by,
      params.order,
      params.page,
      params.page_size,
    ],
    queryFn: ({ signal }) => api.getHourlyAccuracy(params, signal),
  })
}

/**
 * Complete series hook for charts, heatmaps, quantiles, and client-side exports.
 * Fetches all pages concurrently with count parity, uniqueness, and continuity validation.
 */
export function useAllHourlyAccuracy(
  params?: Omit<HourlyAccuracyQueryParams, 'page' | 'page_size'>
) {
  return useQuery<{
    items: HourlyAccuracyItem[]
    hour_of_day_summary: HourOfDayAggregate[]
    total_items: number
  }>({
    queryKey: [
      'accuracy',
      'hourly',
      'complete-series',
      params?.delivery_date,
      params?.delivery_date_from,
      params?.delivery_date_to,
      params?.hour_of_day,
      params?.status,
    ],
    queryFn: ({ signal }) => api.getAllHourlyAccuracy(params, signal),
    staleTime: 60_000,
  })
}

/**
 * Diurnal hour-of-day summary hook.
 */
export function useHourOfDayProfile(deliveryDateFrom?: string, deliveryDateTo?: string) {
  return useQuery<HourOfDayAggregate[]>({
    queryKey: ['accuracy', 'hourly', 'diurnal-profile', deliveryDateFrom, deliveryDateTo],
    queryFn: async ({ signal }) => {
      const res = await api.getHourlyAccuracy(
        {
          delivery_date_from: deliveryDateFrom,
          delivery_date_to: deliveryDateTo,
          view: 'hour_of_day',
          page_size: 1,
        },
        signal
      )
      return res.hour_of_day_summary
    },
    staleTime: 60_000,
  })
}


