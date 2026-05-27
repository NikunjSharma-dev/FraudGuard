# 🛡️ Intelligent Financial Fraud Detection System

[![Python](https://img.shields.io/badge/Python-3.11+-blue.svg)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.111-green.svg)](https://fastapi.tiangolo.com)
[![Streamlit](https://img.shields.io/badge/Streamlit-1.35-red.svg)](https://streamlit.io)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-blue.svg)](https://postgresql.org)
[![Redis](https://img.shields.io/badge/Redis-7.2-red.svg)](https://redis.io)
[![Docker](https://img.shields.io/badge/Docker-Compose-blue.svg)](https://docs.docker.com/compose/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

An **enterprise-grade, real-time fraud detection platform** combining asynchronous ML inference, a PostgreSQL transactional ledger, Redis feature caching, and a live Streamlit dashboard — all orchestrated via Docker Compose.

---

## 📸 Screenshots

| Customer Terminal | Admin Live Monitor |
|---|---|
| ![Terminal](docs/screenshots/terminal.png) | ![Dashboard](docs/screenshots/dashboard.png) |

---

## 🏗️ Architecture

```
[ Streamlit UI ] ──(HTTP)──> [ FastAPI Backend ]
                                   │          │
               ┌───────────────────┘          └──────────────────────┐
      (Instant Write)                                    (Async Risk Eval)
               ▼                                                      ▼
  ┌─────────────────────┐                           ┌──────────────────────────┐
  │    PostgreSQL        │                           │     ML Engine            │
  │  (Core Ledger DB)   │                           │  Isolation Forest + XGB  │
  │                     │                           │                          │
  │  • SQL Triggers     │                           │  • Reads Redis context   │
  │  • Audit Logs       │                           │  • Computes risk score   │
  │  • Partitioning     │                           └──────────┬───────────────┘
  └─────────────────────┘                                      │
                                          (If Fraud → Update DB + Alert UI)
                                          (Status → 'Awaiting Verification')
```

---

## ✨ Key Features

- **Real-Time Transaction Processing** — FastAPI async backend handles concurrent submissions without blocking
- **Dual-Layer Fraud Detection:**
  - 🔴 **Database Triggers** — Hard business rules (suspended accounts, daily limits) via PostgreSQL
  - 🟠 **ML Inference** — Isolation Forest anomaly detection + XGBoost classifier running asynchronously
- **Redis Feature Store** — Sub-millisecond lookups for behavioral features (velocity, geo-distance, transaction frequency)
- **Step-Up MFA Simulation** — OTP verification flow triggered automatically on fraud flags
- **Live Admin Dashboard** — Streamlit dashboard with real-time metrics, charts, and ledger table
- **Full Audit Trail** — Every state change logged with timestamps in PostgreSQL

---

## 🛠️ Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| **Frontend / Dashboard** | Streamlit | Interactive UI, real-time polling, charting |
| **Backend API** | FastAPI (async) | REST endpoints, background task queue |
| **Core Database** | PostgreSQL 16 | ACID ledger, triggers, partitioning |
| **Cache / Feature Store** | Redis 7 | Behavioral context, velocity checks |
| **ML Engine** | Scikit-learn, XGBoost | Isolation Forest + supervised classifier |
| **Containerization** | Docker Compose | One-command deployment of all services |
| **Model Interpretability** | SHAP | Feature attribution and explanation |

---

## 📁 Project Structure

```
fraud-detection-system/
│
├── backend/                        # FastAPI application
│   ├── app/
│   │   ├── api/                    # Route handlers
│   │   │   ├── transactions.py     # Transaction endpoints
│   │   │   └── admin.py            # Admin/monitoring endpoints
│   │   ├── models/                 # Pydantic schemas + DB models
│   │   │   ├── schemas.py
│   │   │   └── database.py
│   │   ├── services/               # Business logic
│   │   │   ├── fraud_service.py    # ML inference + Redis
│   │   │   └── ledger_service.py   # DB operations
│   │   ├── ml/                     # ML model training & artifacts
│   │   │   ├── train.py
│   │   │   ├── predict.py
│   │   │   └── models/             # Saved .pkl model files
│   │   └── main.py                 # FastAPI app entry point
│   ├── tests/
│   │   ├── test_transactions.py
│   │   └── test_ml.py
│   └── requirements.txt
│
├── streamlit_app/                  # Streamlit dashboard
│   ├── app.py                      # Main Streamlit app
│   └── requirements.txt
│
├── ml_pipeline/                    # Standalone ML training pipeline
│   ├── notebooks/
│   │   ├── 01_EDA.ipynb            # Exploratory Data Analysis
│   │   ├── 02_Feature_Engineering.ipynb
│   │   └── 03_Model_Training.ipynb
│   └── data/                       # Place your dataset here
│       └── .gitkeep
│
├── docker/
│   ├── init.sql                    # PostgreSQL schema + triggers
│   └── redis.conf
│
├── docs/
│   ├── API.md                      # API reference
│   └── screenshots/
│
├── .github/
│   └── workflows/
│       └── ci.yml                  # GitHub Actions CI pipeline
│
├── docker-compose.yml
├── .env.example
├── .gitignore
└── README.md
```

---

## 🚀 Quick Start

### Prerequisites
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (includes Docker Compose)
- Git

### 1. Clone the repository
```bash
git clone https://github.com/YOUR_USERNAME/fraud-detection-system.git
cd fraud-detection-system
```

### 2. Configure environment
```bash
cp .env.example .env
# Edit .env if needed (defaults work out of the box)
```

### 3. Launch all services
```bash
docker-compose up --build
```

This starts:
| Service | URL |
|---|---|
| Streamlit Dashboard | http://localhost:8501 |
| FastAPI Backend | http://localhost:8000 |
| FastAPI Docs (Swagger) | http://localhost:8000/docs |
| PostgreSQL | localhost:5432 |
| Redis | localhost:6379 |

### 4. (Optional) Train the ML model locally
```bash
cd backend
pip install -r requirements.txt
python app/ml/train.py
```

---

## 🔌 API Reference

### Submit a Transaction
```http
POST /transaction/submit
Content-Type: application/json

{
  "account_id": "ACC10294",
  "amount": 5000.00,
  "lat": 19.0760,
  "lon": 72.8777
}
```

**Response:**
```json
{
  "transaction_id": "txn_8f3a...",
  "status": "Awaiting Verification",
  "risk_score": 0.87,
  "message": "Suspicious activity flagged by ML engine"
}
```

### Verify OTP (Step-Up MFA)
```http
PATCH /transaction/{transaction_id}/verify
Content-Type: application/json

{ "otp": "123456" }
```

### Admin — Get Ledger Summary
```http
GET /admin/ledger-summary
```

Full API docs available at `/docs` (Swagger UI) when running.

---

## 🧠 ML Models

### 1. Isolation Forest (Unsupervised)
- Detects anomalies without labeled data
- Trained on: `amount`, `geo_velocity`, `tx_count_10m`, `hour_of_day`, `weekend_flag`
- Threshold tuned for top 1% anomaly flagging

### 2. XGBoost Classifier (Supervised)
- Trained on labeled fraud data (Kaggle Credit Card Dataset)
- SMOTE applied to handle class imbalance (~0.17% fraud rate)
- SHAP used for feature attribution and model explainability

### Feature Engineering
| Feature | Description |
|---|---|
| `geo_velocity` | Distance (km) between current & last transaction location |
| `time_since_last_tx` | Seconds elapsed since last transaction |
| `tx_count_10m` | Transactions in the last 10 minutes (from Redis) |
| `amount_z_score` | Z-score of amount vs. account history |
| `hour_of_day` | Hour of transaction (0–23) |
| `is_weekend` | Binary flag for weekends |

---

## 🗄️ Database Schema

The core `transactions` table is **range-partitioned by month** for performance at scale:

```sql
CREATE TABLE transactions (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id    VARCHAR(20) NOT NULL,
    amount        NUMERIC(12, 2) NOT NULL,
    status        VARCHAR(30) DEFAULT 'Pending',
    is_fraudulent BOOLEAN DEFAULT FALSE,
    risk_score    FLOAT,
    latitude      FLOAT,
    longitude     FLOAT,
    created_at    TIMESTAMPTZ DEFAULT NOW()
) PARTITION BY RANGE (created_at);
```

A **PostgreSQL trigger** enforces hard business rules before every insert — no application-level bypass possible.

---

## 📊 Model Performance

| Metric | Isolation Forest | XGBoost |
|---|---|---|
| ROC-AUC | — | **0.974** |
| Fraud Recall | — | **0.91** |
| Precision | — | 0.87 |
| False Positive Rate | ~1% | ~2% |

---

## 🧪 Running Tests

```bash
cd backend
pytest tests/ -v
```

---

## 🤝 Contributing

1. Fork the repo
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Commit your changes: `git commit -m 'Add your feature'`
4. Push and open a Pull Request

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

---

## 🙏 Acknowledgements

- [Kaggle Credit Card Fraud Detection Dataset](https://www.kaggle.com/datasets/mlg-ulb/creditcardfraud) — ULB Machine Learning Group
- Architecture inspired by production patterns at major fintech institutions