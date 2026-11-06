"""Common schemas, pagination envelopes, and error representations."""

from datetime import date
from typing import TypeVar

from pydantic import BaseModel, ConfigDict, Field

T = TypeVar("T")


class PaginationMeta(BaseModel):
    """Metadata describing the pagination status of a list response."""

    model_config = ConfigDict(from_attributes=True)

    page: int = Field(ge=1, description="Current 1-based page number")
    page_size: int = Field(ge=1, le=200, description="Items per page")
    total_items: int = Field(ge=0, description="Total matching items across all pages")
    total_pages: int = Field(ge=0, description="Total number of pages")
    has_next: bool = Field(description="True if next page exists")
    has_previous: bool = Field(description="True if previous page exists")


class PaginatedResponse[T](BaseModel):
    """Standardized multi-record envelope with items and pagination."""

    model_config = ConfigDict(from_attributes=True)

    items: list[T]
    pagination: PaginationMeta


class DateRangeParams(BaseModel):
    """Validated date range query parameters."""

    delivery_date_from: date | None = Field(
        default=None,
        description="Filter range start delivery date (inclusive, YYYY-MM-DD)",
    )
    delivery_date_to: date | None = Field(
        default=None,
        description="Filter range end delivery date (inclusive, YYYY-MM-DD)",
    )


class ErrorDetail(BaseModel):
    """RFC 7807 compliant error details payload."""

    code: str = Field(description="Machine-readable error code")
    message: str = Field(description="Human-readable explanation")
    details: dict | None = Field(default=None, description="Optional parameter or field details")
    request_id: str | None = Field(default=None, description="Correlation tracking ID")
    timestamp: str = Field(description="ISO 8601 error generation timestamp")


class ErrorEnvelope(BaseModel):
    """Standard error response envelope."""

    error: ErrorDetail
