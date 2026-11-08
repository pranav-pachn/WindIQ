# WindIQ UI Refinement & Final Release Audit Report
**UK National Wind Generation Forecast Accuracy & Trading Intelligence Platform**

---

## 1. Executive Summary

This report documents the final release audit and visual refinement of the **WindIQ** energy-market intelligence platform. The platform provides institutional-grade analytical density, information hierarchy, and visual restraint inspired by **Linear** and **Bloomberg Terminal**, operating within a high-contrast dark environment (`#0B1220`).

This audit validates:
1. **Demo Role-Switcher Security**: Cryptographic backend RBAC enforcement, prevention of privilege escalation, and production suppression controls.
2. **Benchmark Wording Integrity**: Strict disambiguation between 19 January 2026 (Best MAE: 736.1458 MW) and 20 January 2026 (Best MAPE: 6.5834%).
3. **Horizon Terminology Standardization**: Complete eradication of informal "Intraday gate closure" phrasing in favor of regulatory "Very Short (0–6h)" and "Decision Cutoff (09:00 UK)".
4. **Cloud Status Truthfulness**: Verifiable real-time health-check latency and transparent reporting of static benchmark demo mode without unsupported pipeline claims.
5. **Regression Verification**: 100% pass across TypeScript typecheck, oxlint, production Vite build, Vitest suite (48/48 tests), and backend RBAC test suite.

---

## 2. Design Tokens & Visual Hierarchy

### 2.1 Theme Palette & Semantics

The platform interface is governed by disciplined tokens defined in `frontend/tailwind.config.js` and `frontend/src/lib/chart-theme.ts`:

| Token | Hex Value | Semantic Usage |
|---|---|---|
| **App Background** | `#0B1220` | Root canvas backdrop |
| **Sidebar Background** | `#0A101C` | Persistent navigation rail |
| **Surface** | `#111C2D` | Primary card panels, chart containers, audit modals |
| **Elevated Surface** | `#162337` | Hover states, active controls, nested summary bars |
| **Subtle Border** | `#1E2B3E` | Minor separators, grid divisions |
| **Prominent Border** | `#26364A` | Table headers, primary card outlines, modal perimeters |
| **Primary Text** | `#E7EDF5` | Metric values, table figures, section headers (high contrast) |
| **Secondary Text** | `#9AAABD` | Descriptive labels, field descriptions, methodology notes |
| **Muted Text** | `#718198` | Timestamps, units (MW, %), metadata captions |
| **Accent Teal** | `#35B9C8` | Single dominant interactive accent: active routes, MAE series, winning D-1 forecast |
| **Status Success** | `#35B98A` | Best delivery days, valid comparison status, online ping |
| **Status Warning** | `#E7AD4A` | Overforecast deviation, penalized RMSE curves, caution alerts |
| **Status Error** | `#E36D73` | Worst delivery days, underforecast deviation, outages |

### 2.2 Typography & Tabular Numerals

- **Sans-Serif**: Inter (`Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`).
- **Monospace**: JetBrains Mono (`"JetBrains Mono", monospace`) with `font-feature-settings: "tnum"` enabled globally in `frontend/src/index.css` to guarantee fixed-width character alignment across all financial and telemetry figures.
- **Precision Mode**: Global toggle between 2-decimal operational view and 4-decimal audit ledger view.

### 2.3 Chart Palette (`frontend/src/lib/chart-theme.ts`)

- **MAE (Linear Deviation)**: `#35B9C8` (Teal)
- **RMSE (Penalized Deviation)**: `#E7AD4A` (Amber)
- **MAPE (%)**: `#CBD5E1` (Slate)
- **Forecast Generation**: `#38BDF8` (Sky Blue)
- **Settlement Actual**: `#35B98A` (Emerald)
- **Overforecast / Imbalance**: `#E7AD4A`
- **Underforecast**: `#E36D73`
- **Grid Lines**: `#1E2B3E` (1px dashed)

---

## 3. Targeted Audit & Corrections

### 3.1 Demo Role-Switcher Security Audit

The Quick Role Switcher (`frontend/src/components/layout/quick-role-switcher.tsx`) was audited for cryptographic integrity, client tamper-resistance, and production isolation:

1. **Backend Privilege Isolation**:
   - The frontend role switcher **does not** mutate role state in client memory or localStorage to gain access.
   - Every role switch triggers a formal HTTP `POST /api/v1/auth/login` containing the credentials of the selected demo persona (`viewer@windiq.local`, `analyst@windiq.local`, or `admin@windiq.local`).
   - The backend authenticates credentials using Argon2id password hashing, generates a signed JWT containing claims `{"sub": user_id, "role": user_role}`, sets an HttpOnly refresh cookie, and returns a signed access token.
   - All protected backend endpoints execute `get_current_principal()` and `require_permission()`, validating the cryptographically signed JWT. Tampered tokens or spoofed client headers immediately fail with `HTTP 401 Unauthorized`.

2. **Verified Permission Matrix (Real API Execution)**:
   The security audit script (`backend/scripts/audit_rbac_security.py`) executed actual HTTP requests against the FastAPI ASGI application with the live database and rate-limiting coordination store:
   - **Unauthenticated**: `GET /api/v1/overview` $\rightarrow$ **HTTP 401 Unauthorized** (Strictly blocked).
   - **Viewer (`viewer@windiq.local`)**:
     - `GET /api/v1/overview` $\rightarrow$ **HTTP 200 OK** (Permitted).
     - `GET /api/v1/accuracy/hourly` $\rightarrow$ **HTTP 403 Forbidden** (Strictly blocked from granular evaluations).
     - `GET /api/v1/auth/keys` $\rightarrow$ **HTTP 403 Forbidden** (Strictly blocked from API key management).
   - **Analyst (`analyst@windiq.local`)**:
     - `GET /api/v1/overview` $\rightarrow$ **HTTP 200 OK** (Permitted).
     - `GET /api/v1/accuracy/hourly` $\rightarrow$ **HTTP 200 OK** (Permitted).
     - `GET /api/v1/forecasts/revisions` $\rightarrow$ **HTTP 200 OK** (Permitted).
     - `GET /api/v1/auth/keys` $\rightarrow$ **HTTP 403 Forbidden** (Strictly blocked from admin privileges).
   - **Admin (`admin@windiq.local`)**:
     - `GET /api/v1/auth/keys` $\rightarrow$ **HTTP 200 OK** (Full platform management permitted).
   - **Forged Token Test**: Client-forged token claiming `role: "admin"` signed with arbitrary secret key $\rightarrow$ **HTTP 401 Unauthorized** (Cryptographically rejected).

3. **Production Isolation**:
   - In a non-demo enterprise deployment, the Quick Role Switcher can be completely suppressed by setting `VITE_ENABLE_DEMO_SWITCHER=false`.
   - The component immediately short-circuits (`return null`), omitting all demo role controls from the DOM while preserving the local and recruiter demonstration experience.

---

### 3.2 Benchmark Wording & Performance Extremes Disambiguation

The Executive Overview performance extremes card (`frontend/src/components/dashboard/performance-extremes.tsx`) was corrected to eliminate any ambiguity between linear error (MAE) and relative percentage error (MAPE):

- **Lowest Linear Error (Best MAE)**:
  - **Date**: **19 January 2026**
  - **Value**: **736.1 MW** (736.1458 MW)
  - **Label**: `Lowest Error (Best MAE)`
  - **Subtitle**: `Peak forecast fidelity across hours (19 Jan)`
- **Lowest Relative Error (Best MAPE)**:
  - **Date**: **20 January 2026**
  - **Value**: **6.6%** (6.5834%)
  - **Label**: `Lowest Relative Error (Best MAPE)`
  - **Subtitle**: `Optimal relative generation match (20 Jan)`
- **Disambiguation Verified**: January 20's 6.58% MAPE is strictly isolated from January 19's 736.15 MW MAE across all component titles, subtitles, and documentation.
- **Worst Extremes**:
  - Highest Linear Error: **28 January 2026** (MAE 5,374.8 MW).
  - Highest Relative Error: **28 January 2026** (MAPE 97.2%, due to low wind outturn magnifying relative deviation).

---

### 3.3 Forecast Horizon Terminology Standardization

Non-standard and informal terminology was audited and eliminated from all explorer charts, modals, and tables:

| Location | Prior Terminology | Standardized Terminology | Rationale |
|---|---|---|---|
| `multi-horizon-chart.tsx:73` | `Intraday gate closure, 0–6h` | `Very Short (0–6h)` | Aligns with formal Elexon & academic multi-horizon lead time classifications. |
| `publication-history-table.tsx:42` | `earliest to final gate closure` | `earliest to final publication before delivery` | Gate closure in GB balancing refers to 1h pre-settlement; WINDFOR publishes up to delivery. |
| `publication-trace-modal.tsx:91` | `Gate Closure & Selection Rule` | `Decision Cutoff & Selection Rule` | The 09:00 UK cutoff is a day-ahead procurement cutoff, not real-time gate closure. |
| `publication-trace-modal.tsx:104` | `Gate Closure Cutoff (UTC):` | `Decision Cutoff (UTC):` | Reflects configured 09:00 Europe/London decision cutoff. |
| `publication-trajectory-chart.tsx:196` | `← Gate Closure (Real-Time 0h)` | `← Real-Time Delivery (0h)` | Accurately describes the 0h lead-time delivery coordinate. |

*Note: No modifications were made to horizon boundaries (0-6h, 6-12h, 12-24h, 24-36h, 36-48h, 48-72h) or mathematical calculations.*

---

### 3.4 API Status & SLA Latency Presentation

The API connectivity indicator in the application header (`frontend/src/components/layout/top-nav.tsx`) decouples binary connectivity from response time performance and provides an accessible explanatory tooltip:

1. **Separated Connectivity Pill**:
   - Discrete status pill indicating true network connectivity (`Online` in green `#35B98A`, `Checking` with pulsing indicator, or `Offline` in red `#E36D73`).
2. **Dedicated Latency Badge with Accessible Tooltip & Label**:
   - Latency measured via `performance.now()` is presented in a dedicated metric badge with a descriptive `Latency:` label prefix.
   - Wrapped in an interactive `<Tooltip>` with `role="status"` and `aria-label`, providing clear explanations of SLA performance targets:
     - **Optimal SLA (<500ms)**: Neutral elevated styling (`#162337` surface, `#9AAABD` text, `#26364A` border) with tooltip indicating optimal operation within standard SLA targets (<500ms).
     - **Elevated Latency (500ms–2000ms)**: Amber cautionary badge (`#332514` surface, `#E7AD4A` text, `#5A3E1B` border) noting elevated service response time.
     - **Cold Start / High Latency (≥2000ms)**: Amber/orange alert badge (`#3A2218` surface, `#E7AD4A` text, `#653723` border) with `(Cold Start)` flag explaining container spin-up delays on free-tier cloud hosting.

---

### 3.5 KPI Grid Architecture & Terminology Refinement

To resolve card crowding, complete abbreviations, and ensure symmetrical horizontal and vertical alignment across all cards, the Core Forecast Accuracy Metrics grid (`frontend/src/components/dashboard/kpi-grid.tsx` and `frontend/src/components/dashboard/kpi-card.tsx`) was restructured:

1. **KPI Terminology & Acronym Disambiguation**:
   - Card 2: Heading **Mean Absolute Error** | Badge `MAE`
   - Card 3: Heading **Root Mean Squared Error** | Badge `RMSE`
   - Card 4: Heading **Mean Absolute Percentage Error** | Badge `MAPE`
   - Card 5: Heading **Forecast Bias** | Badge `Signed`
   - Card 6: Heading **Overforecast vs Underforecast** | Badge `85% Over`
   - Eliminates redundant duplicates (e.g. `MAE` heading + `MAE` badge, or `Root Mean Squared Error (RMSE)` heading + `RMSE` badge).

2. **Expanded Card Width (3-Column Layout)**:
   - Transitioned desktop grid from 6 cramped columns to a spacious 3-column architecture (`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5`).
   - Card widths doubled from ~180px to ~376px, providing ample horizontal room for all metadata elements.
   - The Overforecast vs Underforecast value (`632 : 112 hrs`) remains strictly on a single line on desktop.

3. **Natural Two-Line Wrapping & Value Alignment**:
   - Removed `truncate` ellipses from headings; cards use `min-h-[36px]` with `break-words line-clamp-2 leading-tight`, allowing longer headings to wrap cleanly to two lines.
   - Symmetrical header heights preserve strict horizontal alignment across all numerical values (`744 hrs`, `2,038.91 MW`, `2,504.76 MW` in row 1; `22.04 %`, `+1,747.89 MW`, `632 : 112 hrs` in row 2).

---

### 3.6 Header Subtitle Shortening

The Executive Overview subtitle in `frontend/src/components/layout/app-shell.tsx` was shortened to:
> **"National GB Wind Forecast Analytics"**

This eliminates text truncation across standard desktop viewports (1280px and 1440px) while maintaining complete descriptive clarity.

---

### 3.7 Performance Investigation: 1546 ms API Latency

A thorough performance investigation was conducted into the elevated ~1546 ms latency indicator:

1. **Endpoint Identified**:
   - The latency badge is driven by `useApiHealth()` in `frontend/src/hooks/use-api-health.ts`, measuring the round-trip probe time of `GET /health/ready`.
2. **Root Cause Analysis**:
   - In `backend/app/main.py:232`, `check_db_health(settings=app_settings)` was previously called with `settings` passed and `engine=None`.
   - In `backend/app/core/database.py:96-106`, passing `settings` caused the health check to create a brand-new SQLAlchemy `AsyncEngine` (`create_async_engine`), initiate a fresh TCP handshake and TLS negotiation over the internet to Supabase Tokyo (`aws-0-ap-northeast-1.pooler.supabase.com:5432`), execute `SELECT 1`, and then immediately call `dispose()`.
   - Creating and destroying an async engine + TLS handshake on every probe added **1200–2500ms** of unnecessary network overhead.
3. **Database & Network Geography Breakdown**:
   - **Supabase Host**: `aws-0-ap-northeast-1.pooler.supabase.com` (AWS Tokyo, Japan).
   - **Render / Client Host**: Oregon (`us-west-1`) or local client.
   - Cross-continental ping round-trip time (RTT): ~120–150ms per round trip. A cold TLS handshake requires 3-4 round trips (~450–600ms).
   - Redis latency: < 1ms (Upstash serverless Redis ping).
4. **Resolution**:
   - Modified `backend/app/main.py` to pass `engine=get_engine(app_settings)` to `check_db_health`, reusing the warm pooled connection instead of creating and disposing of an engine on every health check.
   - Frontend request frequency was audited: React Query caches data with `staleTime: 300000` (5 minutes) and refetches health only once every 30 seconds (`refetchInterval: 30000`). No duplicate or runaway requests were occurring.

---

### 3.8 Environment-Aware Scheduler Status & Ingestion Audit

Scheduler status and ingestion telemetry (`frontend/src/components/dashboard/data-freshness-card.tsx`) are verified separately across runtime environments:

1. **Separation of Environments**:
   - **Local Docker Environment**: With `SCHEDULER_ENABLED=true`, the backend initializes `WindIQScheduler`, acquiring a PostgreSQL advisory lock. The card reflects runtime truth: `Background Scheduler Active`, Ingestion Engine `Active Polling`, and `Leader Lock`.
   - **Public Cloud / Demonstration Environment**: With `SCHEDULER_ENABLED=false` (to preserve free-tier compute quotas), the backend reports `enabled: false, status: "DISABLED"`. The card reflects runtime truth: `Scheduler Disabled — Cloud Demo Mode` with Ingestion Engine `Static Benchmark Mode`.
   - **Strict Guarantee**: The condition `isSchedulerActive = Boolean(scheduler?.enabled) && scheduler?.status === 'RUNNING'` prevents any disabled or paused scheduler from ever being displayed as active.
2. **Standardized Ingestion Terminology**:
   - Card title: `Data Freshness`.
   - Section header: `Latest Successful Ingestion`.
   - Outturn tile: `FUELHH Readings` (half-hourly outturn readings).
   - Ingestion explanation: Explicit reference to the canonical January 2026 `Forecast Accuracy` benchmark dataset.
3. **Dynamic Data Age**:
   - Dynamic elapsed time (`formatDataAge`) calculated directly from `datasetHealth.last_successful_ingestion_utc` (e.g. `Data Age: Xm ago` or `Xd ago`).

---

### 3.9 Design System Alignment Across /accuracy and /forecasts

To establish complete design cohesion across the platform matching the refined Executive Overview:

1. **Forecast Accuracy (`/accuracy`)**:
   - **Toolbar & Filter Header**: Styled with institutional container (`#111C2D` / `#26364A`), active window badge, Europe/London hour-of-day selector (`#0B1220` / `#26364A`), evaluation status filter, and Export CSV button (`#162337` / `#26364A`).
   - **Workstation Tabs**: 4 views (`1. Hourly Timeline & Evaluations`, `2. 24-Hour Diurnal Pattern`, `3. Error Distribution & Quantiles`, `4. Daily Performance Ledger`) styled as segmented controls (`#0B1220` container with active pill in `#162337` / `#35B9C8`).
   - **Evaluations Table (`HourlyEvaluationsTable`)**: Clean `#111C2D` panel with `#162337` header, monospace tabular numbers, hover highlight (`#162337/70`), explicit status badges (`VALID`, `MISSING_FORECAST`, `MISSING_ACTUAL`), and institutional `Audit Lineage` button (`#162337` / `#26364A` / `#35B9C8`).
   - **Daily Ledger (`DailyAccuracyLedger`)**: Restyled performance extremes and summary cards with restrained semantic accents (Best MAE `#35B98A`, Worst MAE `#E36D73`, Best MAPE `#35B9C8`, Worst MAPE `#E7AD4A`).
   - **Audit Modal (`AuditLineageModal`)**: Frosted backdrop (`#0B1220/80 backdrop-blur-sm`), dialog card (`#111C2D` / `#26364A`), and 3-step settlement verification proof boxes (`#162337` / `#26364A`).

2. **Forecast Explorer (`/forecasts`)**:
   - **Header & Title Card**: Consistent analytical heading with `#111C2D` card background, compass icon badge in `#162337` / `#35B9C8`, and evaluation window badge.
   - **Unified Toolbar (`ForecastToolbar`)**: Matching segmented workstation tab controls, delivery hour selector with monospace timestamps, population mode toggles, and min swing filter.
   - **Publication Trajectory (`PublicationTrajectoryChart`)**: 4 KPI cards row (`Selected D-1 Forecast` in `#35B9C8` with `09:00 Cutoff` badge, `Actual Generation` in `#E7EDF5` with `2 x FUELHH` badge, `Day-Ahead Error` with `Overforecast` / `Underforecast` semantic pill, `Publication Versions` with direct `Audit Lineage` action).
   - **Publication Lifecycle Ledger (`PublicationHistoryTable`)**: Clean `#111C2D` table with selected D-1 row highlighted in `#162337` with `#35B9C8` left border accent, `ELIGIBLE` (`#133829` / `#35B98A`) and `POST-CUTOFF` (`#162337` / `#718198`) badges, and `D-1 WINNER` badge (`#0E2833` / `#35B9C8`).
   - **Multi-Horizon Error Convergence (`MultiHorizonChart`)**: Restyled convergence banner with `#162337` MAE reduction card (`34.16%` in `#35B98A`, `−835.70 MW`), ComposedChart dual-axis canvas, and 6 horizon bucket cards (`#111C2D` / `#26364A`).
   - **Settlement Trace Modal (`PublicationTraceModal`)**: Dialog aligned with `#0B1220/80` backdrop, `#111C2D` container, and `#162337` step boxes.

---

## 4. Visual Artifacts Catalog

High-resolution screenshots were re-captured from the active runtime and saved to `docs/screenshots/`:

| Screenshot File | Description | Dimensions |
|---|---|---|
| `dashboard_executive_overview_viewport.png` | Executive Overview primary viewport (KPI grid, generation baseline, direction analysis) | 1440 × 900 |
| `dashboard_executive_overview_full.png` | Complete Executive Overview page including daily trend charts and extremes | 1440 × 2650 |
| `accuracy_view1_timeline.png` | Forecast Accuracy View 1: Filters, hourly evaluations table, and pagination | 1440 × 900 |
| `accuracy_view1_lineage_modal.png` | Settlement Lineage & Audit Modal: 3-step mathematical proof and Elexon BMRS readings | 1440 × 900 |
| `accuracy_view2_diurnal.png` | Forecast Accuracy View 2: 24-hour diurnal error cycle and hourly generation match | 1440 × 900 |
| `accuracy_view3_distribution.png` | Forecast Accuracy View 3: Quantiles (P50/P75/P90/P95), critical breaches, and 500 MW histogram | 1440 × 900 |
| `accuracy_view4_daily_ledger.png` | Forecast Accuracy View 4: Full 31-day accounting ledger and extremes | 1440 × 900 |
| `forecast_view1_trajectory.png` | Forecast Explorer View 1: WINDFOR publication cycle evolution, step-line trajectory, and ledger | 1440 × 900 |
| `forecast_view2_multi_horizon.png` | Forecast Explorer View 2: 6-horizon error convergence (553h matched, 34.16% MAE reduction) | 1440 × 900 |
| `dashboard_mobile_390.png` | Mobile responsive rendering (390px viewport width) demonstrating clean layout adaptation | 390 × 844 |

---

## 5. Verification & Test Suite Summary

Every validation check executed cleanly:

1. **TypeScript Typecheck**:
   ```bash
   npm --prefix frontend run typecheck
   # Output: tsc --noEmit (0 errors)
   ```

2. **Linter (oxlint)**:
   ```bash
   npm --prefix frontend run lint
   # Output: 0 errors (79 files audited)
   ```

3. **Frontend Test Suite (Vitest)**:
   ```bash
   npm --prefix frontend test
   # Test Files: 13 passed (13)
   # Tests:      48 passed (48)
   # Duration:   21.36s
   ```

4. **Production Bundle Build (Vite)**:
   ```bash
   npm --prefix frontend run build
   # Output: Built in 5.22s with optimized vendor chunks (0 errors)
   ```

5. **RBAC & Security Audit Script**:
   ```bash
   python backend/scripts/audit_rbac_security.py
   # Output: ALL RBAC SECURITY PERMISSION CHECKS PASSED (100% VERIFIED)
   ```

6. **Canonical Benchmark Verification (744 Hours)**:
   - Valid Comparisons: `744`
   - Fleet Mean Absolute Error (MAE): `2,038.9126 MW`
   - Root Mean Squared Error (RMSE): `2,504.7587 MW`
   - Mean Absolute Percentage Error (MAPE): `22.0446%`
   - Signed Forecast Bias: `+1,747.8871 MW`
   - Overforecast / Underforecast: `632 : 112 hrs` (84.9% vs 15.1%)
   - Strictly Matched Horizon Hours: `553 hrs`
   - Multi-Horizon MAE Reduction: `34.16%` (−835.70 MW from Medium-Range to Very Short)
   - Forward Revision Population: `13,367`

---

## 6. Remaining Limitations & Operating Boundaries

1. **Free-Tier Cold Starts**: Render web services spin down after 15 minutes of inactivity; initial browser requests may take 40–50s while the container boots. TopNav displays `Checking` followed by live response time once active.
2. **Session Pooler Latency**: Supabase free-tier connection pooler operates over external cloud regions; query latency ranges from 80ms to 400ms depending on client geography.
3. **Static Benchmark Ingestion**: Automated APScheduler ingestion is deliberately disabled (`SCHEDULER_ENABLED=false`) to protect free-tier compute quotas. Serving verified canonical January 2026 data.
