import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ForecastPage } from '@/pages/forecast-page'
import { EvaluationPeriodContext } from '@/context/evaluation-period-state'

// Mock API
vi.mock('@/lib/api-client', () => ({
  api: {
    getSingleDeliveryHourPublications: vi.fn().mockResolvedValue({
      delivery_hour_utc: '2026-01-28T12:00:00Z',
      delivery_date_london: '2026-01-28',
      hour_of_day_london: 12,
      decision_cutoff_utc: '2026-01-27T09:00:00Z',
      selected_forecast_id: 15370,
      selected_publish_time_utc: '2026-01-27T07:30:00Z',
      actual_generation_mw: 4857.5,
      actual_data_status: 'VALID',
      settlement_readings: [
        {
          settlement_period: 25,
          start_time_utc: '2026-01-28T12:00:00Z',
          generation_mw: 4908.0,
        },
        {
          settlement_period: 26,
          start_time_utc: '2026-01-28T12:30:00Z',
          generation_mw: 4807.0,
        },
      ],
      total_publications: 19,
      forward_publications: 19,
      eligible_publications: 3,
      publications: [
        {
          id: 15368,
          publish_time_utc: '2026-01-27T02:30:00Z',
          lead_time_hours: 33.5,
          forecast_mw: 9200.0,
          revision_mw: null,
          is_eligible: true,
          is_selected: false,
        },
        {
          id: 15370,
          publish_time_utc: '2026-01-27T07:30:00Z',
          lead_time_hours: 28.5,
          forecast_mw: 9031.0,
          revision_mw: -169.0,
          is_eligible: true,
          is_selected: true,
        },
        {
          id: 15375,
          publish_time_utc: '2026-01-27T11:30:00Z',
          lead_time_hours: 24.5,
          forecast_mw: 8500.0,
          revision_mw: -531.0,
          is_eligible: false,
          is_selected: false,
        },
      ],
    }),

    getMultiHorizonAnalysis: vi.fn().mockResolvedValue({
      delivery_date_from: '2026-01-02',
      delivery_date_to: '2026-02-01',
      analysis_mode: 'matched',
      total_delivery_hours_in_period: 744,
      evaluated_delivery_hours: 553,
      common_matched_hours: 553,
      overall_coverage_pct: 74.33,
      proven_convergence_improvement_pct: 34.16,
      buckets: [
        {
          horizon_bucket: '0-6h',
          lead_time_min_hours: 0.0,
          lead_time_max_hours: 6.0,
          boundary_semantics: '(0.0, 6.0)',
          target_lead_time_hours: 3.0,
          avg_actual_lead_time_hours: 2.82,
          observation_count: 553,
          unique_delivery_hours: 553,
          hour_coverage_pct: 100.0,
          mae_mw: 1610.90,
          rmse_mw: 2058.45,
          bias_mw: 1339.36,
          mape_pct: 15.42,
        },
        {
          horizon_bucket: '48-72h',
          lead_time_min_hours: 48.0,
          lead_time_max_hours: 72.0,
          boundary_semantics: '[48.0, 72.0]',
          target_lead_time_hours: 60.0,
          avg_actual_lead_time_hours: 56.11,
          observation_count: 553,
          unique_delivery_hours: 553,
          hour_coverage_pct: 100.0,
          mae_mw: 2446.61,
          rmse_mw: 3161.74,
          bias_mw: 1495.45,
          mape_pct: 27.35,
        },
      ],
    }),

    getRevisionAnalytics: vi.fn().mockResolvedValue({
      delivery_date_from: '2026-01-02',
      delivery_date_to: '2026-02-01',
      forward_only_revisions: 13367,
      mean_signed_revision_mw: -6.77,
      mean_absolute_revision_mw: 343.96,
      upward_count: 6206,
      upward_pct: 46.43,
      downward_count: 6434,
      downward_pct: 48.13,
      unchanged_count: 727,
      unchanged_pct: 5.44,
      cycle_gap_max_hours: 4.0,
      discontinuous_gap_count: 0,
      histogram: [
        { bin_center_mw: -500, bin_start_mw: -600, bin_end_mw: -400, count: 850 },
        { bin_center_mw: 0, bin_start_mw: -100, bin_end_mw: 100, count: 4200 },
        { bin_center_mw: 500, bin_start_mw: 400, bin_end_mw: 600, count: 790 },
      ],
      top_revisions: [
        {
          raw_forecast_id: 9999,
          delivery_hour_utc: '2026-01-28T12:00:00Z',
          delivery_date_london: '2026-01-28',
          hour_of_day_london: 12,
          publish_time_utc: '2026-01-27T11:30:00Z',
          previous_publish_time_utc: '2026-01-27T07:30:00Z',
          lead_time_hours: 24.5,
          previous_forecast_mw: 9031.0,
          revised_forecast_mw: 8500.0,
          revision_mw: -531.0,
          abs_revision_mw: 531.0,
          cycle_gap_hours: 4.0,
          is_discontinuous: false,
        },
      ],
      diurnal_revision_heatmap: [
        {
          hour_of_day_london: 12,
          horizon_bucket: '24-36h',
          mean_abs_revision_mw: 320.5,
          revision_count: 31,
        },
      ],
    }),

    getCompleteHourlySeries: vi.fn().mockResolvedValue([
      {
        delivery_date: '2026-01-28',
        delivery_hour_utc: '2026-01-28T12:00:00Z',
        hour_of_day: 12,
        decision_date: '2026-01-27',
        decision_cutoff_utc: '2026-01-27T09:00:00Z',
        selected_publish_time_utc: '2026-01-27T07:30:00Z',
        forecast_generation_mw: 9031.0,
        actual_generation_mw: 4857.5,
        forecast_error_mw: 4173.5,
        absolute_error_mw: 4173.5,
        absolute_percentage_error: 85.92,
        comparison_status: 'VALID',
        traceability: null,
      },
    ]),
  },
}))

describe('ForecastPage Component', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          staleTime: Infinity,
        },
      },
    })
    vi.clearAllMocks()
  })

  const renderWithProviders = () => {
    return render(
      <QueryClientProvider client={queryClient}>
        <EvaluationPeriodContext.Provider
          value={{
            period: {
              deliveryDateFrom: '2026-01-02',
              deliveryDateTo: '2026-02-01',
              isBenchmarkPreset: true,
            },
            setPeriod: vi.fn(),
            resetToBenchmark: vi.fn(),
          }}
        >
          <ForecastPage />
        </EvaluationPeriodContext.Provider>
      </QueryClientProvider>
    )
  }

  it('renders View 1 (Publication Evolution) with trajectory chart and history table', async () => {
    renderWithProviders()

    // Page title
    expect(
      screen.getByText('Forecast Explorer & Multi-Horizon Analysis')
    ).toBeInTheDocument()

    // Trajectory chart header
    await waitFor(() => {
      expect(
        screen.getByText('Forecast Evolution Across Lead Times')
      ).toBeInTheDocument()
    })

    // KPI cards in View 1
    expect(screen.getByText('Selected D-1 Forecast')).toBeInTheDocument()
    expect(screen.getByText('9,031.00 MW')).toBeInTheDocument()
    expect(screen.getByText('Actual Generation')).toBeInTheDocument()
    expect(screen.getByText('4,857.50 MW')).toBeInTheDocument()

    // History table
    expect(
      screen.getByText('Complete Publication Lifecycle & Step Revision Ledger')
    ).toBeInTheDocument()
  })

  it('opens publication audit modal when clicking Audit Lineage button', async () => {
    renderWithProviders()

    await waitFor(() => {
      expect(
        screen.getByText('Forecast Evolution Across Lead Times')
      ).toBeInTheDocument()
    })

    const auditButtons = screen.getAllByRole('button', { name: /audit/i })
    expect(auditButtons.length).toBeGreaterThan(0)
    fireEvent.click(auditButtons[0])

    await waitFor(() => {
      expect(
        screen.getByText('Forecast Selection & Settlement Lineage Audit')
      ).toBeInTheDocument()
      expect(
        screen.getByText('Decision Cutoff Gate & Eligibility')
      ).toBeInTheDocument()
      expect(
        screen.getByText('Elexon BMRS FUELHH Half-Hourly Readings')
      ).toBeInTheDocument()
    })

    // Close modal
    const closeBtn = screen.getByRole('button', { name: 'Close Audit' })
    fireEvent.click(closeBtn)

    await waitFor(() => {
      expect(
        screen.queryByText('Forecast Selection & Settlement Lineage Audit')
      ).not.toBeInTheDocument()
    })
  })

  it('switches between all four views via the toolbar', async () => {
    renderWithProviders()

    // Switch to View 2: Multi-Horizon Convergence
    const multiHorizonTab = screen.getByRole('button', {
      name: /2\. Multi-Horizon Convergence/i,
    })
    fireEvent.click(multiHorizonTab)

    await waitFor(() => {
      expect(
        screen.getByText('Forecast Error Convergence Across Lead Times')
      ).toBeInTheDocument()
    })

    // Switch to View 3: Revision Trajectory
    const revisionsTab = screen.getByRole('button', {
      name: /3\. Revision Trajectory/i,
    })
    fireEvent.click(revisionsTab)

    await waitFor(() => {
      expect(
        screen.getByText('Forecast Revision Distribution (Δ MW)')
      ).toBeInTheDocument()
      expect(
        screen.getByText('Top 10 Extreme Forecast Revisions Leaderboard')
      ).toBeInTheDocument()
      expect(
        screen.getByText(/Diurnal Revision Volatility Matrix/)
      ).toBeInTheDocument()
    })

    // Switch to View 4: Horizon vs Actual
    const comparisonTab = screen.getByRole('button', {
      name: /4\. Horizon vs Actual/i,
    })
    fireEvent.click(comparisonTab)

    await waitFor(() => {
      expect(
        screen.getByText('Forecast vs Actual Continuous Timeline Overlay')
      ).toBeInTheDocument()
      expect(
        screen.getByText('Generation Profile & Forecast Error Envelope')
      ).toBeInTheDocument()
    })
  })
})
