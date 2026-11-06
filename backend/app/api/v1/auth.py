"""Authentication API routes: login, anti-theft refresh rotation, logout, profile, and API key management."""

import uuid
from typing import Annotated

from fastapi import (
    APIRouter,
    Cookie,
    Depends,
    Header,
    Path,
    Request,
    Response,
    status,
)
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import Principal, get_current_principal, require_permission
from app.core.config import get_settings
from app.core.database import get_db
from app.core.logging import get_logger
from app.core.rate_limit import RateLimiter, check_login_rate_limit
from app.core.trusted_proxy import get_trusted_client_ip
from app.schemas.auth import (
    ApiKeyCreateRequest,
    ApiKeyCreateResponse,
    ApiKeyItemResponse,
    LoginRequest,
    TokenResponse,
    UserProfileResponse,
)
from app.services.auth_service import AuthService

logger = get_logger("windiq.api.auth")
router = APIRouter(prefix="/auth", tags=["Authentication & Access Control"])


def _set_auth_cookies(
    response: Response,
    refresh_token: str,
    csrf_token: str,
) -> None:
    """Helper to attach secure session and CSRF cookies."""
    settings = get_settings()
    refresh_max_age = settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS * 86400

    # 1. HttpOnly Refresh Token Cookie
    response.set_cookie(
        key="windiq_refresh_token",
        value=refresh_token,
        max_age=refresh_max_age,
        httponly=True,
        secure=settings.AUTH_COOKIE_SECURE,
        samesite=settings.AUTH_COOKIE_SAMESITE.lower(),  # type: ignore[arg-type]
        path="/api/v1/auth",
    )

    # 2. Non-HttpOnly CSRF Synchronizer Token Cookie (Readable by Frontend JS across all routes)
    response.set_cookie(
        key="windiq_csrf_token",
        value=csrf_token,
        max_age=refresh_max_age,
        httponly=False,
        secure=settings.AUTH_COOKIE_SECURE,
        samesite=settings.AUTH_COOKIE_SAMESITE.lower(),  # type: ignore[arg-type]
        path="/",
    )


def _clear_auth_cookies(response: Response) -> None:
    """Helper to delete session cookies upon logout."""
    settings = get_settings()
    response.delete_cookie(
        key="windiq_refresh_token",
        path="/api/v1/auth",
        secure=settings.AUTH_COOKIE_SECURE,
        samesite=settings.AUTH_COOKIE_SAMESITE.lower(),  # type: ignore[arg-type]
    )
    response.delete_cookie(
        key="windiq_csrf_token",
        path="/",
        secure=settings.AUTH_COOKIE_SECURE,
        samesite=settings.AUTH_COOKIE_SAMESITE.lower(),  # type: ignore[arg-type]
    )


@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Authenticate User Credentials",
    description="Authenticates email and Argon2id password with attempt throttling, returns access token, and sets refresh cookies.",
)
async def login(
    credentials: LoginRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    """Authenticate user with Argon2id hash verification and audit logging."""
    await check_login_rate_limit(request, response, credentials.email)

    client_ip = get_trusted_client_ip(request)
    user_agent = request.headers.get("User-Agent")
    settings = get_settings()

    service = AuthService(db)
    access_token, raw_refresh, user, csrf_token = await service.login(
        email=credentials.email,
        password=credentials.password,
        ip_address=client_ip,
        user_agent=user_agent,
    )

    _set_auth_cookies(response, raw_refresh, csrf_token)

    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        expires_in_seconds=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user_id=user.id,
        email=user.email,
        role=user.role,
        csrf_token=csrf_token,
    )


@router.post(
    "/refresh",
    response_model=TokenResponse,
    dependencies=[Depends(RateLimiter(bucket="refresh", fail_closed=True))],
    summary="Rotate Session Refresh Token",
    description="Rotates refresh token atomically; presentation of an already-used token immediately revokes all tokens in the family.",
)
async def refresh_session(
    request: Request,
    response: Response,
    windiq_refresh_token: Annotated[str | None, Cookie()] = None,
    windiq_csrf_token: Annotated[str | None, Cookie()] = None,
    x_csrf_token: Annotated[str | None, Header()] = None,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    """Rotate session tokens with anti-theft reuse detection and CSRF validation."""
    if not windiq_refresh_token:
        response.status_code = status.HTTP_401_UNAUTHORIZED
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session refresh cookie not present.",
        )

    client_ip = get_trusted_client_ip(request)
    user_agent = request.headers.get("User-Agent")
    origin = request.headers.get("Origin") or request.headers.get("Referer")
    settings = get_settings()

    service = AuthService(db)
    new_access_token, new_raw_refresh, user, new_csrf = await service.rotate_refresh_token(
        raw_refresh_secret=windiq_refresh_token,
        header_csrf_token=x_csrf_token,
        cookie_csrf_token=windiq_csrf_token,
        origin_header=origin,
        ip_address=client_ip,
        user_agent=user_agent,
    )

    _set_auth_cookies(response, new_raw_refresh, new_csrf)

    return TokenResponse(
        access_token=new_access_token,
        token_type="bearer",
        expires_in_seconds=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user_id=user.id,
        email=user.email,
        role=user.role,
        csrf_token=new_csrf,
    )


@router.post(
    "/logout",
    dependencies=[Depends(RateLimiter(bucket="logout", fail_closed=True))],
    summary="Terminate Session & Revoke Refresh Family",
    description="Revokes the active refresh token family and purges authentication cookies.",
)
async def logout(
    request: Request,
    response: Response,
    windiq_refresh_token: Annotated[str | None, Cookie()] = None,
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    """Terminate current user session."""
    client_ip = get_trusted_client_ip(request)
    user_agent = request.headers.get("User-Agent")

    service = AuthService(db)
    await service.logout(
        raw_refresh_secret=windiq_refresh_token,
        ip_address=client_ip,
        user_agent=user_agent,
    )

    _clear_auth_cookies(response)
    return {"status": "logged_out"}


@router.get(
    "/me",
    response_model=UserProfileResponse,
    dependencies=[Depends(RateLimiter(bucket="me"))],
    summary="Get Authenticated User Profile",
    description="Returns authenticated principal identity, current assigned role, and effective permissions.",
)
async def get_current_user_profile(
    principal: Principal = Depends(get_current_principal),
) -> UserProfileResponse:
    """Retrieve authenticated user identity context."""
    return UserProfileResponse(
        user_id=principal.id,
        email=principal.identifier,
        full_name=principal.identifier if principal.principal_type == "api_key" else None,
        role=principal.role,
        is_active=True,
        permissions=sorted(list(principal.scopes)),
    )


@router.post(
    "/keys",
    response_model=ApiKeyCreateResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[
        Depends(require_permission("admin:keys")),
        Depends(RateLimiter(bucket="keys", fail_closed=True)),
    ],
    summary="Provision Scoped Machine-to-Machine API Key",
    description="Admin-only: Generates an API key with specific scopes; plaintext key is displayed once and never stored.",
)
async def create_api_key(
    payload: ApiKeyCreateRequest,
    request: Request,
    principal: Principal = Depends(require_permission("admin:keys")),
    db: AsyncSession = Depends(get_db),
) -> ApiKeyCreateResponse:
    """Create a scoped API key."""
    client_ip = get_trusted_client_ip(request)
    user_agent = request.headers.get("User-Agent")

    service = AuthService(db)
    key_record, plaintext_key = await service.create_api_key(
        admin_user_id=principal.id,
        name=payload.name,
        scopes=payload.scopes,
        expires_in_days=payload.expires_in_days,
        ip_address=client_ip,
        user_agent=user_agent,
    )

    return ApiKeyCreateResponse(
        id=key_record.id,
        name=key_record.name,
        key_prefix=key_record.key_prefix,
        plaintext_key=plaintext_key,
        scopes=key_record.scopes,
        expires_at=key_record.expires_at,
        created_at=key_record.created_at,
    )


@router.get(
    "/keys",
    response_model=list[ApiKeyItemResponse],
    dependencies=[
        Depends(require_permission("admin:keys")),
        Depends(RateLimiter(bucket="keys", fail_closed=True)),
    ],
    summary="List Provisioned API Keys",
    description="Admin-only: Lists all machine-to-machine API keys with metadata (excluding secrets).",
)
async def list_api_keys(
    principal: Principal = Depends(require_permission("admin:keys")),
    db: AsyncSession = Depends(get_db),
) -> list[ApiKeyItemResponse]:
    """List all API keys."""
    service = AuthService(db)
    records = await service.list_api_keys()
    return [ApiKeyItemResponse.model_validate(k) for k in records]


@router.delete(
    "/keys/{key_id}",
    dependencies=[
        Depends(require_permission("admin:keys")),
        Depends(RateLimiter(bucket="keys", fail_closed=True)),
    ],
    summary="Revoke Machine-to-Machine API Key",
    description="Admin-only: Immediately revokes an API key.",
)
async def revoke_api_key(
    key_id: uuid.UUID = Path(description="API Key record UUID"),
    request: Request = None,  # type: ignore[assignment]
    principal: Principal = Depends(require_permission("admin:keys")),
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    """Revoke an API key."""
    client_ip = get_trusted_client_ip(request) if request else "unknown"
    user_agent = request.headers.get("User-Agent") if request else None

    service = AuthService(db)
    await service.revoke_api_key(
        key_id=key_id,
        admin_user_id=principal.id,
        ip_address=client_ip,
        user_agent=user_agent,
    )
    return {"status": "revoked", "id": str(key_id)}

