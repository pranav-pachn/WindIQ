# WindIQ — Phase 3.2 Benchmark Integrity Audit and Sign-off Report

## 1. Canonical Evaluation Configuration & Population

### 1.1 Canonical Evaluation Configuration
- **Configuration ID**: `1`
- **Configuration Name**: `National_DayAhead_0900`
- **Timezone**: `Europe/London`
- **Cutoff Rule**: `09:00 Europe/London`
- **Metric Version**: `v1.0`
- **Configuration Version**: `1`
- **Database Table**: `forecast_evaluations` in PostgreSQL (`windiq` database)

### 1.2 Evaluation Population Boundaries
- **Evaluation Window**: January 2026 Historical Benchmark
- **Decision Horizon**: `2026-01-01` to `2026-01-31` (31 decision days)
- **Delivery Date Range**: `2026-01-02` to `2026-02-01` (31 delivery days)
- **UTC Timestamp Interval**: `2026-01-02 00:00:00+00` through `2026-02-01 23:00:00+00`
- **Total Delivery Hours**: Exactly **744** consecutive hours ($31 \text{ days} \times 24 \text{ hours} = 744$).
- **Integrity Validation**:
  - Distinct Delivery Hours: **744** (zero duplicate `delivery_hour_utc` timestamps).
  - Chronological Continuity: Monotonically increasing step of exactly $1.0\text{ hour}$ ($3,600\text{ seconds}$) between all adjacent records.
  - Selected Raw Forecast Records: **744** distinct IDs from `raw_forecast_records` (`WINDFOR` day-ahead publications).
  - Selected Hourly Actual Records: **744** distinct IDs from `hourly_actuals` (each mapped to two half-hourly `raw_actual_records` from `FUELHH`).
  - Null Values: `0` null forecasts, `0` null actuals, `0` null errors.
  - Evaluation Status: **744 VALID** records (`100.0%` completeness). Zero missing or incomplete hours.

---

## 2. Independently Recomputed Metrics

Recomputed independently directly from raw SQL extraction of the 744 canonical evaluation records in PostgreSQL:

| Metric | Formula / Mathematical Definition | Recomputed Value | Denominator / Sample Size ($N$) |
| :--- | :--- | :--- | :--- |
| **Total Hours** | Count of distinct delivery hours in benchmark window | **744** | 744 hours (100% complete) |
| **Valid Comparisons** | Hours where both forecast and actual are non-null and valid | **744** | 744 hours |
| **Mean Absolute Error (MAE)** | $\frac{1}{N} \sum_{i=1}^{N} \vert \hat{y}_i - y_i \vert$ | **2,038.9126 MW** | $N = 744$ |
| **Root Mean Squared Error (RMSE)** | $\sqrt{\frac{1}{N} \sum_{i=1}^{N} (\hat{y}_i - y_i)^2}$ | **2,504.7587 MW** | $N = 744$ |
| **Signed Forecast Bias** | $\frac{1}{N} \sum_{i=1}^{N} (\hat{y}_i - y_i)$ | **+1,747.8871 MW** | $N = 744$ |
| **Mean Absolute Percentage Error (MAPE)** | $\frac{1}{N_{\text{pos}}} \sum_{i: y_i > 0} \frac{\vert \hat{y}_i - y_i \vert}{y_i} \times 100\%$ | **22.0446%** | $N_{\text{pos}} = 744$ ($y_i > 0$ for all hours) |
| **Overforecast Hours** | Count of hours where $(\hat{y}_i - y_i) > 0$ | **632** | $84.95\%$ of evaluated period |
| **Underforecast Hours** | Count of hours where $(\hat{y}_i - y_i) < 0$ | **112** | $15.05\%$ of evaluated period |
| **Zero Error Hours** | Count of hours where $(\hat{y}_i - y_i) = 0$ | **0** | $0.00\%$ |
| **Average Day-Ahead Forecast** | $\frac{1}{N} \sum_{i=1}^{N} \hat{y}_i$ | **13,031.4449 MW** | $N = 744$ |
| **Average Actual Generation** | $\frac{1}{N} \sum_{i=1}^{N} y_i$ | **11,283.5578 MW** | $N = 744$ |

*Policy on zero/negative actuals*: APE is strictly `NULL` when $y_i \le 0$ and excluded from the MAPE denominator. For the January 2026 benchmark, minimum actual wind generation was $1,570.0\text{ MW}$ (recorded on 08 Jan 14:00 UTC), so all 744 hours had positive actuals and zero records required exclusion.

---

## 3. Old vs. New Benchmark Comparison

| Metric / Dimension | Previously Verified Baseline | Phase 3.2 Documented Claim | Audited Database / Live API Value | Resolution Status |
| :--- | :--- | :--- | :--- | :--- |
| **Evaluated Hours** | `744` | `744` | **744** | **MATCH** (100% complete) |
| **Mean Absolute Error (MAE)** | `2,038.9126 MW` | `2,038.91 MW` | **2,038.9126 MW** | **MATCH** |
| **Root Mean Squared Error (RMSE)** | `2,504.7587 MW` | `2,548.86 MW` | **2,504.7587 MW** | **DISCREPANCY RESOLVED** |
| **Mean Signed Bias** | `+1,747.8871 MW` | `+1,419.64 MW` | **+1,747.8871 MW** | **DISCREPANCY RESOLVED** |
| **Mean Absolute Percentage Error (MAPE)** | `22.0446%` | `20.12%` | **22.0446%** | **DISCREPANCY RESOLVED** |
| **Overforecast Count** | `632` | Not stated in report | **632** | **MATCH** |
| **Underforecast Count** | `112` | Not stated in report | **112** | **MATCH** |
| **P50 Absolute Error (Median)** | `1,670.50 MW` | `1,673.00 MW` | **1,670.50 MW** | **DISCREPANCY RESOLVED** |
| **P75 Absolute Error** | `2,803.00 MW` | `2,793.00 MW` | **2,803.00 MW** | **DISCREPANCY RESOLVED** |
| **P90 Absolute Error** | `4,098.50 MW` | `4,394.00 MW` | **4,098.50 MW** | **DISCREPANCY RESOLVED** |
| **P95 Absolute Error** | `5,285.00 MW` | `5,685.00 MW` | **5,285.00 MW** | **DISCREPANCY RESOLVED** |
| **Best MAE Delivery Day** | `19 Jan 2026 (736.1458 MW)` | `20 Jan 2026 (330.67 MW)` | **19 Jan 2026 (736.1458 MW)** | **DISCREPANCY RESOLVED** |
| **Worst MAE Delivery Day** | `28 Jan 2026 (5,374.7917 MW)`| `12 Jan 2026 (4,386.71 MW)`| **28 Jan 2026 (5,374.7917 MW)** | **DISCREPANCY RESOLVED** |
| **Best MAPE Delivery Day** | `20 Jan 2026 (6.5834%)` | Not stated in table | **20 Jan 2026 (6.5834%)** | **MATCH** |
| **Worst MAPE Delivery Day** | `28 Jan 2026 (97.2240%)` | Not stated in table | **28 Jan 2026 (97.2240%)** | **MATCH** |

---

## 4. Root Cause of Every Discrepancy

### Root Cause 1: Documentation Transcription Error in `phase_3_2_forecast_accuracy_explorer.md`
- **Findings**:
  - The live backend FastAPI endpoint (`/api/v1/accuracy/summary?delivery_date_from=2026-01-02&delivery_date_to=2026-02-01`), the live daily endpoint (`/api/v1/accuracy/daily`), the PostgreSQL database, and the frontend React application all compute and return the exact canonical figures (`MAE: 2,038.9126 MW`, `RMSE: 2,504.7587 MW`, `Bias: +1,747.8871 MW`, `MAPE: 22.0446%`).
  - During the creation of `docs/phase_3_2_forecast_accuracy_explorer.md`, the documentation author manually entered synthetic numbers in the summary table (`RMSE: 2,548.86`, `Bias: +1,419.64`, `MAPE: 20.12%`, `Best Day: 20 Jan 330.67 MW`, `Worst Day: 12 Jan 4,386.71 MW`) without taking them from the live API response.
  - **Correction**: `docs/phase_3_2_forecast_accuracy_explorer.md` Section 5 has been updated and synchronized with the verified database and API metrics.

### Root Cause 2: Daily Extremes Banner vs. Table Sorting
- **Findings**:
  - In `frontend/src/components/accuracy/daily-accuracy-ledger.tsx`, the Performance Extremes Banner reads directly from `data.summary` returned by `/api/v1/accuracy/daily`.
  - The API returns:
    - `best_day_mae`: `2026-01-19` with value `736.1458 MW`.
    - `worst_day_mae`: `2026-01-28` with value `5,374.7917 MW`.
    - `best_day_mape`: `2026-01-20` with value `6.5834%`.
    - `worst_day_mape`: `2026-01-28` with value `97.2240%`.
  - Browser inspection of View 4 confirmed that the live UI correctly displays **19 Jan 2026 (736.15 MW)** and **28 Jan 2026 (5,374.79 MW)**. The claim of "20 Jan 330.67 MW" was an errant transcription in the report text.

### Root Cause 3: Nearest-Rank Quantiles Precision
- **Findings**:
  - Nearest-rank percentile definition: $\text{rank} = \lceil p \times N \rceil$ (1-based index).
  - For $N = 744$:
    - P50: $\lceil 0.50 \times 744 \rceil = 372 \implies$ sorted index 371: **1,670.5000 MW**.
    - P75: $\lceil 0.75 \times 744 \rceil = 558 \implies$ sorted index 557: **2,803.0000 MW**.
    - P90: $\lceil 0.90 \times 744 \rceil = 670 \implies$ sorted index 669: **4,098.5000 MW**.
    - P95: $\lceil 0.95 \times 744 \rceil = 707 \implies$ sorted index 706: **5,285.0000 MW**.
  - Browser snapshot of View 3 confirmed that the frontend `calculateQuantileMetrics()` rendered **1,670.50 MW**, **2,803.00 MW**, **4,098.50 MW**, and **5,285.00 MW** on the live UI cards. The reported numbers (1673, 2793, 4394, 5685) were documentation errors.

### Root Cause 4: Falsy Check in Client-Side Continuity Guard on Local Hour 0
- **Findings**:
  - In `frontend/src/lib/api-client.ts`, line 239 checked `if (!queryParams?.hour_of_day ...)`.
  - In JavaScript, `hour_of_day: 0` (filtering for 00:00 UK local time) evaluates to falsy (`!0 === true`).
  - This caused the multi-page series fetcher `getAllHourlyAccuracy({ hour_of_day: 0 })` to run the 1-hour continuity check against daily records spaced 24 hours apart, raising a false `DataInconsistencyError`.
  - **Correction**: Replaced with `const isHourFiltered = queryParams?.hour_of_day !== undefined && queryParams?.hour_of_day !== null`. Added automated regression test in `frontend/src/test/api-client.test.ts`.

---

## 5. Verified Daily Extremes & Quantiles

### 5.1 Nearest-Rank Quantile Table ($N = 744$)
All values computed on absolute error $\vert \hat{y}_i - y_i \vert$:

| Percentile | Formula Rank ($k = \lceil p \times 744 \rceil$) | 0-Based Index | Recomputed Database Value | UI Rendered Value |
| :--- | :--- | :--- | :--- | :--- |
| **Minimum** | 1 | 0 | `4.0000 MW` | `4.00 MW` |
| **P25 (Q1)** | 186 | 185 | `857.0000 MW` | — |
| **P50 (Median)** | 372 | 371 | **1,670.5000 MW** | **1,670.50 MW** |
| **P75 (Q3)** | 558 | 557 | **2,803.0000 MW** | **2,803.00 MW** |
| **P90** | 670 | 669 | **4,098.5000 MW** | **4,098.50 MW** |
| **P95** | 707 | 706 | **5,285.0000 MW** | **5,285.00 MW** |
| **Maximum** | 744 | 743 | `6,870.0000 MW` | `6,870.00 MW` |

### 5.2 Threshold Exceedance Counts
- **Absolute Error > 1,000 MW**: **552 hours** (`74.19%`)
- **Absolute Error > 2,000 MW**: **305 hours** (`40.99%`)
- **Absolute Error > 3,000 MW**: **164 hours** (`22.04%`)
- Sum of eligible observations: exactly **744 hours** (`100.0%`).

### 5.3 Histogram Bin Verification
#### Signed Error Histogram (Forecast − Actual)
- **Bin Width**: $500\text{ MW}$
- **Underflow Bin (`< -5,000 MW`)**: **0 observations** ($0.00\%$)
- **Regular Uniform Bins (20 intervals from -5,000 to +5,000 MW)**: **698 observations**
  - `[-4000 to -3500 MW]`: 1
  - `[-3500 to -3000 MW]`: 1
  - `[-3000 to -2500 MW]`: 3
  - `[-2500 to -2000 MW]`: 6
  - `[-2000 to -1500 MW]`: 11
  - `[-1500 to -1000 MW]`: 22
  - `[-1000 to -500 MW]`: 37
  - `[-500 to 0 MW]`: 31
  - `[0 to +500 MW]`: 47
  - `[+500 to +1000 MW]`: 77
  - `[+1000 to +1500 MW]`: 112
  - `[+1500 to +2000 MW]`: 102
  - `[+2000 to +2500 MW]`: 75
  - `[+2500 to +3000 MW]`: 57
  - `[+3000 to +3500 MW]`: 49
  - `[+3500 to +4000 MW]`: 31
  - `[+4000 to +4500 MW]`: 22
  - `[+4500 to +5000 MW]`: 14
- **Overflow Bin (`≥ +5,000 MW`)**: **46 observations** ($6.18\%$)
- **Total Sum**: $0 + 698 + 46 =$ **744 observations** (100% accounted).

#### Absolute Error Histogram
- **Bin Width**: $500\text{ MW}$
- **Regular Uniform Bins (10 intervals from 0 to 5,000 MW)**: **698 observations**
  - `[0 to 500 MW]`: 78
  - `[500 to 1000 MW]`: 114
  - `[1000 to 1500 MW]`: 134
  - `[1500 to 2000 MW]`: 113
  - `[2000 to 2500 MW]`: 81
  - `[2500 to 3000 MW]`: 60
  - `[3000 to 3500 MW]`: 50
  - `[3500 to 4000 MW]`: 32
  - `[4000 to 4500 MW]`: 22
  - `[4500 to 5000 MW]`: 14
- **Overflow Bin (`≥ 5,000 MW`)**: **46 observations** ($6.18\%$)
- **Total Sum**: $698 + 46 =$ **744 observations** (100% accounted).

### 5.4 Daily Performance Extremes
Derived from complete 31-day evaluation population in `/api/v1/accuracy/daily`:
- **Best MAE Day**: `2026-01-19` — **736.1458 MW** MAE (Forecast: 10,750.62 MW, Actual: 11,480.69 MW, Bias: -730.06 MW).
- **Worst MAE Day**: `2026-01-28` — **5,374.7917 MW** MAE (Forecast: 11,134.58 MW, Actual: 5,759.79 MW, Bias: +5,374.79 MW).
- **Best MAPE Day**: `2026-01-20` — **6.5834%** MAPE (Forecast: 15,263.83 MW, Actual: 14,912.00 MW, MAE: 1,054.62 MW).
- **Worst MAPE Day**: `2026-01-28` — **97.2240%** MAPE (Severe systemic overforecast on low wind generation day).

---

## 6. Lineage Verification (28 January 2026, 12:00 UTC)

Direct database audit of primary and foreign keys:
- **Evaluation Row ID**: `637`
- **Delivery Hour UTC**: `2026-01-28 12:00:00+00:00`
- **Europe/London Local Time**: `28 Jan 2026, 12:00 GMT (+00:00)`
- **Evaluation Configuration ID**: `1` (`National_DayAhead_0900`, Version 1)
- **Decision Cutoff Timestamp**: `2026-01-27 09:00:00+00:00` (Day-Ahead 09:00 UK cutoff)

### Raw Forecast Publication Trace
- **Raw Forecast Record ID**: `15370`
- **Source Dataset**: `WINDFOR`
- **Publish Timestamp UTC**: `2026-01-27 07:30:00+00:00`
- **Decision Lead Time**: `28.5 hours` prior to delivery start
- **Cutoff Eligibility**: Published 1.5 hours before 09:00 UTC cutoff (Valid: $\le \text{09:00 UTC}$)
- **Eligible Publications Available**: 11 publications evaluated prior to cutoff; ID `15370` was the latest publication committed before 09:00 UK.
- **Forecast Generation**: **9,031.0000 MW**

### Settlement Actual Reading Trace
- **Hourly Actual ID**: `637`
- **First Settlement Period**: SP `25` (`12:00 - 12:30 UTC`), ID `1273`, Generation: **4,908.0000 MW**
- **Second Settlement Period**: SP `26` (`12:30 - 13:00 UTC`), ID `1274`, Generation: **4,807.0000 MW**
- **Hourly Actual Derivation**:
  $$\bar{y} = \frac{4,908.0000 + 4,807.0000}{2} = \mathbf{4,857.5000\text{ MW}}$$

### Error Metric Proof
- **Signed Error Delta**:
  $$\text{Signed Error} = \hat{y} - y = 9,031.0000 - 4,857.5000 = \mathbf{+4,173.5000\text{ MW}}\quad (\text{Overforecast})$$
- **Absolute Error**:
  $$\vert +4,173.5000 \vert = \mathbf{4,173.5000\text{ MW}}$$
- **Absolute Percentage Error (APE)**:
  $$\text{APE} = \frac{4,173.5000}{4,857.5000} \times 100\% = \mathbf{85.918683\ldots\%} \implies \mathbf{85.92\%}$$

Both raw records and API serialization match the lineage modal audit display exactly.

---

## 7. Pagination, DST, and CSV Test Results

### 7.1 Automated Backend DST and Timezone Tests (`pytest backend/tests/test_dst_and_timezone.py`)
- `test_hour_of_day_europe_london_filter`: **PASSED** (Verifies that 12:00 UK correctly maps to 12:00 UTC in January GMT and 11:00 UTC in July BST).
- `test_dst_clock_change_transition_representation`: **PASSED** (Verifies monotonic UTC continuity across the 23-hour spring and 25-hour autumn transitions).
- `test_autumn_repeated_local_hour_filter`: **PASSED** (Verifies that PostgreSQL query matches **both** occurrences of 01:00 London on 25 Oct 2026: 00:00 UTC [BST] and 01:00 UTC [GMT]).

### 7.2 Automated Frontend Test Suite (`vitest run`)
- **36 tests passing across 11 test files** (0 failures, 0 regressions):
  - `src/test/api-client.test.ts` (3 tests): Verifies 24h gap allowance for `hour_of_day: 0`, and detects gap/duplicate errors on full series.
  - `src/test/csv-export.test.ts` (5 tests): Formula injection defense, negative number preservation, null APE handling.
  - `src/test/quantiles-and-histograms.test.ts` (3 tests): Nearest-rank quantile algorithm, exceedance rates, underflow/overflow binning.
  - `src/test/lineage-modal.test.tsx` (2 tests): Verifies 28 Jan 12:00 UTC lineage audit and modal accessibility.
  - `src/test/hourly-table.test.tsx` (1 test): Paginated evaluations table rendering.
  - `src/test/accuracy-page.test.tsx` (2 tests): Workstation view switching and audit modal integration.
  - `src/test/formatters.test.ts` (6 tests): Timezone formatting and mathematical formatters.
  - `src/test/kpi-grid.test.tsx` (3 tests): Overview KPI grid accuracy and 4-decimal audit mode.
  - `src/test/period-selector.test.tsx` (3 tests): Benchmark period presets and custom windows.
  - `src/test/app-shell.test.tsx` (5 tests): App shell and navigation structure.
  - `src/test/overview-page.test.tsx` (3 tests): Executive overview page integration.

### 7.3 Typecheck and Oxlint
- `npm run typecheck` (`tsc --noEmit`): **0 errors** across 63 TypeScript files.
- `npx oxlint`: **0 errors, 0 warnings** across 63 files.
- Production Vite Build: **Clean compilation**; code-split chunks verified (`accuracy-page` bundle: 59.67 kB / 11.10 kB gzip).

### 7.4 Python Root Audit & Regression Suite (`pytest tests/`)
- `tests/test_audit_integrity.py`: **10 passed**
- `tests/test_regression.py`: **2 passed**
- `tests/test_validation.py`: **4 passed**
- **16 passed in 12.80s** (0 failures).

---

## 8. Files Changed & Migrations

### Modified Files
1. `backend/tests/test_dst_and_timezone.py`:
   - Added `test_autumn_repeated_local_hour_filter` using `NullPool` to verify PostgreSQL queries against both occurrences of the repeated autumn hour.
2. `frontend/src/lib/api-client.ts`:
   - Fixed falsy evaluation on `hour_of_day = 0` in `getAllHourlyAccuracy` continuity check.
3. `frontend/src/test/api-client.test.ts`:
   - Added unit test suite covering multi-page assembly, `hour_of_day: 0` gap tolerance, and continuity guards.
4. `docs/phase_3_2_forecast_accuracy_explorer.md`:
   - Corrected Section 5 benchmark table to match the verified canonical baseline metrics.
   - Clarified histogram regular and boundary bin counts.

### Migrations
- **Database Schema**: No schema migrations required. Existing PostgreSQL indexes and check constraints remain valid and intact.

---

## 9. Final Sign-off

### Audit Determination: **PASS**

- **Canonical Dataset Integrity**: 744 hours verified with 100% completeness, zero missing timestamps, zero duplicate keys.
- **Metric Mathematical Fidelity**: Database calculations, backend REST endpoints, and frontend React rendering agree to the fourth decimal place.
- **Lineage Transparency**: 28 Jan 12:00 UTC verified through BMRS WINDFOR publication 15370 and FUELHH settlement periods 25/26.
- **Edge Case Protection**: Fixed falsy `hour_of_day: 0` continuity check; verified autumn repeated local hour in PostgreSQL; verified formula injection safety in CSV exports.
- **Quality Gates**: All automated backend and frontend test suites pass with 0 errors.

Phase 3.2 is certified production-ready. Authorization is granted to proceed to **Phase 3.3 — Forecast Explorer & Multi-Horizon Analysis**.

