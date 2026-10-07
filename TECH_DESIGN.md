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
  * `updatedByRole`: Enum (`SYSTEM`, `SCANNER`, `PRINCIPAL`)
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
  * Runs every school morning at `schoolStartTime + absenceCutoffMinutes`.
  * Finds all active students without an `AttendanceRecord` for today.
  * Inserts an `ABSENT` record for each missing student.
  * Emits automated "Unexcused Absence Alert" WhatsApp messages to respective guardians.
* **Role-Based Overrides:**
  * Only requests carrying the `x-user-role: PRINCIPAL` header can manually alter an attendance record (e.g., changing `ABSENT` to `EXCUSED` or `PRESENT`). Regular teachers/staff cannot override.

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
  * Headers: `x-user-role: PRINCIPAL`
  * Body: `{ "status": "EXCUSED", "note": "Medical certificate provided" }`
  * Returns 403 if header is not `PRINCIPAL`.