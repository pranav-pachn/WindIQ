import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { AuditLineageModal } from "@/components/accuracy/audit-lineage-modal";
import type { HourlyAccuracyItem } from "@/types/api";

const verifiedItem28Jan: HourlyAccuracyItem = {
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
      {
        settlement_period: 25,
        start_time_utc: "2026-01-28T12:00:00Z",
        generation_mw: 4908.0,
      },
      {
        settlement_period: 26,
        start_time_utc: "2026-01-28T12:30:00Z",
        generation_mw: 4807.0,
      },
    ],
  },
};

describe("AuditLineageModal Component", () => {
  it("renders verified 28 January 12:00 UTC audit lineage and mathematical proof", () => {
    const handleClose = vi.fn();
    render(<AuditLineageModal item={verifiedItem28Jan} onClose={handleClose} />);

    // Title and Delivery Time
    expect(screen.getByText(/Settlement Lineage & Mathematical Audit/i)).toBeInTheDocument();
    expect(screen.getByText(/28 Jan 2026, 12:00 GMT/i)).toBeInTheDocument();

    // Section 1: Raw forecast ID & Cutoff eligibility
    expect(screen.getByText("#15370")).toBeInTheDocument();
    expect(screen.getByText(/Eligible \(Pre-09:00 Cutoff\)/i)).toBeInTheDocument();
    expect(screen.getByText("28.5 hrs")).toBeInTheDocument();

    // Section 2: Constituent settlement readings
    expect(screen.getByText(/Settlement Period 25/i)).toBeInTheDocument();
    expect(screen.getAllByText(/4,908/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Settlement Period 26/i)).toBeInTheDocument();
    expect(screen.getAllByText(/4,807/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Actual ID: #637/i)).toBeInTheDocument();

    // Section 3: Arithmetic Mean Proof
    expect(screen.getByText(/Actual Generation Mean Formula:/i)).toBeInTheDocument();
    expect(screen.getByText(/4,857.50 MW/i)).toBeInTheDocument();

    // Section 4: Signed Error & APE
    expect(screen.getByText(/Signed Forecast Error/i)).toBeInTheDocument();
    expect(screen.getByText(/\+4,173.50 MW/i)).toBeInTheDocument();
    expect(screen.getByText(/85.9187%/i)).toBeInTheDocument();
  });

  it("closes modal on Escape key press or close button click", () => {
    const handleClose = vi.fn();
    render(<AuditLineageModal item={verifiedItem28Jan} onClose={handleClose} />);

    // Click Close
    const closeBtn = screen.getByRole("button", { name: /Close audit lineage modal/i });
    fireEvent.click(closeBtn);
    expect(handleClose).toHaveBeenCalledTimes(1);

    // Press Escape
    fireEvent.keyDown(window, { key: "Escape" });
    expect(handleClose).toHaveBeenCalledTimes(2);
  });
});
