import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AccuracyPage } from "@/pages/accuracy-page";
import { EvaluationPeriodContext } from "@/context/evaluation-period-state";

// Mock API
vi.mock("@/lib/api-client", () => ({
  api: {
    getAllHourlyAccuracy: vi.fn().mockResolvedValue({
      items: [
        {
          delivery_date: "2026-01-28",
          delivery_hour_utc: "2026-01-28T12:00:00Z",
          hour_of_day: 12,
          decision_date: "2026-01-27",
          decision_cutoff_utc: "2026-01-27T09:00:00Z",
          selected_publish_time_utc: "2026-01-27T07:30:00Z",
          forecast_generation_mw: 9031.0,
          actual_generation_mw: 4857.5,
          forecast_error_mw: 4173.5,
          absolute_error_mw: 4173.5,
          absolute_percentage_error: 85.9187,
          comparison_status: "VALID",
          traceability: {
            selected_forecast_id: 15370,
            hourly_actual_id: 637,
            half_hour_readings: [
              { settlement_period: 25, start_time_utc: "2026-01-28T12:00:00Z", generation_mw: 4908.0 },
              { settlement_period: 26, start_time_utc: "2026-01-28T12:30:00Z", generation_mw: 4807.0 },
            ],
          },
        },
      ],
      hour_of_day_summary: [
        {
          hour_of_day: 12,
          comparison_count: 31,
          mae_mw: 1929.32,
          rmse_mw: 2295.50,
          mape_pct: 21.75,
          mape_denominator: 31,
          bias_mw: 1387.71,
          avg_forecast_mw: 12574.19,
          avg_actual_mw: 11186.48,
          overforecast_count: 24,
          underforecast_count: 7,
        },
      ],
      total_items: 1,
    }),
    getHourlyAccuracy: vi.fn().mockResolvedValue({
      items: [
        {
          delivery_date: "2026-01-28",
          delivery_hour_utc: "2026-01-28T12:00:00Z",
          hour_of_day: 12,
          decision_date: "2026-01-27",
          decision_cutoff_utc: "2026-01-27T09:00:00Z",
          selected_publish_time_utc: "2026-01-27T07:30:00Z",
          forecast_generation_mw: 9031.0,
          actual_generation_mw: 4857.5,
          forecast_error_mw: 4173.5,
          absolute_error_mw: 4173.5,
          absolute_percentage_error: 85.9187,
          comparison_status: "VALID",
          traceability: {
            selected_forecast_id: 15370,
            hourly_actual_id: 637,
            half_hour_readings: [
              { settlement_period: 25, start_time_utc: "2026-01-28T12:00:00Z", generation_mw: 4908.0 },
              { settlement_period: 26, start_time_utc: "2026-01-28T12:30:00Z", generation_mw: 4807.0 },
            ],
          },
        },
      ],
      pagination: {
        page: 1,
        page_size: 50,
        total_items: 1,
        total_pages: 1,
        has_next: false,
        has_previous: false,
      },
      hour_of_day_summary: [],
    }),
    getDailyAccuracy: vi.fn().mockResolvedValue({
      items: [
        {
          delivery_date: "2026-01-28",
          decision_date: "2026-01-27",
          total_hours: 24,
          valid_hours: 24,
          forecast_coverage_pct: 100.0,
          actual_completeness_pct: 100.0,
          mae_mw: 5374.79,
          rmse_mw: 5399.40,
          mape_pct: 97.22,
          mape_denominator: 24,
          bias_mw: 5374.79,
          overforecast_hours: 24,
          underforecast_hours: 0,
          zero_error_hours: 0,
        },
      ],
      summary: {
        total_days: 1,
        best_day_mae: { delivery_date: "2026-01-19", value: 736.15 },
        worst_day_mae: { delivery_date: "2026-01-28", value: 5374.79 },
        best_day_mape: { delivery_date: "2026-01-20", value: 6.58 },
        worst_day_mape: { delivery_date: "2026-01-28", value: 97.22 },
      },
      pagination: { page: 1, page_size: 50, total_items: 1, total_pages: 1, has_next: false, has_previous: false },
    }),
  },
}));

function renderWithProviders() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <EvaluationPeriodContext.Provider
        value={{
          period: {
            deliveryDateFrom: "2026-01-02",
            deliveryDateTo: "2026-02-01",
            totalDays: 31,
            label: "02 Jan 2026 – 01 Feb 2026",
          },
          isBenchmark: true,
          setPresetPeriod: vi.fn(),
          setCustomPeriod: vi.fn(),
        }}
      >
        <AccuracyPage />
      </EvaluationPeriodContext.Provider>
    </QueryClientProvider>
  );
}

describe("AccuracyPage Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the toolbar and switches between all four workstation views", async () => {
    renderWithProviders();

    // 1. Toolbar elements
    expect(screen.getByText(/Evaluation Window:/i)).toBeInTheDocument();
    expect(screen.getByText(/Jan 2026 Benchmark/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Export CSV/i })).toBeInTheDocument();

    // 2. View 1 (Default: Hourly Timeline & Evaluations)
    expect(screen.getByRole("button", { name: /1\. Hourly Timeline & Evaluations/i })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText(/Granular Hourly Forecast vs Actual Evaluations/i)).toBeInTheDocument();
    });

    // 3. Switch to View 2 (24-Hour Diurnal Pattern)
    const diurnalTab = screen.getByRole("button", { name: /2\. 24-Hour Diurnal Pattern/i });
    fireEvent.click(diurnalTab);
    expect(screen.getByText(/24-Hour Diurnal Forecast Accuracy Profile/i)).toBeInTheDocument();
    expect(screen.getByText(/Diurnal Fleet Generation Envelope/i)).toBeInTheDocument();

    // 4. Switch to View 3 (Error Distribution & Quantiles)
    const distributionTab = screen.getByRole("button", { name: /3\. Error Distribution & Quantiles/i });
    fireEvent.click(distributionTab);
    expect(screen.getByText(/Median Error \(P50\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Critical Deviation \(> 3,000 MW\)/i)).toBeInTheDocument();

    // 5. Switch to View 4 (Daily Performance Ledger)
    const dailyTab = screen.getByRole("button", { name: /4\. Daily Performance Ledger/i });
    fireEvent.click(dailyTab);
    expect(screen.getByText(/Best MAE \(Lowest Error\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Daily Accuracy Ledger/i)).toBeInTheDocument();
  });

  it("opens settlement lineage modal when clicking Audit button in evaluations table", async () => {
    renderWithProviders();

    await waitFor(() => {
      expect(screen.getByText("9,031.00 MW")).toBeInTheDocument();
    });

    const auditBtn = screen.getByRole("button", { name: /Audit/i });
    fireEvent.click(auditBtn);

    // Modal title should appear
    expect(screen.getByText(/Settlement Lineage & Mathematical Audit/i)).toBeInTheDocument();
    expect(screen.getByText("#15370")).toBeInTheDocument();
  });
});

