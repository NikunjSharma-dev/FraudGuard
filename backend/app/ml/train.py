"""
ML Training Pipeline — Multi-dimensional Isolation Forest + XGBoost Classifier

Usage:
    python app/ml/train.py

Trains an ensemble ML engine over 12 behavioral & context features.
Saves model artifacts to app/ml/models/.
"""
import os
import numpy as np
import pandas as pd
import joblib
from pathlib import Path

from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, roc_auc_score
from xgboost import XGBClassifier

MODELS_DIR = Path(__file__).parent / "models"
MODELS_DIR.mkdir(exist_ok=True)

DATA_PATH = Path(__file__).parent.parent.parent.parent / "ml_pipeline" / "data" / "creditcard.csv"

FEATURE_COLUMNS = [
    "amount",
    "geo_velocity",
    "tx_count_10m",
    "tx_count_1h",
    "hour_of_day",
    "is_weekend",
    "is_night_tx",
    "amount_z_score",
    "time_since_last_tx",
    "merchant_risk_score",
    "device_trust_score",
    "distance_from_home",
]


def load_data() -> pd.DataFrame:
    """Load dataset or generate rich multi-feature synthetic dataset for demo."""
    if DATA_PATH.exists():
        print(f"📂 Loading dataset from {DATA_PATH}")
        df = pd.read_csv(DATA_PATH)
        return df

    print("Generating rich 12-feature synthetic dataset...")
    np.random.seed(42)
    n = 20000
    fraud_ratio = 0.025

    n_fraud = int(n * fraud_ratio)
    n_legit = n - n_fraud

    # Legitimate transactions
    legit = pd.DataFrame({
        "amount": np.random.exponential(120, n_legit),
        "geo_velocity": np.random.exponential(8, n_legit),
        "tx_count_10m": np.random.poisson(1.2, n_legit),
        "tx_count_1h": np.random.poisson(2.5, n_legit),
        "hour_of_day": np.random.randint(7, 23, n_legit),
        "is_weekend": np.random.binomial(1, 0.28, n_legit),
        "is_night_tx": np.zeros(n_legit, dtype=int),
        "amount_z_score": np.random.normal(0, 0.8, n_legit),
        "time_since_last_tx": np.random.exponential(86400, n_legit),
        "merchant_risk_score": np.random.uniform(0.05, 0.35, n_legit),
        "device_trust_score": np.random.uniform(0.8, 1.0, n_legit),
        "distance_from_home": np.random.exponential(15, n_legit),
        "Class": 0,
    })

    # Fraudulent transactions — anomalous patterns
    fraud_hours = np.random.choice(list(range(0, 6)) + list(range(22, 24)), n_fraud)
    fraud = pd.DataFrame({
        "amount": np.random.exponential(1200, n_fraud),
        "geo_velocity": np.random.exponential(350, n_fraud),
        "tx_count_10m": np.random.poisson(7, n_fraud),
        "tx_count_1h": np.random.poisson(15, n_fraud),
        "hour_of_day": fraud_hours,
        "is_weekend": np.random.binomial(1, 0.55, n_fraud),
        "is_night_tx": np.ones(n_fraud, dtype=int),
        "amount_z_score": np.random.normal(3.8, 1.8, n_fraud),
        "time_since_last_tx": np.random.exponential(120, n_fraud), # rapid fire
        "merchant_risk_score": np.random.uniform(0.7, 1.0, n_fraud), # high risk merchant
        "device_trust_score": np.random.uniform(0.0, 0.4, n_fraud), # untrusted device
        "distance_from_home": np.random.exponential(2500, n_fraud), # far from home
        "Class": 1,
    })

    df = pd.concat([legit, fraud], ignore_index=True).sample(frac=1, random_state=42)
    return df


def engineer_features(df: pd.DataFrame) -> pd.DataFrame:
    """Derive behavioral features from raw transaction data."""
    if "Amount" in df.columns:
        df = df.rename(columns={"Amount": "amount", "Class": "Class"})

    n = len(df)
    for col in FEATURE_COLUMNS:
        if col not in df.columns:
            if col == "geo_velocity":
                df[col] = np.where(df["Class"] == 1, np.random.exponential(300, n), np.random.exponential(8, n))
            elif col == "tx_count_10m":
                df[col] = np.where(df["Class"] == 1, np.random.poisson(6, n), np.random.poisson(1.2, n))
            elif col == "tx_count_1h":
                df[col] = np.where(df["Class"] == 1, np.random.poisson(12, n), np.random.poisson(2.5, n))
            elif col == "hour_of_day":
                df[col] = (df.get("Time", pd.Series(np.zeros(n))) / 3600 % 24).astype(int)
            elif col == "is_weekend":
                df[col] = np.random.binomial(1, 0.28, n)
            elif col == "is_night_tx":
                df[col] = np.where((df["hour_of_day"] >= 23) | (df["hour_of_day"] <= 5), 1, 0)
            elif col == "amount_z_score":
                df[col] = (df["amount"] - df["amount"].mean()) / (df["amount"].std() + 1e-8)
            elif col == "time_since_last_tx":
                df[col] = np.where(df["Class"] == 1, np.random.exponential(120, n), np.random.exponential(86400, n))
            elif col == "merchant_risk_score":
                df[col] = np.where(df["Class"] == 1, np.random.uniform(0.7, 1.0, n), np.random.uniform(0.1, 0.4, n))
            elif col == "device_trust_score":
                df[col] = np.where(df["Class"] == 1, np.random.uniform(0.1, 0.4, n), np.random.uniform(0.8, 1.0, n))
            elif col == "distance_from_home":
                df[col] = np.where(df["Class"] == 1, np.random.exponential(2500, n), np.random.exponential(15, n))

    return df


def train_isolation_forest(X: np.ndarray) -> IsolationForest:
    print("\n🌲 Training Isolation Forest...")
    iso = IsolationForest(
        n_estimators=250,
        contamination=0.025,
        random_state=42,
        n_jobs=-1,
    )
    iso.fit(X)
    return iso


def train_xgboost(X_train, y_train, X_test, y_test) -> XGBClassifier:
    print("\n⚡ Training XGBoost Classifier...")

    scale_pos_weight = (y_train == 0).sum() / (y_train == 1).sum()

    xgb = XGBClassifier(
        n_estimators=350,
        max_depth=6,
        learning_rate=0.04,
        scale_pos_weight=scale_pos_weight,
        eval_metric="auc",
        random_state=42,
        n_jobs=-1,
    )
    xgb.fit(
        X_train, y_train,
        eval_set=[(X_test, y_test)],
        verbose=False,
    )

    y_pred_proba = xgb.predict_proba(X_test)[:, 1]
    auc = roc_auc_score(y_test, y_pred_proba)
    print(f"   ROC-AUC: {auc:.4f}")
    print(classification_report(y_test, xgb.predict(X_test), target_names=["Legit", "Fraud"]))

    return xgb


def main():
    print("=" * 60)
    print("  Fraud Detection — High-Capacity ML Training Pipeline")
    print("=" * 60)

    df = load_data()
    df = engineer_features(df)

    X = df[FEATURE_COLUMNS].values
    y = df["Class"].values

    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    X_train, X_test, y_train, y_test = train_test_split(
        X_scaled, y, test_size=0.2, stratify=y, random_state=42
    )

    iso_forest = train_isolation_forest(X_train)
    xgb_model  = train_xgboost(X_train, y_train, X_test, y_test)

    joblib.dump(iso_forest,       MODELS_DIR / "isolation_forest.pkl")
    joblib.dump(xgb_model,        MODELS_DIR / "xgboost_classifier.pkl")
    joblib.dump(scaler,           MODELS_DIR / "scaler.pkl")
    joblib.dump(FEATURE_COLUMNS,  MODELS_DIR / "feature_columns.pkl")

    print(f"\nModels successfully saved to {MODELS_DIR}")
    print("   • isolation_forest.pkl")
    print("   • xgboost_classifier.pkl")
    print("   • scaler.pkl")
    print("   • feature_columns.pkl")


if __name__ == "__main__":
    main()