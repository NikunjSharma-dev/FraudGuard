"""Async Database Setup — SQLAlchemy 2.0 (PostgreSQL + SQLite Fallback)."""
import os
import uuid
import logging
from datetime import datetime
from typing import Optional

from sqlalchemy import String, Float, Boolean, DateTime, Text, Numeric, BigInteger, Integer
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy.sql import func, text

logger = logging.getLogger(__name__)

# Parse DATABASE_URL from environment with safe fallback
RAW_DB_URL = os.getenv("DATABASE_URL", "").strip()

# Handle placeholder secret strings
if not RAW_DB_URL or "${{" in RAW_DB_URL or "secrets." in RAW_DB_URL:
    RAW_DB_URL = "postgresql+asyncpg://frauduser:fraudpass@localhost:5432/frauddb"

# Engine initialization state
IS_POSTGRES = RAW_DB_URL.startswith("postgres")

def _get_engine_and_session(url: str):
    if url.startswith("postgres"):
        eng = create_async_engine(
            url,
            pool_size=20,
            max_overflow=30,
            pool_pre_ping=True,
            echo=False,
        )
    else:
        eng = create_async_engine(
            url,
            echo=False,
        )
    sess_factory = async_sessionmaker(
        eng,
        class_=AsyncSession,
        expire_on_commit=False,
    )
    return eng, sess_factory

engine, AsyncSessionLocal = _get_engine_and_session(RAW_DB_URL)


class Base(DeclarativeBase):
    pass


# ─────────────────────────────────────────────────────────────────────────────
# ORM Models
# ─────────────────────────────────────────────────────────────────────────────

class AccountORM(Base):
    __tablename__ = "accounts"

    account_id:  Mapped[str]             = mapped_column(String(20), primary_key=True)
    owner_name:  Mapped[str]             = mapped_column(String(100), nullable=False)
    status:      Mapped[str]             = mapped_column(String(20), default="Active")
    daily_limit: Mapped[float]           = mapped_column(Numeric(12, 2), default=500000.00)
    created_at:  Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now())


class TransactionORM(Base):
    __tablename__ = "transactions"

    id:            Mapped[uuid.UUID]       = mapped_column(
        PG_UUID(as_uuid=True) if IS_POSTGRES else String(36),
        primary_key=True,
        default=uuid.uuid4
    )
    account_id:    Mapped[str]             = mapped_column(String(20), nullable=False)
    amount:        Mapped[float]           = mapped_column(Numeric(12, 2), nullable=False)
    status:        Mapped[str]             = mapped_column(String(30), default="Pending")
    is_fraudulent: Mapped[bool]            = mapped_column(Boolean, default=False)
    risk_score:    Mapped[Optional[float]] = mapped_column(Float, default=0.0)
    latitude:      Mapped[Optional[float]] = mapped_column(Float)
    longitude:     Mapped[Optional[float]] = mapped_column(Float)
    created_at:    Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class AuditLogORM(Base):
    __tablename__ = "audit_log"

    id:             Mapped[int]            = mapped_column(Integer, primary_key=True, autoincrement=True)
    transaction_id: Mapped[uuid.UUID]      = mapped_column(
        PG_UUID(as_uuid=True) if IS_POSTGRES else String(36),
        nullable=False
    )
    event_type:     Mapped[str]            = mapped_column(String(50), nullable=False)
    old_status:     Mapped[Optional[str]]  = mapped_column(String(30))
    new_status:     Mapped[Optional[str]]  = mapped_column(String(30))
    notes:          Mapped[Optional[str]]  = mapped_column(Text)
    created_at:     Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now())


# ─────────────────────────────────────────────────────────────────────────────
# DB Utilities
# ─────────────────────────────────────────────────────────────────────────────

async def get_db():
    """Yield an async session per request with automatic SQLite failover."""
    global AsyncSessionLocal, IS_POSTGRES
    try:
        async with AsyncSessionLocal() as session:
            try:
                yield session
            finally:
                await session.close()
    except Exception as exc:
        if IS_POSTGRES:
            logger.warning(f"PostgreSQL connection error in get_db ({exc}). Switching to SQLite fallback...")
            await init_db()
            async with AsyncSessionLocal() as session:
                try:
                    yield session
                finally:
                    await session.close()
        else:
            raise exc



async def init_db():
    """Verify DB connectivity at startup with automatic SQLite fallback."""
    global engine, AsyncSessionLocal, IS_POSTGRES
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        logger.info(f"Database connection established ({'PostgreSQL' if IS_POSTGRES else 'SQLite'}).")
    except Exception as e:
        logger.warning(f"Primary PostgreSQL connection failed ({e}). Falling back to local SQLite engine...")
        RAW_FALLBACK_URL = "sqlite+aiosqlite:///./fraudguard.db"
        IS_POSTGRES = False
        engine, AsyncSessionLocal = _get_engine_and_session(RAW_FALLBACK_URL)
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        logger.info("Local SQLite database initialized successfully.")

        # Seed initial accounts into SQLite if empty
        async with AsyncSessionLocal() as session:
            res = await session.execute(text("SELECT COUNT(*) FROM accounts"))
            count = res.scalar()
            if not count:
                seed_accounts = [
                    AccountORM(account_id="ACC10294", owner_name="Bethany Sparks", status="Active", daily_limit=500000.00),
                    AccountORM(account_id="ACC4491", owner_name="Marcus Vance", status="Active", daily_limit=250000.00),
                    AccountORM(account_id="ACC8812", owner_name="Elena Rostova", status="Active", daily_limit=100000.00),
                    AccountORM(account_id="ACC3310", owner_name="Devon Miles", status="Active", daily_limit=1000000.00),
                ]
                session.add_all(seed_accounts)
                await session.commit()
                logger.info("Seeded initial test accounts into SQLite.")


async def create_next_month_partition():
    """
    Auto-create the next calendar month's transaction partition if running on PostgreSQL.
    """
    if not IS_POSTGRES:
        return
    try:
        async with engine.connect() as conn:
            await conn.execute(text("""
                DO $$
                DECLARE
                    next_month      DATE := DATE_TRUNC('month', NOW() + INTERVAL '1 month');
                    partition_name  TEXT := 'transactions_' || TO_CHAR(next_month, 'YYYY_MM');
                    start_date      TEXT := TO_CHAR(next_month, 'YYYY-MM-DD');
                    end_date        TEXT := TO_CHAR(next_month + INTERVAL '1 month', 'YYYY-MM-DD');
                BEGIN
                    EXECUTE format(
                        'CREATE TABLE IF NOT EXISTS %I PARTITION OF transactions '
                        'FOR VALUES FROM (%L) TO (%L)',
                        partition_name, start_date, end_date
                    );
                END $$;
            """))
            await conn.commit()
    except Exception as e:
        logger.warning(f"Partition creation skipped: {e}")

