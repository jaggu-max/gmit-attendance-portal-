# GMIT Smart Attendance — PRD

## Problem Statement
Premium student attendance app for GMIT, expanded to a full attendance management system with Student, Lecturer/Faculty, and HOD/Admin roles. Supabase Postgres is the source of truth for roster, subjects, and attendance. Must deploy directly to Vercel and Render.

## Architecture
- **Stack**: Next.js 15 (App Router) + TypeScript + Tailwind + Supabase Postgres. Student profile photos are not part of the product.
- **Routing note**: Platform ingress routes `/api/*` → FastAPI(8001). Next.js server routes therefore live under `/gs/*`.
- **Data flow**: UI → Next.js server route (`/gs/*`) → `lib/attendanceApi.ts` → Supabase RPC (`gmit_attendance_api`). Browser never receives the service-role key.
- **Auth**: signed httpOnly cookies (`gmit_session` student, `gmit_faculty` per-subject lecturer, `gmit_hod` passcode). Write authz enforced server-side in `/gs/faculty/write`.

## Deployment (done 2026-09-30)
- `yarn build` (production) **passes** — type-safe, all routes compiled.
- **Vercel**: `frontend/vercel.json` + root directory `frontend`; auto-detected Next.js.
- **Render**: `/app/render.yaml` (rootDir `frontend`, build `yarn install && yarn build`, start `yarn start:prod`).
- `frontend/.env.example` documents all env vars. Cloud deploys require the Supabase URL and service-role key.
- README.md has full deploy steps. Fixed `timingSafeEqual` Buffer type errors (auth.ts, roles-auth.ts) that blocked `next build`; added `server-only` dep.

## Roles
- **Student**: Section+USN login → welcome → dashboard (attendance ring, 75% threshold), subjects, detail, forecast, recovery, initials avatar, dark mode, PWA. Read-only.
- **Lecturer** (`/lecturer`): authorize by Section+Course Code → Mark Attendance (P/A, mark-all, search, submit), History (view/edit/undo), Below 75%, Analytics. Glassmorphism.
- **HOD** (`/hod`): passcode → Dashboard, Sections drill-down (subjects→students→CSV export, below-75 highlight), History. View-only.

## Supabase attendance functions
`supabase/migrations/20261001000000_attendance.sql` defines the roster, subject, aggregate, attendance-session, and audit-event tables and the `gmit_attendance_api` RPC for read, submit, edit, undo, and delete operations. Existing live data and historical `Attendance_Log` rows still require export/import.

## Status
- ✅ Student portal live & verified against real API (35/42 = 83.33%; 0/0 NOT_STARTED excluded).
- ✅ Lecturer + HOD portals built, wired to real API, verified (gates 307, 501 API_NOT_DEPLOYED, sections 200).
- ✅ Production build passes; Vercel + Render deploy configs ready.
- ⚠️ **BLOCKER for live data**: a Supabase project must be configured, the SQL migration applied, and exported roster/subject/attendance totals imported.

## Backlog / Next
- P0: Configure Supabase and import source data → run student, lecturer, and HOD real-data tests.
- P1: HOD department analytics charts & multi-sheet Excel export; lecturer per-date analytics.
- P2: student auto-refresh after lecturer writes.
