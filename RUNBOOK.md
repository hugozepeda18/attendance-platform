# Local Environment Runbook

## Prerequisites
* Docker & Docker Compose
* Node.js v20 LTS or higher
* npm v10 or higher

## 1. Local Infrastructure Setup
```bash
# Clone and enter directory
cd attendance-system

# Start PostgreSQL database container
docker compose up -d

# Verify database container is running
docker compose ps
```

## 2. Backend Initialization
```bash
cd backend
cp .env.example .env

# Install dependencies
npm install

# Run database schema migrations
npx prisma migrate dev --name init

# Seed database with sample middle-school data (grades 1-3, groups A-C, students, cards)
npm run seed

# Start backend service (Runs on http://localhost:4000)
npm run dev
```

## 3. Frontend Initialization
```bash
cd ../frontend
cp .env.example .env

# Install dependencies
npm install

# Start Vite dev server (Runs on http://localhost:5173)
npm run dev
```

## 4. Verification & Testing Suite (Agent Execution Loop)
```bash
# In /backend:
npm run lint
npm test

# In /frontend:
npm run build
```

## 5. Simulating a Scanner Event (Curl Test)
```bash
# Simulate student scanning at the gate (On-time)
curl -X POST http://localhost:4000/api/v1/attendance/scan \
  -H "Content-Type: application/json" \
  -d '{"credentialUid": "CARD-1A-01"}'

# Simulate double-scan (Must return 409 Conflict)
curl -X POST http://localhost:4000/api/v1/attendance/scan \
  -H "Content-Type: application/json" \
  -d '{"credentialUid": "CARD-1A-01"}'
```