Here is an updated, professional-grade `README.md` file that reflects the finalized architecture, the correct folder structure, and the exact step-by-step run instructions to ensure anyone viewing your GitHub repository can get the project running smoothly.

Copy this text and replace the contents of your current `README.md` file.

```markdown
# 🛡️ Intelligent Financial Fraud Detection System

An enterprise-grade, real-time fraud detection platform combining asynchronous Machine Learning inference, a PostgreSQL transactional ledger, Redis feature caching, and a live Streamlit dashboard. 

This project demonstrates a production-ready architecture where hard database constraints and predictive AI work together to process and secure financial transactions in real time.

---

## ✨ Key Features

* **Real-Time Transaction Processing:** FastAPI asynchronous backend handles concurrent payloads without blocking.
* **Dual-Layer Fraud Detection:**
  * 🔴 **Database Triggers:** Hard business rules (e.g., daily transaction limits, suspended accounts) enforced instantly via PostgreSQL.
  * 🟠 **ML Inference:** Isolation Forest (anomaly detection) + XGBoost classifier running asynchronously.
* **Ultra-Fast Feature Store:** Redis caches behavioral context (velocity, geographic distance, 10-minute transaction counts) for sub-millisecond lookups.
* **Step-Up MFA Simulation:** Automated UI flow that halts suspicious transactions and demands One-Time Password (OTP) verification.
* **Live Admin Dashboard:** Streamlit UI polling real-time system metrics, ML flags, and database writes.

---

## 🏗️ System Architecture

```text
[ Streamlit UI ] ──(HTTP)──> [ FastAPI Backend ]
                               │          │
               ┌───────────────┘          └──────────────────────┐
      (Instant Write)                                  (Async Risk Eval)
               ▼                                                 ▼
  ┌─────────────────────┐                          ┌──────────────────────────┐
  │     PostgreSQL      │                          │        ML Engine         │
  │  (Core Ledger DB)   │                          │  Isolation Forest + XGB  │
  │                     │                          │                          │
  │ • SQL Triggers      │                          │ • Reads Redis context    │
  │ • Audit Logs        │                          │ • Computes risk score    │
  │ • Partitioning      │                          └──────────┬───────────────┘
  └─────────────────────┘                                     │
                                         (If Fraud → Update DB + Alert UI)
                                         (Status → 'Awaiting Verification')

```

---

## 🛠️ Tech Stack

| Layer | Technology | Purpose |
| --- | --- | --- |
| **Frontend / Dashboard** | Streamlit (v1.34.0) | Interactive UI, real-time polling, analytics charting |
| **Backend API** | FastAPI (Async) | REST endpoints, background task queues |
| **Core Database** | PostgreSQL 16 | ACID ledger, trigger enforcement, table partitioning |
| **Cache / Feature Store** | Redis 7 | Behavioral context, velocity tracking |
| **ML Engine** | Scikit-learn, XGBoost | Anomaly detection + Supervised classification |

---

## 📁 Repository Structure

```text
fraud-detection-system/
│
├── backend/                    # FastAPI application & ML Engine
│   ├── app/
│   │   ├── api/                # Route handlers (transactions, admin)
│   │   ├── models/             # Database ORMs & Pydantic schemas
│   │   ├── services/           # Business logic (Ledger & Fraud services)
│   │   ├── ml/                 # ML training scripts and predict wrapper
│   │   │   └── models/         # Compiled .pkl artifacts (generated dynamically)
│   │   └── main.py             # FastAPI entry point
│   ├── Dockerfile
│   └── requirements.txt        
│
├── streamlit_app/              # Streamlit dashboard
│   ├── app.py                  
│   ├── Dockerfile
│   └── requirements.txt        
│
├── docker/                     # Database configurations
│   ├── init.sql                # Postgres schema and triggers
│   └── redis.conf              
│
├── docker-compose.yml          # Orchestration for DB and Cache
├── .env                        # Environment variables
├── .gitignore                  
└── README.md

```

---

## 🚀 Quick Start Guide

### Prerequisites

* Docker Desktop
* Python 3.11+
* Git

### 1. Clone the repository

```bash
git clone [https://github.com/YOUR_USERNAME/fraud-detection-system.git](https://github.com/YOUR_USERNAME/fraud-detection-system.git)
cd fraud-detection-system

```

### 2. Start the Databases (Docker)

Spin up PostgreSQL and Redis in the background:

```bash
docker-compose up -d postgres redis

```

### 3. Setup the Backend & Train the ML Models

Open a terminal, navigate to the backend, install dependencies, and run the training script to generate the AI model weights (`.pkl` files):

```bash
cd backend
python -m venv env
source env/bin/activate  # On Windows use `env\Scripts\activate`
pip install -r requirements.txt
python app/ml/train.py

```

Start the FastAPI Server:

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

```

*(The API documentation will be available at `http://localhost:8000/docs`)*

### 4. Launch the Streamlit Dashboard

Open a **new** terminal tab, leave the backend running, and start the frontend:

```bash
cd streamlit_app
python -m venv env
source env/bin/activate
pip install -r requirements.txt
streamlit run app.py

```

*(The dashboard will automatically open at `http://localhost:8501`)*

---

## 🧠 Machine Learning Details

**1. Isolation Forest (Unsupervised)**

* Detects spatial and temporal anomalies without labeled data.
* Tuned for top 1.7% anomaly flagging based on transaction velocity.

**2. XGBoost Classifier (Supervised)**

* Trained on historical fraud data.
* Utilizes a combination of base parameters (amount) and engineered behavioral features (z-scores, time since last transaction).

**Engineered Features:**

* `geo_velocity`: Distance between current and last transaction location.
* `tx_count_10m`: Transactions attempted in the last 10 minutes.
* `amount_z_score`: Standardized deviation from the account's historical average.

---

## 🤝 Contributing

1. Fork the repo
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Commit your changes: `git commit -m 'Add your feature'`
4. Push and open a Pull Request

```

```
