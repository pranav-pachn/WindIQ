import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import {
  PeriodSelector,
  JANUARY_BENCHMARK_PERIOD,
  type EvaluationPeriodState,
} from '@/components/dashboard/period-selector'

describe('PeriodSelector', () => {
  it('renders active window details and benchmark badge', () => {
    const onPeriodChange = vi.fn()
    render(
      <PeriodSelector
        currentPeriod={JANUARY_BENCHMARK_PERIOD}
        onPeriodChange={onPeriodChange}
      />
    )

    expect(screen.getByText('Market Evaluation Window')).toBeInTheDocument()
    expect(screen.getByText('Verified Jan 2026 Benchmark')).toBeInTheDocument()
    expect(screen.getByText(/02 Jan 2026 – 01 Feb 2026/)).toBeInTheDocument()
    expect(screen.getByText(/09:00 UK decision cutoff/)).toBeInTheDocument()
  })

  it('triggers period change when Full Period preset is clicked', () => {
    const onPeriodChange = vi.fn()
    render(
      <PeriodSelector
        currentPeriod={JANUARY_BENCHMARK_PERIOD}
        onPeriodChange={onPeriodChange}
        availableMinDate="2026-01-02"
        availableMaxDate="2026-11-04"
      />
    )

    const fullBtn = screen.getByRole('button', { name: /Full Period/i })
    fireEvent.click(fullBtn)

    expect(onPeriodChange).toHaveBeenCalledWith({
      deliveryDateFrom: '2026-01-02',
      deliveryDateTo: '2026-11-04',
      isBenchmarkPreset: false,
    })
  })

  it('allows opening custom date filter and submitting valid dates', () => {
    const onPeriodChange = vi.fn()
    const customState: EvaluationPeriodState = {
      deliveryDateFrom: '2026-01-10',
      deliveryDateTo: '2026-01-20',
      isBenchmarkPreset: false,
    }

    render(
      <PeriodSelector
        currentPeriod={customState}
        onPeriodChange={onPeriodChange}
      />
    )

    const customBtn = screen.getByRole('button', { name: /Custom Dates/i })
    fireEvent.click(customBtn)

    expect(screen.getByLabelText(/Delivery Date From/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Delivery Date To/i)).toBeInTheDocument()

    const applyBtn = screen.getByRole('button', { name: /Apply Filter/i })
    fireEvent.click(applyBtn)

    expect(onPeriodChange).toHaveBeenCalledWith(
      expect.objectContaining({
        deliveryDateFrom: '2026-01-10',
        deliveryDateTo: '2026-01-20',
      })
    )
  })
})

