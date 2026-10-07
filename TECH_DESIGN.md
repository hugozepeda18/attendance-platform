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
* **ApiKey:** `id`, `schoolId`, `role` (`SCANNER | STAFF | PRINCIPAL`), `label`, `keyHash` (sha256; plaintext shown once), `createdAt`, `revokedAt`.
* `SchoolConfig` (one per school, `schoolId` unique), `Student`, `Teacher`, `Subject` carry `schoolId`. `credentialUid` and teacher `email` are unique **per school**. `AttendanceRecord` is scoped through its student.
* **SchoolConfig:**
  * `id`: UUID (PK)
  * `schoolStartTime`: String (e.g., `"08:00"` format HH:mm)
  * `tardyGraceMinutes`: Int (default: `10` -> scans after 08:10 are `TARDY`)
  * `absenceCutoffMinutes`: Int (configurable: e.g., `30` -> job runs at 08:30)
  * `timezone`: String (e.g., `"America/Mexico_City"`)
* **Student:**
  * `id`: UUID (PK)
  * `credentialUid`: String (Unique, badge barcode/RFID string)
  * `firstName`: String
  * `lastName`: String
  * `grade`: Int (Allowed values: `1`, `2`, `3`)
  * `group`: String (e.g., `"A"`, `"B"`, `"C"`)
  * `guardianName`: String
  * `guardianWhatsApp`: String (E.164 format, e.g., `"+523312345678"`)
* **AttendanceRecord:**
  * `id`: UUID (PK)
  * `studentId`: UUID (FK -> Student.id)
  * `date`: Date (Date only without time: `YYYY-MM-DD`, indexed with studentId for uniqueness)
  * `scanTimestamp`: DateTime (Nullable, set when badge is scanned)
  * `status`: Enum (`PRESENT`, `TARDY`, `ABSENT`, `EXCUSED`)
  * `updatedByRole`: Enum (`SYSTEM`, `SCANNER`, `PRINCIPAL`, `SUPERADMIN`)
  * `updatedByUserId`: UUID (Nullable FK -> User.id; the person who made a manual override)
* **Subject & Teacher (Extensible Schema Stubs for Future):**
  * `Teacher`: `id`, `name`, `email`
  * `Subject`: `id`, `name`, `grade`, `group`, `teacherId` (Nullable relation)

## 4. Business Logic & Constraints
* **Scanner Ingestion & De-duplication:**
  * Endpoint accepts `POST /api/v1/attendance/scan` with `{ "credentialUid": "CARD123" }`.
  * If a record already exists for the student on `current_date` with status `PRESENT` or `TARDY`, reject with `409 Conflict: "Student already entered today"`. No check-out is supported.
  * Evaluate arrival timestamp against `SchoolConfig.schoolStartTime` + `tardyGraceMinutes`. If after grace, assign `TARDY`; otherwise `PRESENT`.
  * Send immediate "Student entered school" WhatsApp notification to the student's guardian.
* **Automated Absence Evaluator (`node-cron`):**
  * Runs every school morning at `schoolStartTime + absenceCutoffMinutes` in each school's timezone. Implemented as one `node-cron` tick per minute that re-reads active schools from the DB and evaluates those whose cutoff is now, so new schools, edited settings and deactivations apply without a restart. A tick missed while the server is down is not replayed.
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
* **Role-Based Overrides:**
  * Only an authenticated `PRINCIPAL` (or `SUPERADMIN`) can manually alter an attendance record (e.g., changing `ABSENT` to `EXCUSED` or `PRESENT`). Staff cannot override.

## 5. API Contracts
* `POST /api/v1/attendance/scan`
  * Body: `{ "credentialUid": "STU-1004" }`
  * Response 201: `{ "success": true, "student": "Juan Perez", "status": "PRESENT", "timestamp": "2026-09-09T07:54:12Z" }`
  * Response 409: `{ "error": "ALREADY_SCANNED", "message": "Attendance already recorded for today" }`
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
* `GET /api/v1/me` → `{ role, school: { id, name, slug } | null, user: { id, name, email } | null }`
* PRINCIPAL (or SUPERADMIN with `x-school-id`): `GET /api/v1/users`, `POST /api/v1/users` `{ email, name, role: STAFF|PRINCIPAL, password (10+) }`, `PATCH /api/v1/users/:id` `{ name?, role?, active?, password? }`. 409 `EMAIL_TAKEN`, 400 `SELF_LOCKOUT`.
* Super-admin only (`Authorization: Bearer $SUPERADMIN_API_KEY`):
  * `POST /api/v1/admin/schools` `{ name, slug, schoolStartTime?, tardyGraceMinutes?, absenceCutoffMinutes?, timezone? }` → 201 `{ school, apiKeys: [{ role, key }] }` (keys shown once)
  * `POST /api/v1/admin/schools` also accepts `principal: { email, name, password }`; school, config, keys and principal are created atomically.
  * `GET /api/v1/admin/schools` → `{ schools: [{ id, name, slug, active, timezone, studentCount }] }`
  * `GET /api/v1/admin/schools/:id` → `{ id, name, slug, active, config, studentCount, userCount, activeKeyCount }`
  * `PATCH /api/v1/admin/schools/:id` `{ active?, slug?, name?, schoolStartTime?, tardyGraceMinutes?, absenceCutoffMinutes?, timezone? }` (409 `SLUG_TAKEN`)
  * `GET|POST /api/v1/admin/schools/:id/keys` (`POST` body `{ role, label }` → plaintext key once), `DELETE /api/v1/admin/schools/:id/keys/:keyId` (revoke)
* Error codes: `401 UNAUTHENTICATED`, `403 FORBIDDEN | SCHOOL_INACTIVE`, `400 SCHOOL_REQUIRED` (super-admin without `x-school-id`).
## 6. Platform Admin Dashboard
* Served by the same frontend at `admin.<platform domain>` (`admin` is a reserved slug). `main.tsx` renders `AdminApp` when the subdomain is `admin`.
* Screens: schools list (search), new school (settings + first principal; shows the school link and device keys once), school detail (activate/deactivate, rename address, schedule settings, device keys issue/revoke, users via `/api/v1/users` with `x-school-id`).
