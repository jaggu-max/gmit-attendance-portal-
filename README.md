# GMIT Smart Attendance

Next.js 15 + TypeScript attendance app. Supabase Postgres is the source of truth for student rosters, subjects, and attendance. Attendance read/write logic runs in database functions; student profile photos have been removed.

## Run locally

```bash
cd frontend
cp .env.example .env.local   # fill values
yarn install
yarn dev                     # http://localhost:3000
```

## Portals

| Role | URL | Access |
|---|---|---|
| Student | `/` | Section + USN (from Supabase) |
| Lecturer | `/lecturer` | Section + Subject Code (authorized via Supabase) |
| HOD / Admin | `/hod` | Passcode (`HOD_PASSCODE` env); register students and subjects |

## Deploy

### Vercel
1. Import the repo in Vercel.
2. Set **Root Directory** to `frontend` (framework auto-detects Next.js).
3. Add env vars from `.env.example`. Keep the Supabase service-role key server-side; never expose it with a `NEXT_PUBLIC_` prefix.
4. Deploy. That's it — `vercel.json` is already configured.

### Render
1. Create a new Blueprint/Web Service from the repo — `render.yaml` (repo root) is already configured:
   - build: `yarn install && yarn build`
   - start: `yarn start:prod`
   - root dir: `frontend`
2. Set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_SECRET`, and `HOD_PASSCODE` in the dashboard.
3. Deploy.

### Required env vars
See `frontend/.env.example`.

### Supabase setup and data import
1. Run `supabase/migrations/20261001000000_attendance.sql` in the Supabase SQL Editor. It creates the attendance tables and the `gmit_attendance_api` function used by the app.
2. Import exported source data into `students`, `subjects`, and `student_attendance` (in that order). The migration seeds the six section codes. Use the existing sheet's section, USN, name, serial number, course code, subject, teacher, conducted count, and attended count as the import fields.
3. Run `supabase/migrations/20261001120000_faculty_passwords.sql` to add per-subject lecturer password authentication.
4. Deploy with the Supabase project URL and service-role key configured as server-only environment variables.

The repository does not contain a Google Sheet export or Supabase project credentials, so this change prepares the schema and application connection but does not transfer live records. Import the existing attended/conducted totals to preserve current student percentages. Historical `Attendance_Log` rows are not automatically imported.

HODs can register students from the **Register Students** tab and add section subjects, course codes, lecturer names, and any previously conducted class count from **Subjects** in the HOD portal. Register subjects before lecturers begin marking attendance.

In **Subjects**, HODs can assign or reset a lecturer password for each section/course. Passwords are stored as salted bcrypt hashes (cost 12), must be 12–72 characters with uppercase, lowercase, numeric, and symbol characters, and cannot be reused for another subject in the same section. Login attempts are rate-limited to five failures per 15-minute window per section/client. Share assigned passwords with lecturers through a secure channel; they cannot be retrieved from the portal.

## Notes
- Server routes live under `/gs/*` (not `/api/*`) so they also work behind this platform's ingress.
- Attendance is read-only for students/HOD; lecturer writes are authorized server-side per section+course.
