"""Structured logging configuration with correlation ID tracing."""

import logging
import sys
from contextvars import ContextVar
from datetime import UTC, datetime

# Context variable for request correlation ID
request_id_ctx: ContextVar[str | None] = ContextVar("request_id_ctx", default=None)


class StructuredLogFormatter(logging.Formatter):
    """Custom log formatter injecting UTC timestamps and request correlation IDs."""

    def format(self, record: logging.LogRecord) -> str:
        utc_time = datetime.now(UTC).strftime("%Y-%m-%d %H:%M:%S UTC")
        req_id = request_id_ctx.get() or "system"
        msg = super().format(record)
        return f"{utc_time} [{record.levelname:<7}] [{record.name}] [req_id={req_id}]: {msg}"


def setup_logging(log_level: str = "INFO") -> None:
    """Initialize structured console logging with custom formatter."""
    numeric_level = getattr(logging, log_level.upper(), logging.INFO)
    root_logger = logging.getLogger()
    root_logger.setLevel(numeric_level)

    # Clear existing handlers to avoid duplicates
    root_logger.handlers.clear()

    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(numeric_level)
    handler.setFormatter(StructuredLogFormatter("%(message)s"))

    root_logger.addHandler(handler)

    # Silence noisy third-party loggers
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)


def get_logger(name: str) -> logging.Logger:
    """Obtain a named logger instance."""
    return logging.getLogger(name)
