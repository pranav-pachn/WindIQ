"""Elexon BMRS API extraction client with caching, retry, and validation."""

import json
import logging
import time
from datetime import date, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional

import requests

from src.data_pipeline.config import PipelineConfig, DEFAULT_CONFIG

logger = logging.getLogger(__name__)


class ElexonExtractor:
    """Extracts WINDFOR and FUELHH datasets from Elexon BMRS API."""

    def __init__(self, config: Optional[PipelineConfig] = None):
        self.config = config or DEFAULT_CONFIG
        self.session = requests.Session()
        self.config.raw_data_dir.mkdir(parents=True, exist_ok=True)
        self.config.raw_cache_dir.mkdir(parents=True, exist_ok=True)

    def _fetch_with_retry(self, url: str, params: Dict[str, Any], context: str) -> List[Dict[str, Any]]:
        """Fetch endpoint with exponential backoff retry and response validation."""
        delay = self.config.request_delay_seconds
        last_exception = None

        for attempt in range(1, self.config.max_retries + 1):
            try:
                logger.info(
                    "Requesting %s (attempt %d/%d): URL=%s, params=%s",
                    context,
                    attempt,
                    self.config.max_retries,
                    url,
                    params,
                )
                response = self.session.get(url, params=params, timeout=self.config.timeout_seconds)
                
                # Check status codes
                if response.status_code in (429, 500, 502, 503, 504):
                    logger.warning(
                        "Transient HTTP status %d for %s (attempt %d). Backing off for %.2fs",
                        response.status_code,
                        context,
                        attempt,
                        delay,
                    )
                    time.sleep(delay)
                    delay *= self.config.backoff_factor
                    continue

                response.raise_for_status()

                # Parse JSON
                try:
                    data = response.json()
                except ValueError as json_err:
                    raise ValueError(f"Failed to parse JSON response for {context}: {json_err}") from json_err

                if not isinstance(data, list):
                    raise ValueError(
                        f"Expected list response for {context}, got {type(data).__name__}"
                    )

                logger.info(
                    "Success for %s: HTTP %d, records=%d",
                    context,
                    response.status_code,
                    len(data),
                )
                if len(data) == 0:
                    logger.warning("Empty response received for %s", context)

                return data

            except (requests.RequestException, ValueError) as err:
                last_exception = err
                logger.warning(
                    "Error fetching %s (attempt %d/%d): %s. Backing off for %.2fs",
                    context,
                    attempt,
                    self.config.max_retries,
                    err,
                    delay,
                )
                if attempt < self.config.max_retries:
                    time.sleep(delay)
                    delay *= self.config.backoff_factor

        raise RuntimeError(
            f"Extraction failed for {context} after {self.config.max_retries} attempts: {last_exception}"
        ) from last_exception

    def fetch_windfor_single_day(self, decision_date: date, use_cache: bool = True) -> List[Dict[str, Any]]:
        """Fetch WINDFOR forecast records for a single decision date (00:00 to next day 00:00 UTC)."""
        cache_path = self.config.raw_cache_dir / f"windfor_{decision_date.isoformat()}.json"
        if use_cache and cache_path.exists():
            logger.debug("Loading cached WINDFOR for %s from %s", decision_date, cache_path)
            with open(cache_path, "r", encoding="utf-8") as f:
                return json.load(f)

        next_day = decision_date + timedelta(days=1)
        params = {
            "publishDateTimeFrom": f"{decision_date.isoformat()}T00:00:00Z",
            "publishDateTimeTo": f"{next_day.isoformat()}T00:00:00Z",
        }
        context = f"WINDFOR decision_date={decision_date}"
        records = self._fetch_with_retry(self.config.windfor_url, params, context)

        # Explicit sort by (publishTime, startTime)
        records.sort(key=lambda x: (x.get("publishTime", ""), x.get("startTime", "")))

        # Cache locally
        with open(cache_path, "w", encoding="utf-8") as f:
            json.dump(records, f, indent=2)

        time.sleep(self.config.request_delay_seconds)
        return records

    def fetch_fuelhh_single_day(self, delivery_date: date, use_cache: bool = True) -> List[Dict[str, Any]]:
        """Fetch FUELHH actual wind generation records for a single delivery date."""
        cache_path = self.config.raw_cache_dir / f"fuelhh_{delivery_date.isoformat()}.json"
        if use_cache and cache_path.exists():
            logger.debug("Loading cached FUELHH for %s from %s", delivery_date, cache_path)
            with open(cache_path, "r", encoding="utf-8") as f:
                return json.load(f)

        params = {
            "settlementDateFrom": delivery_date.isoformat(),
            "settlementDateTo": delivery_date.isoformat(),
            "fuelType": "WIND",
        }
        context = f"FUELHH delivery_date={delivery_date}"
        records = self._fetch_with_retry(self.config.fuelhh_url, params, context)

        # Explicit sort by startTime
        records.sort(key=lambda x: x.get("startTime", ""))

        # Cache locally
        with open(cache_path, "w", encoding="utf-8") as f:
            json.dump(records, f, indent=2)

        time.sleep(self.config.request_delay_seconds)
        return records

    def extract_all_windfor(self, use_cache: bool = True) -> List[Dict[str, Any]]:
        """Extract WINDFOR forecasts across all 31 decision dates (Jan 1 - Jan 31, 2026)."""
        all_records: List[Dict[str, Any]] = []
        current_date = self.config.decision_start_date

        logger.info(
            "Starting WINDFOR extraction from %s to %s",
            self.config.decision_start_date,
            self.config.decision_end_date,
        )

        while current_date <= self.config.decision_end_date:
            day_records = self.fetch_windfor_single_day(current_date, use_cache=use_cache)
            all_records.extend(day_records)
            current_date += timedelta(days=1)

        # Final explicit sort by (publishTime, startTime)
        all_records.sort(key=lambda x: (x.get("publishTime", ""), x.get("startTime", "")))

        logger.info(
            "Extracted total %d WINDFOR records across all decision dates", len(all_records)
        )

        # Save to main raw JSON file
        with open(self.config.raw_windfor_json, "w", encoding="utf-8") as f:
            json.dump(all_records, f, indent=2)

        return all_records

    def extract_all_fuelhh(self, use_cache: bool = True) -> List[Dict[str, Any]]:
        """Extract FUELHH actuals across all 31 delivery dates (Jan 2 - Feb 1, 2026)."""
        all_records: List[Dict[str, Any]] = []
        current_date = self.config.delivery_start_date

        logger.info(
            "Starting FUELHH extraction from %s to %s",
            self.config.delivery_start_date,
            self.config.delivery_end_date,
        )

        while current_date <= self.config.delivery_end_date:
            day_records = self.fetch_fuelhh_single_day(current_date, use_cache=use_cache)
            all_records.extend(day_records)
            current_date += timedelta(days=1)

        # Final explicit sort by startTime
        all_records.sort(key=lambda x: x.get("startTime", ""))

        logger.info(
            "Extracted total %d FUELHH records across all delivery dates", len(all_records)
        )

        # Save to main raw JSON file
        with open(self.config.raw_fuelhh_json, "w", encoding="utf-8") as f:
            json.dump(all_records, f, indent=2)

        return all_records

