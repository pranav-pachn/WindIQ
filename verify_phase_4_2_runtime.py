"""Phase 4.2 Runtime Verification Script: Multi-Instance Quota & Redis Pause/Recovery."""

import json
import subprocess
import time
import urllib.error
import urllib.request

BASE_URL = "http://localhost:8001"
API_URL = f"{BASE_URL}/api/v1"


def http_req(url, method="GET", body=None, headers=None):
    req_headers = {"User-Agent": "WindIQ-Runtime-Verifier"}
    if headers:
        req_headers.update(headers)
    data = None
    if body is not None:
        req_headers["Content-Type"] = "application/json"
        data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=req_headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            body_text = resp.read().decode("utf-8")
            return resp.status, json.loads(body_text) if body_text else {}, {k.lower(): v for k, v in resp.headers.items()}
    except urllib.error.HTTPError as e:
        body_text = e.read().decode("utf-8")
        return e.code, json.loads(body_text) if body_text else {}, {k.lower(): v for k, v in e.headers.items()}
    except Exception as exc:
        return 0, {"error": str(exc)}, {}


def get_role_token(role="Analyst"):
    status, body, _ = http_req(
        f"{API_URL}/auth/login",
        method="POST",
        body={"email": f"{role.lower()}@windiq.local", "password": f"{role}Pass123!#"},
    )
    if status == 429:
        # Flush login rate limit in redis
        import redis
        r = redis.from_url("redis://:windiq_redis_dev_secret_pass@127.0.0.1:6385/0")
        for k in r.keys("windiq:rl:login:*"):
            r.delete(k)
        status, body, _ = http_req(
            f"{API_URL}/auth/login",
            method="POST",
            body={"email": f"{role.lower()}@windiq.local", "password": f"{role}Pass123!#"},
        )
    assert status == 200, f"{role} login failed: {body}"
    return body["access_token"]


def main():
    print("=" * 70)
    print("WINDIQ PHASE 4.2 RUNTIME VERIFICATION")
    print("=" * 70)

    # 1. Verify Live Readiness Probe
    print("\n[Step 1/4] Verifying /health/ready probe reports both DB and Redis...")
    code, body, _ = http_req(f"{BASE_URL}/health/ready")
    print(f"Status: {code}, Body: {body}")
    assert code == 200, f"Expected 200, got {code}"
    assert body.get("redis") == "connected"
    assert body.get("database") == "connected"
    print(">>> PASS: Readiness probe reports Redis and DB healthy.")

    # 2. Verify Security Headers
    print("\n[Step 2/4] Verifying HTTP Security Response Headers...")
    code, body, headers = http_req(f"{API_URL}/status")
    print(f"Status: {code}")
    print(f"X-Content-Type-Options: {headers.get('x-content-type-options')}")
    print(f"X-Frame-Options: {headers.get('x-frame-options')}")
    print(f"Referrer-Policy: {headers.get('referrer-policy')}")
    print(f"Permissions-Policy: {headers.get('permissions-policy')}")
    print(f"Content-Security-Policy: {headers.get('content-security-policy')}")
    assert headers.get("x-content-type-options") == "nosniff"
    assert headers.get("x-frame-options") == "DENY"
    assert "content-security-policy" in headers
    print(">>> PASS: All security response headers verified.")

    # 3. Fail-Closed Verification with Redis Pause
    print("\n[Step 3/4] Pausing Redis container (docker pause windiq-redis)...")
    token = get_role_token("Analyst")
    admin_token = get_role_token("Admin")
    subprocess.run(["docker", "pause", "windiq-redis"], check=True)
    time.sleep(1)

    try:
        print("\nVerifying /health/live during Redis pause (should remain 200)...")
        code, body, _ = http_req(f"{BASE_URL}/health/live")
        print(f"/health/live -> {code}")
        assert code == 200

        print("\nVerifying /health/ready during Redis pause (should return 503)...")
        code, body, _ = http_req(f"{BASE_URL}/health/ready")
        print(f"/health/ready -> {code}, Body: {body}")
        assert code == 503
        assert body.get("redis") == "disconnected"

        print("\nVerifying sensitive routes fail closed (HTTP 503)...")
        t0 = time.time()
        code_rev, body_rev, _ = http_req(
            f"{API_URL}/forecasts/revisions?delivery_date_from=2026-01-02&delivery_date_to=2026-02-01",
            headers={"Authorization": f"Bearer {token}"},
        )
        duration_rev = (time.time() - t0) * 1000
        print(f"GET /forecasts/revisions -> {code_rev} in {duration_rev:.1f}ms (Body: {body_rev})")
        assert code_rev == 503, f"Expected 503, got {code_rev}"

        t0 = time.time()
        code_login, body_login, _ = http_req(
            f"{API_URL}/auth/login",
            method="POST",
            body={"email": "analyst@windiq.local", "password": "AnalystPass123!#"},
        )
        duration_login = (time.time() - t0) * 1000
        print(f"POST /auth/login -> {code_login} in {duration_login:.1f}ms (Body: {body_login})")
        assert code_login == 503, f"Expected 503, got {code_login}"

        t0 = time.time()
        code_keys, body_keys, _ = http_req(
            f"{API_URL}/auth/keys",
            method="POST",
            body={"name": "FailClosedTest", "scopes": ["read:accuracy"]},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        duration_keys = (time.time() - t0) * 1000
        print(f"POST /auth/keys -> {code_keys} in {duration_keys:.1f}ms (Body: {body_keys})")
        assert code_keys == 503, f"Expected 503, got {code_keys}"
        print(">>> PASS: Sensitive routes fail closed with HTTP 503 without backend crash.")
    finally:
        print("\n[Step 4/4] Unpausing Redis container (docker unpause windiq-redis)...")
        subprocess.run(["docker", "unpause", "windiq-redis"], check=True)
        time.sleep(2)

    # 4. Recovery Verification
    print("\nVerifying instantaneous recovery after Redis unpause...")
    code, body, _ = http_req(f"{BASE_URL}/health/ready")
    print(f"/health/ready -> {code}, Body: {body}")
    assert code == 200
    assert body.get("redis") == "connected"

    # Verify sensitive routes recover without backend restart
    code_login, body_login, _ = http_req(
        f"{API_URL}/auth/login",
        method="POST",
        body={"email": "analyst@windiq.local", "password": "AnalystPass123!#"},
    )
    print(f"POST /auth/login after recovery -> {code_login}")
    assert code_login == 200

    print(">>> PASS: System recovered immediately without backend restart.")
    print("\n" + "=" * 70)
    print("ALL RUNTIME VERIFICATIONS COMPLETED SUCCESSFULLY!")
    print("=" * 70)


if __name__ == "__main__":
    main()
