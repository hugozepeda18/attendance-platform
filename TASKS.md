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
  - Attendance rule (confirmed 2026-10-07), example: school opens 08:00, safe-time window 60 min:
    - scan by 08:00 + `tardyGraceMinutes` (0 = none) → `PRESENT`, guardian gets the "entered school" message
    - scan before 09:00 (`absenceCutoffMinutes` = 60) → `TARDY`, guardian gets the "entered school, late" message
    - no scan by 09:00 → `ABSENT`, guardian gets the absence notice (once). Students who never arrive have no scan time.
    - **No correction messages** to guardians, ever.
  - [ ] **Bug:** a scan after the cutoff (student already `ABSENT`) returns 500 (duplicate record). **Decided (C):** reject it with `422 OUTSIDE_WINDOW`, save nothing, send nothing; the gate shows red "Fuera de horario, acude a dirección". Keep it minimal: the door may be unattended and the principal can still override by hand.
  - [ ] **Bug:** if the WhatsApp send fails after the record is saved, the scan returns 500 and a retry gets 409. Record first, then notify via the outbox (Phase 15), so the gate always gets a success.
  - Done when: integration tests cover each rule row above, the after-cutoff scan per the decision, and scan with a failing notifier → 201.

- [ ] **Phase 13b: Excuse in advance** *(S–M)*
  - Flow (office staff or principal): search bar → student → "Justificar falta" → date (default today, optional "until" date) + reason (Cita médica / Enfermedad / Asunto familiar / free text) → save.
  - [ ] `POST /api/v1/attendance/excuses { studentId, from, to?, reason }`: creates `EXCUSED` records (with note, `updatedByUserId`) for each school day in the range; today allowed only before the cutoff; existing records are left untouched (changing those stays PRINCIPAL-only).
  - [ ] Roles: STAFF and PRINCIPAL can excuse in advance. Changing existing records stays PRINCIPAL-only.
  - [ ] The absence run needs no change: it only marks students without a record, so excused students get no absence notice.
  - [ ] If an excused student scans inside the window, the record becomes `PRESENT`/`TARDY` and the "entered school" message is sent; after the window, decision C applies.
  - [ ] UI: "Justificar falta" button in the student modal; excused days show the reason, who registered it and when.
  - Done when: tests show an excuse created at 07:30 → no ABSENT record and no message at the cutoff, a STAFF user can excuse but cannot change an existing record, and an excused student scanning at 08:40 → TARDY + entry message.

- [ ] **Phase 14: Scan API v2 for real scanners** *(M)*
  - [ ] `POST /api/v1/attendance/scan` accepts `{ credentialUid, scannedAt, eventId }`. `scannedAt` comes from the device so offline-buffered scans keep the real arrival time.
  - [ ] Trust rules: accept `scannedAt` only if ≤ 2 min in the future and ≤ 24 h in the past; otherwise use server time and flag `clockSkew`. TARDY/PRESENT is computed from `scannedAt`.
  - [ ] Idempotency: a `ScanEvent` table with a unique `eventId` per key. Replaying the same event returns the original result (safe offline retries).
  - [ ] Normalize `credentialUid` (trim; strip scanner prefix/suffix characters; per-school option to drop leading zeros so the int `0042` and the string `"42"` match).
  - [ ] Response includes `studentName`, `grade-group`, `status`, `alreadyScanned` for the gate screen.
  - [ ] Each API key records `lastSeenAt` (scanner health).
  - [ ] Clock correction: each upload also sends the device's current time (`sentAt`); the server shifts every `scannedAt` in the batch by `serverNow - sentAt` (old PCs often have drifting clocks).
  - [ ] Batch upload: `POST /api/v1/attendance/scans` accepts many queued events in one request.
  - [ ] Heartbeat: `POST /api/v1/gate/heartbeat { pending }` every minute per scanner.
  - [ ] **Absence run waits for gates:** at the cutoff, if any of the school's scanners is offline or reports pending scans, delay that school's absence run until they sync (max 30 min), then run; alert the principal ("Escáner sin conexión, inasistencias en espera"). This prevents a false absence notice for a student whose scan is still queued on the gate PC.
  - Done when: tests cover offline replay with an old timestamp → correct TARDY/PRESENT, a 7-minute-slow device clock → corrected status, duplicate `eventId` → same response with no second message, a future timestamp → server time, and a scanner with pending scans at cutoff → absence run delayed and then executed.

- [ ] **Phase 15: Real WhatsApp delivery** *(L)*
  - [ ] `NotificationOutbox` table (type, studentId, phone, template, params, status, attempts, lastError, sentAt). Scans and the absence job only insert rows (same DB transaction as the attendance write).
  - [ ] Worker (`npm run worker`, same codebase, separate process): sends pending rows with retry + backoff, respects WhatsApp rate limits, marks `FAILED` after N attempts.
  - [ ] WhatsApp Cloud API adapter behind the existing `NotifierService` interface; the console adapter stays for dev.
  - [ ] Meta-approved **utility templates in Spanish**: entrada, llegada tarde, inasistencia (no correction template: decided 2026-10-07). Per-school display name. Entry notifications on every scan are confirmed; budget ~2 messages/student/day.
  - [ ] Expiry: "entered school" messages older than 2 h are not sent (marked `EXPIRED`); absence notices always send.
  - [ ] One message per `eventId` (no duplicates on gate retries or worker restarts).
  - Decided 2026-10-07: **all notifications via WhatsApp** (entry + absence), **one WhatsApp number for the whole platform**, schools pay **per student** (price TBD). The ~US$0.18–0.30/student/month message cost leaves margin, but keep every cost control below.
  - [ ] Cost controls (see "Notification cost plan" below): one platform-wide WhatsApp number (aggregated volume tiers), utility-category templates only, sibling arrivals to the same phone merged into one message within 2 min, delivered-only billing tracked per school.
  - [ ] `NotificationChannel` per guardian (`WHATSAPP | PUSH | NONE`) and per message type, so entry messages can move to a free channel without code changes.
  - [ ] Delivery webhook updates status (sent/delivered/read/failed); show it in the student timeline.
  - [ ] Validate guardian phones as E.164 on create/import.
  - Done when: the outbox survives a backend restart mid-send (no lost or duplicate messages), and a failing provider retries and then marks `FAILED`.

- [ ] **Phase 16: Gate scanner client (Windows, Python)** *(M)* — see "Scanner client plan" below
  - [ ] Python, **standard library only** (`sqlite3`, `urllib`, `tkinter`, `winsound`, `uuid`, `threading`), built for Python 3.8 so it also runs on Windows 7; shipped as one `.exe` (PyInstaller) that starts with Windows.
  - [ ] Store-first: every scan is written to local SQLite (`eventId`, `credentialUid`, `scannedAt`) before anything else.
  - [ ] Instant feedback from a local roster cache (name + badge only, refreshed hourly): full-screen green PRESENT / amber TARDY / blue already scanned / red unknown, plus a beep.
  - [ ] Background sender: uploads the queue in batches (3 s timeout, exponential backoff), sends `sentAt` for clock correction, heartbeat every minute. No separate connection test (the upload itself is the test).
  - [ ] On-screen banner when offline: "Sin conexión, N pendientes".
  - [ ] Config file: school URL + SCANNER key. `gate-setup.ps1`: autostart, disable sleep, enable Windows time sync.
  - [ ] Packaging the `.exe`: PyInstaller one-file build script in the repo (`gate/build.ps1`); version shown on screen; local rotating log file for support.
  - [ ] Antivirus/SmartScreen: unsigned PyInstaller executables are often flagged. Start with a documented "allow" step in setup; buy a code-signing certificate once several schools run it.
  - [ ] Updates: the server reports the latest gate version in the heartbeat response; the screen shows "Actualización disponible". Manual replace for now; auto-update only if school count makes it worth it.
  - [ ] After-cutoff scan: red "Fuera de horario, acude a dirección" with a distinct beep (Phase 13 decision C).
  - Readers are **USB keyboard-type** (confirmed 2026-10-07): the reader types the code + Enter into the focused `tkinter` window. No serial support needed.
  - Done when: a pilot with real hardware passes 50 scans online, cable unplugged, 20 scans, reconnect; every scan gets the correct status and exactly one WhatsApp each.

- [ ] **Phase 17: Student roster management** *(M)*
  - [ ] `Student.active` (withdrawn students stop being marked absent).
  - [ ] Principal UI: add / edit / deactivate students; assign or reassign the badge.
  - [ ] Groups come from the school's data, not hardcoded `['A','B']` in `App.tsx`. Grades stay 1–3: **secundaria only** (decided 2026-10-07).
  - [ ] **Deferred to the first client:** the initial roster comes from the client's Excel files, migrated with Python scripts written together at that time (no in-app import for now).
  - Done when: the UI shows the school's real groups, and a deactivated student is never marked absent.

- [ ] **Phase 18: School calendar** *(M)*
  - [ ] Absence run only on school days: skip weekends and every non-school day of the **SEP calendar for educación básica** (official holidays, vacations, Consejo Técnico Escolar days). Dates are loaded from the official SEP publication for the school year (cited in code), not typed from memory.
  - [ ] The platform admin loads the SEP calendar once per school year for all schools; each school can add its own days (suspensión, school anniversary).
  - [ ] Absence job skips non-school days. Today the job would send absence alerts to **every parent** on a holiday.
  - [ ] Analytics ignore non-school days.
  - Done when: a test shows a holiday → no ABSENT records and no messages.

- [ ] **Phase 19: Spanish UI** *(M)*
  - [ ] All UI text in Spanish (es-MX), dates in local format. Keep the strings in one file.

- [ ] **Phase 19b: Phone-friendly** *(M)* — do together with Phase 19, since both touch every screen
  - Audit 2026-10-07 at iPhone size (390 px): layouts mostly stack correctly and search works well, but:
    - the school navbar is ~27 px wider than the phone: the sign-out button is cut off and tab labels wrap ("By / Grade");
    - user tables (school Staff page and admin Users) hide Status / Reset password / Deactivate off-screen behind a sideways scroll with no visual hint;
    - in the group view the student list sits below 5 KPI cards and 2 charts (~1,500 px of scrolling), so the phone question "who is missing?" is at the bottom;
    - "Override", "Revoke" and similar actions are small text links, not finger-sized buttons; the help text says "Click";
    - sessions live in `sessionStorage`, so when the phone closes the tab the user has to log in again every time.
  - [ ] Phone navigation: compact top bar (school name + menu) and a bottom tab bar (Hoy / Grupos / Buscar / Personal); nothing wider than the screen.
  - [ ] Group view on phones: compact one-line KPI strip, student list first (missing students on top), charts collapsed under "Ver gráficas".
  - [ ] Tables become stacked cards on phones (Staff, admin Users, device keys); every action is a full button ≥ 44 px tall.
  - [ ] Student modal as a full-screen sheet on phones, with large "Justificar falta" (Phase 13b) and "Cambiar estado" buttons; text says "Toca", not "Click".
  - [ ] "Recordarme en este teléfono": optional 30-day session stored in `localStorage` (revocable, shown in the user's sessions); default stays 12 h.
  - [ ] Installable: web app manifest + icon so staff can "Agregar a pantalla de inicio" and open it like an app (no app store, no new dependencies).
  - [ ] Keep the phone-size screenshot check (headless Chrome via DevTools protocol, no dependencies) in `frontend/scripts/phone-check.mjs`.
  - Done when: the phone check shows no element wider than 390 px on every screen, every action button is ≥ 44 px, and a staff user can go from opening the app to "Justificar falta" saved in ≤ 4 taps after search.

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

## Notification cost plan (Phase 15)

Facts (check Meta's official pricing page before launch): WhatsApp bills **per delivered template message**; Mexico utility rate is about **US$0.0085** per message, with cheaper tiers at higher monthly volume. Utility templates sent inside the 24 h customer-service window were free from July 2025, but reportedly stop being free on 2026-10-01.

Estimate for one school of 600 students: ~20 school days × 600 entry messages + ~5 % absences ≈ 12,600 messages/month ≈ **US$107/month** (≈ US$0.18 per student per month) if everything goes through WhatsApp.

Cheapest approach, in order of savings:
1. **Channel split (largest saving, ~95 %).** Absence notices (the urgent ~5 %) always go by WhatsApp. Entry notifications go by a free channel: web push from an installable page (PWA) the parent opens once from the school link, or a Telegram bot. WhatsApp entry messages become an optional paid add-on per school.
2. **One platform WhatsApp number for all schools.** Volume from every school adds up toward the cheaper tiers, and Meta verification is done once. The message text carries the school's name.
3. **Utility category only.** Attendance messages qualify as utility; never let a template get classified as marketing (much higher rate).
4. **Merge siblings.** Two children of the same guardian arriving within 2 min → one message.
5. **Pass the cost through.** Price WhatsApp volume into the school's plan (e.g. per student per month) and show messages sent per school in the admin dashboard (Phase 29).

Rejected: unofficial WhatsApp Web automation (free, but against WhatsApp's terms; numbers get banned, which would leave every school without notices). SMS costs more than WhatsApp; email is free but parents don't read it.

## Scanner client plan (Phase 14 + 16)

**What the gate does:** badge → reader → Windows PC (Python program) → local SQLite queue → background upload `POST /scans { events: [{ eventId, credentialUid, scannedAt }], sentAt }` with the school's SCANNER key → backend saves attendance + queues WhatsApp in one transaction → worker sends WhatsApp. The gate PC never talks to WhatsApp or the database, and never waits for the internet.

**Input formats:** readers send a string (`CARD-1A-01`), a number (`0004521873`) or an RFID UID (`04A2B1C3`). The client sends exactly what the reader produced; normalization lives in **one place on the server** (Phase 14).

**Why store-first instead of a connection test:** a weak link changes second to second, so a test can pass and the next request still fail. Testing also adds delay to every scan and uses bandwidth. Writing to disk first and sending in the background gives the same result as direct sending on a good connection and never blocks the line on a bad one.

**Gate screen:** green "Bienvenido" (PRESENT), amber "Retardo" (TARDY), blue "Ya registrado", red "Credencial no encontrada", each with a beep, cleared after 3 s. Orange banner "Sin conexión, N pendientes" while offline. The window keeps focus so keyboard-type readers always type into it.

**Old PCs:** the server corrects drifting clocks using `sentAt`; the program is stdlib-only and built for Python 3.8 (Windows 7 compatible).

**Absence run safety:** the server delays a school's 09:00 absence run while any of its gates is offline or has unsent scans (max 30 min) and alerts the principal, so a queued scan never becomes a false absence notice.
