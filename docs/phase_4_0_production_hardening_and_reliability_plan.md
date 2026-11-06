# WindIQ Phase 4.0 — Production Hardening, Operational Reliability & Platform Security
## Authoritative Engineering Specification & Corrected Architectural Blueprint

**Platform**: WindIQ — UK Wind Generation Intelligence & Forecast Accuracy Platform  
**Target Milestone**: Phase 4.0 (Production Hardening & Operational Reliability)  
**Status**: APPROVED SPECIFICATION (Fully Corrected & Aligned with Codebase Schema and Routes)  
**Author**: Senior Software Architect, Security Engineer & Reliability Architect  

---

## 1. Architectural Guardrails & Core Corrections

```
+----------------------------------------------------------------------------------------------------+
|                                WindIQ Phase 4.0 Verified Pillars                                   |
+--------------------------+--------------------------+----------------------------------------------+
| 1. AuthN & AuthZ (RBAC)  | 2. API Security & Limits | 3. Observability & Alerting                  |
| - Refresh family reuse   | - Shared Redis store     | - Low-cardinality Prometheus labels          |
| - Pre-commit theft log   | - Fail-closed on Redis down- PromQL histogram quantiles                 |
| - In-memory access token | - Trusted proxy CIDR     | - DB pool checkout wait metrics              |
| - Real registered routes | - Concrete CSRF token    | - Ingestion lag & quality metrics            |
+--------------------------+--------------------------+----------------------------------------------+
| 4. Dual Backup & PITR    | 5. Pool Sizing & Load    | 6. Topology & Runbooks                       |
| - Daily pg_dump logical  | - Measured async pool    | - Dual-replica application topology          |
| - pgBackRest base + WAL  | - Provisional SLO stats  | - Graceful SIGTERM connection draining       |
| - RPO <= 5m, RTO <= 30m  | - EXPLAIN (BUFFERS) plan | - Expand-contract Alembic migrations         |
| - 744h population cert   | - 50 CCU sustained tests | - Rollback and incident runbooks             |
+--------------------------+--------------------------+----------------------------------------------+
```

### Core Architecture Principles:
1. **Dual-Replica Application Topology**: Two backend instances behind one Nginx reverse proxy and one PostgreSQL primary constitute an application-level dual replica, protecting against backend process failure. (Full infrastructure HA requires database primary-standby replication and multi-host ingress).
2. **Dual Backup & Real PITR Policy**:
   - **RPO (Recovery Point Objective)**: $\le 5$ minutes of transactions.
   - **RTO (Recovery Time Objective)**: $\le 30$ minutes.
   - **Retention Window**: 14 days of archived WAL, 30 days of physical base backups.
   - **Archive Failure Alert**: Triggered if WAL archive lag exceeds 10 minutes or continuous archive push fails.
   - **Restore Certification Barrier**: Restores ephemeral instance; asserts schema migration at HEAD, 4-table completeness, and strictly **744 evaluated January records** matching baseline ground truth (MAE: 2,038.9126 MW).
3. **Distributed Shared Rate Limiter & Failure Policy**: Shared Redis 7 store (`windiq-redis:6379`). If Redis is unavailable, sensitive endpoints (login, key management, heavy analytical routes) **fail-closed** rather than silently falling back to independent in-memory limiters that multiply client quotas. Client IP extraction rejects arbitrary `X-Forwarded-For`, trusting only explicit upstream reverse proxy CIDRs.
4. **Complete Refresh Token Security Model**: Token family tracking (`family_id`), atomic rotation with row-level locks, **mandatory database commit before raising HTTP 401 on theft detection**, client-side single-flight refresh synchronization, and signed double-submit CSRF cookie protection.
5. **Measured SQLAlchemy Pool Strategy**: Retains SQLAlchemy async sessions. Instruments connection checkout wait durations, pool overflow, and checked-out connections using engine event listeners.
6. **Low-Cardinality Prometheus Observability**: Exposes raw bucket counters and summary statistics. No `user_id`, `request_id`, dynamic timestamps, or API keys in metric labels. High-cardinality details are restricted to structured JSON logs.
7. **Provisional Endpoint Performance SLOs**: Latency targets are evaluated separately by query profile and treated as provisional SLO candidates measured under sustained load, burst spikes, long-running queries, and concurrent ingestion.
8. **Accurate Route & Database Schema Alignment**: Explicitly binds permissions to actual registered routes (`/api/v1/accuracy/hourly`, `/api/v1/forecasts/revisions`, `/api/v1/overview`, etc.) and database models (`raw_actual_records`, `hourly_actuals`, `raw_forecast_records`, `forecast_evaluations`).

---

## Pillar 1: Authentication, RBAC & Token Lifecycle (Phase 4.1 Focus)

### 1.1 Centralized Authorization Architecture
Authentication and permission enforcement occur strictly at the API routing boundary via centralized FastAPI dependencies. Individual business endpoints contain zero ad-hoc role check logic.

```
                Incoming Request (HTTP / WebSocket)
                               │
                               ▼
        ┌──────────────────────────────────────────────┐
        │        Centralized Auth Dependency           │
        │        `get_current_principal`               │
        └──────────────────────┬───────────────────────┘
                               │
               ┌───────────────┴───────────────┐
               ▼                               ▼
    [Authorization Header]           [Session Cookie]
    Bearer wnd_live_<32-hex>         HttpOnly refreshToken
    or Bearer <JWT>                            │
               │                               ▼
               │                     [POST /api/v1/auth/refresh]
               │                     • Validate Origin & CSRF
               │                     • Verify token family & jti
               │                     • Atomic lock (FOR UPDATE)
               │                     • On reuse: REVOKE & COMMIT, then 401
               │                     • Issue fresh token pair
               ▼                               │
    [Validate Signature / Hash]                │
    • API Key: SHA-256 digest lookup           │
    • JWT: Verify exp, alg, jti, iss, aud      │
    • Instant DB User Status Verification      │
               │                               │
               └───────────────┬───────────────┘
                               ▼
               ┌───────────────────────────────┐
               │    Principal Context Object   │
               │  • user_id / key_id           │
               │  • role (Viewer/Analyst/Admin)│
               │  • scopes: set[str]           │
               └───────────────┬───────────────┘
                               ▼
        ┌──────────────────────────────────────────────┐
        │         Centralized Permission Check         │
        │         `require_permission(perm)`           │
        │    e.g. `accuracy:hourly` -> 403 Forbidden   │
        └──────────────────────┬───────────────────────┘
                               ▼
               Target Route Handler Executes
```

### 1.2 Canonical Registered Route Authorization Table
WindIQ enforces permissions mapped directly to actual registered routes in `backend/app/api/v1/`:

| Actual Registered Route | Method | Required Permission | Viewer | Analyst | Admin | Programmatic Scope |
| :--- | :---: | :--- | :---: | :---: | :---: | :--- |
| `/` | `GET` | *Public* | Allowed | Allowed | Allowed | *None* |
| `/health/live` | `GET` | *Public* | Allowed | Allowed | Allowed | *None* |
| `/health/ready` | `GET` | *Public* | Allowed | Allowed | Allowed | *None* |
| `/api/v1/status` | `GET` | *Public* | Allowed | Allowed | Allowed | *None* |
| `/api/v1/auth/login` | `POST` | *Public (Throttled)* | Allowed | Allowed | Allowed | *None* |
| `/api/v1/auth/refresh` | `POST` | *Public (CSRF+Cookie)*| Allowed | Allowed | Allowed | *None* |
| `/api/v1/auth/logout` | `POST` | `auth:logout` | Allowed | Allowed | Allowed | *None* |
| `/api/v1/auth/me` | `GET` | `auth:me` | Allowed | Allowed | Allowed | `read:profile` |
| `/api/v1/overview` | `GET` | `overview:read` | Allowed | Allowed | Allowed | `read:overview` |
| `/api/v1/accuracy/summary` | `GET` | `accuracy:read` | Allowed | Allowed | Allowed | `read:accuracy` |
| `/api/v1/accuracy/daily` | `GET` | `accuracy:read` | Allowed | Allowed | Allowed | `read:accuracy` |
| `/api/v1/data-health` | `GET` | `health:read` | Allowed | Allowed | Allowed | `read:health` |
| `/api/v1/forecasts` | `GET` | `forecasts:read` | Allowed | Allowed | Allowed | `read:forecasts` |
| `/api/v1/forecasts/horizons` | `GET` | `forecasts:read` | Allowed | Allowed | Allowed | `read:forecasts` |
| `/api/v1/accuracy/hourly` | `GET` | `accuracy:hourly` | **403** | Allowed | Allowed | `read:accuracy_hourly` |
| `/api/v1/forecasts/publications/{delivery_hour_utc}` | `GET` | `forecasts:publications` | **403** | Allowed | Allowed | `read:forecast_publications` |
| `/api/v1/forecasts/revisions` | `GET` | `forecasts:revisions` | **403** | Allowed | Allowed | `read:forecast_revisions` |
| `/api/v1/auth/keys` | `POST` | `auth:manage_keys` | **403** | **403** | Allowed | `admin:keys` |
| `/api/v1/auth/keys` | `GET` | `auth:manage_keys` | **403** | **403** | Allowed | `admin:keys` |
| `/api/v1/auth/keys/{id}` | `DELETE`| `auth:manage_keys` | **403** | **403** | Allowed | `admin:keys` |

---

## Pillar 2: Distributed API Security, Rate Limiting & Secrets (Phase 4.2 — COMPLETED & VERIFIED)

### 2.1 Shared Redis Rate Limiting & Fail-Closed Policy
- **Coordinated Storage:** Shared Redis 7 coordination container (`windiq-redis:6379`, `redis:7.2.4-alpine`, bounded to 128MB, `volatile-lru`).
- **Atomic Sliding-Window Counter:** Implemented via Redis Lua script utilizing `redis.call('TIME')` to prevent multi-instance race conditions and clock drift.
- **Role-Based Tier Quotas & Heavy Route Overrides:**
  - Anonymous: 30 RPM | Viewer: 120 RPM | Analyst: 300 RPM | Admin / API Key: 1,200 RPM.
  - Heavy route overrides: `/auth/login` (10 RPM), `/auth/refresh` (30 RPM), `/auth/logout` (30 RPM), `/auth/keys` (10 RPM), `/forecasts/revisions` (30 RPM), `/accuracy/hourly` & `/forecasts/horizons` (60 RPM).
- **Fail-Closed Failure Policy:**
  - Sensitive endpoints (`/api/v1/auth/login`, `/api/v1/auth/refresh`, `/api/v1/auth/logout`, `/api/v1/auth/keys`, `/api/v1/forecasts/revisions`) strictly **fail-closed** (`HTTP 503 Service Unavailable`) within <5ms during Redis outages.
  - Read-only low-cost dashboard routes (`/api/v1/overview`, `/api/v1/accuracy/summary`) fail-open with warnings.
- **Trusted Proxy IP Resolution:**
  - Client IP resolved strictly via right-to-left traversal of `X-Forwarded-For` across configured CIDR blocks (`TRUSTED_PROXIES`).
  - Untrusted direct connections completely ignore spoofed proxy headers and bind directly to `request.client.host`.
- **Production Hardening:**
  - Startup rejection of weak JWT secrets (<32 chars or dev defaults), default passwords (`postgres:postgres`, `windiq_redis_dev_secret_pass`), wildcard CORS (`*`), wildcard trusted proxies (`0.0.0.0/0`), and `DEBUG=True`.
  - Security response headers attached (`nosniff`, `DENY`, `strict-origin-when-cross-origin`, CSP, Permissions-Policy).
  - Health/readiness probes split: `/health/live` (worker alive), `/health/ready` (checks DB and Redis pool).
- **Verification Sign-Off:** Certified via 30/30 automated tests in `tests/test_phase_4_2_api_security.py` and live container tests in `verify_phase_4_2_runtime.py`. See `docs/phase_4_2_api_security_and_redis.md`.

---

## Pillar 3: Low-Cardinality Observability & Prometheus Metrics (Phase 4.3 Focus)

### 3.1 Strict Metric Cardinality & PromQL Quantiles
- **Permitted Metric Labels**: `method` (GET, POST), `route` (parameterized route template, e.g. `/api/v1/forecasts/publications/{delivery_hour_utc}`), `status_code` (200, 401, 403, 404, 500).
- **Prohibited Labels**: Zero `user_id`, `request_id`, delivery hour timestamps, or API key prefixes in metric labels.
- **PromQL Quantiles**: P50, P95, and P99 are evaluated dynamically via Prometheus `histogram_quantile(0.95, sum(rate(windiq_http_request_duration_seconds_bucket[5m])) by (le, route))`.

---

## Pillar 4: Dual Backup Architecture, PITR Policy & Restore Certification (Phase 4.4 Focus)

### 4.1 PITR Policy & SLA Guarantees
- **RPO**: $\le 5$ minutes of transactions.
- **RTO**: $\le 30$ minutes to restored state.
- **WAL Archiving**: Continuous archive streaming via `pgBackRest` (`archive_timeout = 300s`).
- **Retention**: 14 days of WAL continuous history, 30 days of physical base backups, daily `pg_dump -Fc` snapshots.
- **Archive Monitoring Alert**: Triggers alert if unarchived WAL segments accumulate for $> 10$ minutes.

### 4.2 4-Point Restore Certification Barrier
Automated nightly harness test restores physical and logical backups to an ephemeral container (port 5439) and verifies:
1. `alembic_version` matches repo HEAD.
2. 4 core tables non-empty: `raw_actual_records` ($\ge 1,488$), `hourly_actuals` ($\ge 744$), `raw_forecast_records` ($\ge 14,111$), `forecast_evaluations` ($\ge 744$).
3. **Exact January 2026 Evaluation Population**: strictly **744 evaluated hours** matching canonical baseline:
   - MAE: strictly **2,038.9126 MW**
   - RMSE: strictly **2,504.7587 MW**
   - Bias: strictly **+1,747.8871 MW**
4. Foreign key constraint validation (`chk_hourly_actuals_distinct_readings`, `uq_forecast_eval_delivery_config`).

---

## Pillar 5: Measurement-Driven Pool Sizing & Provisional SLOs (Phase 4.5 Focus)

### 5.1 Provisional Endpoint SLO Candidates
Performance targets are treated as provisional SLO candidates to be measured empirically:

| Actual Registered Route | Query Mechanism | Candidate P50 | Candidate P95 | Candidate P99 | Error SLA |
| :--- | :--- | :---: | :---: | :---: | :---: |
| `GET /health/live` | In-memory status check | $< 5\text{ms}$ | $< 15\text{ms}$ | $< 30\text{ms}$ | $0.00\%$ |
| `GET /api/v1/overview` | Aggregated KPI cache/row | $< 20\text{ms}$ | $< 60\text{ms}$ | $< 120\text{ms}$ | $0.00\%$ |
| `GET /api/v1/accuracy/hourly` | Paginated indexed window (50 rows) | $< 30\text{ms}$ | $< 100\text{ms}$ | $< 200\text{ms}$ | $0.00\%$ |
| `GET /api/v1/forecasts/publications/{hour}`| Delivery hour join (19 cycles) | $< 25\text{ms}$ | $< 80\text{ms}$ | $< 150\text{ms}$ | $0.00\%$ |
| `GET /api/v1/forecasts/horizons` | Window function over 553 hours | $< 50\text{ms}$ | $< 200\text{ms}$ | $< 400\text{ms}$ | $0.00\%$ |
| `GET /api/v1/forecasts/revisions` | 13,367 lead-time transitions | $< 80\text{ms}$ | $< 300\text{ms}$ | $< 600\text{ms}$ | $0.00\%$ |

### 5.2 Load Testing Reporting Requirements
Every load test run records: request count, test duration, P50/P95/P99 latency, error rate, pool checkout wait duration, query execution duration, container CPU/memory utilization, and concurrent ingestion impact.

---

## Pillar 6: Dual-Replica Topology & Operational Runbooks (Phase 4.6 Focus)

### 6.1 Dual-Replica Application Topology
- Two backend container replicas (`backend-1:8001`, `backend-2:8002`) behind Nginx reverse proxy.
- Provides process-level redundancy and enables zero-downtime rolling updates.
- Draining sequence: Nginx marks replica draining $\rightarrow$ waits for in-flight requests to complete $\rightarrow$ sends `SIGTERM` $\rightarrow$ container finishes active queries within 30s timeout $\rightarrow$ restarts with updated image.
