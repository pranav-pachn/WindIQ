# WindIQ Phase 4.1 — Authentication & Role-Based Access Control (RBAC)
## Authoritative Implementation Specification & Engineering Prompt

**Platform**: WindIQ — UK Wind Generation Intelligence & Forecast Accuracy Platform  
**Target Milestone**: Phase 4.1 (Authentication, Sessions, Token Lifecycle & API Keys)  
**Status**: APPROVED IMPLEMENTATION SPECIFICATION (Fully Corrected & Aligned)  
**Author**: Senior Software Architect & Security Engineer  

---

## 1. System Architecture & Centralized Authorization Boundary

Authentication and authorization in WindIQ are strictly enforced at the API boundary using FastAPI dependencies. Individual route handlers and domain services are completely decoupled from authentication mechanics; they receive an authenticated `Principal` domain object or fail at the boundary with HTTP 401 Unauthorized or HTTP 403 Forbidden.

```
Incoming Request
      │
      ▼
[Extract Credentials]
  ├── Authorization: Bearer <JWT>
  ├── Authorization: Bearer wnd_live_<32-byte-hex>
  ├── X-API-Key: wnd_live_<32-byte-hex>
  └── Cookie: windiq_refresh_token (on /api/v1/auth/refresh)
      │
      ▼
[Centralized Dependency: `get_current_principal`]
  ├── 1. Identify credential type (JWT vs API Key vs Refresh Cookie)
  ├── 2. JWT Verification:
  │      • Pinned algorithm: HS256
  │      • Pinned issuer: "windiq-api", audience: "windiq-client"
  │      • Verify exp, nbf (clock skew <= 30s), typ == "access"
  │      • Instant DB User Check: SELECT role, is_active FROM users WHERE id = :sub;
  │      • If is_active == FALSE: raise 401 Unauthorized
  ├── 3. API Key Verification:
  │      • Format: wnd_live_<64-hex>
  │      • Database lookup by SHA-256(plaintext_key)
  │      • Validate is_revoked == FALSE, expires_at > NOW()
  │      • UPDATE api_keys SET last_used_at = NOW()
  └── 4. Construct immutable `Principal` domain context:
         • principal_id: UUID
         • principal_type: PrincipalType.USER | PrincipalType.API_KEY
         • email / name: str
         • role: UserRole.VIEWER | UserRole.ANALYST | UserRole.ADMIN
         • scopes: frozenset[str]
      │
      ▼
[Centralized Dependency: `require_permission(permission: str)`]
  ├── Checks if principal.has_permission(permission)
  ├── If False ──> Raise HTTPException(status_code=403, detail="Forbidden")
  └── If True  ──> Inject Principal into route handler
      │
      ▼
Target Route Handler Executes Business Logic
```

---

## 2. Database Schema & Migration (`alembic/versions/phase4_1_auth_schema.py`)

All timestamp fields use `TIMESTAMPTZ` (UTC). All primary IDs are UUID v4.

```sql
-- 1. Users Table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL UNIQUE,
    hashed_password VARCHAR(255) NOT NULL, -- Argon2id hash string
    full_name VARCHAR(255),
    role VARCHAR(32) NOT NULL DEFAULT 'Viewer', -- 'Viewer', 'Analyst', 'Admin'
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Refresh Token Family Chains (Anti-Replay & Reuse Detection)
CREATE TABLE refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    family_id UUID NOT NULL, -- Shared across all successive rotations of a session
    jti VARCHAR(64) NOT NULL UNIQUE, -- Unique token identifier
    hashed_token VARCHAR(64) NOT NULL UNIQUE, -- SHA-256 digest of secret token string
    is_used BOOLEAN NOT NULL DEFAULT FALSE,
    is_revoked BOOLEAN NOT NULL DEFAULT FALSE,
    replaced_by_jti VARCHAR(64),
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    used_at TIMESTAMPTZ
);

-- 3. Scoped Machine-to-Machine API Keys
CREATE TABLE api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(128) NOT NULL,
    key_prefix VARCHAR(17) NOT NULL, -- "wnd_live_" (9 chars) + 8 hex chars = 17 chars
    hashed_key VARCHAR(64) NOT NULL UNIQUE, -- SHA-256 digest of plaintext key
    scopes TEXT[] NOT NULL DEFAULT '{"read:accuracy"}',
    expires_at TIMESTAMPTZ,
    last_used_at TIMESTAMPTZ,
    is_revoked BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Append-Only Security Audit Event Log
CREATE TABLE security_audit_logs (
    id BIGSERIAL PRIMARY KEY,
    event_type VARCHAR(64) NOT NULL, -- 'login_success', 'login_failure', 'token_reuse_theft', 'key_created', 'key_revoked'
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    ip_address INET NOT NULL,
    user_agent TEXT,
    details JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Immutability Enforcement on Security Audit Log
CREATE OR REPLACE FUNCTION prevent_audit_log_tampering()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'security_audit_logs is an append-only audit table. UPDATE and DELETE operations are prohibited.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_security_audit_immutable
BEFORE UPDATE OR DELETE ON security_audit_logs
FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_tampering();

-- Performance Indexes (Note: UNIQUE constraints already index hashed_token and hashed_key)
CREATE INDEX idx_refresh_tokens_family ON refresh_tokens(family_id);
CREATE INDEX idx_security_audit_created ON security_audit_logs(created_at DESC);
CREATE INDEX idx_users_email ON users(email);
```

---

## 3. Actual Registered Route Authorization Table

WindIQ enforces permissions mapped strictly to actual registered FastAPI routes:

| Route | Method | Required Permission | Viewer | Analyst | Admin | Programmatic Scope |
| :--- | :---: | :--- | :---: | :---: | :---: | :--- |
| `/` | `GET` | *Public* | Allowed | Allowed | Allowed | *None* |
| `/health/live` | `GET` | *Public* | Allowed | Allowed | Allowed | *None* |
| `/health/ready` | `GET` | *Public* | Allowed | Allowed | Allowed | *None* |
| `/api/v1/status` | `GET` | *Public* | Allowed | Allowed | Allowed | *None* |
| `/api/v1/auth/login` | `POST` | *Public (Throttled)* | Allowed | Allowed | Allowed | *None* |
| `/api/v1/auth/refresh` | `POST` | *Public (CSRF+Cookie)*| Allowed | Allowed | Allowed | *None* |
| `/api/v1/auth/logout` | `POST` | `auth:logout` | Allowed | Allowed | Allowed | *None* |
| `/api/v1/auth/me` | `GET` | `auth:me` | Allowed | Allowed | Allowed | `read:profile` |
| `/api/v1/overview` | `GET` | `overview:read` | Allowed | Allowed | Allowed | `read:overview` |
| `/api/v1/accuracy/summary` | `GET` | `accuracy:read` | Allowed | Allowed | Allowed | `read:accuracy` |
| `/api/v1/accuracy/daily` | `GET` | `accuracy:read` | Allowed | Allowed | Allowed | `read:accuracy` |
| `/api/v1/data-health` | `GET` | `health:read` | Allowed | Allowed | Allowed | `read:health` |
| `/api/v1/forecasts` | `GET` | `forecasts:read` | Allowed | Allowed | Allowed | `read:forecasts` |
| `/api/v1/forecasts/horizons` | `GET` | `forecasts:read` | Allowed | Allowed | Allowed | `read:forecasts` |
| `/api/v1/accuracy/hourly` | `GET` | `accuracy:hourly` | **403** | Allowed | Allowed | `read:accuracy_hourly` |
| `/api/v1/forecasts/publications/{delivery_hour_utc}` | `GET` | `forecasts:publications` | **403** | Allowed | Allowed | `read:forecast_publications` |
| `/api/v1/forecasts/revisions` | `GET` | `forecasts:revisions` | **403** | Allowed | Allowed | `read:forecast_revisions` |
| `/api/v1/auth/keys` | `POST` | `auth:manage_keys` | **403** | **403** | Allowed | `admin:keys` |
| `/api/v1/auth/keys` | `GET` | `auth:manage_keys` | **403** | **403** | Allowed | `admin:keys` |
| `/api/v1/auth/keys/{id}` | `DELETE`| `auth:manage_keys` | **403** | **403** | Allowed | `admin:keys` |

---

## 4. Refresh Token Lifecycle, Reuse Detection & Client Concurrency

### 4.1 Transactional Theft Detection (Pre-Commit Requirement)
To prevent active stolen sessions from surviving due to transaction rollbacks, the database transaction **must explicitly commit before returning HTTP 401**:

```python
async def rotate_refresh_token(
    db: AsyncSession,
    raw_token_secret: str,
    ip_address: str,
    user_agent: str,
) -> tuple[str, str]:
    hashed_token = hashlib.sha256(raw_token_secret.encode()).hexdigest()

    # 1. Lock and inspect token
    stmt = select(RefreshToken).where(RefreshToken.hashed_token == hashed_token).with_for_update()
    result = await db.execute(stmt)
    token_record = result.scalar_one_or_none()

    if not token_record or token_record.is_revoked or token_record.expires_at <= datetime.now(UTC):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired session")

    # 2. Check for reuse
    if token_record.is_used:
        # THEFT DETECTED: Revoke entire token family
        await db.execute(
            update(RefreshToken)
            .where(RefreshToken.family_id == token_record.family_id)
            .values(is_revoked=True)
        )
        audit_event = SecurityAuditLog(
            event_type="token_reuse_theft",
            user_id=token_record.user_id,
            ip_address=ip_address,
            user_agent=user_agent,
            details={"revoked_family_id": str(token_record.family_id), "compromised_jti": token_record.jti},
        )
        db.add(audit_event)
        # CRITICAL: Commit transaction to persist revocation before raising exception!
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session security compromise detected. All associated sessions have been revoked.",
        )

    # 3. Legitimate single-use rotation
    new_jti = str(uuid.uuid4())
    new_raw_secret = secrets.token_urlsafe(48)
    new_hashed = hashlib.sha256(new_raw_secret.encode()).hexdigest()

    token_record.is_used = True
    token_record.used_at = datetime.now(UTC)
    token_record.replaced_by_jti = new_jti

    new_token = RefreshToken(
        user_id=token_record.user_id,
        family_id=token_record.family_id,
        jti=new_jti,
        hashed_token=new_hashed,
        expires_at=datetime.now(UTC) + timedelta(days=7),
    )
    db.add(new_token)
    await db.commit()

    new_access_token = create_access_token(user_id=token_record.user_id)
    return new_access_token, new_raw_secret
```

### 4.2 Client-Side Single-Flight Refresh Synchronization
In `frontend/src/lib/api-client.ts`, prevent parallel rotation race conditions when multiple API queries fail simultaneously with 401:

```typescript
let refreshPromise: Promise<string> | null = null;

export async function requestWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
  let response = await fetch(url, options);

  if (response.status === 401 && !url.includes('/api/v1/auth/')) {
    if (!refreshPromise) {
      refreshPromise = executeTokenRefresh().finally(() => {
        refreshPromise = null;
      });
    }

    const newAccessToken = await refreshPromise;
    // Replay failed request with new access token
    options.headers = {
      ...options.headers,
      Authorization: `Bearer ${newAccessToken}`,
    };
    response = await fetch(url, options);
  }

  return response;
}
```

---

## 5. Concrete CSRF Protection Architecture

### 5.1 Signed Double-Submit CSRF Cookie
- On login and token refresh, backend issues two cookies:
  1. `windiq_refresh_token`: `HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth` (secret refresh string).
  2. `windiq_csrf_token`: `Secure; SameSite=Strict; Path=/api/v1/auth` (non-HttpOnly, readable by browser JavaScript).
- On state-changing requests (`/api/v1/auth/refresh`, `/api/v1/auth/logout`):
  1. Browser JavaScript reads cookie `windiq_csrf_token` and attaches header `X-CSRF-Token: <token>`.
  2. Backend validates:
     - `Origin` or `Referer` strictly matches configured CORS origins (`http://localhost:3000` in dev, production domain in prod). No wildcards allowed.
     - `secrets.compare_digest(request.headers.get("X-CSRF-Token"), request.cookies.get("windiq_csrf_token")) == True`.
  3. Environment policy:
     - `development`: `Secure` flag disabled on plaintext localhost HTTP.
     - `production`: `Secure=True`, `SameSite=Strict`, TLS strictly enforced.

---

## 6. Password Security, JWT Validation & API Keys

### 6.1 Argon2id Password Hashing & Login Throttling
- Hashing: `argon2-cffi` (`PasswordHasher(time_cost=3, memory_cost=65536, parallelism=4)`).
- Generic Failure: Always return `HTTP 401 Unauthorized` with detail `"Invalid email or password"`.
- Throttling: IP + email composite counter; locks account after 5 consecutive failures within a 15-minute window.
- Log Scrubbing: Custom logging filter redacts any keys matching `password`, `token`, `secret`, `authorization`, `cookie`.

### 6.2 Strict JWT Validation & Instant Role Verification
- Signing Algorithm: Strictly pinned to `HS256` (rejects `none` and algorithm switching).
- Pinned Claims: `iss="windiq-api"`, `aud="windiq-client"`, `typ="access"`, `sub=<user_uuid>`, `jti=<token_uuid>`, `exp` (15 minutes), `nbf` (with 30s clock skew tolerance).
- **Instant Role Revocation Check**: `get_current_principal` performs a database lookup on `users`:
  ```sql
  SELECT role, is_active FROM users WHERE id = :sub;
  ```
  Deactivations (`is_active = FALSE`) and role changes take effect immediately on subsequent requests.

### 6.3 Scoped API Keys
- Generation: `wnd_live_` + `secrets.token_hex(32)` (total 73 chars).
- Prefix: first 17 characters (`wnd_live_` + 8 hex chars, e.g. `wnd_live_a1b2c3d4`).
- Plaintext shown to administrator once; stored only as `SHA-256(plaintext_key)`.
- Scopes: `["read:accuracy"]`, `["read:accuracy_hourly"]`, `["read:forecast_publications"]`, `["read:forecast_revisions"]`, `["admin:keys"]`.
- Instant revocation via `DELETE /api/v1/auth/keys/{id}` sets `is_revoked = TRUE`.

---

## 7. Comprehensive 30-Case Test Matrix (`tests/test_phase_4_1_auth_rbac.py`)

Every test exercises real cryptographic signatures, database states, and authorization dependencies (zero backdoor bypasses).

### 7.1 Authentication & Credentials (6 tests)
- `test_login_success`: Valid credentials return 200, JWT access token, and set refresh cookie + CSRF cookie.
- `test_login_invalid_password`: Wrong password returns 401 with generic message, logs `login_failure`.
- `test_login_inactive_user`: Deactivated user (`is_active = FALSE`) returns 401.
- `test_jwt_signature_verification`: Forged JWT token returns 401.
- `test_jwt_expired`: Expired JWT access token returns 401.
- `test_credentials_redacted_in_logs`: Logs never contain plaintext passwords, tokens, or raw secrets.

### 7.2 Centralized RBAC Role Boundaries (10 tests)
- `test_viewer_can_read_overview`: Viewer accesses `/api/v1/overview` (200).
- `test_viewer_can_read_accuracy_summary`: Viewer accesses `/api/v1/accuracy/summary` (200).
- `test_viewer_can_read_accuracy_daily`: Viewer accesses `/api/v1/accuracy/daily` (200).
- `test_viewer_cannot_access_accuracy_hourly`: Viewer receives 403 on `/api/v1/accuracy/hourly`.
- `test_viewer_cannot_access_publications_trace`: Viewer receives 403 on `/api/v1/forecasts/publications/{hour}`.
- `test_viewer_cannot_access_revisions`: Viewer receives 403 on `/api/v1/forecasts/revisions`.
- `test_analyst_can_access_hourly_and_revisions`: Analyst accesses hourly accuracy, publications trace, and revisions (all 200).
- `test_analyst_cannot_manage_keys`: Analyst receives 403 on `/api/v1/auth/keys`.
- `test_admin_full_access`: Admin executes all Viewer, Analyst, and Key management operations (200).
- `test_unauthenticated_request_rejected`: Direct request without credentials to protected route returns 401.

### 7.3 Refresh Token Rotation & Anti-Theft Protection (6 tests)
- `test_refresh_token_success`: Valid refresh token returns fresh access token and new rotated refresh token.
- `test_refresh_token_marked_used`: Prior refresh token is marked `is_used = TRUE`.
- `test_refresh_token_reuse_revokes_entire_family`: Replaying an already-used refresh token returns 401 and sets `is_revoked = TRUE` across all tokens sharing that `family_id`.
- `test_reuse_theft_persisted_before_401`: Verifies database transaction committed revocation even though 401 was raised.
- `test_logout_revokes_family`: Calling `/api/v1/auth/logout` revokes the token family and clears cookies.
- `test_refresh_csrf_protection`: Calling refresh endpoint without valid Origin/CSRF header returns 403.

### 7.4 Scoped API Keys (5 tests)
- `test_api_key_authentication_success`: Valid API key authenticated via header returns 200 on authorized routes.
- `test_api_key_revocation_immediate`: Revoked API key is immediately rejected with 401.
- `test_api_key_expiration`: Expired API key is rejected with 401.
- `test_api_key_scope_enforcement`: API key with scope `["read:accuracy"]` can read summary but receives 403 on hourly accuracy.
- `test_api_key_last_used_timestamp_updates`: Calling API with key updates `last_used_at` in database.

### 7.5 Audit Immutability & Ground Truth Preservation (3 tests)
- `test_security_audit_log_immutable`: Direct `UPDATE` or `DELETE` on `security_audit_logs` raises PostgreSQL exception.
- `test_instant_role_revocation`: Demoting user from Analyst to Viewer immediately blocks access to `/api/v1/accuracy/hourly` on next request without re-login.
- `test_ground_truth_preserved_authenticated`: Authenticated evaluation query reproduces canonical January baseline:
  $$\text{Hours} = 744, \quad \text{MAE} = 2,038.9126\text{ MW}, \quad \text{RMSE} = 2,504.7587\text{ MW}, \quad \text{Bias} = +1,747.8871\text{ MW}$$
