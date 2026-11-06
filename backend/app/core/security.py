"""Cryptographic security utilities: Argon2id password hashing, pinned JWT verification, API key management, and CSRF protection."""

import hashlib
import secrets
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError
from fastapi import HTTPException, status

from app.core.config import get_settings

# Argon2id password hasher with recommended enterprise security parameters
_hasher = PasswordHasher(
    time_cost=3,
    memory_cost=65536,  # 64 MB
    parallelism=4,
    hash_len=32,
    salt_len=16,
)


def hash_password(password: str) -> str:
    """Hash a plaintext password using Argon2id."""
    return _hasher.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plaintext password against an Argon2id hash."""
    try:
        return _hasher.verify(hashed_password, plain_password)
    except (VerifyMismatchError, InvalidHashError):
        return False


def create_access_token(
    user_id: uuid.UUID,
    role: str,
    expires_delta: timedelta | None = None,
) -> tuple[str, str]:
    """Create a signed JWT access token with pinned algorithm and security claims.

    Returns:
        tuple[str, str]: (encoded_jwt_token, jti)
    """
    settings = get_settings()
    now = datetime.now(UTC)
    lifetime = expires_delta or timedelta(minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES)
    expire_at = now + lifetime
    token_jti = str(uuid.uuid4())

    payload: dict[str, Any] = {
        "sub": str(user_id),
        "role": role,
        "iss": settings.JWT_ISSUER,
        "aud": settings.JWT_AUDIENCE,
        "typ": "access",
        "jti": token_jti,
        "iat": int(now.timestamp()),
        "nbf": int((now - timedelta(seconds=10)).timestamp()),  # 10s clock skew leeway
        "exp": int(expire_at.timestamp()),
    }

    token = jwt.encode(
        payload,
        settings.JWT_SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM,
    )
    return token, token_jti


def decode_access_token(token: str) -> dict[str, Any]:
    """Decode and validate a JWT access token with strict claims checking.

    Enforces:
    - Pinned signing algorithm (HS256)
    - Pinned issuer and audience
    - Token type ("access")
    - Expiration and not-before claims with 30s maximum clock skew
    """
    settings = get_settings()
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
            issuer=settings.JWT_ISSUER,
            audience=settings.JWT_AUDIENCE,
            leeway=30,  # 30-second clock skew allowance
            options={
                "verify_signature": True,
                "verify_exp": True,
                "verify_nbf": True,
                "verify_iat": True,
                "verify_aud": True,
                "verify_iss": True,
                "require": ["sub", "role", "iss", "aud", "typ", "jti", "exp", "iat"],
            },
        )
    except jwt.ExpiredSignatureError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Access token has expired.",
            headers={"WWW-Authenticate": "Bearer error=\"invalid_token\", error_description=\"token expired\""},
        ) from exc
    except jwt.PyJWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid access token credentials.",
            headers={"WWW-Authenticate": "Bearer error=\"invalid_token\""},
        ) from exc

    if payload.get("typ") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token type; expected access token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return payload


def generate_refresh_token() -> tuple[str, str, str]:
    """Generate a high-entropy refresh token secret and its SHA-256 digest.

    Returns:
        tuple[str, str, str]: (plaintext_secret, jti, sha256_hashed_token)
    """
    plaintext_secret = secrets.token_urlsafe(48)
    token_jti = str(uuid.uuid4())
    hashed_token = hashlib.sha256(plaintext_secret.encode("utf-8")).hexdigest()
    return plaintext_secret, token_jti, hashed_token


def hash_token(raw_secret: str) -> str:
    """Compute SHA-256 digest of a secret string."""
    return hashlib.sha256(raw_secret.encode("utf-8")).hexdigest()


def generate_api_key() -> tuple[str, str, str]:
    """Generate a machine-to-machine API key with prefix and SHA-256 digest.

    Format: `wnd_live_<64-hex-chars>` (Total 73 characters)
    Prefix: First 17 characters (`wnd_live_` + 8 hex chars)

    Returns:
        tuple[str, str, str]: (plaintext_key, key_prefix, sha256_hashed_key)
    """
    secret_hex = secrets.token_hex(32)
    plaintext_key = f"wnd_live_{secret_hex}"
    key_prefix = plaintext_key[:17]
    hashed_key = hashlib.sha256(plaintext_key.encode("utf-8")).hexdigest()
    return plaintext_key, key_prefix, hashed_key


def generate_csrf_token() -> str:
    """Generate a 32-byte cryptographic hex CSRF token."""
    return secrets.token_hex(32)


def verify_csrf_token(header_token: str | None, cookie_token: str | None) -> bool:
    """Verify CSRF token using constant-time string comparison."""
    if not header_token or not cookie_token:
        return False
    return secrets.compare_digest(header_token.strip(), cookie_token.strip())

