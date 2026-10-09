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

- [x] **Phase 13: Fix the gate flow** *(S)*
  - Attendance rule (confirmed 2026-10-07), example: school opens 08:00, safe-time window 60 min:
    - scan by 08:00 + `tardyGraceMinutes` (0 = none) → `PRESENT`, guardian gets the "entered school" message
    - scan before 09:00 (`absenceCutoffMinutes` = 60) → `TARDY`, guardian gets the "entered school, late" message
    - no scan by 09:00 → `ABSENT`, guardian gets the absence notice (once). Students who never arrive have no scan time.
    - **No correction messages** to guardians, ever.
  - [x] **Bug:** a scan after the cutoff (student already `ABSENT`) returns 500 (duplicate record). **Decided (C):** reject it with `422 OUTSIDE_WINDOW`, save nothing, send nothing; the gate shows red "Fuera de horario, acude a dirección". Keep it minimal: the door may be unattended and the principal can still override by hand.
  - [x] **Bug:** if the WhatsApp send fails after the record is saved, the scan returns 500 and a retry gets 409. Now the failure is logged and the scan returns 201; the outbox with retries comes in Phase 15.
  - Done when: integration tests cover each rule row above, the after-cutoff scan per the decision, and scan with a failing notifier → 201.

- [x] **Phase 13b: Excuse in advance** *(S–M)*
  - Flow (office staff or principal): search bar → student → "Justificar falta" → date (default today, optional "until" date) + reason (Cita médica / Enfermedad / Asunto familiar / free text) → save.
  - [x] `POST /api/v1/attendance/excuses { studentId, from, to?, reason }`: creates `EXCUSED` records (with note, `updatedByUserId`) for each school day in the range; today allowed only before the cutoff; existing records are left untouched (changing those stays PRINCIPAL-only).
  - [x] Roles: STAFF and PRINCIPAL can excuse in advance. Changing existing records stays PRINCIPAL-only.
  - [x] The absence run needs no change: it only marks students without a record, so excused students get no absence notice.
  - [x] If an excused student scans inside the window, the record becomes `PRESENT`/`TARDY` and the "entered school" message is sent; after the window, decision C applies.
  - [x] UI: "Justificar falta" button in the student modal; excused days show the reason, who registered it and when.
  - Done when: tests show an excuse created at 07:30 → no ABSENT record and no message at the cutoff, a STAFF user can excuse but cannot change an existing record, and an excused student scanning at 08:40 → TARDY + entry message.

- [x] **Phase 14: Scan API v2 for real scanners** *(M)*
  - [x] `POST /api/v1/attendance/scan` accepts `{ credentialUid, scannedAt, eventId }`. `scannedAt` comes from the device so offline-buffered scans keep the real arrival time.
  - [x] Trust rules: accept `scannedAt` only if ≤ 2 min in the future and ≤ 24 h in the past; otherwise use server time and flag `clockSkew`. TARDY/PRESENT is computed from `scannedAt`.
  - [x] Idempotency: a `ScanEvent` table with a unique `eventId` per key. Replaying the same event returns the original result (safe offline retries).
  - [x] Normalize `credentialUid` (trim; strip scanner prefix/suffix characters; per-school option to drop leading zeros so the int `0042` and the string `"42"` match). Set `dropLeadingZeros` via `PATCH /api/v1/admin/schools/:id`.
  - [x] Response includes `studentName`, `grade-group`, `status`, `alreadyScanned` for the gate screen.
  - [x] Each API key records `lastSeenAt` (scanner health). Admin keys list returns `lastSeenAt` + `pendingScans` (no dashboard UI yet).
  - [x] Clock correction: each upload also sends the device's current time (`sentAt`); the server shifts every `scannedAt` in the batch by `serverNow - sentAt` (old PCs often have drifting clocks).
  - [x] Batch upload: `POST /api/v1/attendance/scans` accepts many queued events in one request.
  - [x] Heartbeat: `POST /api/v1/gate/heartbeat { pending }` every minute per scanner.
  - [x] **Absence run waits for gates:** at the cutoff, if any of the school's scanners is offline or reports pending scans, delay that school's absence run until they sync (max 30 min), then run. The principal alert ("Escáner sin conexión, inasistencias en espera") is only logged for now; it moves to Phase 15/17. This prevents a false absence notice for a student whose scan is still queued on the gate PC.
  - Done when: tests cover offline replay with an old timestamp → correct TARDY/PRESENT, a 7-minute-slow device clock → corrected status, duplicate `eventId` → same response with no second message, a future timestamp → server time, and a scanner with pending scans at cutoff → absence run delayed and then executed.

- [ ] **Phase 15: Real WhatsApp delivery** *(L)* — code done 2026-10-08; open: Meta account, number and template approval (owner)
  - [x] `Notification` outbox table (type, record, phone, template, params, status, attempts, lastError, providerId, sentAt). Scans and the absence job only insert rows, in the same write as the attendance record.
  - [x] Worker (`npm run worker`, same codebase, separate process): sends due rows with retry + backoff, marks `FAILED` after 5 attempts (or at once on permanent errors). ponytail: sequential sends (Meta allows 80/s); parallel batches if one absence run gets too slow.
  - [x] WhatsApp Cloud API adapter behind `NotifierService` (`send(message) → message id`); the console adapter stays for dev (used when `WHATSAPP_TOKEN` is not set).
  - [x] Utility templates in Spanish in `src/services/templates.ts`: `entrada`, `entrada_retardo`, `inasistencia`, plus principal alerts `escaner_en_espera`, `solicitud_cambio` (no correction template: decided 2026-10-07). The school's name is the first parameter (per-school display name on one platform number).
  - [ ] **Owner:** create the Meta Business account + WhatsApp Business app, verify the business, register the platform number, submit the five templates exactly as written, then set the four `WHATSAPP_*` variables (RUNBOOK §8).
  - [x] Expiry: entry messages not sent within 2 h of the arrival are `EXPIRED`; absence notices always send.
  - [x] One message per record and type (unique), so gate retries and worker restarts never send twice.
  - Decided 2026-10-07: **all notifications via WhatsApp** (entry + absence), **one WhatsApp number for the whole platform**, schools pay **per student** (price TBD). The ~US$0.18–0.30/student/month message cost leaves margin, but keep every cost control below.
  - [x] Cost controls: one platform-wide number, utility templates only, sibling arrivals to the same phone merged into one message within 2 min (entry messages wait 2 min for that). Delivered messages per school are in the table (`schoolId`, status); the admin report is Phase 29.
  - [ ] **Deferred:** `NotificationChannel` per guardian (`WHATSAPP | PUSH | NONE`). Only WhatsApp exists today, so the switch has nothing to switch to; add it with the first free channel (web push / Telegram, cost plan item 1).
  - [x] Delivery webhook updates status (sent/delivered/read/failed, never backwards; signature checked); shown in the student's records list.
  - [x] Guardian phones validated as E.164 on create/edit (Phase 17); the Excel import uses the same check.
  - [x] Principal alerts to `principalWhatsApp`: gates holding the absence run, new staff change requests.
  - Done when: the outbox survives a backend restart mid-send (no lost or duplicate messages), and a failing provider retries and then marks `FAILED`. ✔ (`outbox.test.ts`; live: worker printed and marked SENT a queued absence notice)

- [ ] **Phase 16: Gate scanner client (Windows, Python)** *(M)* — code done 2026-10-07; open: Windows build + hardware pilot — see "Scanner client plan" below
  - [x] Python, **standard library only** (`sqlite3`, `urllib`, `tkinter`, `winsound`, `uuid`, `threading`), built for Python 3.8 so it also runs on Windows 7; shipped as one `.exe` (PyInstaller) that starts with Windows.
  - [x] Store-first: every scan is written to local SQLite (`eventId`, `credentialUid`, `scannedAt`) before anything else.
  - [x] Instant feedback from a local roster cache (name + badge only, refreshed hourly): full-screen green PRESENT / amber TARDY / blue already scanned / red unknown, plus a beep.
  - [x] Background sender: uploads the queue in batches (3 s timeout, exponential backoff), sends `sentAt` for clock correction, heartbeat every minute. No separate connection test (the upload itself is the test).
  - [x] On-screen banner when offline: "Sin conexión, N pendientes".
  - [x] Config file: school URL + SCANNER key. `gate-setup.ps1`: autostart, disable sleep, enable Windows time sync.
  - [x] Packaging the `.exe`: PyInstaller one-file build script in the repo (`gate/build.ps1`); version shown on screen; local rotating log file for support.
  - [x] Antivirus/SmartScreen: unsigned PyInstaller executables are often flagged. Start with a documented "allow" step in setup; buy a code-signing certificate once several schools run it.
  - [x] Updates: the server reports the latest gate version in the heartbeat response; the screen shows "Actualización disponible". Manual replace for now; auto-update only if school count makes it worth it.
  - [x] After-cutoff scan: red "Fuera de horario, acude a dirección" with a distinct beep (Phase 13 decision C).
  - Readers are **USB keyboard-type** (confirmed 2026-10-07): the reader types the code + Enter into the focused `tkinter` window. No serial support needed.
  - Notes: roster comes from `GET /gate/roster` (badge, name, grade, group; no guardian data). Scans older than 20 h are dropped on the PC, not sent (the server would count them as today). Verified headless with Python 3.8 and live against the dev server (13 scans online/offline/reconnect, 11 messages, one per guardian, resend changed nothing). **Not yet run:** `build.ps1` and `gate-setup.ps1` on a real Windows PC.
  - [ ] Done when: a pilot with real hardware passes 50 scans online, cable unplugged, 20 scans, reconnect; every scan gets the correct status and exactly one WhatsApp each.

- [x] **Phase 17: Student roster management** *(M)* — done 2026-10-08
  - [x] `Student.active` (withdrawn students stop being marked absent, can't scan, leave the gate roster and the lists; they keep their badge until given another).
  - [x] Principal UI (Students tab): add / edit / withdraw / reactivate students; assign or reassign the badge (409 if another student has it).
  - [x] Groups come from the school's data (`GET /students/groups`), not hardcoded `['A','B']`. Grades stay 1–3: **secundaria only** (decided 2026-10-07).
  - [x] **Change requests (added 2026-10-08):** staff request a status change for a day (incl. "Register late arrival" → TARDY); the principal sees a count on the Requests tab and approves or rejects; the principal's own changes apply at once. No message to the guardian.
  - [x] `SchoolConfig.principalWhatsApp` (admin dashboard), used by Phase 15 alerts.
  - [ ] **Deferred to the first client:** the initial roster comes from the client's Excel files, migrated with Python scripts written together at that time (no in-app import for now).
  - Done when: the UI shows the school's real groups, and a deactivated student is never marked absent. ✔ (`roster.test.ts`, `change.test.ts`)

- [x] **Phase 17b: Owner support mode + new-school wizard** *(S–M)* — done 2026-10-08 (requested while using the app)
  - [x] **Open as support:** the platform owner opens any school's own page with principal powers (2-hour session locked to that school, yellow "Support mode" bar, Exit revokes it, changes recorded as SUPERADMIN). Chosen instead of a new per-school role.
  - [x] **New-school wizard:** School → Schedule → Principal → Review; address from the name with a live "is it free" check; live schedule preview; password generator; principal's WhatsApp; done page with a copyable welcome message (or open in WhatsApp), device keys and "Open as support".
  - Done when: `support.test.ts` passes (scope locked to the school, no admin rights, revocable) and a school can be created end to end from the wizard.

- [x] **Phase 18: School calendar** *(M)* — done 2026-10-08
  - [x] Absence run only on school days: weekends and every non-school day of the **SEP calendar for educación básica** are skipped (suspensiones, vacations, Consejo Técnico Escolar, registro de calificaciones, days outside the school year). 2026-2027 transcribed from **Acuerdo 07/07/26, DOF 15/07/2026** (cited in `backend/src/calendar/sep.ts`); a test recounts the official 185 days.
  - [x] SEP calendar lives in code (`sep.ts`), one entry per school year: the owner adds the next year each July from the DOF; the admin dashboard warns 45 days before the loaded calendar ends. Each school adds its own days (Calendar tab, principal; staff read it).
  - [x] Absence job and excuses skip non-school days (no ABSENT records, no messages).
  - [x] Analytics: the group view says "No classes today: <reason>"; the student's 30-day grid greys out days without classes; the 30-day rate already counts only days with records. Dev seed history follows the calendar.
  - Done when: a test shows a holiday → no ABSENT records and no messages. ✔ (`calendar.test.ts`, `unit/calendar.test.ts`)

- [x] **Phase 19: Spanish UI** *(M)* — done 2026-10-08
  - [x] All UI text in Spanish (es-MX), including the admin dashboard; dates in es-MX format ("Mié 7 de oct"). Shared words, labels, formats and error handling in `frontend/src/strings.ts`; a sentence used by one screen stays in that screen.
  - [x] The API's rule messages that users see (excuses, change requests, calendar, roster, users, school address) are written in Spanish at the source; generic validation errors show "Revise los datos del formulario".

- [x] **Phase 19b: Phone-friendly** *(M)* — done 2026-10-08
  - [x] Phone navigation: compact top bar (school name + sign out) and a bottom tab bar (Grupos / Grados / Solicitudes / Calendario + Alumnos / Personal for the principal); search sits on top of Grupos and Grados.
  - [x] Group view on phones: one-line counts, student list first (absent, then not yet scanned, on top), charts folded under "Ver gráficas".
  - [x] Staff, students, admin schools and device keys are stacked cards; every action is a full button ≥ 44 px.
  - [x] Student window is a full-screen sheet on phones with large "Justificar falta" / "Registrar llegada tarde" buttons; "Solicitar cambio" / "Cambiar estado" opens a bottom sheet; text says "Toque".
  - [x] "Recordarme en este teléfono (30 días)": `remember: true` on login → 30-day session in `localStorage`; revoked like any session (sign out, password reset, deactivation). There is no per-user sessions list yet.
  - [x] Installable: `manifest.webmanifest` + icons (generated PNGs, no dependency) so staff can "Agregar a pantalla de inicio".
  - [x] Phone check: `frontend/scripts/phone-check.mjs` (headless Chrome over the DevTools protocol, no dependencies) visits 16 screens at 390 px and fails on anything wider than the screen or any tap target under 44 px; screenshots in `scripts/phone-shots/` (git-ignored).
  - Done when ✔: the phone check passes on every screen, and search → student → "Justificar falta" → reason → save is 4 taps (the script checks the save button is ready).

- [ ] **Phase 20: Production readiness** *(M)* — code done 2026-10-08; open: server, domain, lawyer review (owner)
  - [x] Dockerfiles (backend image for API + worker, frontend built into Caddy), `docker-compose.prod.yml`, `.env.production.example` (required settings refuse to start when missing). Fixed `npm run build`/`start` (output was `dist/src/`).
  - [x] TLS: wildcard DNS + Caddy on-demand certificates, approved by `/internal/tls-check` (only real schools, admin, api). No CORS needed: pages and API share each host.
  - [x] Security headers (HSTS, CSP, nosniff, frame-ancestors none), body limits (1 MB Caddy, 256 kB API), no `X-Powered-By`.
  - [x] Nightly `pg_dump` (14 kept) by the `backup` service; `ops/restore-check.sh` restores a dump into a scratch database and counts rows. Tested locally: backup → restore OK.
  - [x] CI: backend lint + tests (real Postgres) + build, frontend build, gate self-check (Python 3.8).
  - [x] Privacy: aviso de privacidad draft (`frontend/public/privacidad.html`, linked from sign-in); WhatsApp opt-out per guardian; retention: message + scan logs deleted after 90 days.
  - [ ] **Owner:** have a lawyer review the aviso and fill in the [BRACKETS]; add the consent line to the schools' enrollment form (RUNBOOK §9); rent the server, buy the domain, deploy (RUNBOOK §9); keep a copy of `backups/` off the server.
  - Verified: production stack built and run locally (plain HTTP override): school created through Caddy, login, headers, 413 on a 2 MB body, `/internal` not reachable from outside, worker + retention log, backup + restore, restart keeps data and re-running migrations is a no-op.

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
