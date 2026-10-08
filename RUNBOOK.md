# Local Environment Runbook

## Prerequisites
* Docker Desktop (running) & Docker Compose; nothing else listening on port 5432 (e.g. a Homebrew Postgres)
* Node.js v20 LTS or higher
* npm v10 or higher
* Chrome or Firefox (they resolve `*.localhost` on their own; for other browsers add `127.0.0.1 norte.localhost sur.localhost admin.localhost` to `/etc/hosts`)

Backend and frontend each keep a terminal busy, so use two.

## 1. Local Infrastructure Setup
```bash
cd attendance-platform

# Start PostgreSQL database container
docker compose up -d

# Verify database container is running
docker compose ps
```

## 2. Backend Initialization (terminal 1)
```bash
cd backend
cp .env.example .env

# Install dependencies
npm install

# Apply the existing migrations (use `npx prisma migrate dev --name <change>` only when you change schema.prisma)
npx prisma migrate deploy

# Seed the dev data (safe to re-run; see "Dev data" below)
npm run seed

# Start backend service (Runs on http://localhost:4000)
npm run dev
```

## 3. Frontend Initialization (terminal 2)
```bash
cd frontend
cp .env.example .env

# Install dependencies
npm install

# Start Vite dev server (Runs on http://localhost:5173)
npm run dev
```
Open **http://norte.localhost:5173** (a school's own address, not plain `localhost:5173`) and sign in as `principal@norte.test` / `dev-password-123`.

### Dev data
The seed creates two schools (Norte, Sur), each with grades 1–3, groups A–B, 5 students per group (30 per school), badges `CARD-<grade><group>-<nn>` (e.g. `CARD-1A-01`) and a guardian WhatsApp number per student; a principal and a staff user per school; the platform owner; and the dev device keys (table in §5).
It also creates the **last 30 school days of attendance** (by the SEP calendar, so from 31 Aug, the start of the 2026-2027 school year, skipping 16 Sep and the 25 Sep Consejo Técnico): mostly PRESENT, some TARDY, a few ABSENT and EXCUSED, with every 7th student ("problem" student) tardy or absent more often. **Today stays empty** so you can scan live (curl in §5, or the gate program in §6); after the school's cutoff (08:30 by default) the absence job marks everyone not scanned as ABSENT.
Until Phase 15, WhatsApp messages are only printed in the backend terminal.

## 4. Verification & Testing Suite (Agent Execution Loop)
```bash
# In /backend:
npm run lint
npm test   # uses the same database as the dev server: it deletes all attendance records,
           # scans and every school except Norte/Sur. Run `npm run seed` afterwards to get the history back.

# In /frontend:
npm run build
```

## 5. Simulating a Scanner Event (Curl Test)
Scans are only accepted until the school's window closes (`schoolStartTime + absenceCutoffMinutes`, 08:30 for the seed); later scans return `422 OUTSIDE_WINDOW`. To try scans at other hours, set the school's start time to a few minutes ago in the admin dashboard (http://admin.localhost:5173) and set it back afterwards.
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

# Gate PC uploading its offline queue (safe to resend: same eventIds → same results, no second message)
curl -X POST http://localhost:4000/api/v1/attendance/scans \
  -H "Authorization: Bearer ak_dev_north_scanner" \
  -H "Content-Type: application/json" \
  -d "{\"sentAt\": \"$(date -u +%FT%TZ)\", \"events\": [{\"eventId\": \"evt-1\", \"credentialUid\": \"CARD-2B-03\", \"scannedAt\": \"$(date -u +%FT%TZ)\"}]}"

# Gate heartbeat (pending > 0 at the cutoff delays that school's absence run, max 30 min)
curl -X POST http://localhost:4000/api/v1/gate/heartbeat \
  -H "Authorization: Bearer ak_dev_north_scanner" \
  -H "Content-Type: application/json" -d '{"pending": 0}'

# No token (Must return 401)
curl -i -X POST http://localhost:4000/api/v1/attendance/scan \
  -H "Content-Type: application/json" -d '{"credentialUid": "CARD-1A-01"}'
```

## 6. Gate PC (Windows scanner client)
Build (on any Windows PC with 32-bit Python 3.8 installed: `py -3.8-32`):
```powershell
cd gate
powershell -ExecutionPolicy Bypass -File build.ps1   # runs the self-check, then makes dist\gate.exe
```
Install on the gate PC: copy `gate.exe` and `gate-setup.ps1` into `C:\Asistencia`, then as Administrator:
```powershell
powershell -ExecutionPolicy Bypass -File C:\Asistencia\gate-setup.ps1
```
It asks for the server URL (`https://api.<your domain>/api/v1`), the gate's SCANNER key (issue one per gate in the admin dashboard) and a label. Plug in the USB reader and restart.
* **Antivirus:** the exe is unsigned, so SmartScreen may show "Windows protected your PC" → *More info* → *Run anyway*. The setup adds a Defender exclusion; with another antivirus (or on Windows 7) add `C:\Asistencia` as an exception by hand.
* **Support:** `gate.log` next to the exe; `gate.db` holds every scan (`sent=0` pending, `1` uploaded, `-1` dropped/rejected with the reason in `server`). Ctrl+Q closes the screen.
* **Releasing a new version:** bump `VERSION` in `gate.py`, build, set `GATE_LATEST_VERSION` on the server; old gates show "Actualización disponible" until the exe is replaced.
* **Retiring a gate PC:** revoke its key, or the school's absence run waits 30 min every day for it (Phase 14).
* Try it on a Mac/Linux dev machine: `cd gate && cp gate.ini.example gate.ini` (set `server_url = http://localhost:4000/api/v1`, `api_key = ak_dev_north_scanner`, `fullscreen = no`), then `python3 gate.py` and type a badge such as `CARD-1A-01` + Enter. Self-check: `python3 gate/test_gate.py`. Needs Python with tkinter (python.org installer has it; Homebrew: `brew install python-tk`).

## 7. Super-Admin Operations (Platform Owner)
Day to day, use the dashboard at `admin.<your domain>`: create schools (step-by-step form, ends with a welcome message to send the principal), edit schedules, rename addresses, deactivate, issue/revoke device keys and manage users.
To fix something inside a school (a wrong record, a student, a staff account), open the school and click **Open as support**: its own page opens in a new tab with every principal power for 2 hours, under a yellow "Support mode" bar. Click **Exit** when done; your changes are recorded as platform support.

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
**Every July: load the next SEP calendar.** SEP publishes the next school year's calendar in the DOF (an "ACUERDO … por el que se establecen los calendarios escolares para el ciclo lectivo …"). Add it to `backend/src/calendar/sep.ts` (first and last day of classes, every weekday off, the official number of days and the DOF link), run `npm test` (it recounts the official days) and deploy. The admin schools list shows a warning 45 days before the loaded calendar ends; outside a loaded school year nobody is marked absent.

**Production:** point a wildcard DNS record (`*.<your domain>`) and a wildcard TLS certificate at the frontend; set `SUPERADMIN_API_KEY` to a long random value (`openssl rand -base64 32`), never run the seed (it refuses when `NODE_ENV=production`), and change the default Postgres credentials in `docker-compose.yml`.