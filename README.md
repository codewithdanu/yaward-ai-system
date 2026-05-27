# YAWard - AI Safety Detection System

> Real-time AI-powered workplace safety monitoring for mining industry.  
> Detects PPE violations, danger zone intrusions, and safety hazards using YOLOv8.

---

## 🏗️ Project Structure

```
yaward/
├── yaward-backend/          # Flask REST API + YOLOv8 AI Engine
│   ├── app.py               # Application factory
│   ├── config.py            # Environment configuration
│   ├── database_models.py   # SQLAlchemy ORM models
│   ├── models/
│   │   ├── yolov8_detector.py    # YOLOv8 inference engine
│   │   └── safety_analyzer.py   # Rule-based safety analysis
│   ├── routes/
│   │   ├── health_routes.py
│   │   ├── analysis_routes.py
│   │   └── violation_routes.py
│   ├── services/
│   │   └── alert_service.py  # Email alert system
│   └── tests/               # Pytest test suite
│
├── yaward-frontend/          # NextJS 14 + Tailwind CSS Dashboard
│   └── src/
│       ├── app/             # App Router pages
│       │   ├── page.tsx     # Dashboard
│       │   ├── alerts/      # Alerts management
│       │   ├── feeds/       # Live camera feeds
│       │   └── reports/     # Analytics & charts
│       ├── components/
│       │   ├── shared/      # Sidebar, Topbar
│       │   └── features/    # StatCard, FeedTile, AlertModal, AlertPreview
│       └── lib/
│           ├── api.ts       # Axios client
│           └── store.ts     # Zustand state management
│
├── docker-compose.yml        # Full stack orchestration
└── init.sql                  # PostgreSQL schema + seed data
```

---

## ⚡ Quick Start

### Prerequisites
- Python 3.10+
- Node.js 18+
- PostgreSQL 15+
- Docker + Docker Compose (optional)

---

### 🐍 Backend Setup

```bash
cd yaward-backend

# Create virtual environment
python -m venv venv
venv\Scripts\activate  # Windows
# source venv/bin/activate  # macOS/Linux

# Install dependencies
pip install -r requirements.txt

# Configure environment
copy .env.example .env
# Edit .env with your database credentials

# Run the API
python app.py
# API runs on http://localhost:5000
```

---

### ⚛️ Frontend Setup

```bash
cd yaward-frontend

# Install dependencies
npm install

# Configure environment
copy .env.example .env.local
# Edit NEXT_PUBLIC_API_URL if needed

# Start development server
npm run dev
# Dashboard runs on http://localhost:3000
```

---

### 🐳 Docker Compose (Full Stack)

```bash
# From project root
docker-compose up -d

# Access:
# Frontend:  http://localhost:3000
# Backend:   http://localhost:5000
# Database:  localhost:5432
```

---

## 🔌 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | System health check |
| POST | `/api/analyze` | Analyze image frame |
| GET | `/api/violations` | List violations (filterable) |
| GET | `/api/violations/:id` | Get single violation |
| POST | `/api/acknowledge-alert` | Acknowledge a violation |
| GET | `/api/statistics` | Dashboard statistics |
| GET | `/api/model-info` | YOLOv8 model info |

### Example: Analyze Frame
```bash
curl -X POST http://localhost:5000/api/analyze \
  -H "Content-Type: application/json" \
  -d '{"image_path": "/path/to/frame.jpg", "cctv_id": "CCTV-001"}'
```

### Example: Get Violations
```bash
# All unacknowledged violations
curl "http://localhost:5000/api/violations?acknowledged=false&limit=20"

# Filter by camera
curl "http://localhost:5000/api/violations?cctv_id=CCTV-001"
```

---

## 💾 Database Schema

```sql
CREATE TABLE violations (
    id SERIAL PRIMARY KEY,
    type VARCHAR(50) NOT NULL,      -- NO_HELMET, NO_VEST, INTRUSION, FALL
    severity VARCHAR(20) NOT NULL,  -- LOW, MEDIUM, HIGH, CRITICAL
    person_id VARCHAR(100),
    cctv_id VARCHAR(50) NOT NULL,
    timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    acknowledged BOOLEAN DEFAULT FALSE,
    acknowledged_at TIMESTAMP,
    acknowledged_by VARCHAR(100),
    message TEXT,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 🧪 Testing

```bash
# Backend tests
cd yaward-backend
pytest tests/ -v

# Frontend TypeScript check
cd yaward-frontend
npx tsc --noEmit
```

---

## 🎯 Detection Rules

1. **NO_HELMET** (HIGH) - Worker detected without hard hat
2. **NO_VEST** (HIGH) - Worker detected without safety vest  
3. **INTRUSION** (CRITICAL) - Worker inside danger zone polygon
4. **FALL** (CRITICAL) - Worker fall detection (future)

---

## 🚀 Tech Stack

| Layer | Technology |
|-------|-----------|
| AI Engine | YOLOv8 (Ultralytics) + PyTorch |
| Backend | Python 3.10 + Flask 2.3 |
| ORM | SQLAlchemy 2.0 |
| Database | PostgreSQL 15 |
| Frontend | NextJS 14 (App Router) |
| Styling | Tailwind CSS |
| State | Zustand |
| Data Fetching | SWR + Axios |
| Charts | Recharts |
| Deployment | Docker + Docker Compose |

---

## 📋 Safety Criteria

- ✅ API response time: < 1 second
- ✅ AI inference: < 500ms per frame
- ✅ Confidence threshold: > 0.5 (configurable)
- ✅ Real-time dashboard: polls every 2 seconds
- ✅ Email alerts for HIGH/CRITICAL violations

---

**Project**: YAWard MVP  
**Version**: 1.0  
**License**: Internal Use
