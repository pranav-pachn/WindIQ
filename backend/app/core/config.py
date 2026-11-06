"""Application configuration management using Pydantic Settings."""

import ipaddress
import json
from functools import lru_cache
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Central application settings with environment variable resolution and validation."""

    APP_NAME: str = Field(default="WindIQ API", description="Name of the application service")
    APP_ENV: str = Field(
        default="development",
        description="Deployment environment (development, staging, production, test)",
    )
    DEBUG: bool = Field(default=False, description="Debug mode toggle; must be False in production")
    API_V1_PREFIX: str = Field(default="/api/v1", description="URL route prefix for Version 1 API")
    DATABASE_URL: str = Field(
        default="postgresql+asyncpg://postgres:postgres@localhost:5432/windiq",
        description="Async PostgreSQL connection string",
    )
    DB_POOL_SIZE: int = Field(default=5, ge=1, le=50, description="Database connection pool size")
    DB_MAX_OVERFLOW: int = Field(default=10, ge=0, le=50, description="Database connection pool max overflow")
    DB_POOL_TIMEOUT: float = Field(default=30.0, ge=1.0, description="Database connection acquisition timeout")
    DB_POOL_RECYCLE: int = Field(default=300, ge=60, description="Database connection recycling interval in seconds")
    DB_DISABLE_STATEMENT_CACHE: bool = Field(default=False, description="Disable asyncpg statement cache for transaction poolers")
    LOG_LEVEL: str = Field(default="INFO", description="Application log level")
    CORS_ORIGINS: list[str] = Field(
        default=["http://localhost:3000", "http://localhost:8000"],
        description="Allowed CORS origin domains",
    )
    TIMEZONE: str = Field(
        default="Europe/London",
        description="Decision and aggregation timezone (IANA format)",
    )
    DECISION_CUTOFF_HOUR: int = Field(
        default=9,
        ge=0,
        le=23,
        description="Hour of day for day-ahead forecast cutoff (0-23)",
    )
    DECISION_CUTOFF_MINUTE: int = Field(
        default=0,
        ge=0,
        le=59,
        description="Minute of hour for day-ahead forecast cutoff (0-59)",
    )
    BMRS_BASE_URL: str = Field(
        default="https://data.elexon.co.uk/bmrs/api/v1",
        description="Base URL for Elexon BMRS API",
    )
    BMRS_WINDFOR_URL: str = Field(
        default="https://data.elexon.co.uk/bmrs/api/v1/datasets/WINDFOR/stream",
        description="Stream endpoint for WINDFOR forecast dataset",
    )
    BMRS_FUELHH_URL: str = Field(
        default="https://data.elexon.co.uk/bmrs/api/v1/datasets/FUELHH/stream",
        description="Stream endpoint for FUELHH actual generation dataset",
    )
    BMRS_TIMEOUT_SECONDS: float = Field(
        default=30.0,
        ge=1.0,
        description="Read and request timeout in seconds for BMRS API calls",
    )
    BMRS_CONNECT_TIMEOUT_SECONDS: float = Field(
        default=10.0,
        ge=1.0,
        description="Connection timeout in seconds for BMRS API calls",
    )
    BMRS_MAX_RETRIES: int = Field(
        default=4,
        ge=0,
        le=10,
        description="Maximum retry attempts on transient network or HTTP failures",
    )
    BMRS_BACKOFF_FACTOR: float = Field(
        default=1.5,
        ge=1.0,
        description="Exponential backoff multiplication factor",
    )
    BMRS_JITTER_MAX: float = Field(
        default=0.5,
        ge=0.0,
        description="Maximum random jitter in seconds added to retry delays",
    )
    RAW_CACHE_DIR: str = Field(
        default="data/raw/cache",
        description="Directory for caching raw API payloads",
    )
    RAW_DATA_DIR: str = Field(
        default="data/raw",
        description="Directory for raw ingested datasets",
    )
    SCHEDULER_ENABLED: bool = Field(
        default=True,
        description="Whether automated background ingestion & evaluation scheduler is active",
    )
    WINDFOR_POLL_INTERVAL_MINUTES: int = Field(
        default=30,
        ge=1,
        le=1440,
        description="Interval in minutes between WINDFOR forecast polling executions",
    )
    FUELHH_POLL_INTERVAL_MINUTES: int = Field(
        default=15,
        ge=1,
        le=1440,
        description="Interval in minutes between FUELHH actual settlement polling executions",
    )
    EVALUATION_POLL_INTERVAL_MINUTES: int = Field(
        default=15,
        ge=1,
        le=1440,
        description="Interval in minutes between day-ahead evaluation orchestration checks",
    )
    WINDFOR_POLL_HORIZON_DAYS: int = Field(
        default=2,
        ge=1,
        le=30,
        description="Rolling calendar horizon in days for WINDFOR forecast recovery",
    )
    FUELHH_POLL_HORIZON_DAYS: int = Field(
        default=2,
        ge=1,
        le=30,
        description="Rolling calendar horizon in days for FUELHH actuals recovery",
    )
    SCHEDULER_LOCK_ID: int = Field(
        default=24566378415277825,
        description="PostgreSQL 64-bit advisory lock identifier for cluster leader election",
    )
    JWT_SECRET_KEY: str = Field(
        default="windiq_super_secret_jwt_signing_key_for_development_purposes_only_32bytes",
        min_length=32,
        description="Secret key for signing HMAC-SHA256 JWT access tokens",
    )
    JWT_ALGORITHM: str = Field(
        default="HS256",
        description="Pinned cryptographic algorithm for JWT signing",
    )
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = Field(
        default=15,
        ge=1,
        description="Access token lifespan in minutes",
    )
    JWT_REFRESH_TOKEN_EXPIRE_DAYS: int = Field(
        default=7,
        ge=1,
        description="Refresh token lifespan in days",
    )
    JWT_ISSUER: str = Field(
        default="windiq-api",
        description="Pinned token issuer",
    )
    JWT_AUDIENCE: str = Field(
        default="windiq-client",
        description="Pinned token audience",
    )
    AUTH_COOKIE_SECURE: bool = Field(
        default=False,
        description="Enforce Secure flag on authentication cookies (must be True in prod with TLS)",
    )
    AUTH_COOKIE_SAMESITE: str = Field(
        default="lax",
        description="SameSite cookie policy (lax in dev, strict in prod)",
    )
    AUTH_ENFORCE: bool = Field(
        default=True,
        description="Whether RBAC route authentication is enforced",
    )
    # Redis 7 Distributed Coordination Store
    REDIS_URL: str = Field(
        default="redis://:windiq_redis_dev_secret_pass@localhost:6379/0",
        description="Redis connection URL for distributed rate limiting",
    )
    REDIS_PASSWORD: str = Field(
        default="windiq_redis_dev_secret_pass",
        description="Shared Redis authentication password",
    )
    REDIS_CONNECT_TIMEOUT_SECONDS: float = Field(
        default=2.0,
        ge=0.5,
        description="Connection timeout for Redis pool (seconds)",
    )
    REDIS_SOCKET_TIMEOUT_SECONDS: float = Field(
        default=2.0,
        ge=0.5,
        description="Socket read/write timeout for Redis commands (seconds)",
    )
    REDIS_MAX_CONNECTIONS: int = Field(
        default=20,
        ge=1,
        le=100,
        description="Maximum Redis connection pool size for distributed rate limiting",
    )
    # Distributed Rate Limiting & Fail-Closed Policies
    RATE_LIMIT_ENABLED: bool = Field(
        default=True,
        description="Whether distributed rate limiting is enforced",
    )
    RATE_LIMIT_FAIL_CLOSED_DEFAULT: bool = Field(
        default=False,
        description="Default outage policy for non-sensitive routes (sensitive routes always fail closed)",
    )
    # Baseline Quotas (requests per minute)
    RATE_LIMIT_ANONYMOUS_RPM: int = Field(default=30, ge=1, description="Anonymous IP quota (req/min)")
    RATE_LIMIT_VIEWER_RPM: int = Field(default=120, ge=1, description="Viewer role quota (req/min)")
    RATE_LIMIT_ANALYST_RPM: int = Field(default=300, ge=1, description="Analyst role quota (req/min)")
    RATE_LIMIT_ADMIN_RPM: int = Field(default=1200, ge=1, description="Admin role & internal key quota (req/min)")
    # Heavy & Sensitive Operation Quota Overrides (requests per minute)
    RATE_LIMIT_LOGIN_RPM: int = Field(default=10, ge=1, description="Login attempts quota (req/min)")
    RATE_LIMIT_REFRESH_RPM: int = Field(default=30, ge=1, description="Session refresh quota (req/min)")
    RATE_LIMIT_KEYS_RPM: int = Field(default=10, ge=1, description="API key creation/revocation quota (req/min)")
    RATE_LIMIT_HEAVY_ANALYTICS_RPM: int = Field(default=60, ge=1, description="Granular hourly & horizon queries quota (req/min)")
    RATE_LIMIT_REVISIONS_RPM: int = Field(default=30, ge=1, description="Revision analytics queries quota (req/min)")
    # Ingress Trusted Proxy Security
    TRUSTED_PROXIES: list[str] = Field(
        default=["127.0.0.1/32", "::1/128", "172.16.0.0/12", "10.0.0.0/8"],
        description="Configured IPv4 and IPv6 CIDR blocks permitted to supply forwarded headers",
    )

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
        hide_input_in_errors=True,
    )

    @field_validator("DATABASE_URL", mode="before")
    @classmethod
    def assemble_database_url(cls, v: str) -> str:
        """Convert standard postgres:// or postgresql:// schemes to postgresql+asyncpg://."""
        if isinstance(v, str):
            v_stripped = v.strip()
            if v_stripped.startswith("postgres://"):
                return v_stripped.replace("postgres://", "postgresql+asyncpg://", 1)
            elif v_stripped.startswith("postgresql://") and not v_stripped.startswith("postgresql+asyncpg://"):
                return v_stripped.replace("postgresql://", "postgresql+asyncpg://", 1)
            return v_stripped
        return v

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v: str | list[str]) -> list[str]:
        """Support comma-separated string, JSON string, or list format for CORS origins."""
        if isinstance(v, str):
            v_stripped = v.strip()
            if v_stripped.startswith("[") and v_stripped.endswith("]"):
                try:
                    parsed = json.loads(v_stripped)
                    if isinstance(parsed, list):
                        return [str(item).strip() for item in parsed if str(item).strip()]
                except json.JSONDecodeError:
                    pass
            return [part.strip() for part in v.split(",") if part.strip()]
        elif isinstance(v, list):
            return [str(item).strip() for item in v if str(item).strip()]
        return ["http://localhost:3000", "http://localhost:8000"]

    @field_validator("TIMEZONE")
    @classmethod
    def validate_timezone(cls, v: str) -> str:
        """Validate that the timezone string exists in IANA zoneinfo database."""
        try:
            ZoneInfo(v)
        except (ZoneInfoNotFoundError, ValueError) as err:
            raise ValueError(f"Invalid IANA timezone '{v}': {err}") from err
        return v

    @field_validator("LOG_LEVEL")
    @classmethod
    def validate_log_level(cls, v: str) -> str:
        """Validate log level string."""
        allowed = {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"}
        upper_v = v.upper().strip()
        if upper_v not in allowed:
            raise ValueError(f"LOG_LEVEL must be one of {allowed}, got '{v}'")
        return upper_v

    @field_validator("TRUSTED_PROXIES", mode="before")
    @classmethod
    def assemble_trusted_proxies(cls, v: str | list[str]) -> list[str]:
        """Support comma-separated string, JSON string, or list format and strictly validate CIDRs."""
        proxies: list[str] = []
        if isinstance(v, str):
            v_stripped = v.strip()
            if v_stripped.startswith("[") and v_stripped.endswith("]"):
                try:
                    parsed = json.loads(v_stripped)
                    if isinstance(parsed, list):
                        proxies = [str(item).strip() for item in parsed if str(item).strip()]
                except json.JSONDecodeError:
                    pass
            if not proxies:
                proxies = [part.strip() for part in v.split(",") if part.strip()]
        elif isinstance(v, list):
            proxies = [str(item).strip() for item in v if str(item).strip()]
        else:
            proxies = ["127.0.0.1/32", "::1/128", "172.16.0.0/12", "10.0.0.0/8"]

        # Validate each proxy CIDR block
        validated: list[str] = []
        for entry in proxies:
            if "*" in entry:
                raise ValueError("Wildcard '*' is strictly prohibited in TRUSTED_PROXIES. Explicit IPv4/IPv6 CIDRs required.")
            try:
                # Normalise to standard CIDR notation
                net = ipaddress.ip_network(entry, strict=False)
                validated.append(str(net))
            except ValueError as exc:
                raise ValueError(f"Invalid CIDR format in TRUSTED_PROXIES: '{entry}' ({exc})") from exc

        return validated

    @model_validator(mode="after")
    def validate_production_configuration(self) -> "Settings":
        """Strict production security assertions; prevents insecure defaults and secret leaks."""
        if self.APP_ENV.lower() == "production":
            if self.DEBUG:
                raise ValueError("DEBUG mode must be set to False in production environments.")

            # 1. JWT Key Integrity & Entropy
            if not self.JWT_SECRET_KEY or len(self.JWT_SECRET_KEY.encode("utf-8")) < 32:
                raise ValueError("Production JWT_SECRET_KEY must be at least 32 bytes.")

            insecure_jwt_markers = ["windiq_super_secret", "development", "secret", "change_me", "example"]
            if any(marker in self.JWT_SECRET_KEY.lower() for marker in insecure_jwt_markers):
                raise ValueError("Insecure default or development JWT_SECRET_KEY detected in production configuration.")

            # 2. Database Password Hardening
            if "postgres:postgres@" in self.DATABASE_URL:
                raise ValueError("Default PostgreSQL credentials ('postgres:postgres') are forbidden in production.")

            # 3. Redis Password Hardening
            if "windiq_redis_dev_secret_pass" in self.REDIS_URL or self.REDIS_PASSWORD == "windiq_redis_dev_secret_pass":
                raise ValueError("Default development REDIS_PASSWORD is forbidden in production.")

            # 4. CORS Origins Hardening
            if any("*" in origin for origin in self.CORS_ORIGINS):
                raise ValueError("Wildcard CORS origins are strictly prohibited in production with credentials.")

            # 5. Trusted Proxies Hardening
            if not self.TRUSTED_PROXIES:
                raise ValueError("TRUSTED_PROXIES cannot be empty in production.")
            if any(p in ("0.0.0.0/0", "::/0") for p in self.TRUSTED_PROXIES):
                raise ValueError("Wildcard proxy trust ('0.0.0.0/0' or '::/0') is prohibited in production.")

        return self


@lru_cache
def get_settings() -> Settings:
    """Singleton getter for application settings."""
    return Settings()
