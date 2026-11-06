# WindIQ — UK Wind Generation Intelligence & Forecast Accuracy Platform

**WindIQ** is an enterprise analytics and day-ahead forecast accuracy intelligence platform evaluating national wind generation across Great Britain using Elexon BMRS API data (`WINDFOR` and `FUELHH`).

Built for electricity utility trading, power generation scheduling, and energy risk management desks.

---

## Architecture & Technology Stack

* **Backend**: Python 3.12+, FastAPI, SQLAlchemy 2.0 Async, PostgreSQL 16+, Alembic, Pydantic v2.
* **Frontend**: React 19, TypeScript, Vite 8, Tailwind CSS, Recharts, Lucide React, TanStack Query.
* **Infrastructure**: Multi-stage Docker builds, Nginx Alpine, Docker Compose.
* **Market Rules**: Strict **09:00 Europe/London decision cutoff** for day-ahead market evaluations.

---

## Quickstart with Docker Compose

To boot the entire full-stack system (PostgreSQL + FastAPI Backend + React Frontend):

```bash
# 1. Clone repository and copy environment defaults
cp .env.example .env

# 2. Build and start all three containers
docker compose up -d --build

# 3. Check container status
docker compose ps
```

### Services & Endpoints
* **Web Application**: [http://localhost:3000](http://localhost:3000)
* **API Documentation (Swagger UI)**: [http://localhost:8001/docs](http://localhost:8001/docs)
* **Backend Health Check**: [http://localhost:8001/health/live](http://localhost:8001/health/live)
* **Frontend Health Check**: [http://localhost:3000/health](http://localhost:3000/health)

---

## Local Frontend Development

```bash
cd frontend

# Install dependencies
npm install

# Start Vite dev server on port 3000
npm run dev

# Run TypeScript type check
npm run typecheck

# Run linter
npm run lint

# Run unit & integration test suite
npm test

# Build production bundle
npm run build
```

---

## Verified January 2026 Analytical Benchmark

The platform reconciles 100% against the verified 744-hour January 2026 benchmark:

| Metric | Benchmark Value |
|---|---:|
| **Evaluated Hours** | 744 hrs |
| **Forecast Coverage** | 100.0% |
| **Actual Completeness** | 100.0% |
| **Mean Absolute Error (MAE)** | 2,038.9126 MW |
| **Root Mean Square Error (RMSE)** | 2,504.7587 MW |
| **Mean Absolute Percentage Error (MAPE)** | 22.0446% |
| **Forecast Bias** | +1,747.8871 MW |
| **Overforecast Hours** | 632 hrs (84.9%) |
| **Underforecast Hours** | 112 hrs (15.1%) |
| **Zero Error Hours** | 0 hrs |

---

## Documentation & Deployment

* [Zero-Cost Cloud Deployment Guide (Vercel + Render + Supabase + Upstash)](docs/free_cloud_deployment_guide.md)
* [Render Production Deployment Guide](docs/render_deployment_guide.md)
* [Final Release Candidate Audit Report](docs/final_release_candidate_audit.md)
* [Phase 3.1 Frontend Foundation & Overview Report](docs/phase_3_1_frontend_foundation_and_overview.md)
* [Backend Architecture Design](docs/backend_architecture.md)
* [Database Schema Specification](docs/database_schema.md)
* [API Contract Specification](docs/api_contract.md)
* [Automated Ingestion & Orchestration Specification](docs/phase_2_5_automated_ingestion_and_orchestration.md)

