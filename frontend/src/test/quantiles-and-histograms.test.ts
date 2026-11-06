import { describe, it, expect } from "vitest";
import {
  calculateNearestRankQuantile,
  calculateQuantileMetrics,
  calculateHistogramBins,
} from "@/lib/formatters";
import type { HourlyAccuracyItem } from "@/types/api";

describe("Quantile & Histogram Statistical Calculations", () => {
  it("calculates exact nearest-rank quantiles on known benchmark array", () => {
    // Array of 10 values: 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000
    const sample = [1000, 200, 800, 100, 500, 700, 300, 600, 400, 900];

    // P50: ceil(0.50 * 10) = 5 -> index 4 -> 500
    expect(calculateNearestRankQuantile(sample, 50)).toBe(500);

    // P75: ceil(0.75 * 10) = 8 -> index 7 -> 800
    expect(calculateNearestRankQuantile(sample, 75)).toBe(800);

    // P90: ceil(0.90 * 10) = 9 -> index 8 -> 900
    expect(calculateNearestRankQuantile(sample, 90)).toBe(900);

    // P95: ceil(0.95 * 10) = 10 -> index 9 -> 1000
    expect(calculateNearestRankQuantile(sample, 95)).toBe(1000);
  });

  it("calculates quantile metrics and exceedance rates from HourlyAccuracyItem records", () => {
    const mockItems: HourlyAccuracyItem[] = [
      { absolute_error_mw: 500 } as HourlyAccuracyItem,
      { absolute_error_mw: 1500 } as HourlyAccuracyItem,
      { absolute_error_mw: 2500 } as HourlyAccuracyItem,
      { absolute_error_mw: 3500 } as HourlyAccuracyItem, // > 3000 critical deviation
      { absolute_error_mw: null } as HourlyAccuracyItem, // null excluded from validCount
    ];

    const metrics = calculateQuantileMetrics(mockItems);

    expect(metrics.validCount).toBe(4);
    expect(metrics.minError).toBe(500);
    expect(metrics.maxError).toBe(3500);

    // Nearest rank on [500, 1500, 2500, 3500]:
    // P50: ceil(0.5 * 4) = 2 -> index 1 -> 1500
    expect(metrics.p50).toBe(1500);
    // P75: ceil(0.75 * 4) = 3 -> index 2 -> 2500
    expect(metrics.p75).toBe(2500);
    // P90: ceil(0.9 * 4) = 4 -> index 3 -> 3500
    expect(metrics.p90).toBe(3500);
    // P95: ceil(0.95 * 4) = 4 -> index 3 -> 3500
    expect(metrics.p95).toBe(3500);

    // Exceedance checks (> 1000: 3/4 = 75%, > 2000: 2/4 = 50%, > 3000: 1/4 = 25%)
    expect(metrics.threshold1000Count).toBe(3);
    expect(metrics.threshold1000Pct).toBe(75.0);

    expect(metrics.threshold2000Count).toBe(2);
    expect(metrics.threshold2000Pct).toBe(50.0);

    expect(metrics.threshold3000Count).toBe(1);
    expect(metrics.threshold3000Pct).toBe(25.0);
  });

  it("correctly assigns extreme deviations to underflow and overflow histogram bins", () => {
    const extremeItems: HourlyAccuracyItem[] = [
      { forecast_error_mw: -6500 } as HourlyAccuracyItem, // < -5000: underflow
      { forecast_error_mw: -1200 } as HourlyAccuracyItem, // standard bin [-1500, -1000)
      { forecast_error_mw: 1200 } as HourlyAccuracyItem,  // standard bin [1000, 1500)
      { forecast_error_mw: 7200 } as HourlyAccuracyItem,  // >= 5000: overflow
    ];

    const signedHist = calculateHistogramBins(extremeItems, true);

    expect(signedHist.includedCount).toBe(4);
    expect(signedHist.underflowCount).toBe(1);
    expect(signedHist.overflowCount).toBe(1);

    const underflowBin = signedHist.bins.find((b) => b.isUnderflow);
    const overflowBin = signedHist.bins.find((b) => b.isOverflow);

    expect(underflowBin).toBeDefined();
    expect(underflowBin?.count).toBe(1);

    expect(overflowBin).toBeDefined();
    expect(overflowBin?.count).toBe(1);
  });
});

