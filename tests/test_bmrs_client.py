"""Tests for BmrsClient HTTP timeouts, bounded retries, jitter, and error handling."""

from datetime import date

import httpx
import pytest
from app.core.config import Settings
from app.services.bmrs_client import (
    BmrsClient,
    BmrsFatalError,
    BmrsTransientError,
)


@pytest.fixture
def custom_settings():
    """Test settings with low timeouts and quick retries for fast test execution."""
    return Settings(
        BMRS_TIMEOUT_SECONDS=1.0,
        BMRS_CONNECT_TIMEOUT_SECONDS=1.0,
        BMRS_MAX_RETRIES=3,
        BMRS_BACKOFF_FACTOR=1.1,
        BMRS_JITTER_MAX=0.01,
        RAW_CACHE_DIR="data/raw/cache",
    )


@pytest.mark.asyncio
async def test_successful_json_response(custom_settings, tmp_path):
    """Successful HTTP 200 response returning a valid list of records."""
    custom_settings.RAW_CACHE_DIR = str(tmp_path)
    sample_records = [
        {
            "publishTime": "2026-01-01T05:00:00Z",
            "startTime": "2026-01-02T14:00:00Z",
            "generation": 15000.0,
        }
    ]

    async def mock_handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=sample_records)

    transport = httpx.MockTransport(mock_handler)
    async with httpx.AsyncClient(transport=transport) as http_client:
        client = BmrsClient(settings=custom_settings, http_client=http_client)
        records = await client.fetch_windfor_single_day(date(2026, 1, 1), use_cache=False)
        assert len(records) == 1
        assert records[0]["generation"] == 15000.0


@pytest.mark.asyncio
async def test_transient_retry_and_recovery(custom_settings, tmp_path):
    """Transient HTTP 503 and 429 status codes trigger bounded retries before success."""
    custom_settings.RAW_CACHE_DIR = str(tmp_path)
    attempts = 0

    async def mock_handler(request: httpx.Request) -> httpx.Response:
        nonlocal attempts
        attempts += 1
        if attempts == 1:
            return httpx.Response(503, text="Service Unavailable")
        if attempts == 2:
            return httpx.Response(429, text="Rate Limited")
        return httpx.Response(
            200, json=[{"startTime": "2026-01-02T00:00:00Z", "generation": 12000.0}]
        )

    transport = httpx.MockTransport(mock_handler)
    async with httpx.AsyncClient(transport=transport) as http_client:
        client = BmrsClient(settings=custom_settings, http_client=http_client)
        records = await client.fetch_windfor_single_day(date(2026, 1, 1), use_cache=False)
        assert attempts == 3
        assert len(records) == 1


@pytest.mark.asyncio
async def test_max_retries_exhausted_raises_transient_error(custom_settings, tmp_path):
    """Exhausting maximum retries on repeated 500 errors raises BmrsTransientError."""
    custom_settings.RAW_CACHE_DIR = str(tmp_path)

    async def mock_handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, text="Internal Server Error")

    transport = httpx.MockTransport(mock_handler)
    async with httpx.AsyncClient(transport=transport) as http_client:
        client = BmrsClient(settings=custom_settings, http_client=http_client)
        with pytest.raises(BmrsTransientError) as exc_info:
            await client.fetch_windfor_single_day(date(2026, 1, 1), use_cache=False)
        assert "after 3 attempts" in str(exc_info.value)


@pytest.mark.asyncio
async def test_non_retryable_client_error(custom_settings, tmp_path):
    """HTTP 400 Bad Request fails fast without retrying."""
    custom_settings.RAW_CACHE_DIR = str(tmp_path)
    call_count = 0

    async def mock_handler(request: httpx.Request) -> httpx.Response:
        nonlocal call_count
        call_count += 1
        return httpx.Response(400, text="Bad Request Parameter")

    transport = httpx.MockTransport(mock_handler)
    async with httpx.AsyncClient(transport=transport) as http_client:
        client = BmrsClient(settings=custom_settings, http_client=http_client)
        with pytest.raises(BmrsFatalError) as exc_info:
            await client.fetch_windfor_single_day(date(2026, 1, 1), use_cache=False)
        assert call_count == 1
        assert "Non-retryable HTTP 400" in str(exc_info.value)


@pytest.mark.asyncio
async def test_malformed_json_response_raises_fatal(custom_settings, tmp_path):
    """Malformed non-JSON body raises BmrsFatalError immediately."""
    custom_settings.RAW_CACHE_DIR = str(tmp_path)

    async def mock_handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, text="<html><body>Gateway Error</body></html>")

    transport = httpx.MockTransport(mock_handler)
    async with httpx.AsyncClient(transport=transport) as http_client:
        client = BmrsClient(settings=custom_settings, http_client=http_client)
        with pytest.raises(BmrsFatalError) as exc_info:
            await client.fetch_windfor_single_day(date(2026, 1, 1), use_cache=False)
        assert "Failed to parse JSON" in str(exc_info.value)


@pytest.mark.asyncio
async def test_non_list_json_response_raises_fatal(custom_settings, tmp_path):
    """JSON response that is a dict instead of a list raises BmrsFatalError."""
    custom_settings.RAW_CACHE_DIR = str(tmp_path)

    async def mock_handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"error": "Not a list"})

    transport = httpx.MockTransport(mock_handler)
    async with httpx.AsyncClient(transport=transport) as http_client:
        client = BmrsClient(settings=custom_settings, http_client=http_client)
        with pytest.raises(BmrsFatalError) as exc_info:
            await client.fetch_windfor_single_day(date(2026, 1, 1), use_cache=False)
        assert "Expected list response" in str(exc_info.value)
