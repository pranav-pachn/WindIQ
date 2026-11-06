import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { HourlyEvaluationsTable } from "@/components/accuracy/hourly-evaluations-table";
import type { HourlyAccuracyItem, PaginationMeta } from "@/types/api";

const mockItems: HourlyAccuracyItem[] = [
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
      half_hour_readings: [],
    },
  },
];

const mockPagination: PaginationMeta = {
  page: 1,
  page_size: 50,
  total_items: 744,
  total_pages: 15,
  has_next: true,
  has_previous: false,
};

describe("HourlyEvaluationsTable Component", () => {
  it("renders evaluations table with server-side pagination and values", () => {
    const handleSort = vi.fn();
    const handlePage = vi.fn();
    const handlePageSize = vi.fn();
    const handleInspect = vi.fn();

    render(
      <HourlyEvaluationsTable
        items={mockItems}
        pagination={mockPagination}
        sortBy="delivery_hour_utc"
        order="asc"
        onSortChange={handleSort}
        onPageChange={handlePage}
        onPageSizeChange={handlePageSize}
        onInspectLineage={handleInspect}
      />
    );

    // Checks header & pagination telemetry
    expect(screen.getByText(/Granular Hourly Forecast vs Actual Evaluations/i)).toBeInTheDocument();
    expect(screen.getByText(/Showing/i)).toBeInTheDocument();
    expect(screen.getByText(/Page 1 of 15/i)).toBeInTheDocument();

    // Checks row values
    expect(screen.getByText("9,031.00 MW")).toBeInTheDocument();
    expect(screen.getByText("4,857.50 MW")).toBeInTheDocument();
    expect(screen.getByText("+4,173.50 MW")).toBeInTheDocument();
    expect(screen.getByText("85.92%")).toBeInTheDocument();

    // Click Audit Lineage button
    const auditBtn = screen.getByRole("button", { name: /Audit/i });
    fireEvent.click(auditBtn);
    expect(handleInspect).toHaveBeenCalledTimes(1);
    expect(handleInspect).toHaveBeenCalledWith(mockItems[0]);

    // Click Next Page button
    const nextBtn = screen.getByRole("button", { name: /Next page/i });
    fireEvent.click(nextBtn);
    expect(handlePage).toHaveBeenCalledWith(2);

    // Click Sort header
    const sortHeader = screen.getByText(/Day-Ahead Forecast/i);
    fireEvent.click(sortHeader);
    expect(handleSort).toHaveBeenCalledWith("forecast_generation_mw");
  });
});

