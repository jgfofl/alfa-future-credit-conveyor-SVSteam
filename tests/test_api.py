import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.mocks import bureau

c = TestClient(app)
BASE = dict(inn="7701234567", product="working_capital", req_amount=2_000_000, req_term=24, revenue_12m=18_000_000,
            profit_margin=.15, debt_load=.2, age_months=48, employees=12, avg_balance_ratio=.12, revenue_volatility=.2)


def post(**kw):
    return c.post("/v1/decision", json={**BASE, **kw})


def test_health():
    assert c.get("/health").json()["status"] == "ok"


def test_approved():
    r = post().json()
    assert r["decision"] == "approved" and r["offer"]["amount"] == BASE["req_amount"] and r["score"] > 600


def test_counteroffer_on_large_amount():
    r = post(req_amount=9_000_000).json()
    assert r["decision"] == "counteroffer" and r["offer"]["amount"] < 9_000_000 and r["offer"]["payment"] > 0


def test_rejected_liquidated():
    assert post(inn="7701234500").json()["decision"] == "rejected"


def test_manual_review_when_bureau_down():
    assert post(inn="7701234599").json()["decision"] == "manual_review"


def test_need_info_unknown_inn():
    assert post(inn="abc1234567").json()["decision"] == "need_info"


def test_young_business_rejected():
    assert post(age_months=3).json()["decision"] == "rejected"


def test_validation_error():
    assert post(req_amount=10).status_code == 422


def test_deterministic():
    assert post().json() == post().json()


def test_monotonic_risk():
    lo, hi = post(debt_load=.1).json(), post(debt_load=1.2).json()
    assert hi["pd"] > lo["pd"]


def test_bureau_mock():
    with pytest.raises(TimeoutError):
        bureau("7701234599")


def test_model_quality():
    assert c.get("/v1/model/info").json()["gini"] > 0.5
