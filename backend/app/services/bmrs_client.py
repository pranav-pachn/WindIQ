"""Asynchronous BMRS HTTP client with bounded retries, jitter, and caching."""

import asyncio
import json
import logging
import random
import time
import uuid
from datetime import date, timedelta
from pathlib import Path
from typing import Any

import httpx

from app.core.config import Settings, get_settings

logger = logging.getLogger(__name__)


class BmrsClientError(Exception):
    """Base exception for BMRS client extraction errors."""

    pass


class BmrsTransientError(BmrsClientError):
    """Transient network or server error eligible for bounded retries."""

    pass


class BmrsFatalError(BmrsClientError):
    """Fatal client or data error that should not be retried."""

    pass


class BmrsClient:
    """Asynchronous client for Elexon BMRS API endpoints with resilience and logging."""

    def __init__(
        self,
        settings: Settings | None = None,
        http_client: httpx.AsyncClient | None = None,
    ):
        self.settings = settings or get_settings()
        self._external_client = http_client
        self._client: httpx.AsyncClient | None = None

        self.cache_dir = Path(self.settings.RAW_CACHE_DIR)
        try:
            self.cache_dir.mkdir(parents=True, exist_ok=True)
        except Exception as exc:
            logger.warning("Could not create cache directory %s: %s", self.cache_dir, exc)

    async def _get_client(self) -> httpx.AsyncClient:
        if self._external_client is not None:
            return self._external_client
        if self._client is None or self._client.is_closed:
            timeout = httpx.Timeout(
                timeout=self.settings.BMRS_TIMEOUT_SECONDS,
                connect=self.settings.BMRS_CONNECT_TIMEOUT_SECONDS,
            )
            self._client = httpx.AsyncClient(timeout=timeout)
        return self._client

    async def close(self) -> None:
        """Close underlying HTTP client if internally managed."""
        if self._client is not None and not self._client.is_closed:
            await self._client.aclose()
            self._client = None

    async def __aenter__(self) -> "BmrsClient":
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb) -> None:
        await self.close()

    async def _request_with_retry(
        self,
        url: str,
        params: dict[str, Any],
        context: str,
        request_id: str,
    ) -> list[dict[str, Any]]:
        """Execute HTTP request with exponential backoff, jitter, and strict error handling."""
        client = await self._get_client()
        delay = 0.5
        last_exception: Exception | None = None

        for attempt in range(1, self.settings.BMRS_MAX_RETRIES + 1):
            t_start = time.perf_counter()
            logger.info(
                "[%s] Requesting %s (attempt %d/%d): URL=%s, params=%s",
                request_id,
                context,
                attempt,
                self.settings.BMRS_MAX_RETRIES,
                url,
                params,
            )

            try:
                response = await client.get(url, params=params)
                elapsed = time.perf_counter() - t_start

                # Non-retryable HTTP client errors (400, 401, 403, 404)
                if response.status_code in (400, 401, 403, 404):
                    logger.error(
                        "[%s] Non-retryable HTTP %d for %s after %.2fs: %s",
                        request_id,
                        response.status_code,
                        context,
                        elapsed,
                        response.text[:200],
                    )
                    msg = (
                        f"Non-retryable HTTP {response.status_code} for {context}: "
                        f"{response.text[:200]}"
                    )
                    raise BmrsFatalError(msg)

                # Transient HTTP status codes (429, 500, 502, 503, 504)
                if response.status_code in (429, 500, 502, 503, 504):
                    logger.warning(
                        "[%s] Transient HTTP %d for %s (attempt %d). Backing off.",
                        request_id,
                        response.status_code,
                        context,
                        attempt,
                    )
                    raise BmrsTransientError(f"HTTP {response.status_code} from BMRS endpoint")

                response.raise_for_status()

                # Parse JSON
                try:
                    data = response.json()
                except Exception as json_err:
                    raise BmrsFatalError(
                        f"Failed to parse JSON response for {context}: {json_err}"
                    ) from json_err

                if not isinstance(data, list):
                    raise BmrsFatalError(
                        f"Expected list response for {context}, got {type(data).__name__}"
                    )

                logger.info(
                    "[%s] Success for %s in %.2fs: records=%d",
                    request_id,
                    context,
                    elapsed,
                    len(data),
                )
                return data

            except BmrsFatalError:
                raise

            except (httpx.TransportError, httpx.TimeoutException, BmrsTransientError) as err:
                last_exception = err
                elapsed = time.perf_counter() - t_start
                logger.warning(
                    "[%s] Transient error for %s (attempt %d/%d) after %.2fs: %s",
                    request_id,
                    context,
                    attempt,
                    self.settings.BMRS_MAX_RETRIES,
                    elapsed,
                    err,
                )
                if attempt < self.settings.BMRS_MAX_RETRIES:
                    jitter = random.uniform(0, self.settings.BMRS_JITTER_MAX)
                    sleep_duration = delay + jitter
                    logger.info(
                        "[%s] Sleeping for %.2fs before retry (delay=%.2fs, jitter=%.2fs)",
                        request_id,
                        sleep_duration,
                        delay,
                        jitter,
                    )
                    await asyncio.sleep(sleep_duration)
                    delay *= self.settings.BMRS_BACKOFF_FACTOR

        err_msg = (
            f"Extraction failed for {context} after "
            f"{self.settings.BMRS_MAX_RETRIES} attempts: {last_exception}"
        )
        raise BmrsTransientError(err_msg) from last_exception

    async def fetch_windfor_single_day(
        self,
        decision_date: date,
        use_cache: bool = True,
        request_id: str | None = None,
    ) -> list[dict[str, Any]]:
        """Fetch WINDFOR forecast records published on decision_date (00:00 to 24:00 UTC)."""
        req_id = request_id or str(uuid.uuid4())
        cache_path = self.cache_dir / f"windfor_{decision_date.isoformat()}.json"

        if use_cache and cache_path.exists():
            logger.debug(
                "[%s] Loading cached WINDFOR for %s from %s", req_id, decision_date, cache_path
            )
            with open(cache_path, encoding="utf-8") as f:
                return json.load(f)

        next_day = decision_date + timedelta(days=1)
        params = {
            "publishDateTimeFrom": f"{decision_date.isoformat()}T00:00:00Z",
            "publishDateTimeTo": f"{next_day.isoformat()}T00:00:00Z",
        }
        context = f"WINDFOR decision_date={decision_date}"
        records = await self._request_with_retry(
            self.settings.BMRS_WINDFOR_URL,
            params,
            context,
            req_id,
        )

        records.sort(key=lambda x: (x.get("publishTime", ""), x.get("startTime", "")))

        # Cache locally if caching is enabled
        if use_cache:
            try:
                with open(cache_path, "w", encoding="utf-8") as f:
                    json.dump(records, f, indent=2)
            except Exception as cache_err:
                logger.warning(
                    "[%s] Failed to write cache for %s: %s", req_id, cache_path, cache_err
                )

        return records

    async def fetch_fuelhh_single_day(
        self,
        delivery_date: date,
        use_cache: bool = True,
        request_id: str | None = None,
    ) -> list[dict[str, Any]]:
        """Fetch FUELHH actual wind generation records for a delivery date."""
        req_id = request_id or str(uuid.uuid4())
        cache_path = self.cache_dir / f"fuelhh_{delivery_date.isoformat()}.json"

        if use_cache and cache_path.exists():
            logger.debug(
                "[%s] Loading cached FUELHH for %s from %s", req_id, delivery_date, cache_path
            )
            with open(cache_path, encoding="utf-8") as f:
                return json.load(f)

        params = {
            "settlementDateFrom": delivery_date.isoformat(),
            "settlementDateTo": delivery_date.isoformat(),
            "fuelType": "WIND",
        }
        context = f"FUELHH delivery_date={delivery_date}"
        records = await self._request_with_retry(
            self.settings.BMRS_FUELHH_URL,
            params,
            context,
            req_id,
        )

        records.sort(key=lambda x: x.get("startTime", ""))

        # Cache locally if caching is enabled
        if use_cache:
            try:
                with open(cache_path, "w", encoding="utf-8") as f:
                    json.dump(records, f, indent=2)
            except Exception as cache_err:
                logger.warning(
                    "[%s] Failed to write cache for %s: %s", req_id, cache_path, cache_err
                )

        return records
