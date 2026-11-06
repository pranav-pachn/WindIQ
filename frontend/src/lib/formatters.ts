/**
 * Formatting and presentation helpers for WindIQ analytics.
 * Enforces engineering precision, consistent units, and transparent metric definitions.
 */

export function formatNumber(
  value: number | null | undefined,
  decimals = 2,
  fallback = "—"
): string {
  if (value === null || value === undefined || isNaN(value)) {
    return fallback;
  }
  return new Intl.NumberFormat("en-GB", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

export function formatMw(
  value: number | null | undefined,
  decimals = 2,
  includeUnit = true
): string {
  if (value === null || value === undefined || isNaN(value)) {
    return includeUnit ? "— MW" : "—";
  }
  const formatted = formatNumber(value, decimals);
  return includeUnit ? `${formatted} MW` : formatted;
}

export function formatPct(
  value: number | null | undefined,
  decimals = 2,
  includeSymbol = true
): string {
  if (value === null || value === undefined || isNaN(value)) {
    return includeSymbol ? "— %" : "—";
  }
  const formatted = formatNumber(value, decimals);
  return includeSymbol ? `${formatted}%` : formatted;
}

export function formatBias(
  value: number | null | undefined,
  decimals = 2,
  includeUnit = true
): { text: string; direction: "positive" | "negative" | "neutral" } {
  if (value === null || value === undefined || isNaN(value)) {
    return { text: includeUnit ? "— MW" : "—", direction: "neutral" };
  }
  const sign = value > 0 ? "+" : "";
  const formatted = `${sign}${formatNumber(value, decimals)}`;
  const text = includeUnit ? `${formatted} MW` : formatted;

  if (Math.abs(value) < 0.001) {
    return { text, direction: "neutral" };
  }
  return {
    text,
    direction: value > 0 ? "positive" : "negative",
  };
}

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  try {
    const [year, month, day] = dateStr.split("-").map(Number);
    if (!year || !month || !day) return dateStr;
    const date = new Date(Date.UTC(year, month - 1, day));
    return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }).format(date);
  } catch {
    return dateStr;
  }
}

export function formatUtcDateTime(isoString: string | null | undefined): string {
  if (!isoString) return "—";
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return isoString;
    return (
      new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
        timeZone: "UTC",
      }).format(date) + " UTC"
    );
  } catch {
    return isoString;
  }
}

export const formatDateTimeUtc = formatUtcDateTime;
export const formatDateTimeLondon = formatLondonDateTime;

export function formatLondonDateTime(isoString: string | null | undefined): string {
  if (!isoString) return "—";
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return isoString;
    return (
      new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
        timeZone: "Europe/London",
      }).format(date) + " (UK)"
    );
  } catch {
    return isoString;
  }
}

export function formatLondonHour(isoString: string | null | undefined): string {
  if (!isoString) return "—";
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return isoString;
    return new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "Europe/London",
    }).format(date);
  } catch {
    return isoString;
  }
}

/**
 * Formats timestamp in Europe/London local time with explicit timezone code and UTC offset.
 * Example winter: "28 Jan 2026, 12:00 GMT (+00:00)"
 * Example summer: "15 Jul 2026, 13:00 BST (+01:00)"
 */
export function formatLondonWithDstOffset(isoString: string | null | undefined): string {
  if (!isoString) return "—";
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return isoString;

    const formatter = new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "Europe/London",
      timeZoneName: "short",
    });
    const parts = formatter.formatToParts(date);
    const getPart = (type: string) => parts.find((p) => p.type === type)?.value || "";
    const day = getPart("day");
    const month = getPart("month");
    const year = getPart("year");
    const hour = getPart("hour");
    const minute = getPart("minute");
    const tzName = getPart("timeZoneName") || "UK";

    const londonDate = new Date(date.toLocaleString("en-US", { timeZone: "Europe/London" }));
    const utcDate = new Date(date.toLocaleString("en-US", { timeZone: "UTC" }));
    const diffMinutes = Math.round((londonDate.getTime() - utcDate.getTime()) / 60000);
    const sign = diffMinutes >= 0 ? "+" : "-";
    const absDiffHours = Math.floor(Math.abs(diffMinutes) / 60);
    const absDiffMins = Math.abs(diffMinutes) % 60;
    const offsetStr = `(${sign}${String(absDiffHours).padStart(2, "0")}:${String(absDiffMins).padStart(2, "0")})`;

    return `${day} ${month} ${year}, ${hour}:${minute} ${tzName} ${offsetStr}`;
  } catch {
    return isoString;
  }
}

/**
 * Calculates lead time between forecast publication and delivery hour start in hours.
 */
export function formatLeadTimeHours(
  publishIso: string | null | undefined,
  deliveryIso: string | null | undefined
): string {
  if (!publishIso || !deliveryIso) return "—";
  try {
    const p = new Date(publishIso).getTime();
    const d = new Date(deliveryIso).getTime();
    if (isNaN(p) || isNaN(d) || d < p) return "—";
    const hours = (d - p) / (1000 * 60 * 60);
    return `${hours.toFixed(1)} hrs`;
  } catch {
    return "—";
  }
}

/**
 * Calculates percentile using the Nearest-Rank method on sorted non-null values.
 * k = ceil((P / 100) * N) - 1
 */
export function calculateNearestRankQuantile(values: number[], percentile: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const rank = Math.ceil((percentile / 100) * n);
  const index = Math.max(0, Math.min(n - 1, rank - 1));
  return sorted[index];
}

import type { HourlyAccuracyItem, QuantileMetrics, HistogramBin } from "@/types/api";

/**
 * Computes statistical percentiles (P50, P75, P90, P95) and exceedance counts on valid absolute errors.
 */
export function calculateQuantileMetrics(items: HourlyAccuracyItem[]): QuantileMetrics {
  const absErrors = items
    .map((i) => i.absolute_error_mw)
    .filter((v): v is number => v !== null && v !== undefined && !isNaN(v));

  const validCount = absErrors.length;
  if (validCount === 0) {
    return {
      p50: 0,
      p75: 0,
      p90: 0,
      p95: 0,
      validCount: 0,
      maxError: 0,
      minError: 0,
      threshold1000Count: 0,
      threshold1000Pct: 0,
      threshold2000Count: 0,
      threshold2000Pct: 0,
      threshold3000Count: 0,
      threshold3000Pct: 0,
    };
  }

  const p50 = calculateNearestRankQuantile(absErrors, 50);
  const p75 = calculateNearestRankQuantile(absErrors, 75);
  const p90 = calculateNearestRankQuantile(absErrors, 90);
  const p95 = calculateNearestRankQuantile(absErrors, 95);

  const maxError = Math.max(...absErrors);
  const minError = Math.min(...absErrors);

  const t1000 = absErrors.filter((e) => e > 1000).length;
  const t2000 = absErrors.filter((e) => e > 2000).length;
  const t3000 = absErrors.filter((e) => e > 3000).length;

  return {
    p50,
    p75,
    p90,
    p95,
    validCount,
    maxError,
    minError,
    threshold1000Count: t1000,
    threshold1000Pct: (t1000 / validCount) * 100,
    threshold2000Count: t2000,
    threshold2000Pct: (t2000 / validCount) * 100,
    threshold3000Count: t3000,
    threshold3000Pct: (t3000 / validCount) * 100,
  };
}

/**
 * Generates histogram bins with explicit underflow and overflow bins to avoid masking extreme errors.
 */
export function calculateHistogramBins(
  items: HourlyAccuracyItem[],
  isSigned: boolean
): { bins: HistogramBin[]; underflowCount: number; overflowCount: number; includedCount: number } {
  if (isSigned) {
    const values = items
      .map((i) => i.forecast_error_mw)
      .filter((v): v is number => v !== null && v !== undefined && !isNaN(v));

    const total = values.length;
    if (total === 0) {
      return { bins: [], underflowCount: 0, overflowCount: 0, includedCount: 0 };
    }

    // Signed bins: [-5000, -4500), ..., [4500, 5000), underflow < -5000, overflow >= 5000
    const binWidth = 500;
    const minBound = -5000;
    const maxBound = 5000;

    let underflow = 0;
    let overflow = 0;
    const counts: number[] = new Array((maxBound - minBound) / binWidth).fill(0);

    for (const v of values) {
      if (v < minBound) {
        underflow++;
      } else if (v >= maxBound) {
        overflow++;
      } else {
        const binIdx = Math.floor((v - minBound) / binWidth);
        counts[binIdx]++;
      }
    }

    const bins: HistogramBin[] = [];

    // Underflow bin
    bins.push({
      binLabel: `< -5,000 MW`,
      min: -Infinity,
      max: minBound,
      count: underflow,
      percentage: total > 0 ? (underflow / total) * 100 : 0,
      isUnderflow: true,
    });

    // Standard bins
    for (let i = 0; i < counts.length; i++) {
      const bMin = minBound + i * binWidth;
      const bMax = bMin + binWidth;
      const cnt = counts[i];
      bins.push({
        binLabel: `${bMin >= 0 ? "+" : ""}${bMin} to ${bMax >= 0 ? "+" : ""}${bMax} MW`,
        min: bMin,
        max: bMax,
        count: cnt,
        percentage: total > 0 ? (cnt / total) * 100 : 0,
      });
    }

    // Overflow bin
    bins.push({
      binLabel: `≥ +5,000 MW`,
      min: maxBound,
      max: Infinity,
      count: overflow,
      percentage: total > 0 ? (overflow / total) * 100 : 0,
      isOverflow: true,
    });

    return {
      bins,
      underflowCount: underflow,
      overflowCount: overflow,
      includedCount: total,
    };
  } else {
    // Absolute error bins: [0, 500), ..., [4500, 5000), overflow >= 5000
    const values = items
      .map((i) => i.absolute_error_mw)
      .filter((v): v is number => v !== null && v !== undefined && !isNaN(v));

    const total = values.length;
    if (total === 0) {
      return { bins: [], underflowCount: 0, overflowCount: 0, includedCount: 0 };
    }

    const binWidth = 500;
    const maxBound = 5000;
    const binCount = maxBound / binWidth;

    let overflow = 0;
    const counts: number[] = new Array(binCount).fill(0);

    for (const v of values) {
      if (v >= maxBound) {
        overflow++;
      } else {
        const binIdx = Math.floor(v / binWidth);
        counts[binIdx]++;
      }
    }

    const bins: HistogramBin[] = [];
    for (let i = 0; i < counts.length; i++) {
      const bMin = i * binWidth;
      const bMax = bMin + binWidth;
      const cnt = counts[i];
      bins.push({
        binLabel: `${bMin}–${bMax} MW`,
        min: bMin,
        max: bMax,
        count: cnt,
        percentage: total > 0 ? (cnt / total) * 100 : 0,
      });
    }

    bins.push({
      binLabel: `≥ 5,000 MW`,
      min: maxBound,
      max: Infinity,
      count: overflow,
      percentage: total > 0 ? (overflow / total) * 100 : 0,
      isOverflow: true,
    });

    return {
      bins,
      underflowCount: 0,
      overflowCount: overflow,
      includedCount: total,
    };
  }
}


/**
 * Explanations and documentation for energy forecast KPIs.
 */
export const METRIC_DESCRIPTIONS = {
  mae: {
    title: "Mean Absolute Error (MAE)",
    unit: "MW",
    description:
      "Average absolute magnitude of forecast error across all evaluated hours: mean(|Forecast − Actual|). Treats all error magnitudes linearly without extra penalty for large misses.",
  },
  rmse: {
    title: "Root Mean Square Error (RMSE)",
    unit: "MW",
    description:
      "Square root of the mean squared error: sqrt(mean((Forecast − Actual)²)). Penalizes large forecast misses more heavily than small ones.",
  },
  mape: {
    title: "Mean Absolute Percentage Error (MAPE)",
    unit: "%",
    description:
      "Average percentage deviation relative to actual generation: mean(|Forecast − Actual| / Actual) × 100%. Computed only for hours with actual generation > 0 MW.",
  },
  bias: {
    title: "Forecast Bias (Mean Signed Error)",
    unit: "MW",
    description:
      "Mean signed deviation: mean(Forecast − Actual). Positive bias (+MW) indicates the forecast systematically overpredicted generation. Negative bias (−MW) indicates underprediction.",
  },
  overforecast: {
    title: "Overforecast Hours",
    unit: "hours",
    description:
      "Total evaluated hours where day-ahead forecast generation exceeded measured actual generation (Forecast > Actual).",
  },
  underforecast: {
    title: "Underforecast Hours",
    unit: "hours",
    description:
      "Total evaluated hours where measured actual generation exceeded day-ahead forecast generation (Forecast < Actual).",
  },
  coverage: {
    title: "Forecast Coverage",
    unit: "%",
    description:
      "Percentage of delivery hours with an eligible day-ahead WINDFOR publication strictly locked in before the 09:00 Europe/London cutoff.",
  },
  completeness: {
    title: "Actual Completeness",
    unit: "%",
    description:
      "Percentage of delivery hours with two complete, consecutive half-hourly FUELHH settlement readings (HH:00 and HH:30).",
  },
  comparisons: {
    title: "Valid Comparisons",
    unit: "hours",
    description:
      "Number of delivery hours with both valid locked forecast and complete actual generation aggregate evaluated in the benchmark period.",
  },
};

