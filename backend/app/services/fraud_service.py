"""
FraudService — Async orchestrator for ML inference, Redis/In-Memory feature store, and OTP.

Owns all async I/O (Redis reads/writes, geo-velocity, OTP).
CPU-bound inference is delegated to FraudPredictor via run_in_executor.
"""
import os
import asyncio
import secrets
import json
import logging
from datetime import datetime
from math import radians, cos, sin, asin, sqrt
from typing import Optional, Tuple, Dict, Any, List

import pandas as pd
import redis.asyncio as aioredis

from app.ml.predict import FraudPredictor, FraudPrediction

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# In-Memory Cache Fallback (When Redis server is offline)
# ─────────────────────────────────────────────────────────────────────────────
class InMemoryCache:
    """Async in-memory fallback mimicking Redis API when Redis is offline."""
    def __init__(self):
        self._store: Dict[str, str] = {}
        self._ttl: Dict[str, float] = {}

    async def get(self, key: str) -> Optional[str]:
        if key in self._ttl and datetime.now().timestamp() > self._ttl[key]:
            self._store.pop(key, None)
            self._ttl.pop(key, None)
            return None
        return self._store.get(key)

    async def setex(self, key: str, time_sec: int, value: str) -> None:
        self._store[key] = value
        self._ttl[key] = datetime.now().timestamp() + time_sec

    async def incr(self, key: str) -> int:
        val = int(await self.get(key) or 0) + 1
        self._store[key] = str(val)
        return val

    async def expire(self, key: str, time_sec: int) -> None:
        self._ttl[key] = datetime.now().timestamp() + time_sec

    async def delete(self, key: str) -> None:
        self._store.pop(key, None)
        self._ttl.pop(key, None)

    async def ping(self) -> bool:
        return True

_redis_client = None
_in_memory_fallback = InMemoryCache()

def get_redis():
    """Return async Redis client or in-memory fallback gracefully."""
    global _redis_client
    if _redis_client is not None:
        return _redis_client

    redis_url = os.getenv("REDIS_URL", "").strip()
    if not redis_url or "${{" in redis_url or "secrets." in redis_url:
        redis_url = "redis://localhost:6379/0"

    try:
        client = aioredis.from_url(
            redis_url,
            encoding="utf-8",
            decode_responses=True,
            socket_timeout=1.5,
        )
        _redis_client = client
        return _redis_client
    except Exception as e:
        logger.warning(f"Redis connection init failed ({e}). Using in-memory cache fallback.")
        return _in_memory_fallback


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
    return 2 * R * asin(sqrt(max(a, 0.0)))


class FraudService:
    """
    Single public interface used by transactions API.
    Delegates ML scoring to FraudPredictor.
    """
    _models_loaded: bool = False

    @classmethod
    def load_models(cls) -> None:
        if cls._models_loaded:
            return
        try:
            FraudPredictor.load()
            cls._models_loaded = FraudPredictor.is_loaded()
            logger.info("ML models loaded.")
        except Exception as e:
            logger.warning(f"FraudPredictor model load warning: {e}")

    @classmethod
    async def _safe_get_cache(cls):
        global _redis_client
        r = get_redis()
        if r is _in_memory_fallback:
            return _in_memory_fallback
        try:
            await r.ping()
            return r
        except Exception:
            logger.warning("Redis ping failed. Switching to in-memory feature cache fallback.")
            _redis_client = _in_memory_fallback
            return _in_memory_fallback

    @classmethod
    async def _read_account_context(cls, account_id: str) -> dict:
        try:
            r = await cls._safe_get_cache()
            raw = await r.get(f"ctx:{account_id}")
            return json.loads(raw) if raw else {}
        except Exception:
            return {}

    @classmethod
    async def _write_account_context(
        cls,
        account_id: str,
        amount: float,
        lat: float,
        lon: float,
        prev_ctx: dict,
    ) -> None:
        try:
            r = await cls._safe_get_cache()
            prev_avg = prev_ctx.get("amount_avg", amount)
            prev_std = prev_ctx.get("amount_std", 0.0)

            alpha   = 0.15
            new_avg = alpha * amount + (1 - alpha) * prev_avg
            new_std = max(alpha * abs(amount - prev_avg) + (1 - alpha) * prev_std, 1.0)

            ctx = {
                "last_lat":   lat,
                "last_lon":   lon,
                "last_tx_ts": datetime.now().timestamp(),
                "amount_avg": round(new_avg, 4),
                "amount_std": round(new_std, 4),
            }
            await r.setex(f"ctx:{account_id}", 604_800, json.dumps(ctx))
        except Exception as e:
            logger.warning(f"Account context write skipped: {e}")


    @classmethod
    async def _get_tx_counts(cls, account_id: str) -> Tuple[int, int]:
        try:
            r = await cls._safe_get_cache()
            key_10m = f"txcount10m:{account_id}"
            key_1h  = f"txcount1h:{account_id}"

            c_10m = await r.incr(key_10m)
            if c_10m == 1:
                await r.expire(key_10m, 600)

            c_1h = await r.incr(key_1h)
            if c_1h == 1:
                await r.expire(key_1h, 3600)

            return int(c_10m), int(c_1h)
        except Exception:
            return 1, 1


    @classmethod
    async def _build_features(
        cls,
        account_id: str,
        amount: float,
        lat: float,
        lon: float,
        merchant_category: str = "General",
        device_id: Optional[str] = None,
    ) -> Tuple[pd.DataFrame, dict]:
        ctx = await cls._read_account_context(account_id)
        tx_count_10m, tx_count_1h = await cls._get_tx_counts(account_id)
        now = datetime.now()

        # Geo velocity & distance
        geo_velocity       = 0.0
        time_since_last_tx = 86_400.0
        home_lat, home_lon = 40.7128, -74.0060 # Default NYC home

        if ctx.get("last_lat") is not None and ctx.get("last_tx_ts") is not None:
            dist_km            = _haversine_km(ctx["last_lat"], ctx["last_lon"], lat, lon)
            elapsed_sec        = max(now.timestamp() - ctx["last_tx_ts"], 1.0)
            elapsed_hr         = elapsed_sec / 3600.0
            geo_velocity       = min(dist_km / elapsed_hr, 5000.0)
            time_since_last_tx = elapsed_sec

        distance_from_home = _haversine_km(home_lat, home_lon, lat, lon)

        # Amount z-score
        acct_avg       = ctx.get("amount_avg", amount)
        acct_std       = max(ctx.get("amount_std", 1.0), 1.0)
        amount_z_score = (amount - acct_avg) / acct_std

        # Merchant risk score
        cat_map = {
            "CryptoExchange": 0.95,
            "Offshore Mule": 0.98,
            "Casino / Gambling": 0.85,
            "Digital Assets": 0.75,
            "Electronics": 0.40,
            "Supermarket": 0.05,
            "General": 0.15
        }
        merchant_risk = cat_map.get(merchant_category, 0.20)

        # Device trust score
        device_trust = 0.35 if (device_id and "untrusted" in device_id.lower()) else 0.90
        if geo_velocity > 400:
            device_trust = min(device_trust, 0.25)

        is_night = 1 if (now.hour >= 23 or now.hour <= 5) else 0

        features = {
            "amount":              amount,
            "geo_velocity":        round(geo_velocity, 4),
            "tx_count_10m":        tx_count_10m,
            "tx_count_1h":         tx_count_1h,
            "hour_of_day":         now.hour,
            "is_weekend":          int(now.weekday() >= 5),
            "is_night_tx":         is_night,
            "amount_z_score":      round(amount_z_score, 4),
            "time_since_last_tx":  round(time_since_last_tx, 4),
            "merchant_risk_score": merchant_risk,
            "device_trust_score":  device_trust,
            "distance_from_home":  round(distance_from_home, 2),
        }

        feature_cols = FraudPredictor._feature_columns or list(features.keys())
        for col in feature_cols:
            features.setdefault(col, 0.0)

        df = pd.DataFrame([features])[feature_cols]
        return df, ctx

    @classmethod
    def _run_inference(cls, df: pd.DataFrame) -> FraudPrediction:
        return FraudPredictor.predict(df)

    @classmethod
    async def evaluate_transaction(
        cls,
        account_id: str,
        amount: float,
        lat: float,
        lon: float,
        merchant_category: str = "General",
        device_id: Optional[str] = None,
    ) -> Tuple[float, str, dict, List[str]]:
        """
        Full async evaluation pipeline.
        Returns: (risk_score, action, explanation, risk_reasons)
        """
        if not cls._models_loaded:
            cls.load_models()

        feature_df, prev_ctx = await cls._build_features(
            account_id, amount, lat, lon, merchant_category, device_id
        )

        loop = asyncio.get_event_loop()
        result: FraudPrediction = await loop.run_in_executor(
            None, cls._run_inference, feature_df
        )

        asyncio.create_task(
            cls._write_account_context(account_id, amount, lat, lon, prev_ctx)
        )

        return result.risk_score, result.action, result.explanation, result.risk_reasons

    @classmethod
    async def generate_otp(cls, transaction_id: str) -> str:
        otp = str(secrets.randbelow(900_000) + 100_000)
        r = await cls._safe_get_cache()
        await r.setex(f"otp:{transaction_id}", 300, otp)
        logger.info(f"🔑 OTP issued for transaction {transaction_id}: {otp}")
        return otp

    @classmethod
    async def verify_otp(cls, transaction_id: str, submitted: str) -> bool:
        r = await cls._safe_get_cache()
        stored = await r.get(f"otp:{transaction_id}")
        if not stored:
            return False
        if stored.strip() == submitted.strip():
            await r.delete(f"otp:{transaction_id}")
            return True
        return False

