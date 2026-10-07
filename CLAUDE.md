# Agent Directives (`CLAUDE.md`)

## Operational Rules
* Work strictly phase-by-phase according to `TASKS.md`. Do not start Phase 2 until Phase 1 tests pass.
* Always run automated tests after making changes before declaring any task finished.
* No mock databases in backend integration tests; run migrations and test against the PostgreSQL instance defined in Docker Compose.
* Do not invent new UI features or dependencies beyond what is declared in `TECH_DESIGN.md`.

## CLI & Tooling Commands
* **Backend:**
  * Package manager: `npm` (run inside `/backend`)
  * Dev server: `npm run dev`
  * Linting: `npm run lint`
  * Database Migration: `npx prisma migrate dev`
  * Test Suite: `npm test`
* **Frontend:**
  * Package manager: `npm` (run inside `/frontend`)
  * Dev server: `npm run dev`
  * Build check: `npm run build`

## Code Standards
* **Backend:** Strict TypeScript. Controllers parse payloads using Zod or typed DTOs. Business rules (cutoff calculations, WhatsApp dispatching) must live inside `services/`, never in route controllers.
* **Frontend:** Functional React components with typed props. Use Tailwind CSS for rapid layout. Visual cards and charts should use Recharts.
* **Security & Auth:** Every `/api/v1/attendance/*` route runs `authenticate` + `requireTenant`; roles come from the server-side credential, never from client headers (`x-user-role` is ignored). Enforce `principalGuard` (authenticated `PRINCIPAL`, or platform `SUPERADMIN`) on any manual record update endpoint.
* **Multi-tenancy:** Every repository query on tenant data must be filtered by `schoolId` (records via `student.schoolId`). New tenant tables need a `schoolId` column. Add an isolation test (School A key cannot see/modify School B) for every new tenant endpoint.