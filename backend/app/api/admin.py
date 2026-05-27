"""
Admin Dashboard API — Ledger stats, transaction history, volume trends, account management.

Fixes vs. previous version:
  - Added missing `from pydantic import BaseModel` (app was crashing on startup)
  - Added missing `HTTPException` import (crash when 404 path was hit)
  - Fixed `transactions=` field: was passing get_ledger_summary() dict instead of
    get_recent_transactions() list — LedgerSummaryResponse.transactions is List[dict]
  - SQL injection in account search delegated to LedgerService (uses :param binding)
  - AccountStatusUpdate moved to top of file (was referencing BaseModel before import)
"""
import logging
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text, select

from app.models.database import get_db, TransactionORM
from app.models.schemas import LedgerSummaryResponse, TransactionDetail
from app.services.ledger_service import LedgerService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin", tags=["Admin Dashboard"])


# ─────────────────────────────────────────────────────────────────────────────
# Inline schema (used only in this router)
# ─────────────────────────────────────────────────────────────────────────────
class AccountStatusUpdate(BaseModel):
    status: str


# ─────────────────────────────────────────────────────────────────────────────
# GET /admin/ledger-summary
# ─────────────────────────────────────────────────────────────────────────────
@router.get("/ledger-summary", response_model=LedgerSummaryResponse)
async def get_ledger_summary(db: AsyncSession = Depends(get_db)):
    """Real-time aggregated ledger stats — used by the Live Dashboard page."""
    query = text("""
        SELECT
            SUM(total_volume)        AS total_volume,
            SUM(fraud_flagged_count) AS fraud_count,
            SUM(approved_count)      AS approved,
            SUM(declined_count)      AS declined,
            SUM(pending_mfa_count)   AS pending
        FROM vw_ledger_summary;
    """)
    row = (await db.execute(query)).fetchone()

    if not row or row[0] is None:
        return LedgerSummaryResponse(
            total_volume=0.0, fraud_count=0, throughput=0.0,
            transactions=[],
            status_breakdown={"Approved": 0, "Declined": 0, "Awaiting Verification": 0},
        )

    # Real TPS from LedgerService
    summary = await LedgerService.get_ledger_summary(db)

    # FIX: transactions must be a list — use get_recent_transactions, not get_ledger_summary
    recent_txns = await LedgerService.get_recent_transactions(db, limit=20)

    return LedgerSummaryResponse(
        total_volume=float(row.total_volume or 0),
        fraud_count=int(row.fraud_count or 0),
        throughput=summary["throughput"],         # Real TPS
        transactions=recent_txns,                 # Real list of dicts
        status_breakdown={
            "Approved":              int(row.approved or 0),
            "Declined":              int(row.declined or 0),
            "Awaiting Verification": int(row.pending or 0),
        },
    )


# ─────────────────────────────────────────────────────────────────────────────
# GET /admin/transactions
# ─────────────────────────────────────────────────────────────────────────────
@router.get("/transactions", response_model=List[TransactionDetail])
async def get_recent_transactions(
    limit: int = Query(default=50, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
):
    """Paginated recent transactions, newest first — powers the ledger table."""
    rows = (
        await db.execute(
            select(TransactionORM).order_by(TransactionORM.created_at.desc()).limit(limit)
        )
    ).scalars().all()
    return [TransactionDetail.model_validate(r) for r in rows]


# ─────────────────────────────────────────────────────────────────────────────
# GET /admin/volume-trend
# ─────────────────────────────────────────────────────────────────────────────
@router.get("/volume-trend")
async def get_volume_trend(db: AsyncSession = Depends(get_db)):
    """
    Hourly transaction volume + fraud count for the last 24 hours.
    Replaces the fake [x**2 for x in range(24)] data from the original.
    """
    return await LedgerService.get_volume_trend(db)


# ─────────────────────────────────────────────────────────────────────────────
# GET /admin/audit-log
# ─────────────────────────────────────────────────────────────────────────────
@router.get("/audit-log")
async def get_audit_log(
    limit: int = Query(default=50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
):
    """Most recent status-change audit events — compliance & debugging."""
    rows = (await db.execute(text(f"""
        SELECT id, transaction_id, event_type, old_status, new_status, notes, created_at
        FROM audit_log
        ORDER BY created_at DESC
        LIMIT {limit}
    """))).fetchall()
    return [dict(r._mapping) for r in rows]


# ─────────────────────────────────────────────────────────────────────────────
# GET /admin/accounts
# ─────────────────────────────────────────────────────────────────────────────
@router.get("/accounts")
async def get_all_accounts(
    search: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    """
    Fetch all customer accounts with optional search by account_id or name.
    Parameterized query in LedgerService prevents SQL injection.
    """
    return await LedgerService.get_all_accounts(db, search=search)


# ─────────────────────────────────────────────────────────────────────────────
# PATCH /admin/accounts/{account_id}/status
# ─────────────────────────────────────────────────────────────────────────────
@router.patch("/accounts/{account_id}/status")
async def update_account_status(
    account_id: str,
    payload: AccountStatusUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Block or unblock a customer account."""
    found = await LedgerService.update_account_status(db, account_id, payload.status)
    if not found:
        raise HTTPException(status_code=404, detail=f"Account {account_id} not found.")
    return {"message": f"Account {account_id} is now {payload.status}."}
