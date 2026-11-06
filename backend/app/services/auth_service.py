"""Authentication service managing login, single-flight refresh rotation, token theft detection, and API keys."""

import hashlib
import uuid
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException, status
from sqlalchemy import desc, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.logging import get_logger
from app.core.security import (
    create_access_token,
    generate_api_key,
    generate_csrf_token,
    generate_refresh_token,
    hash_password,
    verify_csrf_token,
    verify_password,
)
from app.models.auth import ApiKey, RefreshToken, SecurityAuditLog, User, UserRole

logger = get_logger("windiq.service.auth")


class AuthService:
    """Enterprise authentication service with anti-theft token rotation and audit logging."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.settings = get_settings()

    async def login(
        self,
        email: str,
        password: str,
        ip_address: str,
        user_agent: str | None = None,
    ) -> tuple[str, str, User, str]:
        """Authenticate user credentials with attempt throttling and security audit logging.

        Returns:
            tuple: (access_token, raw_refresh_secret, user, csrf_token)
        """
        now = datetime.now(UTC)
        normalized_email = email.lower().strip()

        # 1. Login Attempt Throttling (5 failed attempts per 15 minutes per IP or email)
        throttle_window_start = now - timedelta(minutes=15)
        failure_count_stmt = (
            select(func.count(SecurityAuditLog.id))
            .where(SecurityAuditLog.event_type == "login_failure")
            .where(SecurityAuditLog.created_at >= throttle_window_start)
            .where(
                (SecurityAuditLog.ip_address == ip_address)
                & (SecurityAuditLog.details["email"].as_string() == normalized_email)
            )
        )
        res = await self.db.execute(failure_count_stmt)
        failed_count = res.scalar() or 0

        if failed_count >= 5:
            logger.warning(
                "Login throttled for ip=%s email=%s (failed_count=%d)",
                ip_address,
                normalized_email,
                failed_count,
            )
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many failed login attempts. Please wait 15 minutes before retrying.",
            )

        # 2. Lookup user and verify Argon2id hash
        stmt = select(User).where(User.email == normalized_email)
        res = await self.db.execute(stmt)
        user = res.scalar_one_or_none()

        if not user or not verify_password(password, user.hashed_password):
            # Record audit failure with transaction commit
            audit_event = SecurityAuditLog(
                event_type="login_failure",
                user_id=user.id if user else None,
                ip_address=ip_address,
                user_agent=user_agent,
                details={"email": normalized_email, "reason": "invalid_credentials"},
            )
            self.db.add(audit_event)
            await self.db.commit()
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password.",
            )

        if not user.is_active:
            audit_event = SecurityAuditLog(
                event_type="login_failure",
                user_id=user.id,
                ip_address=ip_address,
                user_agent=user_agent,
                details={"email": normalized_email, "reason": "inactive_account"},
            )
            self.db.add(audit_event)
            await self.db.commit()
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password.",
            )

        # 3. Legitimate authentication: issue access token and initial refresh token family
        access_token, _ = create_access_token(user.id, user.role)
        raw_refresh_secret, jti, hashed_token = generate_refresh_token()
        family_id = uuid.uuid4()
        refresh_expires = now + timedelta(days=self.settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS)

        new_refresh_record = RefreshToken(
            user_id=user.id,
            family_id=family_id,
            jti=jti,
            hashed_token=hashed_token,
            expires_at=refresh_expires,
        )
        self.db.add(new_refresh_record)

        audit_event = SecurityAuditLog(
            event_type="login_success",
            user_id=user.id,
            ip_address=ip_address,
            user_agent=user_agent,
            details={"email": normalized_email, "role": user.role, "family_id": str(family_id)},
        )
        self.db.add(audit_event)
        await self.db.commit()

        csrf_token = generate_csrf_token()
        return access_token, raw_refresh_secret, user, csrf_token

    async def rotate_refresh_token(
        self,
        raw_refresh_secret: str,
        header_csrf_token: str | None,
        cookie_csrf_token: str | None,
        origin_header: str | None,
        ip_address: str,
        user_agent: str | None = None,
    ) -> tuple[str, str, User, str]:
        """Atomic refresh token rotation with immediate pre-commit theft family revocation.

        Returns:
            tuple: (new_access_token, new_raw_refresh_secret, user, new_csrf_token)
        """
        now = datetime.now(UTC)

        # 1. CSRF & Origin Validation
        if origin_header:
            cleaned_origin = origin_header.strip().rstrip("/")
            valid_origins = [o.rstrip("/") for o in self.settings.CORS_ORIGINS]
            if cleaned_origin not in valid_origins:
                logger.warning("CSRF origin validation failure: %s not in %s", cleaned_origin, valid_origins)
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Cross-site request forgery origin mismatch.",
                )

        if not verify_csrf_token(header_csrf_token, cookie_csrf_token):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Invalid or missing CSRF synchronizer token.",
            )

        # 2. Lock and inspect presented refresh token
        hashed_token = hashlib.sha256(raw_refresh_secret.encode("utf-8")).hexdigest()
        stmt = (
            select(RefreshToken)
            .where(RefreshToken.hashed_token == hashed_token)
            .with_for_update()
        )
        res = await self.db.execute(stmt)
        token_record = res.scalar_one_or_none()

        if not token_record:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or unrecognised refresh token.",
            )

        if token_record.is_revoked:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Session has been revoked.",
            )

        if token_record.expires_at <= now:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Refresh token has expired. Please re-authenticate.",
            )

        # 3. REUSE DETECTION (THEFT DETECTED)
        if token_record.is_used:
            logger.error(
                "SECURITY ALERT: Refresh token reuse detected! Revoking family_id=%s user_id=%s ip=%s",
                token_record.family_id,
                token_record.user_id,
                ip_address,
            )
            # Revoke entire token family
            await self.db.execute(
                update(RefreshToken)
                .where(RefreshToken.family_id == token_record.family_id)
                .values(is_revoked=True)
            )
            audit_event = SecurityAuditLog(
                event_type="token_reuse_theft",
                user_id=token_record.user_id,
                ip_address=ip_address,
                user_agent=user_agent,
                details={
                    "family_id": str(token_record.family_id),
                    "compromised_jti": token_record.jti,
                    "action": "revoked_all_family_tokens",
                },
            )
            self.db.add(audit_event)
            # CRITICAL: Commit revocation transaction before raising HTTP 401 exception!
            await self.db.commit()

            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Session compromise detected. All associated sessions have been terminated for security.",
            )

        # 4. Valid single-use rotation
        new_raw_secret, new_jti, new_hashed = generate_refresh_token()
        token_record.is_used = True
        token_record.used_at = now
        token_record.replaced_by_jti = new_jti

        new_record = RefreshToken(
            user_id=token_record.user_id,
            family_id=token_record.family_id,
            jti=new_jti,
            hashed_token=new_hashed,
            expires_at=now + timedelta(days=self.settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS),
        )
        self.db.add(new_record)

        # Lookup user to ensure still active
        user_stmt = select(User).where(User.id == token_record.user_id)
        user_res = await self.db.execute(user_stmt)
        user = user_res.scalar_one_or_none()

        if not user or not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User account is inactive.",
            )

        new_access_token, _ = create_access_token(user.id, user.role)
        new_csrf_token = generate_csrf_token()

        audit_event = SecurityAuditLog(
            event_type="token_rotated",
            user_id=user.id,
            ip_address=ip_address,
            user_agent=user_agent,
            details={"family_id": str(token_record.family_id), "new_jti": new_jti},
        )
        self.db.add(audit_event)
        await self.db.commit()

        return new_access_token, new_raw_secret, user, new_csrf_token

    async def logout(
        self,
        raw_refresh_secret: str | None,
        ip_address: str,
        user_agent: str | None = None,
    ) -> None:
        """Revoke active refresh token family and log session termination."""
        if not raw_refresh_secret:
            return

        hashed_token = hashlib.sha256(raw_refresh_secret.encode("utf-8")).hexdigest()
        stmt = (
            select(RefreshToken)
            .where(RefreshToken.hashed_token == hashed_token)
            .with_for_update()
        )
        res = await self.db.execute(stmt)
        token_record = res.scalar_one_or_none()

        if token_record:
            await self.db.execute(
                update(RefreshToken)
                .where(RefreshToken.family_id == token_record.family_id)
                .values(is_revoked=True)
            )
            audit_event = SecurityAuditLog(
                event_type="logout",
                user_id=token_record.user_id,
                ip_address=ip_address,
                user_agent=user_agent,
                details={"family_id": str(token_record.family_id)},
            )
            self.db.add(audit_event)
            await self.db.commit()

    async def create_api_key(
        self,
        admin_user_id: uuid.UUID,
        name: str,
        scopes: list[str],
        expires_in_days: int | None,
        ip_address: str,
        user_agent: str | None = None,
    ) -> tuple[ApiKey, str]:
        """Generate a machine-to-machine API key, revealing plaintext key exactly once."""
        now = datetime.now(UTC)
        plaintext_key, key_prefix, hashed_key = generate_api_key()
        expires_at = now + timedelta(days=expires_in_days) if expires_in_days else None

        key_record = ApiKey(
            user_id=admin_user_id,
            name=name.strip(),
            key_prefix=key_prefix,
            hashed_key=hashed_key,
            scopes=scopes,
            expires_at=expires_at,
        )
        self.db.add(key_record)

        audit_event = SecurityAuditLog(
            event_type="key_created",
            user_id=admin_user_id,
            ip_address=ip_address,
            user_agent=user_agent,
            details={"key_name": name, "key_prefix": key_prefix, "scopes": scopes},
        )
        self.db.add(audit_event)
        await self.db.commit()
        await self.db.refresh(key_record)

        return key_record, plaintext_key

    async def list_api_keys(self) -> list[ApiKey]:
        """List all provisioned machine-to-machine API keys ordered by creation date."""
        stmt = select(ApiKey).order_by(desc(ApiKey.created_at))
        res = await self.db.execute(stmt)
        return list(res.scalars().all())

    async def revoke_api_key(
        self,
        key_id: uuid.UUID,
        admin_user_id: uuid.UUID,
        ip_address: str,
        user_agent: str | None = None,
    ) -> None:
        """Immediately revoke an API key."""
        stmt = select(ApiKey).where(ApiKey.id == key_id).with_for_update()
        res = await self.db.execute(stmt)
        key_record = res.scalar_one_or_none()

        if not key_record:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="API key not found.")

        key_record.is_revoked = True
        audit_event = SecurityAuditLog(
            event_type="key_revoked",
            user_id=admin_user_id,
            ip_address=ip_address,
            user_agent=user_agent,
            details={"key_id": str(key_id), "key_prefix": key_record.key_prefix},
        )
        self.db.add(audit_event)
        await self.db.commit()

    async def seed_default_users_if_empty(self) -> None:
        """Seed default role accounts for development and testing environments."""
        stmt = select(func.count(User.id))
        res = await self.db.execute(stmt)
        count = res.scalar() or 0

        if count > 0:
            return

        logger.info("Seeding initial development role accounts (Admin, Analyst, Viewer)...")
        defaults = [
            ("admin@windiq.local", "AdminPass123!#", "Platform Administrator", UserRole.ADMIN.value),
            ("analyst@windiq.local", "AnalystPass123!#", "Energy Analyst", UserRole.ANALYST.value),
            ("viewer@windiq.local", "ViewerPass123!#", "Executive Viewer", UserRole.VIEWER.value),
        ]
        for email, password, full_name, role in defaults:
            user = User(
                email=email,
                hashed_password=hash_password(password),
                full_name=full_name,
                role=role,
                is_active=True,
            )
            self.db.add(user)
        await self.db.commit()
        logger.info("Default development accounts seeded successfully.")
