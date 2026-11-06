import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { OverviewPage } from '@/pages/overview-page'
import { api } from '@/lib/api-client'
import type {
  OverviewResponse,
  AccuracySummaryResponse,
  DailyAccuracyResponse,
  DataHealthResponse,
} from '@/types/api'

vi.mock('@/lib/api-client', () => ({
  api: {
    getOverview: vi.fn(),
    getAccuracySummary: vi.fn(),
    getDailyAccuracy: vi.fn(),
    getDataHealth: vi.fn(),
    checkReadiness: vi.fn(),
    getBaseUrl: () => 'http://localhost:8001',
  },
}))

const mockOverview: OverviewResponse = {
  platform: 'WindIQ UK Forecast Accuracy Platform',
  version: '2.0.0',
  evaluation_period: {
    decision_start_date: '2026-01-01',
    decision_end_date: '2026-01-31',
    delivery_start_date: '2026-01-02',
    delivery_end_date: '2026-02-01',
    decision_cutoff: '09:00 Europe/London',
    total_evaluation_hours: 744,
  },
  accuracy_kpis: {
    valid_comparisons: 744,
    forecast_coverage_pct: 100.0,
    actual_completeness_pct: 100.0,
    mae_mw: 2038.9126,
    rmse_mw: 2504.7587,
    mape_pct: 22.0446,
    mape_denominator: 744,
    forecast_bias_mw: 1747.8871,
    overforecast_hours: 632,
    underforecast_hours: 112,
    zero_error_hours: 0,
    avg_forecast_mw: 13031.4449,
    avg_actual_mw: 11283.5578,
  },
  dataset_health: {
    raw_windfor_records: 18104,
    raw_fuelhh_readings: 1488,
    last_successful_ingestion_utc: '2026-11-03T16:38:11Z',
  },
  configuration_version: 1,
  metric_version: 'v1.0',
}

const mockSummary: AccuracySummaryResponse = {
  date_range: {
    delivery_date_from: '2026-01-02',
    delivery_date_to: '2026-02-01',
    total_calendar_days: 31,
    total_hours: 744,
  },
  metrics: {
    valid_comparisons: 744,
    missing_forecast_hours: 0,
    missing_actual_hours: 0,
    forecast_coverage_pct: 100.0,
    actual_completeness_pct: 100.0,
    mae_mw: 2038.9126,
    rmse_mw: 2504.7587,
    mape_pct: 22.0446,
    forecast_bias_mw: 1747.8871,
    overforecast_count: 632,
    underforecast_count: 112,
    zero_error_count: 0,
    mape_denominator: 744,
    mape_excluded_count: 0,
    mape_exclusion_reasons: [],
    avg_forecast_mw: 13031.4449,
    avg_actual_mw: 11283.5578,
  },
}

const mockDaily: DailyAccuracyResponse = {
  items: [
    {
      delivery_date: '2026-01-02',
      decision_date: '2026-01-01',
      total_hours: 24,
      valid_hours: 24,
      forecast_coverage_pct: 100.0,
      actual_completeness_pct: 100.0,
      mae_mw: 3109.9167,
      rmse_mw: 3171.3786,
      mape_pct: 20.6601,
      mape_denominator: 24,
      bias_mw: 3109.9167,
      overforecast_hours: 24,
      underforecast_hours: 0,
      zero_error_hours: 0,
      avg_forecast_mw: 18279.0,
      avg_actual_mw: 15169.0833,
    },
    {
      delivery_date: '2026-01-19',
      decision_date: '2026-01-18',
      total_hours: 24,
      valid_hours: 24,
      forecast_coverage_pct: 100.0,
      actual_completeness_pct: 100.0,
      mae_mw: 736.1458,
      rmse_mw: 871.2,
      mape_pct: 7.5,
      mape_denominator: 24,
      bias_mw: 600.0,
      overforecast_hours: 20,
      underforecast_hours: 4,
      zero_error_hours: 0,
      avg_forecast_mw: 12000.0,
      avg_actual_mw: 11400.0,
    },
    {
      delivery_date: '2026-01-28',
      decision_date: '2026-01-27',
      total_hours: 24,
      valid_hours: 24,
      forecast_coverage_pct: 100.0,
      actual_completeness_pct: 100.0,
      mae_mw: 5374.7917,
      rmse_mw: 5399.4028,
      mape_pct: 97.224,
      mape_denominator: 24,
      bias_mw: 5374.7917,
      overforecast_hours: 24,
      underforecast_hours: 0,
      zero_error_hours: 0,
      avg_forecast_mw: 11134.5833,
      avg_actual_mw: 5759.7917,
    },
  ],
  summary: {
    total_days: 31,
    best_day_mae: { delivery_date: '2026-01-19', value: 736.1458 },
    worst_day_mae: { delivery_date: '2026-01-28', value: 5374.7917 },
    best_day_mape: { delivery_date: '2026-01-20', value: 6.5834 },
    worst_day_mape: { delivery_date: '2026-01-28', value: 97.224 },
  },
}

const mockDataHealth: DataHealthResponse = {
  health_status: 'HEALTHY',
  data_integrity_score: 100.0,
  summary: {
    total_delivery_hours_evaluated: 744,
    missing_actual_hours: 0,
    missing_forecast_hours: 0,
    incomplete_hourly_actual_pairs: 0,
    half_hourly_spacing_violations: 0,
    null_generation_readings: 0,
    duplicate_keys_detected: 0,
  },
  publication_cycle_health: {
    total_publication_cycles_observed: 248,
    average_cycles_per_day: 8.0,
    min_cycles_per_day: 8,
    max_cycles_per_day: 8,
  },
  recent_quality_events: [],
  scheduler: {
    status: 'RUNNING',
    is_leader: true,
    enabled: true,
    jobs: {},
  },
}

import { EvaluationPeriodProvider } from '@/context/evaluation-period-context'

function renderOverview() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <EvaluationPeriodProvider>
        <OverviewPage />
      </EvaluationPeriodProvider>
    </QueryClientProvider>
  )
}

describe('OverviewPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.getOverview).mockResolvedValue(mockOverview)
    vi.mocked(api.getAccuracySummary).mockResolvedValue(mockSummary)
    vi.mocked(api.getDailyAccuracy).mockResolvedValue(mockDaily)
    vi.mocked(api.getDataHealth).mockResolvedValue(mockDataHealth)
  })

  it('renders the complete overview dashboard with real benchmark KPIs', async () => {
    renderOverview()

    // Expect benchmark KPIs
    expect(await screen.findByText('2,038.91')).toBeInTheDocument()
    expect(screen.getByText('2,504.76')).toBeInTheDocument()
    expect(screen.getByText('22.04')).toBeInTheDocument()
    expect(screen.getByText('+1,747.89')).toBeInTheDocument()

    // Direction Card counts (multiple elements because of card summary + segmented progress bar)
    const overElements = screen.getAllByText(/632/)
    expect(overElements.length).toBeGreaterThanOrEqual(1)
    const underElements = screen.getAllByText(/112/)
    expect(underElements.length).toBeGreaterThanOrEqual(1)

    // Dataset Health
    expect(screen.getByText('18,104')).toBeInTheDocument()
    expect(screen.getByText('1,488')).toBeInTheDocument()

    // Performance Extremes
    expect(screen.getByText('Lowest Error (Best MAE)')).toBeInTheDocument()
    expect(screen.getByText('Highest Error (Worst MAE)')).toBeInTheDocument()
  })

  it('renders error alert banner when API call fails and provides retry action', async () => {
    vi.mocked(api.getAccuracySummary).mockRejectedValue(new Error('Network connection refused'))

    renderOverview()

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByText(/Network connection refused/)).toBeInTheDocument()

    const retryBtn = screen.getByRole('button', { name: /Retry/i })
    expect(retryBtn).toBeInTheDocument()
  })

  it('renders empty state when date range returns 0 valid comparisons', async () => {
    vi.mocked(api.getAccuracySummary).mockResolvedValue({
      ...mockSummary,
      metrics: {
        ...mockSummary.metrics,
        valid_comparisons: 0,
      },
    })

    renderOverview()

    expect(
      await screen.findByText('No Forecast Evaluations in Selected Date Range')
    ).toBeInTheDocument()

    const resetBtn = screen.getByRole('button', { name: /Reset to January 2026 Benchmark/i })
    expect(resetBtn).toBeInTheDocument()
    fireEvent.click(resetBtn)
  })
})
