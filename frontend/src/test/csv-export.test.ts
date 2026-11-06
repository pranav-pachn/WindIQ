import { describe, it, expect } from "vitest";
import { sanitizeCsvCell, generateHourlyAccuracyCsv } from "@/lib/export-accuracy-csv";
import type { HourlyAccuracyItem } from "@/types/api";

describe("CSV Export Sanitization & Formatting", () => {
  it("preserves legitimate negative and positive numbers without altering them", () => {
    expect(sanitizeCsvCell(-4173.5)).toBe("-4173.5");
    expect(sanitizeCsvCell(1747.89)).toBe("1747.89");
    expect(sanitizeCsvCell(0)).toBe("0");
    expect(sanitizeCsvCell(-0.5)).toBe("-0.5");
  });

  it("sanitizes untrusted text strings starting with formula triggers", () => {
    expect(sanitizeCsvCell("=1+1")).toBe("'=1+1");
    expect(sanitizeCsvCell("@SUM(A1:A10)")).toBe("'@SUM(A1:A10)");
    expect(sanitizeCsvCell("+cmd|' /C calc'!A0")).toBe("'+cmd|' /C calc'!A0");
    expect(sanitizeCsvCell("-DANGEROUS")).toBe("'-DANGEROUS");
    expect(sanitizeCsvCell("\tTAB_INJECT")).toBe("'\tTAB_INJECT");
  });

  it("properly escapes text containing commas or double quotes", () => {
    expect(sanitizeCsvCell('Text with "quotes"')).toBe('"Text with ""quotes"""');
    expect(sanitizeCsvCell("London, UK")).toBe('"London, UK"');
  });

  it("handles null and undefined values by returning empty strings", () => {
    expect(sanitizeCsvCell(null)).toBe("");
    expect(sanitizeCsvCell(undefined)).toBe("");
    expect(sanitizeCsvCell(NaN)).toBe("");
  });

  it("generates a full CSV row with constituent settlement readings and null APE as empty", () => {
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
          half_hour_readings: [
            { settlement_period: 25, start_time_utc: "2026-01-28T12:00:00Z", generation_mw: 4908.0 },
            { settlement_period: 26, start_time_utc: "2026-01-28T12:30:00Z", generation_mw: 4807.0 },
          ],
        },
      },
      {
        delivery_date: "2026-01-29",
        delivery_hour_utc: "2026-01-29T00:00:00Z",
        hour_of_day: 0,
        decision_date: "2026-01-28",
        decision_cutoff_utc: "2026-01-28T09:00:00Z",
        selected_publish_time_utc: "2026-01-28T07:30:00Z",
        forecast_generation_mw: 5000.0,
        actual_generation_mw: 0.0, // Zero actual
        forecast_error_mw: 5000.0,
        absolute_error_mw: 5000.0,
        absolute_percentage_error: null, // Null APE
        comparison_status: "VALID",
        traceability: null,
      },
    ];

    const csv = generateHourlyAccuracyCsv(mockItems);
    const lines = csv.split("\r\n");

    // Header check
    expect(lines[0]).toContain("delivery_date,delivery_hour_utc");
    expect(lines[0]).toContain("sp_first_period,sp_first_generation_mw,sp_second_period,sp_second_generation_mw");

    // Row 1 check (verified 28 Jan record)
    expect(lines[1]).toContain("2026-01-28,2026-01-28T12:00:00Z");
    expect(lines[1]).toContain("9031,4857.5,4173.5,4173.5,85.9187,VALID,15370,637,25,4908,26,4807");

    // Row 2 check (zero actual has null APE represented as empty string)
    expect(lines[2]).toContain("2026-01-29,2026-01-29T00:00:00Z");
    expect(lines[2]).toContain("5000,0,5000,5000,,VALID"); // ,, represents empty string for null APE
  });
});

