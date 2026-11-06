import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import type {
  SingleDeliveryHourPublicationResponse,
  MultiHorizonResponse,
  HorizonMode,
  RevisionAnalyticsResponse,
} from '@/types/api'

export function useSingleHourPublications(deliveryHourUtc: string | null) {
  return useQuery<SingleDeliveryHourPublicationResponse>({
    queryKey: ['forecasts', 'publications', deliveryHourUtc],
    queryFn: ({ signal }) => {
      if (!deliveryHourUtc) {
        throw new Error('deliveryHourUtc is required')
      }
      return api.getSingleDeliveryHourPublications(deliveryHourUtc, { signal })
    },
    enabled: Boolean(deliveryHourUtc),
    staleTime: 5 * 60 * 1000,
  })
}

export function useMultiHorizonAnalysis(
  deliveryDateFrom?: string,
  deliveryDateTo?: string,
  mode: HorizonMode = 'matched'
) {
  return useQuery<MultiHorizonResponse>({
    queryKey: ['forecasts', 'horizons', deliveryDateFrom, deliveryDateTo, mode],
    queryFn: ({ signal }) =>
      api.getMultiHorizonAnalysis(
        {
          delivery_date_from: deliveryDateFrom,
          delivery_date_to: deliveryDateTo,
          mode,
        },
        { signal }
      ),
    staleTime: 5 * 60 * 1000,
  })
}

export function useRevisionAnalytics(
  deliveryDateFrom?: string,
  deliveryDateTo?: string,
  minAbsRevisionMw: number = 500.0
) {
  return useQuery<RevisionAnalyticsResponse>({
    queryKey: ['forecasts', 'revisions', deliveryDateFrom, deliveryDateTo, minAbsRevisionMw],
    queryFn: ({ signal }) =>
      api.getRevisionAnalytics(
        {
          delivery_date_from: deliveryDateFrom,
          delivery_date_to: deliveryDateTo,
          min_abs_revision_mw: minAbsRevisionMw,
        },
        { signal }
      ),
    staleTime: 5 * 60 * 1000,
  })
}

export function useHourlySeriesForTimeline(
  deliveryDateFrom?: string,
  deliveryDateTo?: string
) {
  return useQuery({
    queryKey: ['accuracy', 'hourly', 'complete-series', deliveryDateFrom, deliveryDateTo],
    queryFn: ({ signal }) =>
      api.getCompleteHourlySeries(
        {
          delivery_date_from: deliveryDateFrom,
          delivery_date_to: deliveryDateTo,
        },
        signal
      ),
    staleTime: 5 * 60 * 1000,
  })
}

