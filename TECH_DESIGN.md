# Technical Design Document (TDD) - Middle School Attendance Tracker

## 1. Stack & Runtime
* **Frontend:** React 18+ (Vite, TypeScript, Tailwind CSS, Lucide Icons, Recharts for analytics).
* **Backend:** Node.js (v20+ LTS), Express.js, TypeScript.
* **Database & ORM:** PostgreSQL 16 with Prisma ORM.
* **Scheduling & Background Jobs:** `node-cron` for automated daily absence evaluations.
* **Notification Provider:** WhatsApp Cloud API (with a modular interface and local Console Logger fallback for local dev).

## 2. Architecture & Directory Layout
* **Monorepo / Clean Separation Structure:**
  ```text
  attendance-system/
  ├── backend/
  │   ├── prisma/
  │   │   ├── schema.prisma
  │   │   └── seed.ts
  │   ├── src/
  │   │   ├── controllers/      # HTTP request handlers
  │   │   ├── services/         # Business logic (attendance, scanner, notifier)
  │   │   ├── jobs/             # Daily absence cron scheduler
  │   │   ├── repositories/     # Prisma database queries
  │   │   ├── routes/           # Express router definitions
  │   │   ├── types/            # Shared DTOs and interfaces
  │   │   └── index.ts          # Express app bootstrap
  │   └── tests/
  │       ├── unit/
  │       └── integration/
  ├── gate/                 # Windows gate client (Python stdlib, one .exe), see §7
  ├── frontend/
  │   ├── src/
  │   │   ├── components/       # UI building blocks (charts, tables, search bar)
  │   │   ├── pages/            # Dashboard, GradeView, GroupView, StudentDetail
  │   │   ├── services/         # Axios / Fetch client API layer
  │   │   └── App.tsx
  │   └── index.html
  ├── CLAUDE.md
  ├── RUNBOOK.md
  └── TASKS.md
  ```

## 3. Data Model & Schema (PostgreSQL via Prisma)
* **Multi-tenancy (SaaS):** Shared database, row-level tenancy. Each school is a `School` tenant; the platform owner is the `SUPERADMIN`.
* **School:** `id`, `slug` (unique; the school's subdomain, e.g. `sec-12` → `sec-12.<platform domain>`), `name`, `active` (deactivated schools are locked out), `createdAt`.
* **User:** `id`, `schoolId`, `email` (unique per school, stored lowercase), `name`, `role` (`STAFF | PRINCIPAL`), `passwordHash` (Node `crypto.scrypt`, salted), `active`, `createdAt`. People sign in; devices use `ApiKey`.
* **PlatformAdmin:** `id`, `email` (unique), `name`, `passwordHash`, `active`, `createdAt`. The platform owner's sign-in account (role `SUPERADMIN`), not tied to a school. Created with `npm run create-admin`.
* **Session:** `id`, `userId` *or* `adminId` (DB CHECK: exactly one), `tokenHash` (sha256 of an opaque `st_` token), `createdAt`, `expiresAt` (12 h), `revokedAt`.
* **ApiKey:** `id`, `schoolId`, `role` (`SCANNER | STAFF | PRINCIPAL`), `label`, `keyHash` (sha256; plaintext shown once), `createdAt`, `revokedAt`, `lastSeenAt` (scanner health, written at most once a minute), `pendingScans` (from the gate heartbeat).
* **ScanEvent:** `id`, `schoolId`, `eventId` (device-generated, unique per school), `credentialUid` (as read), `scannedAt` (after clock correction), `clockSkew`, `result` (JSON outcome returned to the gate), `createdAt`. Makes gate retries idempotent.
* `SchoolConfig` (one per school, `schoolId` unique), `Student`, `Teacher`, `Subject` carry `schoolId`. `credentialUid` and teacher `email` are unique **per school**. `AttendanceRecord` is scoped through its student.
* **SchoolConfig:**
  * `id`: UUID (PK)
  * `schoolStartTime`: String (e.g., `"08:00"` format HH:mm)
  * `tardyGraceMinutes`: Int (default: `10` -> scans after 08:10 are `TARDY`)
  * `absenceCutoffMinutes`: Int (configurable: e.g., `30` -> job runs at 08:30)
  * `timezone`: String (e.g., `"America/Mexico_City"`)
  * `dropLeadingZeros`: Boolean (default `false`; badge `0042` matches roster `42`, for rosters that lost zeros in Excel)
  * `absenceRunOn`: Date (last day the absence run finished; the run happens once per school day)
  * `principalWhatsApp`: String? (E.164; principal alerts from Phase 15; set in the admin dashboard)
* **Student:**
  * `id`: UUID (PK)
  * `credentialUid`: String (Unique, badge barcode/RFID string)
  * `firstName`: String
  * `lastName`: String
  * `grade`: Int (Allowed values: `1`, `2`, `3`)
  * `group`: String (e.g., `"A"`, `"B"`, `"C"`)
  * `guardianName`: String
  * `guardianWhatsApp`: String (E.164 format, e.g., `"+523312345678"`)
  * `active`: Boolean (default `true`; withdrawn students are not scanned, not marked absent, not on the gate roster or in lists, and keep their badge until given another one)
* **ChangeRequest:** `id`, `schoolId`, `studentId`, `date`, `fromStatus` (null = no record yet), `toStatus`, `reason`, `requestedById` (staff user), `state` (`PENDING | APPROVED | REJECTED`), `decidedById`, `decidedAt`, `createdAt`.
* **AttendanceRecord:**
  * `id`: UUID (PK)
  * `studentId`: UUID (FK -> Student.id)
  * `date`: Date (Date only without time: `YYYY-MM-DD`, indexed with studentId for uniqueness)
  * `scanTimestamp`: DateTime (Nullable, set when badge is scanned)
  * `status`: Enum (`PRESENT`, `TARDY`, `ABSENT`, `EXCUSED`)
  * `updatedByRole`: Enum (`SYSTEM`, `SCANNER`, `STAFF`, `PRINCIPAL`, `SUPERADMIN`)
  * `updatedByUserId`: UUID (Nullable FK -> User.id; the person who made a manual override)
* **Subject & Teacher (Extensible Schema Stubs for Future):**
  * `Teacher`: `id`, `name`, `email`
  * `Subject`: `id`, `name`, `grade`, `group`, `teacherId` (Nullable relation)

## 4. Business Logic & Constraints
* **Scanner Ingestion & De-duplication:**
  * Endpoint accepts `POST /api/v1/attendance/scan` with `{ "credentialUid": "CARD123" }`; gate PCs upload their offline queue with `POST /api/v1/attendance/scans` (see section 5).
  * `credentialUid` is normalized in one place (`normalizeCredential`): trimmed, reader framing characters stripped (e.g. `;0042?`), leading zeros dropped when the school's `dropLeadingZeros` is on; matched case-insensitively. Roster imports must apply the same function.
  * Scan time: the device's `scannedAt`, shifted by `server now − sentAt` (corrects drifting gate clocks). If the result is more than 2 min in the future or 24 h in the past, server time is used and the event is flagged `clockSkew`. The status and the record's date come from the scan time, not the upload time.
  * Idempotency: an `eventId` already seen for the school returns the stored outcome; nothing is written or sent again.
  * If a record already exists for the student on `current_date` with status `PRESENT` or `TARDY`, reject with `409 Conflict: "Student already entered today"`. No check-out is supported.
  * Evaluate the arrival time (school timezone): up to `schoolStartTime + tardyGraceMinutes` → `PRESENT`; before `schoolStartTime + absenceCutoffMinutes` (the school's safe-time window) → `TARDY`; from the cutoff on → rejected with `422 OUTSIDE_WINDOW`, nothing saved and no message (the student goes to the office; the principal can override by hand).
  * If the student already has an `EXCUSED`/`ABSENT` record for today and scans inside the window, the record is updated to the scanned status (the note is kept).
  * Guardians never receive correction messages: a queued in-window scan arriving after the absence notice updates the record silently.
  * Send immediate "Student entered school" WhatsApp notification to the student's guardian, unless the scan is more than 2 h old (old offline queue). A failed send is logged and does not fail the scan (attendance is already saved).
* **Automated Absence Evaluator (`node-cron`):**
  * Runs once per school weekday from `schoolStartTime + absenceCutoffMinutes` in each school's timezone. Implemented as one `node-cron` tick per minute that re-reads active schools from the DB, so new schools, edited settings and deactivations apply without a restart.
  * **Waits for gates:** while any of the school's scanner keys seen in the last 7 days is offline (no request for 2 min) or reports pending scans in its heartbeat, the run is delayed, at most 30 min; then it runs anyway. A tick missed while the server is down is caught up within the same 30 min. (Principal alert for a waiting run: Phase 15/17; logged for now.)
  * Finds all active students without an `AttendanceRecord` for today.
  * Inserts an `ABSENT` record for each missing student.
  * Emits automated "Unexcused Absence Alert" WhatsApp messages to respective guardians.
* **Authentication & Roles:**
  * All tenant routes require `Authorization: Bearer <token>`. The token is either a user session (`st_…`, from login) or a device API key (`ak_…`), and resolves server-side to `{ role, schoolId, userId? }`; client role headers are ignored.
  * Each school uses only its own URL (`<slug>.<platform domain>`). The frontend reads the slug from the hostname and sends it with the login request; the user never types it.
  * Login is throttled: 5 failed attempts per school+email lock that pair for 15 minutes (in-memory, per backend process).
  * Deactivating a user, changing their role or resetting their password revokes their sessions immediately. A principal cannot deactivate or demote their own account.
  * `SCANNER`: scan only. `STAFF`: scan + search/analytics. `PRINCIPAL`: all of STAFF + manual overrides.
  * `SUPERADMIN`: platform owner. Signs in with a `PlatformAdmin` account at `admin.<platform domain>` (`POST /api/v1/auth/admin-login`); `SUPERADMIN_API_KEY` remains as an emergency/scripting fallback. Manages schools via `/api/v1/admin/*`; acts on a tenant's routes by sending `x-school-id`. Its overrides are recorded as `updatedByRole: SUPERADMIN`.
* **Excuse in advance:**
  * STAFF or PRINCIPAL (or SUPERADMIN) can excuse a student before the absence run: student window → "Excuse absence" → from / until (optional) + reason (quick choices Cita médica / Enfermedad / Asunto familiar, or free text).
  * Creates `EXCUSED` records (note = reason, author recorded) for each weekday in the range (max 31 days; SEP holidays in Phase 18). Today only before the window closes; past days are rejected. Days that already have a record are skipped, never changed.
  * The absence run skips excused students automatically (they have a record), so the guardian gets no absence notice.
* **Role-Based Overrides:**
  * Only an authenticated `PRINCIPAL` (or `SUPERADMIN`) can manually alter an attendance record (e.g., changing `ABSENT` to `EXCUSED` or `PRESENT`). Staff cannot override.
* **Change requests (staff → principal):**
  * STAFF ask to change a student's status for a day (any of the last 30 days, not the future; a day without a record counts, e.g. "Register late arrival" → TARDY). Reason required; one pending request per student and day.
  * Nothing changes until the principal approves; approving writes the requested status (note = reason, author = principal) and creates the record if the day has none (the absence run then skips the student). Rejecting leaves it untouched. A principal's own change applies at once, no request.
  * The principal is notified in the app: a red count on the Requests tab, checked every minute (WhatsApp to `principalWhatsApp` in Phase 15). Staff see their own requests and the decision.
  * The guardian is never messaged about a change (no corrections).
* **Roster (Phase 17):** the principal adds, edits and withdraws students (grades 1–3, groups of 1–2 letters). Badges are normalized like scans and unique per school, case-insensitive (409 `BADGE_TAKEN`). The group selectors come from the data (`GET /students/groups`). The initial roster import from the school's Excel is a one-off Python migration with the first client.

## 5. API Contracts
* `POST /api/v1/attendance/scan` (SCANNER, STAFF, PRINCIPAL)
  * Body: `{ "credentialUid": "STU-1004", "eventId"?: "uuid", "scannedAt"?: ISO, "sentAt"?: ISO }` (`credentialUid` may be a JSON number)
  * Response 201: `{ "success": true, "student": "Juan Perez", "grade": 1, "group": "A", "status": "PRESENT", "timestamp": "2026-09-09T07:54:12Z", "alreadyScanned": false, "clockSkew": false, "eventId": … }`
  * Response 409: `{ "error": "ALREADY_SCANNED", "alreadyScanned": true, "student", "grade", "group", … }`
  * Response 422: `{ "error": "OUTSIDE_WINDOW", ... }` when scanned at or after `schoolStartTime + absenceCutoffMinutes`
  * Response 404: `{ "error": "STUDENT_NOT_FOUND" }`
* `POST /api/v1/attendance/scans` (gate offline queue upload)
  * Body: `{ "sentAt": ISO, "events": [{ "eventId", "credentialUid", "scannedAt": ISO }] }` (1–500 events)
  * Response 200: `{ "results": [{ "eventId", "result": "PRESENT|TARDY|ALREADY_SCANNED|OUTSIDE_WINDOW|NOT_FOUND", "studentName", "grade", "group", "scannedAt", "clockSkew" }] }`, one per event, in order. Safe to resend.
* `POST /api/v1/gate/heartbeat` (SCANNER key only), every minute
  * Body: `{ "pending": 0 }` → `{ "serverTime": ISO, "latestGateVersion": string | null }` (env `GATE_LATEST_VERSION`; a gate on another version shows "Actualización disponible")
* `GET /api/v1/gate/roster` (SCANNER key only), hourly → `{ serverTime, utcOffsetMinutes, schoolStartTime, tardyGraceMinutes, absenceCutoffMinutes, dropLeadingZeros, students: [{ credentialUid, name, grade, group }] }`. No guardian data leaves the server.
* `GET /api/v1/attendance/search?query=...`
  * Query parameters: `query` (can match student name, group like `"1-A"`, grade `"1"`, or teacher name).
  * Returns: List of matching students with current status and 30-day attendance overview.
* `GET /api/v1/attendance/analytics/group/:grade/:group`
  * Returns: Summary stats (Total students, Present today, Absent today, Group attendance % over last 30 days) and tabular student list with individual metrics.
* `GET /api/v1/attendance/analytics/student/:id`
  * Returns: Student profile, guardian details, 30-day timeline array of `{ date, status, scanTimestamp }`, and risk flag (`isHabituallyTardy`, `isChronicAbsentee`).
* `PATCH /api/v1/attendance/record/:id`
  * Headers: `Authorization: Bearer <PRINCIPAL session or key>` (response includes `updatedByUserId`)
  * Body: `{ "status": "EXCUSED", "note": "Medical certificate provided" }`
  * Returns 401 without a valid token, 403 for non-PRINCIPAL roles, 404 for records of another school.
* `GET /api/v1/public/schools/:slug` (no auth) → `{ name }`; 404 if unknown or inactive.
* `POST /api/v1/auth/login` `{ school: "<slug>", email, password }` → `{ token, expiresAt, user, school }`; 401 `INVALID_CREDENTIALS`, 403 `SCHOOL_INACTIVE`, 429 `TOO_MANY_ATTEMPTS`.
* `POST /api/v1/auth/admin-login` `{ email, password }` → `{ token, expiresAt, admin }` (platform owner; same throttle).
* `POST /api/v1/auth/logout` → 204 (revokes the current session).
* `POST /api/v1/attendance/excuses` (STAFF/PRINCIPAL) `{ studentId, from: "YYYY-MM-DD", to?, reason }` → 201 `{ excused: [dates], skipped: [dates] }`; 400 `EXCUSE_NOT_ALLOWED`, 404 for another school's student.
* `GET /api/v1/attendance/analytics/student/:id` timeline entries include `note` and `updatedByName`; response includes `upcomingExcuses` (next 60 days).
* `POST /api/v1/attendance/changes` (STAFF/PRINCIPAL) `{ studentId, date: "YYYY-MM-DD", status, reason }` → STAFF: 202 `{ applied: false, request }`; PRINCIPAL: 200 `{ applied: true, record }`. 400 `FUTURE_DATE | TOO_OLD | NO_CHANGE`, 409 `ALREADY_REQUESTED`, 404 another school's or a withdrawn student.
* `GET /api/v1/attendance/changes?state=PENDING|APPROVED|REJECTED` → `{ requests: [{ id, student: { id, name, grade, group }, date, fromStatus, toStatus, reason, state, requestedBy, decidedBy, decidedAt, createdAt }], pending }` (newest 100; STAFF get only their own and no `pending`).
* `POST /api/v1/attendance/changes/:id/approve` | `/reject` (PRINCIPAL) → `{ id, state }`; 409 `ALREADY_DECIDED`, 404 another school's.
* `GET /api/v1/students/groups` (STAFF/PRINCIPAL) → `{ groups: [{ grade, group, students }] }` (active students).
* PRINCIPAL: `GET /api/v1/students?grade&group` (withdrawn included), `POST /api/v1/students` `{ firstName, lastName, grade, group, credentialUid, guardianName, guardianWhatsApp }`, `PATCH /api/v1/students/:id` (same fields + `active`, all optional). 409 `BADGE_TAKEN`.
* `GET /api/v1/me` → `{ role, school: { id, name, slug } | null, user: { id, name, email } | null }`
* PRINCIPAL (or SUPERADMIN with `x-school-id`): `GET /api/v1/users`, `POST /api/v1/users` `{ email, name, role: STAFF|PRINCIPAL, password (10+) }`, `PATCH /api/v1/users/:id` `{ name?, role?, active?, password? }`. 409 `EMAIL_TAKEN`, 400 `SELF_LOCKOUT`.
* Super-admin only (`Authorization: Bearer $SUPERADMIN_API_KEY`):
  * `POST /api/v1/admin/schools` `{ name, slug, schoolStartTime?, tardyGraceMinutes?, absenceCutoffMinutes?, timezone? }` → 201 `{ school, apiKeys: [{ role, key }] }` (keys shown once)
  * `POST /api/v1/admin/schools` also accepts `principal: { email, name, password }`; school, config, keys and principal are created atomically.
  * `GET /api/v1/admin/schools` → `{ schools: [{ id, name, slug, active, timezone, studentCount }] }`
  * `GET /api/v1/admin/schools/:id` → `{ id, name, slug, active, config, studentCount, userCount, activeKeyCount }`
  * `PATCH /api/v1/admin/schools/:id` `{ active?, slug?, name?, schoolStartTime?, tardyGraceMinutes?, absenceCutoffMinutes?, timezone?, dropLeadingZeros?, principalWhatsApp? }` (409 `SLUG_TAKEN`)
  * `GET|POST /api/v1/admin/schools/:id/keys` (`POST` body `{ role, label }` → plaintext key once), `DELETE /api/v1/admin/schools/:id/keys/:keyId` (revoke)
* Error codes: `401 UNAUTHENTICATED`, `403 FORBIDDEN | SCHOOL_INACTIVE`, `400 SCHOOL_REQUIRED` (super-admin without `x-school-id`).
## 6. Platform Admin Dashboard
* Served by the same frontend at `admin.<platform domain>` (`admin` is a reserved slug). `main.tsx` renders `AdminApp` when the subdomain is `admin`.
* Screens: schools list (search), new school (settings + first principal; shows the school link and device keys once), school detail (activate/deactivate, rename address, schedule settings, device keys issue/revoke, users via `/api/v1/users` with `x-school-id`).

## 7. Gate Client (`gate/`)
* `gate.py`: Python 3.8+ standard library only (`tkinter`, `sqlite3`, `urllib`, `winsound`), built into one `gate.exe` with PyInstaller (`build.ps1`, 32-bit Python 3.8 so it runs on Windows 7). `gate-setup.ps1` writes `gate.ini`, adds autostart, disables sleep, enables time sync and a Defender exclusion.
* Store-first: each scan is inserted into `gate.db` (SQLite) before the screen answers. The answer comes from the cached roster (`GET /gate/roster`, kept on disk): green Bienvenido / amber Retardo / blue Ya registrado / red Credencial no encontrada / red Fuera de horario, beep, cleared after 3 s. Without a roster yet (first start offline) it shows grey "Registrado" and the server decides.
* A background thread uploads the queue to `POST /attendance/scans` (≤ 200 per batch, 3 s timeout, backoff 2→60 s, woken by each scan), sends the heartbeat every minute and refreshes the roster hourly. The server's `serverTime` gives the clock offset used for the on-screen verdict; uploads send raw PC time + `sentAt` and the server corrects.
* Scans older than 20 h are dropped and logged instead of sent (the server would take them as today). A batch rejected with 400 is set aside (kept in `gate.db`) so it cannot block the queue. 401/403 shows "Clave de escáner inválida".
* Orange banner "Sin conexión, N pendientes" while uploads fail. `gate.log` rotates (3 × 1 MB). Ctrl+Q exits.

