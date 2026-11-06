import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppShell } from '@/components/layout/app-shell'
import { EvaluationPeriodProvider } from '@/context/evaluation-period-context'

function renderShell(initialPath = '/') {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <EvaluationPeriodProvider>
        <MemoryRouter initialEntries={[initialPath]}>
          <AppShell />
        </MemoryRouter>
      </EvaluationPeriodProvider>
    </QueryClientProvider>
  )
}

describe('AppShell', () => {
  it('renders brand logo and title', () => {
    renderShell()

    expect(screen.getByText('WindIQ')).toBeInTheDocument()
    expect(screen.getByText('Forecast Intelligence')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Executive Overview/i })).toBeInTheDocument()
  })

  it('renders active selected evaluation period in top nav agreeing with default', () => {
    renderShell()

    expect(screen.getByText(/02 Jan 2026 – 01 Feb 2026/)).toBeInTheDocument()
    expect(screen.getByText('Jan 2026 Benchmark')).toBeInTheDocument()
  })

  it('renders all required sidebar navigation items', () => {
    renderShell()

    expect(screen.getByRole('link', { name: /Executive Overview/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Forecast Accuracy/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Forecast Explorer/i })).toBeInTheDocument()
  })

  it('toggles sidebar collapse state when collapse button is clicked', () => {
    renderShell()

    const collapseBtn = screen.getByRole('button', { name: /Collapse sidebar/i })
    fireEvent.click(collapseBtn)

    expect(screen.getByRole('button', { name: /Expand sidebar/i })).toBeInTheDocument()
  })

  it('opens and closes mobile sidebar navigation drawer', () => {
    renderShell()

    const mobileMenuBtn = screen.getByRole('button', { name: /Open navigation menu/i })
    fireEvent.click(mobileMenuBtn)

    const backdrop = document.querySelector('[aria-hidden="true"]')
    expect(backdrop).toBeInTheDocument()

    if (backdrop) {
      fireEvent.click(backdrop)
    }
  })
})
