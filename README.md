# BrowserDNA 🧬

A full-stack bot detection system that combines **browser fingerprinting**, **behavioral analysis**, **network scoring**, and a **Random Forest ML model** to classify visitors as `HUMAN`, `SUSPICIOUS`, or `BOT` — in real time.

Built as an educational lab, every signal is isolated and explainable so you can see exactly what contributes to the final risk score.

---

## Screenshot

> Detection form + live score breakdown on the main page.

---

## Features

| Module | What it detects |
|--------|----------------|
| 🔍 Browser Fingerprinting | User-Agent, Canvas hash, WebGL/GPU, screen, timezone, plugins |
| 🤖 Automation Detection | WebDriver flag, headless keywords, Selenium/Playwright/Puppeteer props |
| 🖱️ Behavioral Analysis | Mouse entropy, typing speed, scroll events, time-on-page |
| 🌐 Network Scoring | ASN/IP reputation via WHOIS lookup |
| 🧠 ML Model | Random Forest trained on synthetic human vs. bot feature vectors |
| ⚔️ Attack Simulation | Rate limiting demo, honeypot fields, header inspection |
| 📊 Risk Score Breakdown | Per-signal weights, live formula, verdict explanation |

### Score Formula

```
Final Score = browser × 35% + behavior × 25% + ML × 25% + network × 15%
```

| Score | Verdict |
|-------|---------|
| ≥ 65  | 🤖 BOT |
| 40–64 | ⚠️ SUSPICIOUS |
| < 40  | ✅ HUMAN |

---

## Tech Stack

**Backend**
- Python 3.11+
- FastAPI + Uvicorn
- SQLAlchemy + SQLite
- scikit-learn (Random Forest)
- ipwhois (ASN/network lookup)

**Frontend**
- Next.js 15 (App Router)
- TypeScript
- Tailwind CSS

---

## Project Structure

```
BrowserDNA/
├── backend/
│   ├── main.py              # FastAPI app, routes, CORS
│   ├── scoring.py           # Signal weights & verdict thresholds
│   ├── ml_model.py          # Random Forest model (train + predict)
│   ├── network_analysis.py  # ASN / IP reputation scoring
│   ├── models.py            # SQLAlchemy ORM models
│   ├── schemas.py           # Pydantic request/response schemas
│   └── database.py          # DB engine & session factory
├── frontend/
│   ├── app/
│   │   ├── page.tsx         # Main detection form
│   │   ├── dashboard/       # Visit history dashboard
│   │   ├── visit/[id]/      # Per-visit full report
│   │   └── lab/             # Interactive lab modules
│   │       ├── fingerprint/ # Module 01 — Browser fingerprinting
│   │       ├── automation/  # Module 02 — Automation detection
│   │       ├── behavior/    # Module 03 — Behavioral analysis
│   │       ├── attack/      # Module 04 — Attack simulation
│   │       └── risk/        # Module 05 — Risk score breakdown
│   ├── components/          # Shared UI components
│   └── lib/
│       ├── fingerprint.ts   # Client-side fingerprint collector
│       ├── audio.ts         # Audio fingerprinting
│       └── api.ts           # Backend API client
├── data/
│   ├── bots.db              # SQLite database
│   └── bot_model.joblib     # Trained ML model (auto-generated)
├── run.py                   # Single entry point (starts both servers)
├── requirements.txt
└── .env
```

---

## Getting Started

### Prerequisites

- Python 3.11+
- Node.js 18+

### 1. Clone the repo

```bash
git clone https://github.com/mmdMadi/BrowserDNA.git
cd BrowserDNA
```

### 2. Set up the backend

```bash
python -m venv .venv
# Windows
.venv\Scripts\activate
# macOS/Linux
source .venv/bin/activate

pip install -r requirements.txt
```

### 3. Set up the frontend

```bash
cd frontend
npm install
cd ..
```

### 4. Configure environment

Copy `.env` and set your values:

```env
HOST=0.0.0.0
PORT=8001
FRONTEND_PORT=3000
ALLOWED_ORIGINS=http://localhost:3000
```

### 5. Run

**Development mode** (hot reload on both servers):
```bash
python run.py --dev
```

**Production mode:**
```bash
python run.py
```

| Service  | URL |
|----------|-----|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:8001 |
| API Docs | http://localhost:8001/docs |

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/analyze` | Submit fingerprint data, get bot score |
| `GET` | `/visits` | Paginated visit history |
| `GET` | `/visits/{id}` | Full report for a single visit |
| `GET` | `/demo/rate-limit` | Rate limiting demo (5 req / 10s) |
| `POST` | `/demo/honeypot` | Honeypot field detection demo |
| `GET` | `/demo/echo` | Echo request headers |
| `GET` | `/health` | Health check |

---

## ML Model

The Random Forest classifier uses 6 features:

| Feature | Bot signal |
|---------|-----------|
| `mouse_entropy` | Low variance → no real mouse movement |
| `typing_delay` | < 40ms avg → automated input |
| `webdriver` | `true` → automation framework detected |
| `plugins_count` | 0 → headless browser |
| `scroll_events` | 0 → no user interaction |
| `time_on_page` | < 3s → instant form submission |

The model is trained on synthetic data at first run and saved to `data/bot_model.joblib`.

---

## License

MIT
