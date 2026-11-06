# ============================================================================
# WindIQ Backend Multi-Stage Dockerfile (Phase 2.1)
# ============================================================================

# Stage 1: Dependency Builder
FROM python:3.12-slim AS builder

WORKDIR /build

# Install build dependencies if needed for C-extensions
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

# Stage 2: Production Runtime
FROM python:3.12-slim AS runner

# Create non-root system user and group
RUN groupadd -r windiq && useradd -r -g windiq -d /app -s /sbin/nologin windiq

# Runtime system library for libpq
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy python packages from builder
COPY --from=builder /install /usr/local

# Copy application source code, migrations, scripts, and data
COPY --chown=windiq:windiq app/ /app/app/
COPY --chown=windiq:windiq migrations/ /app/migrations/
COPY --chown=windiq:windiq scripts/ /app/scripts/
COPY --chown=windiq:windiq data/ /app/data/
COPY --chown=windiq:windiq alembic.ini /app/

# Create data directories and ensure non-root user permissions
RUN mkdir -p /app/data/raw/cache && chown -R windiq:windiq /app

# Environment settings
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONPATH=/app \
    PORT=8000

USER windiq

EXPOSE 8000

# Native Python healthcheck (zero external curl/wget dependencies)
HEALTHCHECK --interval=15s --timeout=5s --start-period=5s --retries=3 \
    CMD python -c "import urllib.request, sys; sys.exit(0 if urllib.request.urlopen('http://localhost:8000/health/live', timeout=3).getcode() == 200 else 1)"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

