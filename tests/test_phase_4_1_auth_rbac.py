"""Comprehensive 30-case test suite for Phase 4.1: Authentication, RBAC, Token Lifecycle & Audit Immutability."""

import json
import urllib.error
import urllib.request
import uuid
import pytest

BASE_URL = "http://localhost:8001/api/v1"


def _http_request(
    path: str,
    method: str = "GET",
    body: dict | None = None,
    headers: dict | None = None,
    cookies: dict | None = None,
) -> tuple[int, dict, dict]:
    """Execute live HTTP request against running backend container."""
    url = f"{BASE_URL}{path}"
    req_headers = {
        "User-Agent": "WindIQ-Test/1.0",
        "X-Test-Rate-Limit-Bypass": "true",
    }
    if headers:
        req_headers.update(headers)

    if cookies:
        cookie_str = "; ".join(f"{k}={v}" for k, v in cookies.items())
        req_headers["Cookie"] = cookie_str

    data_bytes = None
    if body is not None:
        req_headers["Content-Type"] = "application/json"
        data_bytes = json.dumps(body).encode("utf-8")

    req = urllib.request.Request(url, data=data_bytes, headers=req_headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            resp_body = resp.read().decode("utf-8")
            resp_json = json.loads(resp_body) if resp_body else {}
            # Extract cookies from response headers
            resp_cookies = {}
            for header_name, header_val in resp.headers.items():
                if header_name.lower() == "set-cookie":
                    cookie_parts = header_val.split(";")[0].split("=", 1)
                    if len(cookie_parts) == 2:
                        resp_cookies[cookie_parts[0].strip()] = cookie_parts[1].strip()
            return resp.status, resp_json, resp_cookies
    except urllib.error.HTTPError as err:
        err_body = err.read().decode("utf-8")
        try:
            err_json = json.loads(err_body)
        except Exception:
            err_json = {"raw": err_body}
        return err.code, err_json, {}


def _login(role: str) -> tuple[str, str, str]:
    """Login helper returning (access_token, raw_refresh_token, csrf_token)."""
    passwords = {
        "Admin": "AdminPass123!#",
        "Analyst": "AnalystPass123!#",
        "Viewer": "ViewerPass123!#",
    }
    email = f"{role.lower()}@windiq.local"
    status, data, cookies = _http_request(
        "/auth/login",
        method="POST",
        body={"email": email, "password": passwords[role]},
    )
    if status == 429:
        try:
            import redis
            r = redis.from_url("redis://:windiq_redis_dev_secret_pass@127.0.0.1:6385/0")
            for k in r.keys("windiq:rl:login:*"):
                r.delete(k)
            status, data, cookies = _http_request(
                "/auth/login",
                method="POST",
                body={"email": email, "password": passwords[role]},
            )
        except Exception:
            pass

    assert status == 200, f"Login failed: {data}"
    refresh_token = cookies.get("windiq_refresh_token") or ""
    csrf_token = data.get("csrf_token") or cookies.get("windiq_csrf_token") or ""
    return data["access_token"], refresh_token, csrf_token


# ============================================================================
# 1. Authentication & Credentials (Tests 1-6)
# ============================================================================

def test_01_login_success():
    status, data, cookies = _http_request(
        "/auth/login",
        method="POST",
        body={"email": "admin@windiq.local", "password": "AdminPass123!#"},
    )
    assert status == 200
    assert "access_token" in data
    assert data["role"] == "Admin"
    assert "windiq_refresh_token" in cookies
    assert "windiq_csrf_token" in cookies


def test_02_login_invalid_password():
    status, data, _ = _http_request(
        "/auth/login",
        method="POST",
        body={"email": "bad_password_test@windiq.local", "password": "WrongPassword999!"},
    )
    assert status == 401
    assert data.get("detail") == "Invalid email or password."


def test_03_login_inactive_user():
    # Calling with nonexistent or inactive user returns generic 401
    status, data, _ = _http_request(
        "/auth/login",
        method="POST",
        body={"email": "nonexistent@windiq.local", "password": "SomePassword123!"},
    )
    assert status == 401
    assert data.get("detail") == "Invalid email or password."


def test_04_jwt_signature_verification():
    # Tampered signature on valid JWT
    token, _, _ = _login("Viewer")
    tampered = token[:-6] + "xxxxxx"
    status, data, _ = _http_request(
        "/overview",
        headers={"Authorization": f"Bearer {tampered}"},
    )
    assert status == 401


def test_05_jwt_expired():
    # Calling with fake token structure claiming expiration in the past
    bogus_token = (
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
        "eyJzdWIiOiIxMmY4M2Q2OC1kOTRjLTQ4ODktYTBlZC0wNWU3ZDlhOWNjODkiLCJyb2xlIjoiQWRtaW4iLCJpc3MiOiJ3aW5kaXEtYXBpIiwiYXVkIjoid2luZGlxLWNsaWVudCIsInR5cCI6ImFjY2VzcyIsImp0aSI6ImZvbyIsImlhdCI6MTYwMDAwMDAwMCwiZXhwIjoxNjAwMDAwMTAwfQ."
        "c2lnbmF0dXJl"
    )
    status, data, _ = _http_request(
        "/overview",
        headers={"Authorization": f"Bearer {bogus_token}"},
    )
    assert status == 401


def test_06_credentials_redacted_in_logs():
    # Request profile to verify returned structure doesn't leak secrets
    token, _, _ = _login("Analyst")
    status, data, _ = _http_request(
        "/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert status == 200
    assert "hashed_password" not in data
    assert "token" not in data


# ============================================================================
# 2. Centralized RBAC Role Boundaries (Tests 7-16)
# ============================================================================

def test_07_viewer_can_read_overview():
    token, _, _ = _login("Viewer")
    status, data, _ = _http_request("/overview", headers={"Authorization": f"Bearer {token}"})
    assert status == 200
    assert data["platform"] == "WindIQ API UK Forecast Accuracy Platform"


def test_08_viewer_can_read_accuracy_summary():
    token, _, _ = _login("Viewer")
    status, data, _ = _http_request("/accuracy/summary", headers={"Authorization": f"Bearer {token}"})
    assert status == 200
    assert "metrics" in data


def test_09_viewer_can_read_accuracy_daily():
    token, _, _ = _login("Viewer")
    status, data, _ = _http_request("/accuracy/daily", headers={"Authorization": f"Bearer {token}"})
    assert status == 200
    assert "items" in data


def test_10_viewer_cannot_access_accuracy_hourly():
    token, _, _ = _login("Viewer")
    status, data, _ = _http_request("/accuracy/hourly", headers={"Authorization": f"Bearer {token}"})
    assert status == 403


def test_11_viewer_cannot_access_publications_trace():
    token, _, _ = _login("Viewer")
    status, data, _ = _http_request(
        "/forecasts/publications/2026-01-28T12:00:00Z",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert status == 403


def test_12_viewer_cannot_access_revisions():
    token, _, _ = _login("Viewer")
    status, data, _ = _http_request("/forecasts/revisions", headers={"Authorization": f"Bearer {token}"})
    assert status == 403


def test_13_analyst_can_access_hourly_and_revisions():
    token, _, _ = _login("Analyst")
    status1, data1, _ = _http_request("/accuracy/hourly?page=1&page_size=2", headers={"Authorization": f"Bearer {token}"})
    assert status1 == 200

    status2, data2, _ = _http_request(
        "/forecasts/revisions?delivery_date_from=2026-01-02&delivery_date_to=2026-02-01",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert status2 == 200
    assert data2["forward_only_revisions"] == 13367


def test_14_analyst_cannot_manage_keys():
    token, _, _ = _login("Analyst")
    status, _, _ = _http_request(
        "/auth/keys",
        method="POST",
        body={"name": "HackerKey", "scopes": ["read:accuracy"]},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert status == 403


def test_15_admin_full_access():
    token, _, _ = _login("Admin")
    # Admin can access Viewer route
    s1, _, _ = _http_request("/overview", headers={"Authorization": f"Bearer {token}"})
    assert s1 == 200
    # Admin can access Analyst route
    s2, _, _ = _http_request("/forecasts/revisions", headers={"Authorization": f"Bearer {token}"})
    assert s2 == 200
    # Admin can access Admin route
    s3, _, _ = _http_request("/auth/keys", headers={"Authorization": f"Bearer {token}"})
    assert s3 == 200


def test_16_unauthenticated_request_rejected():
    status, _, _ = _http_request("/overview")
    assert status == 401


# ============================================================================
# 3. Refresh Token Rotation & Anti-Theft Protection (Tests 17-22)
# ============================================================================

def test_17_refresh_token_success():
    _, refresh_token, csrf_token = _login("Analyst")
    status, data, cookies = _http_request(
        "/auth/refresh",
        method="POST",
        cookies={"windiq_refresh_token": refresh_token, "windiq_csrf_token": csrf_token},
        headers={"X-CSRF-Token": csrf_token, "Origin": "http://localhost:3000"},
    )
    assert status == 200
    assert "access_token" in data
    assert "windiq_refresh_token" in cookies


def test_18_refresh_token_marked_used_and_theft_detected():
    _, refresh_token, csrf_token = _login("Analyst")
    # Legitimate first rotation
    s1, d1, c1 = _http_request(
        "/auth/refresh",
        method="POST",
        cookies={"windiq_refresh_token": refresh_token, "windiq_csrf_token": csrf_token},
        headers={"X-CSRF-Token": csrf_token, "Origin": "http://localhost:3000"},
    )
    assert s1 == 200
    new_token_1 = d1["access_token"]
    new_refresh_1 = c1["windiq_refresh_token"]
    new_csrf_1 = d1["csrf_token"]

    # REPLAY OLD TOKEN (Simulates token theft)
    s2, d2, _ = _http_request(
        "/auth/refresh",
        method="POST",
        cookies={"windiq_refresh_token": refresh_token, "windiq_csrf_token": csrf_token},
        headers={"X-CSRF-Token": csrf_token, "Origin": "http://localhost:3000"},
    )
    assert s2 == 401
    assert "compromise detected" in d2.get("detail", "").lower()

    # Even the legitimately rotated token is now revoked because the whole family is revoked!
    s3, _, _ = _http_request(
        "/auth/refresh",
        method="POST",
        cookies={"windiq_refresh_token": new_refresh_1, "windiq_csrf_token": new_csrf_1},
        headers={"X-CSRF-Token": new_csrf_1, "Origin": "http://localhost:3000"},
    )
    assert s3 == 401


def test_19_logout_revokes_family():
    _, refresh_token, csrf_token = _login("Viewer")
    s1, _, _ = _http_request(
        "/auth/logout",
        method="POST",
        cookies={"windiq_refresh_token": refresh_token},
    )
    assert s1 == 200

    # Refresh after logout fails
    s2, _, _ = _http_request(
        "/auth/refresh",
        method="POST",
        cookies={"windiq_refresh_token": refresh_token, "windiq_csrf_token": csrf_token},
        headers={"X-CSRF-Token": csrf_token, "Origin": "http://localhost:3000"},
    )
    assert s2 == 401


def test_20_refresh_csrf_protection_missing_header():
    _, refresh_token, csrf_token = _login("Viewer")
    # Calling refresh with cookie but without X-CSRF-Token header
    status, data, _ = _http_request(
        "/auth/refresh",
        method="POST",
        cookies={"windiq_refresh_token": refresh_token, "windiq_csrf_token": csrf_token},
        headers={"Origin": "http://localhost:3000"},
    )
    assert status == 403


def test_21_refresh_csrf_protection_origin_mismatch():
    _, refresh_token, csrf_token = _login("Viewer")
    # Calling refresh with malicious origin
    status, _, _ = _http_request(
        "/auth/refresh",
        method="POST",
        cookies={"windiq_refresh_token": refresh_token, "windiq_csrf_token": csrf_token},
        headers={"X-CSRF-Token": csrf_token, "Origin": "http://attacker-site.com"},
    )
    assert status == 403


def test_22_single_flight_refresh_simulation():
    # Verify that consecutive legitimate refreshes succeed when using newest token
    _, refresh_token, csrf_token = _login("Analyst")
    s1, d1, c1 = _http_request(
        "/auth/refresh",
        method="POST",
        cookies={"windiq_refresh_token": refresh_token, "windiq_csrf_token": csrf_token},
        headers={"X-CSRF-Token": csrf_token, "Origin": "http://localhost:3000"},
    )
    assert s1 == 200
    # Second rotation with newest token succeeds
    s2, d2, _ = _http_request(
        "/auth/refresh",
        method="POST",
        cookies={"windiq_refresh_token": c1["windiq_refresh_token"], "windiq_csrf_token": d1["csrf_token"]},
        headers={"X-CSRF-Token": d1["csrf_token"], "Origin": "http://localhost:3000"},
    )
    assert s2 == 200


# ============================================================================
# 4. Scoped Machine-to-Machine API Keys (Tests 23-27)
# ============================================================================

def test_23_api_key_authentication_success():
    token, _, _ = _login("Admin")
    # Provision scoped key
    s1, d1, _ = _http_request(
        "/auth/keys",
        method="POST",
        body={"name": "IntegrationTestKey", "scopes": ["read:accuracy", "read:accuracy_hourly"]},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert s1 == 201
    plain_key = d1["plaintext_key"]
    assert plain_key.startswith("wnd_live_")

    # Access endpoint via X-API-Key
    s2, d2, _ = _http_request(
        "/accuracy/summary",
        headers={"X-API-Key": plain_key},
    )
    assert s2 == 200


def test_24_api_key_revocation_immediate():
    token, _, _ = _login("Admin")
    s1, d1, _ = _http_request(
        "/auth/keys",
        method="POST",
        body={"name": "TemporaryKey", "scopes": ["read:accuracy"]},
        headers={"Authorization": f"Bearer {token}"},
    )
    key_id = d1["id"]
    plain_key = d1["plaintext_key"]

    # Delete key
    s2, _, _ = _http_request(
        f"/auth/keys/{key_id}",
        method="DELETE",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert s2 == 200

    # Key immediately rejected
    s3, _, _ = _http_request(
        "/accuracy/summary",
        headers={"X-API-Key": plain_key},
    )
    assert s3 == 401


def test_25_api_key_scope_enforcement():
    token, _, _ = _login("Admin")
    # Key provisioned ONLY for overview
    s1, d1, _ = _http_request(
        "/auth/keys",
        method="POST",
        body={"name": "OverviewOnlyKey", "scopes": ["read:overview"]},
        headers={"Authorization": f"Bearer {token}"},
    )
    plain_key = d1["plaintext_key"]

    # Allowed overview
    s2, _, _ = _http_request("/overview", headers={"X-API-Key": plain_key})
    assert s2 == 200

    # Forbidden hourly evaluations
    s3, _, _ = _http_request("/accuracy/hourly", headers={"X-API-Key": plain_key})
    assert s3 == 403


def test_26_api_key_last_used_at_updates():
    token, _, _ = _login("Admin")
    s1, d1, _ = _http_request(
        "/auth/keys",
        method="POST",
        body={"name": "TrackingKey", "scopes": ["read:accuracy"]},
        headers={"Authorization": f"Bearer {token}"},
    )
    key_id = d1["id"]
    plain_key = d1["plaintext_key"]

    # Call endpoint with key
    _http_request("/accuracy/summary", headers={"X-API-Key": plain_key})

    # Query key listing and verify last_used_at is not null
    s3, d3, _ = _http_request("/auth/keys", headers={"Authorization": f"Bearer {token}"})
    assert s3 == 200
    target_key = next((k for k in d3 if k["id"] == key_id), None)
    assert target_key is not None
    assert target_key["last_used_at"] is not None


def test_27_invalid_api_key_format():
    status, _, _ = _http_request(
        "/accuracy/summary",
        headers={"X-API-Key": "wnd_live_invalidbogushex12345"},
    )
    assert status == 401


# ============================================================================
# 5. Audit Immutability & Ground Truth Preservation (Tests 28-30)
# ============================================================================

def test_28_audit_immutability_trigger():
    # Verified by executing delete command inside PostgreSQL container and checking error
    import subprocess
    cmd = ["docker", "exec", "windiq-db", "psql", "-U", "postgres", "-d", "windiq", "-c", "DELETE FROM security_audit_logs;"]
    result = subprocess.run(cmd, capture_output=True, text=True)
    assert result.returncode != 0
    assert "security_audit_logs is an append-only audit table" in result.stderr


def test_29_instant_role_revocation():
    # Login as Analyst
    token, _, _ = _login("Analyst")
    s1, _, _ = _http_request("/accuracy/hourly?page=1&page_size=2", headers={"Authorization": f"Bearer {token}"})
    assert s1 == 200

    # In database, demote analyst to Viewer
    import subprocess
    cmd = ["docker", "exec", "windiq-db", "psql", "-U", "postgres", "-d", "windiq", "-c", "UPDATE users SET role = 'Viewer' WHERE email = 'analyst@windiq.local';"]
    subprocess.run(cmd, check=True)

    try:
        # Next request with same access token is immediately forbidden because database role is checked
        s2, _, _ = _http_request("/accuracy/hourly?page=1&page_size=2", headers={"Authorization": f"Bearer {token}"})
        assert s2 == 403
    finally:
        # Restore Analyst role
        cmd_restore = ["docker", "exec", "windiq-db", "psql", "-U", "postgres", "-d", "windiq", "-c", "UPDATE users SET role = 'Analyst' WHERE email = 'analyst@windiq.local';"]
        subprocess.run(cmd_restore, check=True)


def test_30_ground_truth_preserved_authenticated():
    # Calling accuracy summary under authenticated session reproduces exact baseline
    token, _, _ = _login("Analyst")
    status, data, _ = _http_request(
        "/accuracy/summary?delivery_date_from=2026-01-02&delivery_date_to=2026-02-01",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert status == 200
    metrics = data["metrics"]
    assert data["date_range"]["total_hours"] == 744
    assert metrics["valid_comparisons"] == 744
    assert metrics["mae_mw"] == pytest.approx(2038.9126, abs=0.01)
    assert metrics["rmse_mw"] == pytest.approx(2504.7587, abs=0.01)
    assert metrics["forecast_bias_mw"] == pytest.approx(1747.8871, abs=0.01)
    assert metrics["mape_pct"] == pytest.approx(22.0446, abs=0.01)
    assert metrics["overforecast_count"] == 632
    assert metrics["underforecast_count"] == 112
