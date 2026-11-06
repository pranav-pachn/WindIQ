# WindIQ — January 2026 Data Quality & Extraction Audit Report

**Audit Execution Time (UTC)**: 2026-11-06 05:08:26 UTC

## 1. Raw Dataset Extraction Overview

- **FUELHH Total Raw Records Retrieved**: 1,488
- **WINDFOR Total Raw Records Retrieved**: 18,104
- **Extraction Date Range (Delivery Dates)**: 2026-01-02 to 2026-02-01 (31 days)
- **Extraction Date Range (Decision Dates)**: 2026-01-01 to 2026-01-31 (31 days)

## 2. Actual Generation (FUELHH) Quality Validation

- **Target Settlement Periods per Day**: 48 half-hourly periods
- **Expected Total Settlement Periods (31 days)**: 1488 (1,488 readings)
- **Observed FUELHH Records**: 1488
- **Actual Hourly Completeness**: 100.00% (744/744 hours)
- **Half-Hourly Spacing Integrity**: 100% compliant (no intervals differing from 1,800 seconds)
- **Null Generation Values in FUELHH**: 0
- **Data Anomalies / Incomplete Actual Hours Count**: 0

> [!NOTE]
> Zero actual generation anomalies observed. All 1,488 half-hourly FUELHH periods were present, valid, and successfully aggregated into 744 hourly averages.

## 3. Forecast Generation (WINDFOR) Quality Validation

- **Total Publication Timestamps Observed**: 248
- **Average Publication Cycles per Day**: 8.00 cycles/day
- **Null Generation Values in WINDFOR**: 0
- **Day-Ahead Forecast Coverage (before 09:00 London cutoff)**: 100.00% (744/744 hours)
- **Forecast Selection Anomalies Count**: 0

> [!NOTE]
> Complete forecast coverage achieved. Every delivery hour had at least one valid forecast published strictly before the 09:00 London decision cutoff.
