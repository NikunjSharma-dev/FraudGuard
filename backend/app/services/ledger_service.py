"""LedgerService — Database-agnostic read/write operations for transactions and accounts."""
from uuid import UUID
import uuid
import logging
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, text, update

from app.models.database import TransactionORM, AccountORM, AuditLogORM, IS_POSTGRES

logger = logging.getLogger(__name__)


class LedgerService:

    # ── Transactions: Write ───────────────────────────────────────────────────

    @staticmethod
    async def create_transaction(
        db: AsyncSession, payload: Any
    ) -> TransactionORM:
        """
        Insert a new transaction row.
        If running on SQLite (no Postgres triggers), enforces hard business rules in Python.
        """
        # Business rule enforcement for non-Postgres environments
        init_status = "Pending"
        if not IS_POSTGRES:
            account_res = await db.execute(
                select(AccountORM).where(AccountORM.account_id == payload.account_id)
            )
            acct = account_res.scalars().first()
            if acct:
                if acct.status in ["Suspended", "Blocked", "Closed"]:
                    init_status = "Declined"
                elif payload.amount > float(acct.daily_limit or 500000):
                    init_status = "Declined"

        new_id = uuid.uuid4()
        new_txn = TransactionORM(
            id=new_id,
            account_id=payload.account_id,
            amount=payload.amount,
            latitude=payload.lat,
            longitude=payload.lon,
            status=init_status,
            risk_score=0.0,
        )
        db.add(new_txn)
        await db.commit()
        await db.refresh(new_txn)
        return new_txn

    @staticmethod
    async def update_transaction_status(
        db: AsyncSession,
        txn_id: UUID,
        status: str,
        is_fraudulent: bool = False,
        risk_score: float = 0.0,
    ) -> None:
        """Update status, fraud flag, and risk score after ML evaluation or OTP."""
        result = await db.execute(
            select(TransactionORM).where(TransactionORM.id == txn_id)
        )
        txn = result.scalars().first()
        if txn:
            old_st = txn.status
            txn.status        = status
            txn.is_fraudulent = is_fraudulent
            txn.risk_score    = risk_score

            # Create audit log entry
            audit = AuditLogORM(
                transaction_id=txn_id,
                event_type="STATUS_UPDATE",
                old_status=old_st,
                new_status=status,
                notes=f"Updated risk score to {risk_score:.2f}"
            )
            db.add(audit)
            await db.commit()

    # ── Transactions: Read ────────────────────────────────────────────────────

    @staticmethod
    async def get_ledger_summary(db: AsyncSession) -> Dict[str, Any]:
        """
        Returns aggregate stats: total volume, fraud count, throughput, and status breakdown.
        """
        res = await db.execute(select(TransactionORM))
        txns = res.scalars().all()

        if not txns:
            return {
                "throughput": 0.0,
                "total_volume": 0.0,
                "fraud_count": 0,
                "status_breakdown": {"Approved": 0, "Declined": 0, "Awaiting Verification": 0},
            }

        total_vol = sum(float(t.amount or 0) for t in txns)
        fraud_cnt = sum(1 for t in txns if t.is_fraudulent)
        
        now = datetime.now()
        one_min_ago = now - timedelta(minutes=1)
        recent_cnt = sum(1 for t in txns if t.created_at and t.created_at >= one_min_ago)
        throughput = round(recent_cnt / 60.0, 2)

        approved = sum(1 for t in txns if t.status == "Approved")
        declined = sum(1 for t in txns if t.status == "Declined")
        awaiting = sum(1 for t in txns if t.status == "Awaiting Verification")

        return {
            "throughput": throughput,
            "total_volume": total_vol,
            "fraud_count": fraud_cnt,
            "status_breakdown": {
                "Approved": approved,
                "Declined": declined,
                "Awaiting Verification": awaiting,
            },
        }

    @staticmethod
    async def get_volume_trend(db: AsyncSession) -> List[Dict[str, Any]]:
        """Hourly transaction volume breakdown."""
        res = await db.execute(select(TransactionORM))
        txns = res.scalars().all()

        hours_map: Dict[str, Dict[str, Any]] = {}
        for t in txns:
            hr_str = t.created_at.strftime("%H:00") if t.created_at else "00:00"
            if hr_str not in hours_map:
                hours_map[hr_str] = {"hour": hr_str, "volume": 0.0, "tx_count": 0, "fraud_count": 0}
            hours_map[hr_str]["volume"] += float(t.amount or 0)
            hours_map[hr_str]["tx_count"] += 1
            if t.is_fraudulent:
                hours_map[hr_str]["fraud_count"] += 1

        sorted_hours = sorted(hours_map.values(), key=lambda x: x["hour"])
        return sorted_hours if sorted_hours else [{"hour": "12:00", "volume": 0.0, "tx_count": 0, "fraud_count": 0}]

    @staticmethod
    async def get_recent_transactions(db: AsyncSession, limit: int = 50) -> List[Dict[str, Any]]:
        """Paginated list of the most recent transactions."""
        res = await db.execute(
            select(TransactionORM).order_by(TransactionORM.created_at.desc()).limit(limit)
        )
        txns = res.scalars().all()
        return [
            {
                "id":            str(t.id),
                "account_id":    t.account_id,
                "amount":        float(t.amount or 0),
                "status":        t.status,
                "is_fraudulent": t.is_fraudulent,
                "risk_score":    float(t.risk_score or 0.0),
                "created_at":    t.created_at.isoformat() if t.created_at else datetime.now().isoformat(),
            }
            for t in txns
        ]

    # ── Accounts ──────────────────────────────────────────────────────────────

    @staticmethod
    async def create_account(
        db: AsyncSession,
        account_id: str,
        full_name: str,
        email: str,
        phone: str,
        kyc_document: str,
    ) -> None:
        """Provision a new customer account."""
        res = await db.execute(select(AccountORM).where(AccountORM.account_id == account_id))
        existing = res.scalars().first()
        if not existing:
            new_acct = AccountORM(
                account_id=account_id,
                owner_name=full_name,
                status="Active",
                daily_limit=500000.00
            )
            db.add(new_acct)
            await db.commit()

    @staticmethod
    async def get_all_accounts(db: AsyncSession, search: Optional[str] = None) -> List[Dict[str, Any]]:
        """Fetch all accounts with optional search."""
        query = select(AccountORM)
        if search:
            query = query.where(
                (AccountORM.account_id.contains(search)) | (AccountORM.owner_name.contains(search))
            )
        res = await db.execute(query.order_by(AccountORM.account_id.desc()))
        accounts = res.scalars().all()
        return [
            {
                "account_id": a.account_id,
                "full_name": a.owner_name,
                "owner_name": a.owner_name,
                "status": a.status or "Active",
                "daily_limit": float(a.daily_limit or 500000),
            }
            for a in accounts
        ]

    @staticmethod
    async def update_account_status(
        db: AsyncSession, account_id: str, new_status: str
    ) -> bool:
        """Update account status (Active, Suspended, Blocked)."""
        res = await db.execute(select(AccountORM).where(AccountORM.account_id == account_id))
        acct = res.scalars().first()
        if acct:
            acct.status = new_status
            await db.commit()
            return True
        return False

