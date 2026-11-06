"""Pydantic schemas for authentication requests, token responses, and API key management."""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class LoginRequest(BaseModel):
    """User login credential payload."""

    email: str = Field(min_length=3, max_length=255, description="Registered user email address")
    password: str = Field(min_length=8, description="User password")


class TokenResponse(BaseModel):
    """Authentication success payload with access token and CSRF synchronizer token."""

    access_token: str = Field(description="Signed JWT access token")
    token_type: str = Field(default="bearer", description="Token type")
    expires_in_seconds: int = Field(description="Access token lifespan in seconds")
    user_id: uuid.UUID = Field(description="Authenticated user UUID")
    email: str = Field(description="User email address")
    role: str = Field(description="Assigned RBAC role")
    csrf_token: str = Field(description="Synchronizer CSRF token for state-changing requests")


class UserProfileResponse(BaseModel):
    """Current authenticated user profile context."""

    model_config = ConfigDict(from_attributes=True)

    user_id: uuid.UUID = Field(description="User UUID")
    email: str = Field(description="User email address")
    full_name: str | None = Field(default=None, description="User full display name")
    role: str = Field(description="Assigned RBAC role")
    is_active: bool = Field(description="Account active status")
    permissions: list[str] = Field(description="Granted effective permissions")


class ApiKeyCreateRequest(BaseModel):
    """Payload to provision a scoped machine-to-machine API key."""

    name: str = Field(min_length=3, max_length=128, description="Descriptive identifier for the API key")
    scopes: list[str] = Field(
        default=["read:accuracy"],
        description="Permission scopes granted to the API key",
    )
    expires_in_days: int | None = Field(
        default=None,
        ge=1,
        le=365,
        description="Optional expiration in days (null for non-expiring)",
    )


class ApiKeyCreateResponse(BaseModel):
    """Response containing the plaintext key, revealed exactly once upon creation."""

    id: uuid.UUID = Field(description="API key record UUID")
    name: str = Field(description="Key name")
    key_prefix: str = Field(description="Key prefix for identification")
    plaintext_key: str = Field(description="Secret plaintext key (shown once; cannot be recovered)")
    scopes: list[str] = Field(description="Granted permission scopes")
    expires_at: datetime | None = Field(description="Expiration timestamp")
    created_at: datetime = Field(description="Creation timestamp")


class ApiKeyItemResponse(BaseModel):
    """API key metadata without secret key."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID = Field(description="API key record UUID")
    name: str = Field(description="Key name")
    key_prefix: str = Field(description="Key prefix for identification")
    scopes: list[str] = Field(description="Granted permission scopes")
    expires_at: datetime | None = Field(description="Expiration timestamp")
    last_used_at: datetime | None = Field(description="Last usage timestamp")
    is_revoked: bool = Field(description="Revocation flag")
    created_at: datetime = Field(description="Creation timestamp")
