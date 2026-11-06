import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { KpiGrid } from '@/components/dashboard/kpi-grid'
import type { AccuracySummaryMetrics } from '@/types/api'

const mockBenchmarkMetrics: AccuracySummaryMetrics = {
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
}

describe('KpiGrid', () => {
  it('renders all benchmark KPIs accurately with standard 2 decimal places', () => {
    render(<KpiGrid metrics={mockBenchmarkMetrics} isBenchmarkPreset={true} />)

    // Valid comparisons
    expect(screen.getByText('744')).toBeInTheDocument()

    // MAE: 2,038.91 MW
    expect(screen.getByText('2,038.91')).toBeInTheDocument()

    // RMSE: 2,504.76 MW
    expect(screen.getByText('2,504.76')).toBeInTheDocument()

    // MAPE: 22.04%
    expect(screen.getByText('22.04')).toBeInTheDocument()

    // Forecast bias: +1,747.89 MW
    expect(screen.getByText('+1,747.89')).toBeInTheDocument()

    // Over vs under count: 632 : 112
    expect(screen.getByText('632 : 112')).toBeInTheDocument()

    // Benchmark badge
    expect(screen.getByText('Validated January 2026 Benchmark')).toBeInTheDocument()
  })

  it('toggles to 4 decimal places high-precision audit mode when clicked', () => {
    render(<KpiGrid metrics={mockBenchmarkMetrics} />)

    const toggleBtn = screen.getByRole('button', { name: /audit \(4 decimals\)/i })
    fireEvent.click(toggleBtn)

    // MAE in 4 decimals
    expect(screen.getByText('2,038.9126')).toBeInTheDocument()
    // RMSE in 4 decimals
    expect(screen.getByText('2,504.7587')).toBeInTheDocument()
    // MAPE in 4 decimals
    expect(screen.getByText('22.0446')).toBeInTheDocument()
    // Forecast bias in 4 decimals
    expect(screen.getByText('+1,747.8871')).toBeInTheDocument()
  })

  it('renders generation baseline context bar', () => {
    render(<KpiGrid metrics={mockBenchmarkMetrics} />)

    expect(screen.getByText(/13,031.4 MW/)).toBeInTheDocument()
    expect(screen.getByText(/11,283.6 MW/)).toBeInTheDocument()
  })
})

