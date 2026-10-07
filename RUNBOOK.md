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
The dev seed creates two schools that share badge IDs:

| School | Web page (dev) | Users (password `dev-password-123`) | Device keys |
|---|---|---|---|
| Secundaria Demo Norte (`norte`) | http://norte.localhost:5173 | `principal@norte.test`, `staff@norte.test` | `ak_dev_north_{scanner,staff,principal}` |
| Secundaria Demo Sur (`sur`) | http://sur.localhost:5173 | `principal@sur.test`, `staff@sur.test` | `ak_dev_south_{scanner,staff,principal}` |

The platform admin dashboard is at **http://admin.localhost:5173** (dev owner: `owner@platform.test` / `dev-password-123`). The emergency super-admin key is `SUPERADMIN_API_KEY` (`ak_dev_superadmin`). Plain `http://localhost:5173` has no school and shows "School not found".

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
Day to day, use the dashboard at `admin.<your domain>`: create schools (with their first principal), edit schedules, rename addresses, deactivate, issue/revoke device keys and manage users.

Create your owner account (prints a random password once; re-running resets it and signs out old sessions):
```bash
cd backend && npm run create-admin -- you@example.com "Your Name"
```

The same operations by API (scripts/emergencies), using the fallback key:
```bash
ADMIN="Authorization: Bearer $SUPERADMIN_API_KEY"

# Onboard a new school (the response contains its device keys ONCE; store them safely)
curl -X POST http://localhost:4000/api/v1/admin/schools -H "$ADMIN" \
  -H "Content-Type: application/json" \
  -d '{"name": "Secundaria 12", "slug": "sec-12", "timezone": "America/Monterrey", "schoolStartTime": "07:30"}'

# Create the school's first principal (they then add their own staff from the Staff page)
curl -X POST http://localhost:4000/api/v1/users -H "$ADMIN" -H "x-school-id: <id>" \
  -H "Content-Type: application/json" \
  -d '{"email": "director@sec12.mx", "name": "Directora", "role": "PRINCIPAL", "password": "<initial password>"}'
# → the principal signs in at https://sec-12.<your domain>

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
**Production:** point a wildcard DNS record (`*.<your domain>`) and a wildcard TLS certificate at the frontend; set `SUPERADMIN_API_KEY` to a long random value (`openssl rand -base64 32`), never run the seed (it refuses when `NODE_ENV=production`), and change the default Postgres credentials in `docker-compose.yml`.