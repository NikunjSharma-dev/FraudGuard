"""
API Integration Tests — FastAPI endpoints with mocked DB and Redis.
"""
import pytest
import uuid
from unittest.mock import AsyncMock, patch, MagicMock
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.models.database import get_db


@pytest.fixture(autouse=True)
def override_db_dependency():
    """Provide mock async DB session for all tests."""
    mock_db = AsyncMock()
    mock_db.execute = AsyncMock(return_value=MagicMock(scalars=MagicMock(return_value=MagicMock(first=MagicMock(return_value=None)))))
    
    async def _get_mock_db():
        yield mock_db

    app.dependency_overrides[get_db] = _get_mock_db
    yield
    app.dependency_overrides.clear()


def _tx_orm(status="Approved", risk_score=0.12, account_id="ACC10294", amount=5000.0):
    m = MagicMock()
    m.id         = uuid.uuid4()
    m.account_id = account_id
    m.amount     = amount
    m.status     = status
    m.risk_score = risk_score
    m.is_fraudulent = (status != "Approved")
    return m


@pytest.mark.asyncio
async def test_health_check_returns_online():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        resp = await c.get("/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "online"
    assert body["service"] == "fraudguard"
    assert "ml_engine_active" in body
    assert "version" in body


@pytest.mark.asyncio
async def test_negative_amount_rejected_with_422():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        resp = await c.post("/transaction/submit", json={
            "account_id": "ACC10294", "amount": -500.0, "lat": 19.076, "lon": 72.877,
        })
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_zero_amount_rejected_with_422():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        resp = await c.post("/transaction/submit", json={
            "account_id": "ACC10294", "amount": 0.0, "lat": 19.076, "lon": 72.877,
        })
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_invalid_latitude_rejected():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        resp = await c.post("/transaction/submit", json={
            "account_id": "ACC10294", "amount": 100.0, "lat": 999.0, "lon": 72.877,
        })
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_otp_must_be_exactly_6_digits():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        resp = await c.patch(
            f"/transaction/{uuid.uuid4()}/verify",
            json={"otp": "123"},
        )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_otp_must_be_numeric():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        resp = await c.patch(
            f"/transaction/{uuid.uuid4()}/verify",
            json={"otp": "ABCDEF"},
        )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_approved_transaction_returns_200():
    tx = _tx_orm(status="Approved", risk_score=0.10)

    with patch("app.api.transactions.LedgerService") as MockLS, \
         patch("app.api.transactions.FraudService") as MockFS:
        MockLS.create_transaction    = AsyncMock(return_value=tx)
        MockLS.update_transaction_status = AsyncMock()
        MockFS.evaluate_transaction  = AsyncMock(return_value=(0.10, "Approved", {"amount": -0.01}, ["Passed"]))

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.post("/transaction/submit", json={
                "account_id": "ACC10294", "amount": 500.0, "lat": 19.076, "lon": 72.877,
            })

    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "Approved"
    assert "risk_score" in body


@pytest.mark.asyncio
async def test_high_risk_triggers_mfa():
    tx = _tx_orm(status="Approved", risk_score=0.92)

    with patch("app.api.transactions.LedgerService") as MockLS, \
         patch("app.api.transactions.FraudService") as MockFS:
        MockLS.create_transaction        = AsyncMock(return_value=tx)
        MockLS.update_transaction_status = AsyncMock()
        MockFS.evaluate_transaction      = AsyncMock(return_value=(0.92, "Awaiting Verification", {}, ["Suspicious"]))
        MockFS.generate_otp              = AsyncMock(return_value="482910")

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.post("/transaction/submit", json={
                "account_id": "ACC10294", "amount": 75_000.0, "lat": 19.076, "lon": 72.877,
            })

    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "Awaiting Verification"
    assert body["risk_score"] == pytest.approx(0.92)


@pytest.mark.asyncio
async def test_trigger_declined_transaction():
    tx = _tx_orm(status="Declined", risk_score=0.0)

    with patch("app.api.transactions.LedgerService") as MockLS:
        MockLS.create_transaction = AsyncMock(return_value=tx)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.post("/transaction/submit", json={
                "account_id": "ACC10294", "amount": 999_999.0, "lat": 19.076, "lon": 72.877,
            })

    assert resp.status_code == 200
    assert resp.json()["status"] == "Declined"


@pytest.mark.asyncio
async def test_verify_with_correct_otp_returns_verified():
    tx = _tx_orm(status="Awaiting Verification", risk_score=0.88)
    tx_id = str(tx.id)

    with patch("app.api.transactions.FraudService") as MockFS, \
         patch("app.api.transactions.LedgerService") as MockLS:

        MockFS.verify_otp                = AsyncMock(return_value=True)
        MockLS.update_transaction_status = AsyncMock()

        mock_result = MagicMock()
        mock_result.scalars.return_value.first.return_value = tx
        mock_db = AsyncMock()
        mock_db.execute = AsyncMock(return_value=mock_result)

        async def _override_db():
            yield mock_db

        app.dependency_overrides[get_db] = _override_db

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.patch(
                f"/transaction/{tx_id}/verify",
                json={"otp": "482910"},
            )

    assert resp.status_code == 200
    assert resp.json()["status"] == "Verified"


@pytest.mark.asyncio
async def test_verify_with_wrong_otp_declines():
    tx = _tx_orm(status="Awaiting Verification", risk_score=0.88)

    with patch("app.api.transactions.FraudService") as MockFS, \
         patch("app.api.transactions.LedgerService") as MockLS:

        MockFS.verify_otp                = AsyncMock(return_value=False)
        MockLS.update_transaction_status = AsyncMock()

        mock_result = MagicMock()
        mock_result.scalars.return_value.first.return_value = tx
        mock_db = AsyncMock()
        mock_db.execute = AsyncMock(return_value=mock_result)

        async def _override_db():
            yield mock_db

        app.dependency_overrides[get_db] = _override_db

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.patch(
                f"/transaction/{str(tx.id)}/verify",
                json={"otp": "000000"},
            )

    assert resp.status_code == 200
    assert resp.json()["status"] == "Declined"


@pytest.mark.asyncio
async def test_verify_invalid_uuid_returns_400():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        resp = await c.patch(
            "/transaction/not-a-uuid/verify",
            json={"otp": "123456"},
        )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_admin_transactions_query_param_validation():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        resp = await c.get("/admin/transactions?limit=0")
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_admin_transactions_limit_too_large():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        resp = await c.get("/admin/transactions?limit=9999")
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_account_status_update_rejects_missing_body():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        resp = await c.patch("/admin/accounts/ACC10294/status")
    assert resp.status_code == 422

