# MVP Implementation Tasks

Rules for the Agent:
1. Complete tasks sequentially.
2. Mark tasks `[x]` only when implementation and passing automated tests are confirmed.
3. Commit progress with clear commit messages after finishing each phase.

---

- [x] **Phase 1: Project Scaffolding & Database Setup**
  - [x] Initialize monorepo structure with `backend/` and `frontend/`.
  - [x] Configure `docker-compose.yml` with PostgreSQL 16 and a persistent volume.
  - [x] Configure `backend/prisma/schema.prisma` with `Student`, `AttendanceRecord`, and `SchoolConfig`.
  - [x] Write `backend/prisma/seed.ts` populating 3 grades (1, 2, 3), groups (A, B), 30 students, and dummy guardian numbers.
  - [x] Add `/health` endpoint and test DB connectivity.

- [x] **Phase 2: Attendance Ingestion & Notification Engine**
  - [x] Implement `POST /api/v1/attendance/scan` endpoint:
    - [x] Lookup student by `credentialUid`.
    - [x] De-duplicate: block same-day scans with HTTP 409.
    - [x] Evaluate timestamp against `schoolStartTime` to mark `PRESENT` vs `TARDY`.
  - [x] Create WhatsApp notification service interface:
    - [x] Implement console logger adapter for local development.
    - [x] Dispatch "Entered School" alert on successful scan.
  - [x] Implement `node-cron` job for configurable absence cutoff:
    - [x] Read `absenceCutoffMinutes` from `SchoolConfig`.
    - [x] Flag unscanned students as `ABSENT` after cutoff time.
    - [x] Dispatch "Absence Notice" WhatsApp alert.
  - [x] Add unit and integration tests for scanner and absence job logic.

- [x] **Phase 3: Search, Analytics & Role Overrides**
  - [x] Implement universal lookup endpoint `GET /api/v1/attendance/search?query=`:
    - [x] Support searching by student name, group (`1-A`), grade (`1`), and teacher.
  - [x] Implement `GET /api/v1/attendance/analytics/group/:grade/:group` calculating attendance rates and counts.
  - [x] Implement `GET /api/v1/attendance/analytics/student/:id` returning 30-day historical matrix and tardy/absence flags.
  - [x] Implement `PATCH /api/v1/attendance/record/:id` requiring `x-user-role: PRINCIPAL` for manual overrides; reject all other roles with 403.
  - [x] Write route integration tests for all search and analytic endpoints.

- [x] **Phase 4: Responsive Frontend Interface**
  - [x] Setup React + Vite + Tailwind CSS + Lucide Icons.
  - [x] Build Top Navigation Bar with View Toggle buttons ("Attendance by Grade", "Attendance by Group").
  - [x] Build Universal Search & Lookup Bar with live dropdown filters.
  - [x] Build "Attendance by Group" view:
    - [x] Group summary KPIs (Present, Tardy, Absent counts).
    - [x] Bar/Pie charts displaying group attendance percentage via Recharts.
    - [x] Student list table highlighting chronic absentees or frequent tardiness with color-coded badges.
  - [x] Build "Student 30-Day History" modal / view showing a calendar/grid layout of attendance status.
  - [x] Add Principal status override modal (guarded by role selector toggle).

- [x] **Phase 5: End-to-End Verification**
  - [x] Run complete backend test suite (`npm test`).
  - [x] Execute `RUNBOOK.md` simulation script verifying scan -> record -> duplicate prevention loop.
  - [x] Run frontend production build check (`npm run build`).
- [x] **Phase 6: Multi-Tenant Data Model**
  - [x] Add `School` and `ApiKey` models; `schoolId` on `SchoolConfig`, `Student`, `Teacher`, `Subject`.
  - [x] Per-school uniqueness for `credentialUid` and teacher `email`.
  - [x] Migration backfills pre-existing data into a "Default School".
  - [x] Seed two schools sharing badge IDs, with dev API keys.

- [x] **Phase 7: Authentication & Tenant Scoping**
  - [x] Bearer API-key auth (hashed keys); ignore client `x-user-role`.
  - [x] Role gates: SCANNER (scan), STAFF (read), PRINCIPAL (override); SUPERADMIN via env key + `x-school-id`.
  - [x] Scope every repository query by `schoolId`.
  - [x] Tenant isolation tests (search, analytics, override, scan, absence job).

- [x] **Phase 8: Per-School Absence Job**
  - [x] Schedule one cron task per active school in its timezone; `evaluateAbsences(schoolId)`.

- [x] **Phase 9: Super-Admin API**
  - [x] Onboard school (+ config + one-time keys), list, activate/deactivate, issue/list/revoke keys.

- [x] **Phase 10: Frontend Sign-In**
  - [x] Sign-in screen, bearer header interceptor, `GET /api/v1/me`, remove demo role toggle.

- [x] **Phase 11: User Accounts (Option B)**
  - [x] `School.slug` (subdomain per school); `User` + `Session` models; email/password login (Node `crypto.scrypt`), opaque session tokens, login throttle.
  - [x] Overrides record the acting user (`updatedByUserId`); principals manage their school's staff accounts (`/api/v1/users`).
  - [x] Frontend: school detected from subdomain, email/password sign-in, logout, Staff page for principals; API keys remain for scanner devices.

- [x] **Phase 12: Platform Admin Dashboard**
  - [x] `PlatformAdmin` accounts with email/password sessions; `npm run create-admin`.
  - [x] Absence job: per-minute tick reading schools from the DB (no restart needed for new/edited/deactivated schools).
  - [x] Admin API: school detail, editable settings, atomic create with first principal.
  - [x] Dashboard at `admin.<domain>`: schools list, new school, school detail (settings, status, keys, users).

---

# Roadmap (planned 2026-10-07)

Effort: **S** ≈ ½ day · **M** ≈ 1–3 days · **L** ≈ 1 week. Batches are ordered: finish a batch before starting the next.
Per `CLAUDE.md`, any task that adds UI or dependencies must first be added to `TECH_DESIGN.md`.

## Batch 1 — Go-live blockers (needed before the first real school)

- [ ] **Phase 13: Fix the gate flow** *(S)*
  - [ ] **Bug:** a student scanning after the cutoff (already `ABSENT`) gets a 500 because the scan tries to insert a second record for the day. Upgrade the existing `ABSENT` record to `TARDY` instead, and send a "llegó tarde" message that corrects the absence alert. Leave `EXCUSED` records alone.
  - [ ] **Bug:** if the WhatsApp send fails after the record is saved, the scan returns 500 and a retry gets 409. Record first, then notify via the outbox (Phase 15), so the gate always gets a success.
  - Done when: integration tests cover scan-after-absent → `TARDY` + correction message, and scan with a failing notifier → 201.

- [ ] **Phase 14: Scan API v2 for real scanners** *(M)*
  - [ ] `POST /api/v1/attendance/scan` accepts `{ credentialUid, scannedAt, eventId }`. `scannedAt` comes from the device so offline-buffered scans keep the real arrival time.
  - [ ] Trust rules: accept `scannedAt` only if ≤ 2 min in the future and ≤ 24 h in the past; otherwise use server time and flag `clockSkew`. TARDY/PRESENT is computed from `scannedAt`.
  - [ ] Idempotency: a `ScanEvent` table with a unique `eventId` per key. Replaying the same event returns the original result (safe offline retries).
  - [ ] Normalize `credentialUid` (trim; strip scanner prefix/suffix characters; per-school option to drop leading zeros so the int `0042` and the string `"42"` match).
  - [ ] Response includes `studentName`, `grade-group`, `status`, `alreadyScanned` for the gate screen.
  - [ ] Each API key records `lastSeenAt` (scanner health).
  - Done when: tests cover offline replay with an old timestamp → correct TARDY/PRESENT, duplicate `eventId` → same response with no second message, and a future timestamp → server time.

- [ ] **Phase 15: Real WhatsApp delivery** *(L)*
  - [ ] `NotificationOutbox` table (type, studentId, phone, template, params, status, attempts, lastError, sentAt). Scans and the absence job only insert rows (same DB transaction as the attendance write).
  - [ ] Worker (`npm run worker`, same codebase, separate process): sends pending rows with retry + backoff, respects WhatsApp rate limits, marks `FAILED` after N attempts.
  - [ ] WhatsApp Cloud API adapter behind the existing `NotifierService` interface; the console adapter stays for dev.
  - [ ] Meta-approved **utility templates in Spanish**: entrada, llegada tarde, inasistencia, corrección de inasistencia. Per-school display name.
  - [ ] Delivery webhook updates status (sent/delivered/read/failed); show it in the student timeline.
  - [ ] Validate guardian phones as E.164 on create/import.
  - Done when: the outbox survives a backend restart mid-send (no lost or duplicate messages), and a failing provider retries and then marks `FAILED`.

- [ ] **Phase 16: Gate scanner client (Windows)** *(M)* — see "Scanner client plan" below
  - [ ] Kiosk page `https://<slug>.<domain>/gate`, unlocked with a SCANNER key, large name + color + sound feedback.
  - [ ] Offline queue (IndexedDB) of `{ eventId, credentialUid, scannedAt }`, auto-flush on reconnect, pending counter on screen.
  - [ ] Windows setup script (PowerShell): Chrome kiosk shortcut in Startup, disable sleep, enable time sync.
  - [ ] Optional native agent only if a school's reader is serial/COM (not keyboard-wedge).
  - Done when: a pilot with real hardware passes 50 scans online, cable unplugged, 20 scans, reconnect; every scan gets the correct status and exactly one WhatsApp each.

- [ ] **Phase 17: Student roster management** *(M–L)*
  - [ ] `Student.active` (withdrawn students stop being marked absent).
  - [ ] Principal UI: add / edit / deactivate students; assign or reassign the badge.
  - [ ] CSV import (preview → confirm) with row-level errors (duplicate badge, bad phone, unknown group). Template downloadable.
  - [ ] Grades and groups come from the school's data, not hardcoded `[1,2,3]` / `['A','B']` in `App.tsx`.
  - Done when: a 600-row CSV imports in < 10 s with an accurate error report; the UI shows the school's real groups.

- [ ] **Phase 18: School calendar** *(M)*
  - [ ] Non-school days (holidays, vacations, "suspensión de clases") per school; the platform admin can push the SEP national calendar to all schools.
  - [ ] Absence job skips non-school days. Today the job would send absence alerts to **every parent** on a holiday.
  - [ ] Analytics ignore non-school days.
  - Done when: a test shows a holiday → no ABSENT records and no messages.

- [ ] **Phase 19: Spanish UI** *(M)*
  - [ ] All UI text in Spanish (es-MX), dates in local format. Keep the strings in one file.

- [ ] **Phase 20: Production readiness** *(M)*
  - [ ] Dockerfiles (backend, worker, frontend static), production compose, env checklist.
  - [ ] Wildcard DNS + TLS, CORS locked to `*.<domain>`, security headers, body size limits.
  - [ ] Automated nightly Postgres backups + a tested restore.
  - [ ] CI: lint + tests + build on every push.
  - [ ] Privacy (LFPDPPP; this is minors' data): aviso de privacidad, guardian consent for WhatsApp, data-retention rule.

## Batch 2 — Operate with confidence

- [ ] **Phase 21: Audit trail** *(S–M)* — keep every status change (who, when, from → to, note) instead of overwriting the record; show it in the student modal.
- [ ] **Phase 22: Job resilience** *(S)* — replay a missed absence run when the server was down at cutoff (run once if the cutoff passed today and no run is logged); a `JobRun` table.
- [ ] **Phase 23: Monitoring** *(M)* — structured logs, error alerts, uptime check. Platform dashboard tiles: scanners silent today, outbox failures, schools with zero scans by 09:00.
- [ ] **Phase 24: Account hygiene** *(M)* — users change their own password; "olvidé mi contraseña" via email; login throttle stored in Postgres (multi-instance safe); optional 2FA for the platform owner.

## Batch 3 — More value for schools

- [ ] **Phase 25: Reports** *(M)* — monthly attendance per group/student as CSV and PDF (for SEP/parents meetings); chronic-absence list.
- [ ] **Phase 26: Teacher role** *(M)* — teachers see only their own groups (uses the `Teacher`/`Subject` stubs).
- [ ] **Phase 27: Live "today" board** *(S)* — at 08:15 the prefect sees who hasn't arrived yet, per group, auto-refreshing.
- [ ] **Phase 28: Guardians** *(M)* — up to 2 guardians per student; per-guardian opt-out.
- [ ] **Phase 29: Platform business metrics** *(M)* — per school: active students, scans, WhatsApp messages sent (cost), for billing.

## Batch 4 — Later / only if asked

- Check-out at the end of the day · parent portal · billing integration · per-subject (class period) attendance.

---

## Scanner client plan (Phase 14 + 16)

**What the gate does:** badge → reader → Windows PC → `POST /scan { credentialUid, scannedAt, eventId }` with the school's SCANNER key → backend saves the attendance in one transaction and queues the WhatsApp message → the worker sends it. The gate PC never talks to WhatsApp or the database.

**Input formats:** readers send a string (`CARD-1A-01`), a number (`0004521873`) or an RFID UID (`04A2B1C3`). Normalize in **one place on the server** (Phase 14), so changing a rule doesn't require updating every gate PC. The client sends exactly what the reader typed.

**Client choice (depends on the reader hardware):**
1. **USB keyboard-wedge reader (most barcode/RFID readers): kiosk web page.** Chrome in kiosk mode opens `https://<slug>.<domain>/gate`, and the reader "types" the code + Enter into a focused input. Nothing to install, updates itself, same codebase.
2. **Serial/COM or SDK reader: small native agent** (Node packaged as `.exe`, run as a Windows service via NSSM). It reads the port and uses the same offline queue + API. Build it only if a school needs it.

**Gate screen behavior:**
- Green, name and "Bienvenido" for PRESENT; amber "Retardo" for TARDY; blue "Ya registrado" for a duplicate scan; red "Credencial no encontrada" for an unknown badge. A sound for each, and the screen clears after 3 s.
- The input keeps focus permanently (refocus on blur), so a mis-click can't break scanning.
- While offline, an orange banner shows "Sin conexión, N registros pendientes"; scans still give immediate local feedback ("Registrado, se enviará al reconectar").
- Device clock: the setup script forces Windows time sync. The server rejects or flags timestamps that are off (Phase 14).

**Setup script (`gate-setup.ps1`, run once as admin):** asks for the school URL and SCANNER key, creates the Chrome kiosk shortcut in Startup, disables sleep and screen-off, and enables NTP sync.
