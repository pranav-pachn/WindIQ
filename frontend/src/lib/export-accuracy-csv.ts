/**
 * Complete non-distorting CSV export utility for hourly forecast evaluations.
 * Preserves numeric fields (including negative numbers) while escaping untrusted text strings against formula injection.
 */

import type { HourlyAccuracyItem } from "@/types/api";
import { formatLondonWithDstOffset } from "./formatters";

/**
 * Escapes a cell value for CSV output.
 * Preserves numbers as raw numeric literals.
 * For string values starting with formula triggers (=, +, -, @, \t, \r), prepends a single quote.
 */
export function sanitizeCsvCell(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  // Preserve numbers directly without formula prepending
  if (typeof value === "number") {
    if (isNaN(value)) return "";
    return String(value);
  }

  let str = String(value);

  // Formula injection defense for untrusted text cells:
  // If string begins with =, +, -, @, \t, or \r, prepend a single quote
  const formulaTriggers = ["=", "+", "-", "@", "\t", "\r"];
  if (formulaTriggers.some((t) => str.startsWith(t))) {
    str = `'${str}`;
  }

  // Escape double quotes and enclose in quotes if comma or newline present
  if (str.includes('"') || str.includes(",") || str.includes("\n") || str.includes("\r")) {
    str = `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

export function generateHourlyAccuracyCsv(items: HourlyAccuracyItem[]): string {
  const headers = [
    "delivery_date",
    "delivery_hour_utc",
    "delivery_hour_uk_formatted",
    "hour_of_day_uk",
    "decision_date",
    "decision_cutoff_utc",
    "selected_publish_time_utc",
    "forecast_generation_mw",
    "actual_generation_mw",
    "signed_error_mw",
    "absolute_error_mw",
    "absolute_percentage_error",
    "comparison_status",
    "raw_forecast_id",
    "hourly_actual_id",
    "sp_first_period",
    "sp_first_generation_mw",
    "sp_second_period",
    "sp_second_generation_mw",
  ];

  const rows: string[] = [headers.join(",")];

  for (const item of items) {
    const sp1 = item.traceability?.half_hour_readings?.[0];
    const sp2 = item.traceability?.half_hour_readings?.[1];

    const row = [
      sanitizeCsvCell(item.delivery_date),
      sanitizeCsvCell(item.delivery_hour_utc),
      sanitizeCsvCell(formatLondonWithDstOffset(item.delivery_hour_utc)),
      sanitizeCsvCell(item.hour_of_day),
      sanitizeCsvCell(item.decision_date),
      sanitizeCsvCell(item.decision_cutoff_utc),
      sanitizeCsvCell(item.selected_publish_time_utc),
      sanitizeCsvCell(item.forecast_generation_mw),
      sanitizeCsvCell(item.actual_generation_mw),
      sanitizeCsvCell(item.forecast_error_mw),
      sanitizeCsvCell(item.absolute_error_mw),
      sanitizeCsvCell(item.absolute_percentage_error), // empty string if null, never 0
      sanitizeCsvCell(item.comparison_status),
      sanitizeCsvCell(item.traceability?.selected_forecast_id),
      sanitizeCsvCell(item.traceability?.hourly_actual_id),
      sanitizeCsvCell(sp1?.settlement_period),
      sanitizeCsvCell(sp1?.generation_mw),
      sanitizeCsvCell(sp2?.settlement_period),
      sanitizeCsvCell(sp2?.generation_mw),
    ];

    rows.push(row.join(","));
  }

  return rows.join("\r\n");
}

export function downloadCsvFile(csvContent: string, filename: string): void {
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

