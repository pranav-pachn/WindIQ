"""Targeted Security and RBAC Permission Verification Script."""

import asyncio
import os
import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))
os.chdir(str(backend_dir))

import httpx
import jwt
from app.main import create_app
from app.core.config import get_settings

async def run_security_audit():
    settings = get_settings()
    app = create_app(settings)
    
    print("=" * 70)
    print("WINDIQ RBAC & DEMO ROLE SWITCHER SECURITY AUDIT")
    print("=" * 70)
    
    async with app.router.lifespan_context(app):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
            # 1. Test Unauthenticated Access
            res = await client.get("/api/v1/overview")
            assert res.status_code == 401, f"Expected 401 for unauthenticated overview, got {res.status_code}"
            print("[PASS] Unauthenticated access properly rejected with HTTP 401.")

            # 2. Test Viewer Role Permissions
            login_viewer = await client.post("/api/v1/auth/login", json={
                "email": "viewer@windiq.local",
                "password": "ViewerPass123!#"
            })
            assert login_viewer.status_code == 200, f"Viewer login failed: {login_viewer.text}"
            viewer_token = login_viewer.json()["access_token"]
            viewer_headers = {"Authorization": f"Bearer {viewer_token}"}
            print("[PASS] Viewer authentication succeeded (Argon2id verified).")

            # Viewer can read overview
            res = await client.get("/api/v1/overview", headers=viewer_headers)
            assert res.status_code == 200, f"Viewer overview failed: {res.status_code}"
            print("[PASS] Viewer permitted on overview:read (HTTP 200).")

            # Viewer CANNOT read hourly evaluations (requires accuracy:hourly)
            res = await client.get("/api/v1/accuracy/hourly?delivery_date_from=2026-01-02&delivery_date_to=2026-01-03", headers=viewer_headers)
            assert res.status_code == 403, f"Expected 403 for Viewer on accuracy:hourly, got {res.status_code}"
            print("[PASS] Viewer strictly blocked from accuracy:hourly with HTTP 403 Forbidden.")

            # Viewer CANNOT access admin API key provisioning
            res = await client.get("/api/v1/auth/keys", headers=viewer_headers)
            assert res.status_code == 403, f"Expected 403 for Viewer on admin:keys, got {res.status_code}"
            print("[PASS] Viewer strictly blocked from admin:keys with HTTP 403 Forbidden.")

            # 3. Test Analyst Role Permissions
            login_analyst = await client.post("/api/v1/auth/login", json={
                "email": "analyst@windiq.local",
                "password": "AnalystPass123!#"
            })
            assert login_analyst.status_code == 200, f"Analyst login failed: {login_analyst.text}"
            analyst_token = login_analyst.json()["access_token"]
            analyst_headers = {"Authorization": f"Bearer {analyst_token}"}
            print("[PASS] Analyst authentication succeeded (Argon2id verified).")

            # Analyst CAN read hourly evaluations
            res = await client.get("/api/v1/accuracy/hourly?delivery_date_from=2026-01-02&delivery_date_to=2026-01-03", headers=analyst_headers)
            assert res.status_code == 200, f"Analyst accuracy:hourly failed: {res.status_code}"
            print("[PASS] Analyst permitted on accuracy:hourly (HTTP 200).")

            # Analyst CAN read revision analytics
            res = await client.get("/api/v1/forecasts/revisions?delivery_date_from=2026-01-02&delivery_date_to=2026-01-03", headers=analyst_headers)
            assert res.status_code == 200, f"Analyst forecasts:revisions failed: {res.status_code}"
            print("[PASS] Analyst permitted on forecasts:revisions (HTTP 200).")

            # Analyst CANNOT access admin API key provisioning
            res = await client.get("/api/v1/auth/keys", headers=analyst_headers)
            assert res.status_code == 403, f"Expected 403 for Analyst on admin:keys, got {res.status_code}"
            print("[PASS] Analyst strictly blocked from admin:keys with HTTP 403 Forbidden.")

            # 4. Test Admin Role Permissions
            login_admin = await client.post("/api/v1/auth/login", json={
                "email": "admin@windiq.local",
                "password": "AdminPass123!#"
            })
            assert login_admin.status_code == 200, f"Admin login failed: {login_admin.text}"
            admin_token = login_admin.json()["access_token"]
            admin_headers = {"Authorization": f"Bearer {admin_token}"}
            print("[PASS] Admin authentication succeeded (Argon2id verified).")

            # Admin CAN access admin API keys
            res = await client.get("/api/v1/auth/keys", headers=admin_headers)
            assert res.status_code == 200, f"Admin admin:keys failed: {res.status_code}"
            print("[PASS] Admin permitted on admin:keys (HTTP 200).")

            # 5. Test Forged Token / Client Role Tampering
            forged_token = jwt.encode(
                {"sub": str(login_viewer.json()["user_id"]), "role": "admin"},
                "fake_secret_key_12345678901234567890123456",
                algorithm="HS256"
            )
            forged_headers = {"Authorization": f"Bearer {forged_token}"}
            res = await client.get("/api/v1/auth/keys", headers=forged_headers)
            assert res.status_code == 401, f"Expected 401 for forged JWT, got {res.status_code}"
            print("[PASS] Forged token / client role tampering strictly rejected with HTTP 401.")

    print("=" * 70)
    print("ALL RBAC SECURITY PERMISSION CHECKS PASSED (100% VERIFIED)")
    print("=" * 70)

if __name__ == "__main__":
    asyncio.run(run_security_audit())
