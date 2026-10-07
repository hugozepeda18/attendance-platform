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
