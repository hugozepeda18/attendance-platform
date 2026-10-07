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
The dev seed creates two schools that share badge IDs, with fixed dev keys:
`ak_dev_north_{scanner,staff,principal}` (school `default-school`), `ak_dev_south_{scanner,staff,principal}` (school `school-b`), and the super-admin key from `SUPERADMIN_API_KEY` (`ak_dev_superadmin`). Sign in to the frontend with a STAFF or PRINCIPAL key.

```bash
# Simulate student scanning at the gate (On-time)
curl -X POST http://localhost:4000/api/v1/attendance/scan \
  -H "Authorization: Bearer ak_dev_north_scanner" \
  -H "Content-Type: application/json" \
  -d '{"credentialUid": "CARD-1A-01"}'

# Simulate double-scan (Must return 409 Conflict)
curl -X POST http://localhost:4000/api/v1/attendance/scan \
  -H "Authorization: Bearer ak_dev_north_scanner" \
  -H "Content-Type: application/json" \
  -d '{"credentialUid": "CARD-1A-01"}'

# Same badge at the other school is a different student (Must return 201)
curl -X POST http://localhost:4000/api/v1/attendance/scan \
  -H "Authorization: Bearer ak_dev_south_scanner" \
  -H "Content-Type: application/json" \
  -d '{"credentialUid": "CARD-1A-01"}'

# No token (Must return 401)
curl -i -X POST http://localhost:4000/api/v1/attendance/scan \
  -H "Content-Type: application/json" -d '{"credentialUid": "CARD-1A-01"}'
```

## 6. Super-Admin Operations (Platform Owner)
```bash
ADMIN="Authorization: Bearer $SUPERADMIN_API_KEY"

# Onboard a new school (the response contains its keys ONCE; store them safely)
curl -X POST http://localhost:4000/api/v1/admin/schools -H "$ADMIN" \
  -H "Content-Type: application/json" \
  -d '{"name": "Secundaria 12", "timezone": "America/Monterrey", "schoolStartTime": "07:30"}'

# List schools / deactivate one
curl http://localhost:4000/api/v1/admin/schools -H "$ADMIN"
curl -X PATCH http://localhost:4000/api/v1/admin/schools/<id> -H "$ADMIN" \
  -H "Content-Type: application/json" -d '{"active": false}'

# Issue / revoke a key (e.g. a new gate scanner, or a leaked key)
curl -X POST http://localhost:4000/api/v1/admin/schools/<id>/keys -H "$ADMIN" \
  -H "Content-Type: application/json" -d '{"role": "SCANNER", "label": "Gate 2"}'
curl -X DELETE http://localhost:4000/api/v1/admin/schools/<id>/keys/<keyId> -H "$ADMIN"

# Support: act inside a school's data
curl "http://localhost:4000/api/v1/attendance/search?query=1-A" -H "$ADMIN" -H "x-school-id: <id>"

# Direct database access (owner only)
cd backend && npx prisma studio
```
Restart the backend after onboarding a school so its absence job gets scheduled.

**Production:** set `SUPERADMIN_API_KEY` to a long random value (`openssl rand -base64 32`), never run the seed (it refuses when `NODE_ENV=production`), and change the default Postgres credentials in `docker-compose.yml`.