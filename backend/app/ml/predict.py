"""
ML Prediction Module — High-Capacity Fraud Risk Scoring.

Architecture:
  FraudService (async, Redis/In-Memory, OTP) → FraudPredictor.predict() → FraudPrediction
"""
import joblib
import shap
import numpy as np
import pandas as pd
from pathlib import Path
from dataclasses import dataclass, field
from typing import Optional, List, Dict

MODELS_DIR = Path(__file__).parent / "models"

# ─────────────────────────────────────────────────────────────────────────────
# Dynamic ML Engine Configuration (Adjustable via API)
# ─────────────────────────────────────────────────────────────────────────────
ENGINE_CONFIG = {
    "xgb_weight": 0.75,
    "iso_bump": 0.25,
    "mfa_threshold": 0.65,
    "block_threshold": 0.85,
    "sensitivity_mode": "Balanced",
}


@dataclass
class FraudPrediction:
    """Fully typed result from a single inference run."""
    risk_score:      float          # 0.0 → safe, 1.0 → highly suspicious
    action:          str            # "Approved" | "Declined" | "Awaiting Verification"
    is_fraudulent:   bool           # True when action != "Approved"
    iso_anomaly:     int            # -1 = anomaly, 1 = normal (Isolation Forest)
    xgb_probability: float          # Raw XGBoost fraud probability
    explanation:     Dict[str, float] = field(default_factory=dict)  # SHAP attributions
    risk_reasons:    List[str]        = field(default_factory=list)  # Human readable risk flags


class FraudPredictor:
    """
    Wraps Isolation Forest + XGBoost + SHAP into a single predict() call.
    Models are loaded once at startup and cached as class attributes.
    """
    _iso_forest      = None
    _xgb_model       = None
    _scaler          = None
    _feature_columns = None
    _shap_explainer  = None

    # ── Loading ───────────────────────────────────────────────────────────────

    @classmethod
    def load(cls) -> None:
        """Load all .pkl artifacts from disk. Safe to call multiple times."""
        if cls._iso_forest is not None:
            return  # Already loaded

        cls._scaler          = joblib.load(MODELS_DIR / "scaler.pkl")
        cls._iso_forest      = joblib.load(MODELS_DIR / "isolation_forest.pkl")
        cls._xgb_model       = joblib.load(MODELS_DIR / "xgboost_classifier.pkl")
        cls._feature_columns = joblib.load(MODELS_DIR / "feature_columns.pkl")

        # Build SHAP TreeExplainer once
        try:
            cls._shap_explainer = shap.TreeExplainer(cls._xgb_model)
        except Exception as e:
            cls._shap_explainer = None

    @classmethod
    def is_loaded(cls) -> bool:
        return cls._iso_forest is not None

    # ── Inference ─────────────────────────────────────────────────────────────

    @classmethod
    def predict(cls, features_df: pd.DataFrame) -> FraudPrediction:
        """
        Score a single transaction over active feature set.
        """
        if not cls.is_loaded():
            cls.load()

        # Re-order and pad missing features if any
        for col in cls._feature_columns:
            if col not in features_df.columns:
                features_df[col] = 0.0
        X = features_df[cls._feature_columns]

        # 1. Scale
        X_scaled = cls._scaler.transform(X)

        # 2. Isolation Forest (-1 = anomaly)
        iso_result = int(cls._iso_forest.predict(X_scaled)[0])
        is_anomaly = iso_result == -1

        # 3. XGBoost fraud probability
        xgb_proba = float(cls._xgb_model.predict_proba(X_scaled)[0][1])

        # 4. Dynamic Ensemble Scoring
        xgb_w  = ENGINE_CONFIG["xgb_weight"]
        iso_w  = ENGINE_CONFIG["iso_bump"]
        mfa_th = ENGINE_CONFIG["mfa_threshold"]
        blk_th = ENGINE_CONFIG["block_threshold"]

        iso_bump   = iso_w if is_anomaly else 0.0
        risk_score = round(min(xgb_w * xgb_proba + iso_bump, 0.99), 4)

        # 5. Threshold Decision Logic
        if risk_score >= blk_th:
            action = "Declined"
        elif risk_score >= mfa_th:
            action = "Awaiting Verification"
        else:
            action = "Approved"

        # 6. SHAP Attributions
        explanation = {}
        if cls._shap_explainer is not None:
            try:
                shap_values = cls._shap_explainer.shap_values(X_scaled)
                values = shap_values[1][0] if isinstance(shap_values, list) else shap_values[0]
                explanation = {
                    col: round(float(val), 5)
                    for col, val in zip(cls._feature_columns, values)
                }
            except Exception:
                explanation = {col: 0.0 for col in cls._feature_columns}

        # 7. Human-readable Risk Reasons
        row = features_df.iloc[0]
        reasons = []
        if row.get("geo_velocity", 0) > 300:
            reasons.append(f"Geographic Velocity of {row.get('geo_velocity'):,.0f} km/h indicates physical impossibility.")
        if row.get("amount_z_score", 0) > 2.5:
            reasons.append(f"Transaction amount is {row.get('amount_z_score'):.1f}x standard deviations above history.")
        if row.get("merchant_risk_score", 0) > 0.65:
            reasons.append("High-risk merchant category (Offshore / Crypto / Casino).")
        if row.get("device_trust_score", 1.0) < 0.4:
            reasons.append("Untrusted device fingerprint detected.")
        if row.get("is_night_tx", 0) == 1:
            reasons.append("Off-hours midnight transaction window.")
        if row.get("tx_count_10m", 0) >= 4:
            reasons.append(f"High transaction frequency ({int(row.get('tx_count_10m'))} tx in 10 mins).")
        if row.get("distance_from_home", 0) > 1000:
            reasons.append(f"Location is {row.get('distance_from_home'):,.0f} km from registered home address.")

        if not reasons and action != "Approved":
            reasons.append("ML ensemble anomaly score exceeded risk threshold.")
        elif not reasons:
            reasons.append("Passed all security & behavioral checks.")

        return FraudPrediction(
            risk_score=risk_score,
            action=action,
            is_fraudulent=(action != "Approved"),
            iso_anomaly=iso_result,
            xgb_probability=round(xgb_proba, 4),
            explanation=explanation,
            risk_reasons=reasons,
        )

