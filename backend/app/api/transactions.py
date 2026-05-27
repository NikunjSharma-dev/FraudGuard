"""
Transactions API — Submit, ML-score, and OTP-verify credit card transactions.

Upgrades:
  - evaluate_transaction now fully async (awaited directly)
  - lat/lon forwarded to FraudService for real geo-velocity calculation
  - Redis-backed OTP generation on MFA trigger (no more hardcoded "123456")
  - Real OTP verification via FraudService.verify_otp()
  - verify endpoint uses PATCH (correct REST semantics)
  - Rate-limited to 10 submissions/minute per IP via slowapi
  - LedgerService used for DB operations (no inline duplication)
  - SHAP explanation returned in response
"""
import uuid
import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

# --- NEW RATE LIMITER IMPORTS ---
from slowapi import Limiter
from slowapi.util import get_remote_address
# --------------------------------

from app.models.database import get_db, TransactionORM
from app.models.schemas import (
    TransactionSubmitRequest,
    TransactionResponse,
    OTPVerifyRequest,
)
from app.services.fraud_service import FraudService
from app.services.ledger_service import LedgerService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/transaction", tags=["Transactions"])

# --- INITIALIZE LIMITER ---
limiter = Limiter(key_func=get_remote_address)
# --------------------------

@router.post("/submit", response_model=TransactionResponse)
@limiter.limit("10/minute") # <--- THE MISSING DECORATOR!
async def submit_transaction(
    request: Request,
    payload: TransactionSubmitRequest,
    db: AsyncSession = Depends(get_db),
):
    """Submit a new transaction for real-time fraud evaluation."""
    try:
        # ── Anti-brute-force: recover any existing pending MFA challenge ──────
        pending_query = select(TransactionORM).where(
            TransactionORM.account_id == payload.account_id,
            TransactionORM.status == "Awaiting Verification",
        )
        result = await db.execute(pending_query)
        pending_tx = result.scalars().first()

        if pending_tx:
            return TransactionResponse(
                transaction_id=str(pending_tx.id),
                status="Awaiting Verification",
                risk_score=pending_tx.risk_score,
                message="SECURITY LOCK: Complete pending MFA challenge first.",
            )

        # ── Step 1: Insert into PostgreSQL (trigger runs hard rules) ──────────
        new_tx = await LedgerService.create_transaction(db, payload)

        # Trigger may have declined this immediately
        if new_tx.status == "Declined":
            return TransactionResponse(
                transaction_id=str(new_tx.id),
                status="Declined",
                risk_score=0.0,
                message="Blocked by PostgreSQL Ledger Rules.",
            )

        # ── Step 2: ML inference (async — runs in thread pool internally) ─────
        risk_score, ml_status, explanation = await FraudService.evaluate_transaction(
            account_id=payload.account_id,
            amount=payload.amount,
            lat=payload.lat,
            lon=payload.lon,
        )

        # ── Step 3: Generate OTP if MFA is triggered ──────────────────────────
        otp_hint: str | None = None
        if ml_status == "Awaiting Verification":
            generated_otp = await FraudService.generate_otp(str(new_tx.id))
            
            # Massive print statement so you can't miss it in the terminal!
            print(f"\n{'='*50}")
            print(f"🚨 YOUR DEMO OTP IS: {generated_otp}")
            print(f"{'='*50}\n")
            
            logger.info(f"📱 OTP for {new_tx.id}: {generated_otp}  (demo only)")
            otp_hint = f"[DEMO] Your OTP: {generated_otp}"

        # ── Step 4: Persist ML decision ───────────────────────────────────────
        await LedgerService.update_transaction_status(
            db,
            txn_id=new_tx.id,
            status=ml_status,
            is_fraudulent=(ml_status != "Approved"),
            risk_score=risk_score,
        )

        message = otp_hint or "Processed successfully."
        return TransactionResponse(
            transaction_id=str(new_tx.id),
            status=ml_status,
            risk_score=risk_score,
            message=message,
            explanation=explanation if explanation else None,
        )

    except Exception as e:
        await db.rollback()
        logger.error(f"Transaction processing failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Transaction processing failed: {str(e)}")


@router.patch("/{transaction_id}/verify", response_model=TransactionResponse)
async def verify_mfa(
    transaction_id: str,
    payload: OTPVerifyRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Validate a 6-digit OTP and approve/decline the pending transaction.
    Uses PATCH (correct REST semantics — partial update of an existing resource).
    """
    try:
        query = select(TransactionORM).where(TransactionORM.id == uuid.UUID(transaction_id))
        result = await db.execute(query)
        tx = result.scalars().first()

        if not tx:
            raise HTTPException(status_code=404, detail="Transaction not found.")
        if tx.status != "Awaiting Verification":
            raise HTTPException(status_code=400, detail="Transaction does not require verification.")

        # ── Real OTP check against Redis (not hardcoded) ──────────────────────
        is_valid = await FraudService.verify_otp(transaction_id, payload.otp)

        if is_valid:
            await LedgerService.update_transaction_status(
                db, txn_id=tx.id, status="Verified", is_fraudulent=False, risk_score=tx.risk_score or 0.0
            )
            return TransactionResponse(
                transaction_id=str(tx.id),
                status="Verified",
                message="Identity confirmed. Transaction approved.",
            )
        else:
            await LedgerService.update_transaction_status(
                db, txn_id=tx.id, status="Declined", is_fraudulent=True, risk_score=tx.risk_score or 0.0
            )
            return TransactionResponse(
                transaction_id=str(tx.id),
                status="Declined",
                message="Invalid or expired OTP. Transaction terminated.",
            )

    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid Transaction ID format.")


@router.get("/{transaction_id}/explain", tags=["Transactions"])
async def explain_transaction(transaction_id: str, db: AsyncSession = Depends(get_db)):
    """
    Return SHAP feature attributions for a completed transaction.
    Useful for auditing ML decisions and regulatory explainability.
    """
    try:
        query = select(TransactionORM).where(TransactionORM.id == uuid.UUID(transaction_id))
        result = await db.execute(query)
        tx = result.scalars().first()
        if not tx:
            raise HTTPException(status_code=404, detail="Transaction not found.")
        return {
            "transaction_id": transaction_id,
            "account_id": tx.account_id,
            "risk_score": tx.risk_score,
            "status": tx.status,
            "note": "Re-run inference with current features to get live SHAP values. Stored attributions require a separate audit log table.",
        }
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid Transaction ID format.")
    
@router.post("/{transaction_id}/resend-otp", tags=["Transactions"])
async def resend_otp(transaction_id: str, db: AsyncSession = Depends(get_db)):
    """Generates a fresh OTP and resets the 5-minute Redis timer."""
    try:
        query = select(TransactionORM).where(TransactionORM.id == uuid.UUID(transaction_id))
        result = await db.execute(query)
        tx = result.scalars().first()

        if not tx:
            raise HTTPException(status_code=404, detail="Transaction not found.")
        if tx.status != "Awaiting Verification":
            raise HTTPException(status_code=400, detail="Transaction does not require verification.")

        # Generate the new OTP (this safely overwrites the old one in Redis)
        generated_otp = await FraudService.generate_otp(str(tx.id))
        
        # Giant print statement for the backend terminal
        print(f"\n{'='*50}")
        print(f"🔄 NEW DEMO OTP IS: {generated_otp}")
        print(f"{'='*50}\n")
        
        logger.info(f"📱 Resent OTP for {tx.id}: {generated_otp}  (demo only)")

        return {"status": "Success", "message": "New OTP generated successfully."}

    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid Transaction ID format.")    
