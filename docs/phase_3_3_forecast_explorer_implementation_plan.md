# WindIQ Phase 3.3 — Forecast Explorer & Multi-Horizon Analysis
## Engineering Discovery, API Audit & Implementation Plan

## 1. Executive Summary

Phase 3.3 elevates WindIQ from forecast accuracy evaluation into a comprehensive **Forecast Publication Intelligence & Multi-Horizon Analysis Platform**. Energy trading desks, balancing dispatchers, and wind operational analysts require deep visibility into how National Grid ESO / Elexon BMRS `WINDFOR` forecasts evolve over time, how model revisions behave across publication cadences, and how forecast accuracy converges as delivery gate closure approaches.

This document establishes the verified empirical characteristics of the WINDFOR forecast dataset stored in PostgreSQL, audits existing backend API contracts, and provides an implementation-ready architectural blueprint for Phase 3.3 without modifying verified Phase 3.1 and Phase 3.2 functionality or disturbing the canonical 744-hour January 2026 benchmark.

---

## 2. Current Architecture Findings

### 2.1 Technology Stack & Alignment
- **Frontend**: React 19, TypeScript 5.8, Vite 8.3, Tailwind CSS, Recharts 2.x, Lucide React, React Router 7.
- **Server State Management**: TanStack Query (React Query) v5 with query-key scoping, caching, and request abort signals.
- **Backend**: Python 3.12+, FastAPI, Pydantic v2 schemas, SQLAlchemy 2.0 async engine with `asyncpg`.
- **Database**: PostgreSQL 16 Alpine running in Docker container `windiq-db` (port 5435).
- **Application Routing**: `/` (Executive Overview), `/accuracy` (Forecast Accuracy Explorer), `/forecasts` (currently mapped to [`PlaceholderPage`](file:///c:/Users/prana/Projects/WindIQ/frontend/src/pages/placeholder-page.tsx)).

### 2.2 Preservation of Established Baselines
- The canonical January 2026 evaluation dataset comprises exactly **744 evaluated hours** ($31\text{ days} \times 24\text{ hours}$ from `2026-01-02 00:00:00+00` to `2026-02-01 23:00:00+00`).
- Established benchmark KPIs (MAE: `2,038.9126 MW`, RMSE: `2,504.7587 MW`, MAPE: `22.0446%`, Bias: `+1,747.8871 MW`) remain immutable.
- Phase 3.3 operates on raw forecast publications (`raw_forecast_records`) and compares them with actual generation (`hourly_actuals`), referencing but never mutating `forecast_evaluations`.

---

## 3. Existing API Contract Audit

### 3.1 Live OpenAPI Audit Matrix
Inspected directly against the running FastAPI backend container (`http://localhost:8001/api/v1`):

| Capability | Existing Endpoint | Available Request Parameters | Available Response Fields | Limitations / Gaps Identified | Recommended Phase 3.3 Action |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Forecast List & Lineage** | `GET /api/v1/forecasts` | `delivery_date_from`, `delivery_date_to`, `delivery_hour`, `selected_only`, `sort_by`, `order`, `page`, `page_size` | `items[].id`, `delivery_hour_utc`, `decision_date`, `decision_cutoff_utc`, `selected_publish_time_utc`, `forecast_generation_mw`, `actual_generation_mw`, `all_publications[]` (`publish_time_utc`, `forecast_mw`, `is_eligible`) | 1. `PublicationVersion` lacks `id` (raw record ID), `lead_time_hours`, `revision_mw`, and `is_selected`.<br>2. When `selected_only=false`, an N+1 query loop runs per row in `AnalyticsService.get_forecasts`.<br>3. Cannot query a single delivery hour without complex range params. | Extend `PublicationVersion` schema with `id`, `lead_time_hours`, `revision_mw`, and `is_selected`. Optimize query to batch-fetch publications in a single `WHERE delivery_hour_utc IN (...)` query. |
| **Single Hour Publication Cycle** | None | N/A | N/A | No dedicated low-latency endpoint to fetch all ~24 publication versions and constituent settlement pairs for a specific delivery timestamp. | Add `GET /api/v1/forecasts/publications/{delivery_hour_utc}` returning detailed publication progression, cutoff indicator, and matched settlement actuals. |
| **Multi-Horizon Aggregates** | None | N/A | N/A | Existing `/accuracy/summary` and `/accuracy/hourly` evaluate only the *selected day-ahead* forecast at 09:00 UK cutoff, not multi-horizon lead-time buckets. | Add `GET /api/v1/forecasts/horizons` computing MAE, RMSE, Bias, and revision volatility grouped by standardized lead-time buckets (0-6h, 6-12h, 12-24h, 24-36h, 36-48h, 48-72h) with matched vs. unmatched population flags. |
| **Consecutive Revision Analytics** | None | N/A | N/A | No endpoint calculates delta trajectory ($\hat{y}_t - \hat{y}_{t-1}$) between consecutive publication cycles, revision distributions, or extreme volatility events. | Add `GET /api/v1/forecasts/revisions` returning revision magnitude distributions, upward/downward revision counts, and top extreme revision events. |
| **Horizon vs Actual Convergence** | None | N/A | N/A | No endpoint compares early D-2/D-3 forecasts, winning D-1 forecasts, and final gate closure intraday forecasts against actual settlement readings. | Add `GET /api/v1/forecasts/horizon-accuracy` computing accuracy metrics across lead times for both all-available and strictly matched delivery hours. |

---

## 4. WINDFOR Publication Data Characteristics

Direct SQL inspection of PostgreSQL table `raw_forecast_records` revealed the following verified data properties:

### 4.1 Volume & Temporal Range
- **Total Raw Forecast Records in Database**: `20,075` rows.
- **January 2026 Benchmark Scope (`2026-01-02` to `2026-02-01`)**: Exactly `17,688` rows across `744` distinct delivery hours.
- **Publication Cycles**: `275` distinct publication timestamps spanning `2026-01-01 02:30 UTC` to `2026-11-05 07:30 UTC`.
- **Daily Publication Cadence**: Exactly **8 publication cycles per calendar day** occurring at:
  - `02:30 UTC`, `04:30 UTC`, `07:30 UTC`, `09:30 UTC`, `11:30 UTC`, `15:30 UTC`, `18:30 UTC`, `22:30 UTC`.

### 4.2 Publication Versions per Delivery Hour
- **Minimum Versions**: `8` publications.
- **Maximum Versions**: `32` publications.
- **Mean Versions per Delivery Hour**: **23.77** publications.
- **Median Versions per Delivery Hour**: **24.0** publications.
- *Analytical Implication*: Each hourly delivery period is forecasted approximately 24 separate times over a 3-day rolling window as new weather model runs arrive.

### 4.3 Lead Time Boundaries & Post-Delivery Publications
- **Lead Time Range in DB**: `-25.5 hours` to `+66.5 hours` (Average: `+21.57 hours`).
- **Post-Delivery Forecasts (`publish_time_utc > delivery_hour_utc`)**: **4,106 records** in DB (3,577 in Jan 2026).
  - *Root Cause*: Elexon BMRS WINDFOR reports rolling multi-day arrays. When a publication is released at 15:30 UTC, its array payload still contains earlier delivery hours from the same calendar day.
  - *Engineering Rule*: **All forward-looking forecast and revision analytics must filter `lead_time_hours > 0`**. Post-delivery records must never be included in forward forecast accuracy calculations.

### 4.4 Empirical Horizon Distribution & Strict Boundary Definitions (January 2026)

All horizon analytics operate under strictly non-overlapping boundaries. The first five buckets use half-open intervals $[t_{\text{start}}, t_{\text{end}})$, while the final bucket `Medium-Range (48–72h)` is explicitly closed at both ends $[48.0, 72.0]$. Forecast observations with $t_{\text{lead}} \le 0.0\text{h}$ are strictly excluded as ex-post telemetry, and $t_{\text{lead}} > 72.0\text{h}$ are excluded as outside the operational analysis scope:

| Horizon Bucket | Strict Lead Time Range ($t_{\text{lead}}$) | Target Lead Time ($t_{\text{target}}$) | Total Publications ($N_{\text{pub}}$) | Unique Delivery Hours ($N_{\text{hour}}$) | Hour Coverage (%) | Average Actual Lead Time |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Very Short (0–6h)** | $0.0\text{h} < t_{\text{lead}} < 6.0\text{h}$ | $3.0\text{h}$ | 1,446 | 725 | 97.45% | 2.88h |
| **Short (6–12h)** | $6.0\text{h} \le t_{\text{lead}} < 12.0\text{h}$ | $9.0\text{h}$ | 1,456 | 731 | 98.25% | 8.88h |
| **Same-Day (12–24h)** | $12.0\text{h} \le t_{\text{lead}} < 24.0\text{h}$ | $18.0\text{h}$ | 2,954 | 743 | 99.87% | 17.89h |
| **Day-Ahead (24–36h)** | $24.0\text{h} \le t_{\text{lead}} < 36.0\text{h}$ | $30.0\text{h}$ | 2,954 | 741 | 99.60% | 29.85h |
| **D-2 Early (36–48h)** | $36.0\text{h} \le t_{\text{lead}} < 48.0\text{h}$ | $42.0\text{h}$ | 2,872 | 729 | 97.98% | 41.85h |
| **Medium-Range (48–72h)**| $48.0\text{h} \le t_{\text{lead}} \le 72.0\text{h}$ | $60.0\text{h}$ | 2,429 | 570 | 76.61% | 56.13h | (Closed: $[48.0, 72.0]$)
| **Post-Delivery (Excluded)**| $t_{\text{lead}} \le 0.0\text{h}$ | N/A | 3,577 | 744 | 100.00% | -8.92h |
| **Out-of-Scope (Excluded)**| $t_{\text{lead}} > 72.0\text{h}$ | N/A | 0 | 0 | 0.00% | N/A |

---

## 5. Forecast Lead-Time & Revision Semantics

### 5.1 Strict Lead-Time Definition
$$\mathbf{t_{\text{lead\_hours}}} = \frac{\mathbf{t_{\text{delivery\_hour\_start\_utc}}} - \mathbf{t_{\text{publish\_time\_utc}}}}{3600\text{ seconds}}$$

- **Example 1**: Delivery `2026-01-28 12:00 UTC`, Published `2026-01-27 07:30 UTC`:
  $$t_{\text{lead}} = 28.5\text{ hours}\quad (\text{Day-Ahead Cutoff Winner})$$
- **Example 2**: Delivery `2026-01-28 12:00 UTC`, Published `2026-01-28 11:30 UTC`:
  $$t_{\text{lead}} = 0.5\text{ hours}\quad (\text{Final Intraday Gate Closure Run})$$
- **Example 3**: Delivery `2026-01-28 12:00 UTC`, Published `2026-01-28 15:30 UTC`:
  $$t_{\text{lead}} = -3.5\text{ hours}\quad (\text{Ex-Post Historical Inclusion, excluded from forward metrics})$$

### 5.2 Four Distinct Temporal Concepts
1. **Publication Time (`publish_time_utc`)**: The exact timestamp when National Grid ESO / Elexon published the forecast file.
2. **Decision Cutoff (`decision_cutoff_utc`)**: The market gate closure for day-ahead auction bidding (`09:00 Europe/London` on D-1).
3. **Delivery Hour (`delivery_hour_utc`)**: The operating hour when electrical energy is generated and delivered to the GB grid.
4. **Lead Time (`lead_time_hours`)**: The forward-looking prediction horizon.

### 5.3 Forward-Only Revision Analysis vs. Historical Discovery Discrepancy

A critical discovery audit revealed that the initial exploratory revision metric ($16,944$ revisions, mean absolute revision $281.44\text{ MW}$) improperly concatenated post-delivery records ($t_{\text{lead}} \le 0$).

#### Root Cause of the 16,944 vs. 13,367 Discrepancy
- In January 2026, there are **17,688 total forecast records** across **744 delivery hours**.
- There are **3,577 post-delivery records** ($t_{\text{lead}} \le 0.0\text{h}$).
- Filtering strictly to forward-looking forecasts ($t_{\text{lead}} > 0$) leaves **14,111 valid forward forecast records**.
- Calculating consecutive revisions strictly within forward publications produces exactly:
  $$N_{\text{forward\_revisions}} = 14,111 - 744 = 13,367\text{ consecutive transitions}$$
- The 3,577 post-delivery records contained **2,925 identical, flatlined generation values** (81.8% unchanged). Because BMRS WINDFOR keeps republishing the same static value after delivery has already passed, including these ex-post records artificially depressed the mean absolute revision from **343.96 MW down to 281.44 MW**, while artificially bloating unchanged revisions from **727 up to 3,652**.

#### Verified Empirical Forward-Only Revision Metrics ($t_{\text{lead}} > 0$)
- **Forward-Looking Observations**: $14,111$
- **Total Forward Consecutive Revisions**: **13,367**
- **Mean Absolute Revision**: **343.96 MW** (vs. 281.44 MW previously reported)
- **Mean Signed Revision**: **-6.77 MW** (vs. -4.88 MW previously reported)
- **Upward Revisions ($\Delta \hat{y} > 0$)**: **6,206** (46.43%, vs. 6,558 previously reported)
- **Downward Revisions ($\Delta \hat{y} < 0$)**: **6,434** (48.13%, vs. 6,734 previously reported)
- **Unchanged Revisions ($\Delta \hat{y} = 0$)**: **727** (5.44%, vs. 3,652 previously reported)

#### Publication Cadence & Gap Semantics
The National Grid ESO / Elexon BMRS `WINDFOR` feed does **not** adhere to a universal 3-hour cycle. The scheduled 8 daily publication cycles occur at non-uniform intervals:
- `02:30 UTC` $\to$ `04:30 UTC` ($\Delta t = 2.0\text{h}$)
- `04:30 UTC` $\to$ `07:30 UTC` ($\Delta t = 3.0\text{h}$)
- `07:30 UTC` $\to$ `09:30 UTC` ($\Delta t = 2.0\text{h}$)
- `09:30 UTC` $\to$ `11:30 UTC` ($\Delta t = 2.0\text{h}$)
- `11:30 UTC` $\to$ `15:30 UTC` ($\Delta t = 4.0\text{h}$)
- `15:30 UTC` $\to$ `18:30 UTC` ($\Delta t = 3.0\text{h}$)
- `18:30 UTC` $\to$ `22:30 UTC` ($\Delta t = 4.0\text{h}$)
- `22:30 UTC` $\to$ `02:30 UTC` ($\Delta t = 4.0\text{h}$)

Accordingly, the system strictly separates three distinct operational concepts:
1. **Observed Inter-Publication Gap**: The measured time delta $\Delta t = t_{\text{publish}, k} - t_{\text{publish}, k-1}$. In January 2026, transitions fall into scheduled intervals of $2.0\text{h}$ (5,504 transitions), $3.0\text{h}$ (3,438 transitions), $4.0\text{h}$ (4,314 transitions), and minor publication jitter of 2.92h–3.08h (111 transitions). The observed maximum forward gap across all 13,367 transitions is **exactly 4.00 hours**.
2. **Long-Gap Warning Threshold**: A configurable operational latency threshold set to $\Delta t > 6.0\text{h}$. This serves as an anomaly safeguard; any transition spanning $\Delta t > 6.0\text{h}$ is flagged with `is_discontinuous = true` and excluded from rolling revision volatility metrics to prevent attributing multi-period hiatuses to a single model update.
3. **Missing Expected Publication Cycle**: A true missing cycle is determined **only** by auditing against the explicitly validated 8-cycle schedule above. A gap of $4.0\text{h}$ is standard operational cadence, not a missing run. No expected publication cycles were missed across January 2026.

### 5.4 Forward-Only Revision Population Coverage Proof

The algebraic relation $N_{\text{transitions}} = N_{\text{publications}} - N_{\text{delivery\_hours}}$ is mathematically valid if and only if every delivery hour in scope has at least one forward-looking publication.

Direct PostgreSQL verification against all 744 January 2026 delivery hours confirms:
* **Total Delivery Hours in Scope**: Exactly **744 hours**.
* **Delivery Hours with Zero Forward Publications**: **0 hours** ($0.00\%$).
* **Delivery Hours with Exactly One Forward Publication**: **0 hours** ($0.00\%$).
* **Delivery Hours with Multiple Forward Publications**: **744 hours** ($100.00\%$).
* **Minimum Forward Publications per Delivery Hour**: **8 publications** (occurring during initial warmup hours).
* **Maximum Forward Publications per Delivery Hour**: **23 publications**.
* **Average Forward Publications per Delivery Hour**: **18.9664 publications**.
* **Total Forward Publications ($N_{\text{fwd}}$)**: **14,111 records**.
* **Total Consecutive Forward Transitions**:
  $$\sum_{h=1}^{744} (N_{\text{fwd}, h} - 1) = \left( \sum_{h=1}^{744} N_{\text{fwd}, h} \right) - 744 = 14,111 - 744 = \mathbf{13,367}$$

Because every single delivery hour contains at least 8 forward observations, each delivery hour contributes at least 7 consecutive transitions, proving complete population coverage with zero unrepresented hours.

### 5.5 Strict Conceptual Demarcation & Uncertainty Terminology

To prevent conflation between grid telemetry, forecast revisions, and statistical dispersion, five distinct physical and mathematical terms are defined and strictly adhered to across all UI copy, tooltips, API schemas, and documentation:

1. **Forecast Revision ($\Delta \hat{y} = \hat{y}_{h, k} - \hat{y}_{h, k-1}$)**:
   The difference between two successive weather model predictions issued at publication times $t_{k-1}$ and $t_k$ for the **same target delivery hour $h$**. Revisions represent updates in model expectations, **never** physical wind ramps.
2. **Forecast Error ($e = \hat{y}_{h, k} - y_h$)**:
   The algebraic deviation between predicted generation $\hat{y}_{h, k}$ and the actual outturn metered settlement generation $y_h$.
3. **Horizon-Dependent Error Dispersion**:
   The variation, spread, or convergence curve of forecast errors across standardized lead-time buckets (e.g., MAE dropping from 2,446.61 MW at 48–72h to 1,610.90 MW at 0–6h).
4. **Forecast Trajectory Variation**:
   The chronological variation or step-change in forecast generation values for a single delivery hour across rolling publication cycles leading up to gate closure.
5. **Physical Wind Generation Ramp ($\Delta y = y_h - y_{h-1}$)**:
   The physical change in metered electrical generation delivered to the GB transmission network between successive delivery hours.
6. **Forecast Uncertainty (Restricted Usage)**:
   The term "Forecast Uncertainty" is strictly restricted to calibrated probabilistic or ensemble confidence bounds (e.g., P10/P90 prediction intervals). Ordinary horizon-dependent error dispersion or revision step magnitudes must **never** be labeled as "calibrated forecast uncertainty".

---

## 6. Proposed Phase 3.3 Functional Scope & Views

The Forecast Explorer is designed as a high-density, 4-view operational analytics workstation.

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ WindIQ Forecast Explorer Header & Context Filter Bar                                                   │
│ [Evaluation Window: Jan 2026] [Delivery Day: 28 Jan 2026] [Hour: 12:00 UK] [Horizon Filter: All/0-48h]│
├────────────────────────────────┬───────────────────────────┬──────────────────────┬────────────────────┤
│ 1. Publication Evolution View  │ 2. Multi-Horizon Analysis │ 3. Revision Trajectory│ 4. Horizon Accuracy│
└────────────────────────────────┴───────────────────────────┴──────────────────────┴────────────────────┘
```

### View 1 — Forecast Publication Explorer (Single Delivery Hour Deep-Dive)
- **Visual Revision Trajectory**: Recharts step-after-step line chart mapping all ~24 forecast publications across lead time ($57.5\text{h} \to 0.5\text{h}$) against publication timestamp.
- **Key Milestones Displayed on Chart**:
  - Vertical Reference Line at **09:00 Europe/London D-1 Decision Cutoff**.
  - Distinct highlighted diamond marker for the **Winning Day-Ahead Publication** (`9,031 MW`).
  - Horizontal Dashed Line for **Actual Settlement Generation** (`4,857.5 MW`).
- **Publication History Table**:
  - Columns: Publication Timestamp (UTC + London), Lead Time (hours), Forecast Generation (MW), Step Revision ($\Delta\text{MW}$), Cutoff Eligibility Status (`ELIGIBLE` / `POST_CUTOFF`), Day-Ahead Selection Badge, Raw BMRS Record ID.
- **Traceability Card**: One-click deep link to inspect raw BMRS JSON payload and constituent FUELHH readings.

### View 2 — Multi-Horizon Forecast Analysis (Aggregate Horizons)
- **Horizon Error Convergence Curves**: Dual-axis line/bar chart displaying MAE, RMSE, Bias, and MAPE across 6 strictly non-overlapping lead-time buckets:
  - `Very Short (0-6h)`, `Short (6-12h)`, `Same-Day (12-24h)`, `Day-Ahead (24-36h)`, `D-2 Early (36-48h)`, `Medium-Range (48-72h)`.
- **Three Methodological Modes Supported**:
  1. **Matched Population (`mode=matched`, Recommended Default)**:
     - Exactly 1 forecast observation per delivery hour per bucket, selecting the publication minimizing $\vert t_{\text{lead}} - t_{\text{target}} \vert$ (tie-breaker: latest `publish_time_utc`).
     - Restricted strictly to the common subset of delivery hours present across all 6 horizon buckets ($N = 553$ common hours, 74.33% coverage).
     - **Proven Monotonic Convergence Ground Truth**:
       - Medium-Range (48-72h): MAE **2,446.61 MW**, RMSE **3,161.74 MW**, MAPE **27.35%**
       - D-2 Early (36-48h): MAE **2,221.54 MW**, RMSE **2,738.99 MW**, MAPE **24.84%**
       - Day-Ahead (24-36h): MAE **2,051.62 MW**, RMSE **2,512.18 MW**, MAPE **22.74%**
       - Same-Day (12-24h): MAE **1,820.83 MW**, RMSE **2,271.70 MW**, MAPE **18.15%**
       - Short (6-12h): MAE **1,720.40 MW**, RMSE **2,162.71 MW**, MAPE **16.98%**
       - Very Short (0-6h): MAE **1,610.90 MW**, RMSE **2,058.45 MW**, MAPE **15.42%**
       - Total Error Reduction: **835.70 MW** (**34.16%** improvement, strictly monotonic across all 6 buckets).
  2. **Publication-Level Analysis (`mode=publication_weighted`)**:
     - Evaluates all 14,111 eligible forward-looking publications ($N = 1,446 \text{ to } 2,954$ observations per bucket).
     - Reports total publication count ($N_{\text{pub}}$) and unique delivery-hour count ($N_{\text{hour}}$) separately to make sample density transparent.
  3. **Unmatched Representative (`mode=unmatched_representative`)**:
     - Evaluates 1 representative observation per delivery hour per bucket based on available hours in each individual bucket ($N = 570 \text{ to } 743$ hours).
- **Clear UI Separation**: The UI provides a segmented control toggling between *Matched Delivery Hours (553 Common Hours)* and *Publication-Weighted (All Observations)*, explicitly badge-labeling the active population to eliminate statistical confusion.

### View 3 — Forecast Revision Analysis (Stability & Volatility)
- **Consecutive Revision Distribution**: Signed histogram showing frequency of forward-only upward vs downward revisions (Jan 2026 baseline: **13,367 forward revisions**; **6,206 upward [46.43%]**, **6,434 downward [48.13%]**, **727 unchanged [5.44%]**; Mean Abs Revision: **343.96 MW**, Mean Signed Revision: **-6.77 MW**).
- **Publication Cadence & Integrity Metrics**: Displays confirmation that 100% of forward revisions adhered to the standard $\le 4\text{h}$ publication cycle with zero missing cycles ($> 6\text{h}$).
- **24-Hour Diurnal Revision Heatmap**: Grid mapping delivery hour (00:00 to 23:00 UK) against lead-time bucket to identify which operating hours experience the largest weather model revisions.
- **Top Extreme Revisions Leaderboard**: Identifies the 10 largest forecast swings (e.g. 20 Jan 17:00 delivery hour jumping $+4,456.0\text{ MW}$ in a single 3-hour cycle).

### View 4 — Forecast vs Actual Comparison (Horizon Gate Closure)
- **Multi-Line Time-Series Comparison**:
  - Actual Generation Line (Solid Emerald).
  - Selected Day-Ahead 09:00 Forecast Line (Solid Cyan).
  - Early D-2 Forecast Line (Dotted Slate, 36-48h).
  - Final Intraday Gate Closure Forecast Line (Dashed Amber, 0-6h).
- **Convergence Delta Area Chart**: Visual envelope displaying how the forecast revision spread shrinks as real-time delivery approaches.

---

## 7. Backend API Architecture & Contracts

To maintain modular monolith simplicity and avoid N+1 queries, three new endpoints and one optimized existing endpoint are specified.

### 7.1 Optimized Existing Endpoint: `GET /api/v1/forecasts`
- **Path**: `/api/v1/forecasts`
- **Query Params**: `delivery_date_from`, `delivery_date_to`, `delivery_hour`, `selected_only`, `page`, `page_size`.
- **Enhancement**: Batch-load publications using `WHERE delivery_hour_utc IN (...)` when `selected_only=false`.
- **Response Schema Update**:
  ```python
  class PublicationVersion(BaseModel):
      id: int = Field(description="Raw forecast record ID in raw_forecast_records")
      publish_time_utc: datetime = Field(description="Publication timestamp (UTC)")
      lead_time_hours: float = Field(description="Lead time before delivery hour start (hours)")
      forecast_mw: float = Field(description="Forecast generation (MW)")
      revision_mw: float | None = Field(description="Delta from immediately prior publication (MW)")
      is_eligible: bool = Field(description="True if published before 09:00 UK decision cutoff")
      is_selected: bool = Field(description="True if this publication was selected for D-1 evaluation")
  ```

### 7.2 Dedicated Endpoint: `GET /api/v1/forecasts/publications/{delivery_hour_utc}`
- **Path**: `/api/v1/forecasts/publications/{delivery_hour_utc}`
- **Description**: Returns all publication cycles for a single delivery hour with actual generation and settlement readings trace.
- **Parameters**: `delivery_hour_utc` (ISO 8601 string, e.g. `2026-01-28T12:00:00Z`).
- **Response Schema**:
  ```python
  class SingleDeliveryHourPublicationResponse(BaseModel):
      delivery_hour_utc: datetime
      delivery_date_london: date
      hour_of_day_london: int
      decision_cutoff_utc: datetime
      selected_forecast_id: int | None
      selected_publish_time_utc: datetime | None
      actual_generation_mw: float | None
      settlement_readings: list[HalfHourReadingTrace]
      total_publications: int
      eligible_publications: int
      publications: list[PublicationVersion]
  ```

### 7.3 Horizon Analytics Endpoint: `GET /api/v1/forecasts/horizons`
- **Path**: `/api/v1/forecasts/horizons`
- **Parameters**:
  - `delivery_date_from` (date, optional)
  - `delivery_date_to` (date, optional)
  - `mode` (str, default `"matched"`): One of `"matched"`, `"publication_weighted"`, `"unmatched_representative"`.
- **Response Schema**:
  ```python
  class HorizonBucketStats(BaseModel):
      horizon_bucket: str  # e.g. "Very Short (0-6h)", "Short (6-12h)", etc.
      lead_time_min_hours: float
      lead_time_max_hours: float
      target_lead_time_hours: float | None
      avg_actual_lead_time_hours: float
      observation_count: int
      unique_delivery_hours: int
      hour_coverage_pct: float
      mae_mw: float
      rmse_mw: float
      bias_mw: float
      mape_pct: float

  class MultiHorizonResponse(BaseModel):
      delivery_date_from: date
      delivery_date_to: date
      analysis_mode: str  # "matched", "publication_weighted", "unmatched_representative"
      total_delivery_hours_in_period: int
      evaluated_delivery_hours: int
      common_matched_hours: int | None
      overall_coverage_pct: float
      buckets: list[HorizonBucketStats]
  ```

### 7.4 Revision Analytics Endpoint: `GET /api/v1/forecasts/revisions`
- **Path**: `/api/v1/forecasts/revisions`
- **Parameters**: `delivery_date_from`, `delivery_date_to`, `min_abs_revision_mw` (optional, default `500.0`).
- **Response Schema**:
  ```python
  class ExtremeRevisionItem(BaseModel):
      raw_forecast_id: int
      delivery_hour_utc: datetime
      publish_time_utc: datetime
      previous_publish_time_utc: datetime
      lead_time_hours: float
      previous_forecast_mw: float
      revised_forecast_mw: float
      revision_mw: float
      abs_revision_mw: float
      cycle_gap_hours: float

  class RevisionAnalyticsResponse(BaseModel):
      forward_only_revisions: int  # 13,367 in Jan 2026
      mean_signed_revision_mw: float  # -6.77 MW
      mean_absolute_revision_mw: float  # 343.96 MW
      upward_count: int  # 6,206 (46.43%)
      downward_count: int  # 6,434 (48.13%)
      unchanged_count: int  # 727 (5.44%)
      cycle_gap_max_hours: float  # 4.0h
      discontinuous_gap_count: int  # 0 (> 6h)
      top_revisions: list[ExtremeRevisionItem]
      diurnal_revision_heatmap: list[dict[str, Any]]
  ```

---

## 8. Database & Indexing Strategy

### 8.1 Existing Index Verification
`raw_forecast_records` currently features:
1. `PRIMARY KEY (id)`
2. `UNIQUE CONSTRAINT (publish_time_utc, delivery_hour_utc)`
3. `Index("idx_raw_forecast_delivery_publish", "delivery_hour_utc", "publish_time_utc")`
4. `Index("idx_raw_forecast_publish_time", "publish_time_utc")`

### 8.2 Query Optimization
- Queries for a single delivery hour (`WHERE delivery_hour_utc = :target ORDER BY publish_time_utc ASC`) are already fully indexed by `idx_raw_forecast_delivery_publish` (B-Tree index scan in $< 2\text{ms}$).
- For range horizon queries (`WHERE delivery_hour_utc >= :start AND delivery_hour_utc <= :end`), `idx_raw_forecast_delivery_publish` efficiently scans the leading column `delivery_hour_utc`.
- **Database Schema Changes**: **Zero new tables or column alterations required**. All raw data, timestamps, and generation values already exist in `raw_forecast_records` and `hourly_actuals`.

---

## 9. Frontend Component Architecture

### 9.1 Routing & Code Splitting
- Route: `/forecasts` in [`frontend/src/app/router.tsx`](file:///c:/Users/prana/Projects/WindIQ/frontend/src/app/router.tsx).
- Integrated via lazy loading: `LazyForecastPage` in [`frontend/src/components/layout/lazy-routes.tsx`](file:///c:/Users/prana/Projects/WindIQ/frontend/src/components/layout/lazy-routes.tsx).
- Bundle Budget: Expected chunk size $\le 65\text{ kB}$ uncompressed ($\le 15\text{ kB}$ gzip), preserving fast initial dashboard load.

### 9.2 Component Hierarchy
```
frontend/src/
├── pages/
│   └── forecast-page.tsx                  # Main analytical workstation page
├── components/
│   └── forecasts/
│       ├── forecast-toolbar.tsx            # Date range, single-hour picker, horizon toggles
│       ├── publication-trajectory-chart.tsx # Step-by-step revision curve with cutoff and actual line
│       ├── publication-history-table.tsx   # Detailed publication table with eligibility badges
│       ├── multi-horizon-chart.tsx        # MAE/RMSE/Bias bar chart across 6 horizon buckets
│       ├── revision-distribution-chart.tsx # Upward/Downward histogram and extreme revisions
│       ├── diurnal-revision-heatmap.tsx    # 24h x Lead-Time revision volatility heatmap
│       ├── forecast-actual-comparison.tsx  # Multi-horizon time-series overlay
│       └── publication-trace-modal.tsx     # Raw record BMRS audit payload modal
├── hooks/
│   └── use-forecasts.ts                   # TanStack Query hooks (publications, horizons, revisions)
└── types/
    └── api.ts                             # TypeScript models for Phase 3.3 schemas
```

---

## 10. Statistical Definitions & Mathematical Formats

### 10.1 Forecast Error Metrics
1. **Forecast Error at Horizon $h$**:
   $$e_{i, h} = \hat{y}_{i, h} - y_i$$
2. **Mean Absolute Error (MAE) at Horizon $h$**:
   $$\text{MAE}_h = \frac{1}{N_h} \sum_{i=1}^{N_h} \vert \hat{y}_{i, h} - y_i \vert$$
3. **Root Mean Squared Error (RMSE) at Horizon $h$**:
   $$\text{RMSE}_h = \sqrt{\frac{1}{N_h} \sum_{i=1}^{N_h} (\hat{y}_{i, h} - y_i)^2}$$
4. **Forecast Bias at Horizon $h$**:
   $$\text{Bias}_h = \frac{1}{N_h} \sum_{i=1}^{N_h} (\hat{y}_{i, h} - y_i)$$
5. **Mean Absolute Percentage Error (MAPE) at Horizon $h$**:
   $$\text{MAPE}_h = \frac{1}{N_{h, \text{pos}}} \sum_{i: y_i > 0} \frac{\vert \hat{y}_{i, h} - y_i \vert}{y_i} \times 100\%$$
   *Policy*: APE is strictly `NULL` and excluded from the denominator when actual generation $y_i \le 0\text{ MW}$.

### 10.2 Deterministic Horizon Selection Rule & Matched Population
For delivery hour $h \in \mathcal{H}$ and horizon bucket $B \in \mathcal{B}$ with target lead time $t_{\text{target}, B}$:
$$\hat{y}_{h, B}^* = \text{arg}\min_{p \in \mathcal{P}_{h, B}} \left( \vert t_{\text{lead}}(p) - t_{\text{target}, B} \vert, -t_{\text{publish}}(p) \right)$$
- **Tie-Breaking Rule**: When two candidate publications $p_1, p_2$ are equidistant from $t_{\text{target}, B}$, select the publication with the greater `publish_time_utc` (the more recent model run).
- **Proof of Single Contribution**: The `ROW_NUMBER() OVER (PARTITION BY delivery_hour_utc, bucket_name ORDER BY ABS(lead_time - target) ASC, publish_time DESC)` partition guarantees that exactly one observation is chosen per delivery hour per bucket ($N \le 1$).
- **Strictly Matched Population $\mathcal{H}_{\text{matched}}$**:
  $$\mathcal{H}_{\text{matched}} = \left\{ h \in \mathcal{H} \;\middle|\; \forall B \in \mathcal{B},\; \mathcal{P}_{h, B} \neq \emptyset \right\}$$
  In January 2026, $\vert \mathcal{H}_{\text{matched}} \vert = 553\text{ delivery hours}$ (74.33% coverage). When `mode=matched`, only delivery hours belonging to $\mathcal{H}_{\text{matched}}$ are included. No synthetic forecast substitution is permitted.

### 10.3 Forward-Only Revision & Cadence Gap Analytics
1. **Consecutive Forward Revision**:
   $$\Delta \hat{y}_{h, k} = \hat{y}_{h, k} - \hat{y}_{h, k-1} \quad \text{for } t_{\text{lead}}(p_{h, k-1}) > 0 \text{ and } t_{\text{lead}}(p_{h, k}) > 0$$
2. **Mean Absolute Revision**:
   $$\overline{\vert \Delta \hat{y} \vert} = \frac{1}{K_{\text{fwd}}} \sum_{k=1}^{K_{\text{fwd}}} \vert \Delta \hat{y}_k \vert = 343.96\text{ MW}$$
3. **Publication Cadence Gap**:
   $$\Delta t_{\text{cadence}} = \frac{t_{\text{publish}, k} - t_{\text{publish}, k-1}}{3600\text{ seconds}}$$
   - $\Delta t \le 4.0\text{h}$: Standard BMRS scheduled publication intervals (2h, 3h, 4h; 100% in Jan 2026).
   - $\Delta t > 6.0\text{h}$: Operational long-gap threshold (`is_discontinuous = true`).
4. **Revision Volatility**:
   $$\sigma_{\text{rev}} = \sqrt{\frac{1}{K-1} \sum_{k=1}^K (\Delta \hat{y}_k - \bar{\Delta})^2}$$

---

## 11. Data Integrity & Operational Safeguards

- **Post-Delivery Exclusion**: Any publication with $t_{\text{lead}} \le 0$ is classified as ex-post telemetry and excluded from forward forecasting metrics.
- **Cutoff Immutability**: The 09:00 UK decision cutoff rule is strictly evaluated against `publish_time_utc <= decision_cutoff_utc`. Publications released after 09:00 UK on D-1 are labeled `POST_CUTOFF` and never selected as the benchmark day-ahead forecast.
- **Matched Population Flag**: Analysts can toggle between *All Available Data* and *Matched Data* (common delivery hours across all 6 horizons). The UI explicitly labels which population is being viewed to prevent erroneous comparisons.
- **Zero-Conversion Prohibition**: Missing values remain `null` or `MISSING_ACTUAL`; they are never cast to `0.0 MW`.

---

## 12. Testing Strategy

### 12.1 Backend Tests (`backend/tests/`)
- `test_horizon_bucket_boundary_isolation`: Proves that exact boundary values 0, 6, 12, 24, 36, 48, 72 belong to exactly one bucket, that [48, 72] is closed at 72, and negative/zero/>72 values are excluded.
- `test_forward_population_coverage_proof`: Proves that all 744 delivery hours contain $\ge 8$ forward publications and $\sum (N_{\text{fwd}, h} - 1) = 13,367$.
- `test_publication_lineage_and_ordering`: Verify publications for a single delivery hour are returned in strict chronological order with correct lead-time hours.
- `test_decision_cutoff_selection_rule`: Test that publication at 08:59 UK is eligible, 09:01 UK is post-cutoff, and the latest pre-09:00 publication is marked `is_selected`.
- `test_multi_horizon_aggregation_matched_vs_unmatched`: Verify horizon metrics match database SQL calculations on both all-available and matched populations.
- `test_consecutive_revision_calculation`: Test revision delta $\hat{y}_t - \hat{y}_{t-1}$ across publications, verifying gap detection for cycles $> 6\text{h}$.
- `test_post_delivery_forecast_filtering`: Ensure forecasts with $t_{\text{lead}} \le 0$ are excluded from forward horizon accuracy metrics.

### 12.2 Frontend Tests (`frontend/src/test/`)
- `forecast-toolbar.test.tsx`: Verify date picking, hour of day selection, and matched-population toggle.
- `publication-trajectory-chart.test.tsx`: Verify cutoff reference line, selected forecast marker, and actual generation line.
- `multi-horizon-chart.test.tsx`: Test horizon bar rendering and tooltip values.
- `use-forecasts.test.ts`: Verify React Query caching, parameter serialization, and error handling.
- `regression.test.tsx`: Verify Executive Overview (`/`) and Forecast Accuracy Explorer (`/accuracy`) remain fully operational with 0 regressions.

---

## 13. Implementation Roadmap

### Phase 3.3.1 — Contract & Service Layer Implementation
- Enhance `AnalyticsService.get_forecasts` to eliminate N+1 queries.
- Add `PublicationVersion` fields (`id`, `lead_time_hours`, `revision_mw`, `is_selected`).
- Implement `GET /api/v1/forecasts/publications/{delivery_hour_utc}`.
- Automated backend unit tests for publication lineage.

### Phase 3.3.2 — Multi-Horizon & Revision Analytics Endpoints
- Implement `GET /api/v1/forecasts/horizons` (supporting `matched_only`).
- Implement `GET /api/v1/forecasts/revisions` (consecutive revisions and top leaderboard).
- Implement `GET /api/v1/forecasts/horizon-accuracy`.
- Automated backend tests for statistical formulas and matched population filtering.

### Phase 3.3.3 — Frontend Foundation & Publication Explorer (View 1)
- Create TypeScript types in `frontend/src/types/api.ts` and React Query hooks in `frontend/src/hooks/use-forecasts.ts`.
- Build [`ForecastPage`](file:///c:/Users/prana/Projects/WindIQ/frontend/src/pages/forecast-page.tsx) shell, toolbar, and routing at `/forecasts`.
- Build `PublicationTrajectoryChart` and `PublicationHistoryTable`.
- Verify View 1 against 28 Jan 12:00 UTC verified record.

### Phase 3.3.4 — Multi-Horizon Analysis (View 2) & Convergence Curves
- Implement `MultiHorizonChart` (MAE/RMSE/Bias by lead-time bucket).
- Implement Matched Population toggle with clear UI explanation.
- Build Horizon summary KPI cards.

### Phase 3.3.5 — Revision Analytics (View 3) & Heatmap
- Implement `RevisionDistributionChart` (signed histogram and upward/downward counters).
- Implement `DiurnalRevisionHeatmap` (24h x Horizon revision volatility).
- Implement Top Revisions Leaderboard table.

### Phase 3.3.6 — Forecast vs Actual Comparison (View 4) & Trace Modal
- Implement `ForecastActualComparisonChart` (multi-horizon time-series overlay).
- Implement `PublicationTraceModal` for deep raw BMRS payload audit.

### Phase 3.3.7 — Quality Gates, Full Regression & Docker Verification
- Run complete frontend verification: `npm run typecheck`, `npx oxlint`, `vitest run`.
- Run complete backend test suite: `pytest backend/tests/` and `pytest tests/`.
- Rebuild production Docker containers (`docker compose up --build -d`).
- Capture screenshots for all 4 views and compile final completion documentation.

---

## 14. Risks & Unresolved Assumptions

| Risk / Assumption | Severity | Mitigation Strategy |
| :--- | :--- | :--- |
| **Post-delivery publications in WINDFOR stream** | Medium | Explicitly filter `lead_time_hours > 0` in all horizon and revision analytics queries; label $t_{\text{lead}} \le 0$ as historical in publication table. |
| **Missing publication cycles across calendar days** | Low | Query tracks cycle gaps; revisions across gaps $> 6.0\text{h}$ are marked discontinuous to avoid attributing multi-day jumps to a single model run. |
| **Sample size imbalance in 48-72h horizon** | Medium | Offer Matched Population toggle ($N=553$ common hours) alongside All-Available ($N=2,429$), clearly displaying sample count badges. |
| **Performance overhead of large publication joins** | Low | Existing B-Tree index `(delivery_hour_utc, publish_time_utc)` provides $< 2\text{ms}$ indexed lookups. Bounded date ranges avoid full-table scans. |

---

## 15. Acceptance Criteria for Phase 3.3 Execution

1. **View 1 Functional**: An analyst can select any delivery hour (e.g. 28 Jan 12:00 UTC) and view all ~24 publication versions, lead times, decision cutoff, winning publication, and actual generation.
2. **View 2 Functional**: Multi-horizon convergence curve clearly displays MAE/RMSE/Bias across the 6 lead-time buckets, supporting both all-available and matched populations.
3. **View 3 Functional**: Revision analytics show signed revision distribution, upward/downward counts, and the 24-hour diurnal revision heatmap.
4. **View 4 Functional**: Multi-line forecast vs actual comparison plots early D-2, selected D-1, final intraday, and actual generation.
5. **Zero Regression**: Phase 3.1 Executive Overview and Phase 3.2 Forecast Accuracy Explorer continue to pass all 36 unit tests and display verified benchmark metrics.
6. **Docker Compliance**: Production build succeeds with code splitting; all containers run healthy.

---

## 16. Implementation Sign-off & Verification Audit

- **Implementation Status**: **COMPLETED & VERIFIED**
- **Date**: 05 November 2026

### 16.1 Automated Test Execution Results
1. **Backend Tests**: 23/23 passed in 12.05s (`pytest tests/`)
   - `tests/test_audit_integrity.py`: 10/10 passed (January benchmark integrity, zero regression on canonical numbers).
   - `tests/test_live_endpoints.py`: 4/4 passed live against container port 8001 (`/forecasts/publications/{delivery_hour_utc}`, `/forecasts/horizons?mode=matched`, `/forecasts/horizons?mode=publication_weighted`, `/forecasts/revisions`).
   - `tests/test_phase_3_3_methodology.py`: 3/3 passed (horizon boundary isolation & semantics, mathematical proof of forward revision population coverage, monotonic error convergence ground truth).
   - `tests/test_regression.py` & `tests/test_validation.py`: 6/6 passed.
2. **Frontend Quality Gates**:
   - TypeScript typecheck (`tsc --noEmit`): **0 errors**.
   - Code quality linter (`oxlint`): **0 errors, 0 warnings** across 73 files.
   - Vitest unit & component test suite: **39/39 passed** across 12 test files (`npm run test -- --run`).
   - Production asset compilation (`vite build`): Succeeded in 5.26s with lazy-loaded chunk `forecast-page-*.js`.

### 16.2 Live Browser & Visual Verification
Captured and verified against live Docker frontend container (Nginx on port 3000):
1. **View 1 — Publication Evolution**: `forecasts_view1_evolution.png` (displays 19 forward publication cycles for 28 Jan 12:00 UTC, cutoff line at 09:00 D-1, diamond winner marker at 9,031 MW, actual line at 4,857.5 MW, and full lifecycle table).
2. **View 1 — Lineage & Audit Modal**: `forecasts_view1_lineage_modal.png` (deep mathematical proof displaying 09:00 UK decision cutoff, winner selection, FUELHH SP 25 & 26 readings, arithmetic average, and signed error).
3. **View 2 — Multi-Horizon Convergence**: `forecasts_view2_multi_horizon.png` (proves monotonic error convergence across all 6 horizon buckets with MAE reduction: 34.16%, MAE change: −835.71 MW on 553 common hours).
4. **View 3 — Revision Trajectory & Heatmap**: `forecasts_view3_revisions.png` (signed histogram of 13,367 forward revisions, 24h diurnal volatility matrix, and top 10 extreme revisions leaderboard).
5. **View 4 — Horizon vs Actual Comparison**: `forecasts_view4_comparison.png` (continuous timeline overlay of 744 hours, exactly reproducing baseline MAE 2,038.9 MW and Bias +1,747.89 MW with pan/zoom brush).

---

## 17. Final Numerical Reconciliation

### 17.1 Revision Metrics Reconciliation
- **Original Reported Figures**: Mean signed: -12.45 MW, Mean absolute: 285.34 MW, Up: 6,100, Down: 6,200, Unchanged: 1,067.
- **Independently Recalculated Ground Truth (PostgreSQL & Live API)**:
  - Total transitions: **13,367** ($\sum_{h=1}^{744} (N_{\text{fwd}, h} - 1)$)
  - Mean signed revision: **-6.7732 MW (-6.77 MW)** (Numerator: $-90,537.49\text{ MW}$, Denominator: $13,367$)
  - Mean absolute revision: **343.9565 MW (343.96 MW)** (Numerator: $4,597,666.08\text{ MW}$, Denominator: $13,367$)
  - Upward revisions: **6,206** (46.43%)
  - Downward revisions: **6,434** (48.13%)
  - Unchanged revisions: **727** (5.44%)
  - Category Sum: $6,206 + 6,434 + 727 = 13,367$ (100.00%)
- **Root Cause**: The preliminary report quoted synthetic mock test values typed into `frontend/src/test/forecast-page.test.tsx`. The database SQL and live API endpoint `/api/v1/forecasts/revisions` already produced the exact canonical values.

### 17.2 Publication Interval Count Reconciliation
- **Original Reported Figures**: 2h: 5,504, 3h: 3,438, 4h: 4,314 (sum = 13,256; 111 missing transitions).
- **Independently Recalculated PostgreSQL Distribution**:
  - 2.0000h (2h 00m): **5,504**
  - 2.9167h (2h 55m, 5m early): **57**
  - 3.0000h (3h 00m): **3,438**
  - 3.0833h (3h 05m, 5m late): **54**
  - 4.0000h (4h 00m): **4,314**
  - **Exhaustive Sum**: $5,504 + 57 + 3,438 + 54 + 4,314 = \mathbf{13,367}$ transitions (100.00%).
- **Root Cause**: The missing 111 transitions ($57 + 54 = 111$) were two non-integer 5-minute operational jitter intervals that were omitted when only integer bucket labels were reported.
- Maximum observed interval: strictly **4.0000 hours**. Discontinuous intervals ($> 6.0\text{h}$): **0**.

### 17.3 Matched Horizon Average Lead-Time Reconciliation
- **Original Reported Figures**: Very Short 3.2h, Short 8.8h, Same-Day 17.5h, Day-Ahead 29.8h, D-2 Early 41.5h, Medium-Range 59.8h.
- **Independently Recalculated PostgreSQL Ground Truth (553 Common Hours)**:
  - Very Short (0–6h): **2.82h** (2.8187h)
  - Short (6–12h): **8.92h** (8.9180h)
  - Same-Day (12–24h): **17.92h** (17.9164h)
  - Day-Ahead (24–36h): **29.81h** (29.8079h)
  - D-2 Early (36–48h): **41.92h** (41.9164h)
  - Medium-Range (48–72h): **56.11h** (56.1058h)
- **Root Cause**: The discovery report values (2.82h, 8.92h, 17.92h, 29.81h, 41.92h, 56.11h) are the exact database values. The preliminary report quoted synthetic mock test values.

