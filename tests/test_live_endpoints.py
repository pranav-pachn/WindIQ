"""Test the new Phase 3.3 API endpoints live against the running FastAPI container."""

import urllib.request
import json
import pytest

BASE_URL = "http://localhost:8001/api/v1"


def get_auth_token(email: str = "analyst@windiq.local", password: str = "AnalystPass123!#") -> str:
    login_url = f"{BASE_URL}/auth/login"
    payload = json.dumps({"email": email, "password": password}).encode("utf-8")
    req = urllib.request.Request(
        login_url,
        data=payload,
        headers={
            "Content-Type": "application/json",
            "X-Test-Rate-Limit-Bypass": "true",
        },
    )
    with urllib.request.urlopen(req) as res:
        data = json.loads(res.read().decode())
        return data["access_token"]


def test_single_delivery_hour_publications():
    token = get_auth_token()
    url = f"{BASE_URL}/forecasts/publications/2026-01-28T12:00:00Z"
    req_obj = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    req = urllib.request.urlopen(req_obj)
    assert req.getcode() == 200
    data = json.loads(req.read().decode())
    assert data["delivery_hour_utc"].startswith("2026-01-28T12:00:00")
    assert data["delivery_date_london"] == "2026-01-28"
    assert data["hour_of_day_london"] == 12
    assert data["total_publications"] >= 20
    assert data["forward_publications"] >= 15
    assert data["eligible_publications"] >= 5
    assert data["actual_generation_mw"] == pytest.approx(4857.5, abs=0.1)
    assert len(data["settlement_readings"]) == 2

    # Check that winning publication is flagged
    sel_pub = next((p for p in data["publications"] if p["is_selected"]), None)
    assert sel_pub is not None
    assert sel_pub["forecast_mw"] == pytest.approx(9031.0, abs=1.0)
    assert sel_pub["is_eligible"] is True
    assert sel_pub["lead_time_hours"] == pytest.approx(28.5, abs=0.1)


def test_multi_horizon_matched_mode():
    token = get_auth_token()
    url = f"{BASE_URL}/forecasts/horizons?delivery_date_from=2026-01-02&delivery_date_to=2026-02-01&mode=matched"
    req_obj = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    req = urllib.request.urlopen(req_obj)
    assert req.getcode() == 200
    data = json.loads(req.read().decode())
    assert data["analysis_mode"] == "matched"
    assert data["common_matched_hours"] == 553
    assert data["overall_coverage_pct"] == pytest.approx(74.33, abs=0.1)
    assert data["proven_convergence_improvement_pct"] == pytest.approx(34.16, abs=0.1)
    assert len(data["buckets"]) == 6

    # Verify bucket metrics and monotonicity
    b_dict = {b["horizon_bucket"]: b for b in data["buckets"]}
    assert b_dict["Very Short (0-6h)"]["mae_mw"] == pytest.approx(1610.9042, abs=0.1)
    assert b_dict["Short (6-12h)"]["mae_mw"] == pytest.approx(1720.3996, abs=0.1)
    assert b_dict["Same-Day (12-24h)"]["mae_mw"] == pytest.approx(1820.8336, abs=0.1)
    assert b_dict["Day-Ahead (24-36h)"]["mae_mw"] == pytest.approx(2051.6203, abs=0.1)
    assert b_dict["D-2 Early (36-48h)"]["mae_mw"] == pytest.approx(2221.5389, abs=0.1)
    assert b_dict["Medium-Range (48-72h)"]["mae_mw"] == pytest.approx(2446.6076, abs=0.1)

    maes = [b["mae_mw"] for b in data["buckets"]]
    assert maes[0] < maes[1] < maes[2] < maes[3] < maes[4] < maes[5]


def test_multi_horizon_publication_weighted_mode():
    token = get_auth_token()
    url = f"{BASE_URL}/forecasts/horizons?delivery_date_from=2026-01-02&delivery_date_to=2026-02-01&mode=publication_weighted"
    req_obj = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    req = urllib.request.urlopen(req_obj)
    assert req.getcode() == 200
    data = json.loads(req.read().decode())
    assert data["analysis_mode"] == "publication_weighted"
    assert len(data["buckets"]) == 6
    b_dict = {b["horizon_bucket"]: b for b in data["buckets"]}
    assert b_dict["Very Short (0-6h)"]["observation_count"] == 1446
    assert b_dict["Very Short (0-6h)"]["unique_delivery_hours"] == 725
    assert b_dict["Short (6-12h)"]["observation_count"] == 1456
    assert b_dict["Short (6-12h)"]["unique_delivery_hours"] == 731
    assert b_dict["Same-Day (12-24h)"]["observation_count"] == 2954
    assert b_dict["Same-Day (12-24h)"]["unique_delivery_hours"] == 743


def test_revisions_analytics():
    token = get_auth_token()
    url = f"{BASE_URL}/forecasts/revisions?delivery_date_from=2026-01-02&delivery_date_to=2026-02-01"
    req_obj = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    req = urllib.request.urlopen(req_obj)
    assert req.getcode() == 200
    data = json.loads(req.read().decode())
    assert data["forward_only_revisions"] == 13367
    assert data["mean_signed_revision_mw"] == pytest.approx(-6.77, abs=0.1)
    assert data["mean_absolute_revision_mw"] == pytest.approx(343.96, abs=0.1)
    assert data["upward_count"] == 6206
    assert data["downward_count"] == 6434
    assert data["unchanged_count"] == 727
    assert data["cycle_gap_max_hours"] == pytest.approx(4.0, abs=0.1)
    assert data["discontinuous_gap_count"] == 0
    assert len(data["histogram"]) == 20
    assert len(data["top_revisions"]) == 10
    assert len(data["diurnal_revision_heatmap"]) > 0

