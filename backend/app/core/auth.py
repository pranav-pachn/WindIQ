"""Centralized authentication and role-based authorization dependencies."""

import hashlib
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime

from fastapi import Depends, HTTPException, Request, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import get_db
from app.core.security import decode_access_token
from app.models.auth import ApiKey, User, UserRole

# HTTP Bearer header extractor (auto_error=False allows inspecting other headers like X-API-Key)
_bearer_security = HTTPBearer(auto_error=False)

# Granular permission mapping for user roles
ROLE_PERMISSIONS: dict[str, frozenset[str]] = {
    UserRole.VIEWER.value: frozenset({
        "overview:read",
        "accuracy:read",
        "health:read",
        "forecasts:read",
        "auth:me",
        "auth:logout",
    }),
    UserRole.ANALYST.value: frozenset({
        "overview:read",
        "accuracy:read",
        "health:read",
        "forecasts:read",
        "auth:me",
        "auth:logout",
        "accuracy:hourly",
        "forecasts:publications",
        "forecasts:revisions",
    }),
    UserRole.ADMIN.value: frozenset({
        "overview:read",
        "accuracy:read",
        "health:read",
        "forecasts:read",
        "auth:me",
        "auth:logout",
        "accuracy:hourly",
        "forecasts:publications",
        "forecasts:revisions",
        "admin:keys",
        "admin:pipeline",
        "admin:users",
    }),
}


@dataclass(frozen=True)
class Principal:
    """Authenticated subject context (user or programmatic API key)."""

    id: uuid.UUID
    principal_type: str  # "user" or "api_key"
    identifier: str  # email or key name
    role: str
    scopes: frozenset[str]

    def has_permission(self, permission: str) -> bool:
        """Check if principal holds permission directly or via RBAC role."""
        parts = permission.split(":", 1)
        inverse_perm = f"{parts[1]}:{parts[0]}" if len(parts) == 2 else permission
        has_direct_scope = permission in self.scopes or inverse_perm in self.scopes

        if self.principal_type == "api_key":
            return has_direct_scope
        if self.role == UserRole.ADMIN.value:
            return True
        if has_direct_scope:
            return True
        role_perms = ROLE_PERMISSIONS.get(self.role, frozenset())
        return permission in role_perms


async def get_current_principal(
    request: Request,
    bearer: HTTPAuthorizationCredentials | None = Security(_bearer_security),
    db: AsyncSession = Depends(get_db),
) -> Principal:
    """Centralized authentication dependency extracting credentials and validating principal.

    Supports:
    1. Authorization: Bearer <JWT>
    2. Authorization: Bearer wnd_live_<key>
    3. X-API-Key: wnd_live_<key>
    """
    if hasattr(request.state, "principal") and request.state.principal is not None:
        return request.state.principal

    settings = get_settings()
    if not settings.AUTH_ENFORCE:
        # Default unconstrained admin principal if authentication enforcement is disabled
        principal = Principal(
            id=uuid.UUID("00000000-0000-0000-0000-000000000000"),
            principal_type="system",
            identifier="system@windiq.local",
            role=UserRole.ADMIN.value,
            scopes=frozenset({"*"}),
        )
        request.state.principal = principal
        return principal

    raw_token: str | None = None
    if bearer and bearer.credentials:
        raw_token = bearer.credentials.strip()
    elif "X-API-Key" in request.headers:
        raw_token = request.headers["X-API-Key"].strip()

    if not raw_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication credentials were not provided.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # 1. Machine-to-Machine API Key Authentication
    if raw_token.startswith("wnd_live_"):
        hashed_key = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
        stmt = (
            select(ApiKey)
            .where(ApiKey.hashed_key == hashed_key)
            .where(ApiKey.is_revoked.is_(False))
        )
        res = await db.execute(stmt)
        key_record = res.scalar_one_or_none()

        now = datetime.now(UTC)
        if not key_record or (key_record.expires_at and key_record.expires_at <= now):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid, expired, or revoked API key.",
                headers={"WWW-Authenticate": "Bearer error=\"invalid_token\""},
            )

        # Update last_used_at timestamp asynchronously
        await db.execute(
            update(ApiKey)
            .where(ApiKey.id == key_record.id)
            .values(last_used_at=now)
        )
        await db.commit()

        # Map API key scopes to role context
        key_scopes = frozenset(key_record.scopes)
        derived_role = UserRole.ADMIN.value if "admin:keys" in key_scopes else UserRole.ANALYST.value

        principal = Principal(
            id=key_record.id,
            principal_type="api_key",
            identifier=key_record.name,
            role=derived_role,
            scopes=key_scopes,
        )
        request.state.principal = principal
        return principal

    # 2. User JWT Access Token Authentication
    payload = decode_access_token(raw_token)
    user_id_str = payload.get("sub")
    if not user_id_str:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token subject claim.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        user_uuid = uuid.UUID(user_id_str)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Malformed token user ID.",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    # Instant Database User Status Verification
    # Enforces immediate role demotions, permission updates, and account deactivations
    user_stmt = select(User).where(User.id == user_uuid)
    user_res = await db.execute(user_stmt)
    user = user_res.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account no longer exists.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account has been deactivated.",
            headers={"WWW-Authenticate": "Bearer error=\"user_inactive\""},
        )

    principal = Principal(
        id=user.id,
        principal_type="user",
        identifier=user.email,
        role=user.role,
        scopes=ROLE_PERMISSIONS.get(user.role, frozenset()),
    )
    request.state.principal = principal
    return principal


def require_permission(permission: str):
    """Centralized authorization dependency factory verifying required permission.

    Raises:
        HTTPException(403): If the authenticated principal does not hold the permission.
    """

    async def _permission_dependency(
        principal: Principal = Depends(get_current_principal),
    ) -> Principal:
        if not principal.has_permission(permission):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    f"Forbidden: Insufficient privileges for permission '{permission}'. "
                    f"Current role '{principal.role}' is not authorized."
                ),
            )
        return principal

    return _permission_dependency
