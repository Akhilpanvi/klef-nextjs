# Planning portal integration

The planning application stays in the existing private GitHub repository
`umarkcse/kl-university-timetable-portal`. A local checkout can be kept in the
ignored `planning/` directory. It contains Templates, Courses,
Category Min-Max, Generate Templates, Faculty Sections, Faculty Load, Room Allocation,
INPUT CSV, ERP CSV, Dashboard, and Manage Users. The existing Next.js timetable portal
continues to own faculty, rooms, Free Rooms, Class TT, and its MongoDB data.

The production site serves the planning app at `/planning` after its separate FastAPI
service is connected. `PLANNING_PORTAL_ORIGIN` in the Next.js deployment must be the
HTTPS origin of that service (for example, `https://example.onrender.com`). The Next.js
rewrite forwards `/planning/*` to that service. The planning frontend is built with
`/planning/` asset paths and calls `/planning/api/*`, so the browser stays on the
existing timetable domain. The Planning navigation tab appears only when this origin
is configured. Set the environment variable and redeploy Next.js after the planning
service is healthy.

## One portal login

Set `PORTAL_AUTH_URL=https://timetable.kluniversity.me/api/auth/me` on the planning
service. A signed-in browser sends its existing `klef_token` to the planning service;
the service verifies it with the current portal and issues a short planning session.
Current portal admins become planning admins. Other users need the `manage_data`
permission and become planning users. Accounts still required to change their portal
password are refused. Password login in the planning service is disabled when this
connection is configured. Signing out of planning also signs out of the current portal.

## Saved data

The source folder's `backend/kl_timetable.db` contains saved planning work. The private
planning repository's `render.yaml` prepares a persistent `/var/data` disk; applying it
creates a paid Render service. Do not commit the SQLite file, reference workbook,
tokens, or database backups. Stop the planning service and transfer a consistent SQLite
backup privately to `/var/data/kl_timetable.db`, plus `TIME_TABLE_REQ_FILE.xlsx` to
`/var/data/TIME_TABLE_REQ_FILE.xlsx`, before users begin editing online. Restart the
service and verify the saved templates, course import, generated plans, and INPUT rows.
The source folder and hosted database will be separate copies; later desktop edits do
not automatically synchronize.

For an empty hosted PostgreSQL database instead, `planning/scripts/migrate_database.py`
copies and verifies all planning tables from the local SQLite database. It refuses a
destination that already contains records. Set `PLANNING_DATABASE_URL` privately and
pass `--source-sqlite` to the script. Do not put database credentials in command logs.

## Local verification

Build the planning frontend from `planning/frontend` with `VITE_BASE_PATH=/planning/`
and `npm run build`. Run the planning backend with `PUBLIC_BASE_PATH=/planning`,
`PORTAL_AUTH_URL` pointing to the local current portal's `/api/auth/me`, and a private
development `SECRET_KEY`. Set `PLANNING_PORTAL_ORIGIN=http://127.0.0.1:8000` for the
Next.js dev server. The `/planning` route and its API then use the same local origin.

The source's tests remain under `planning/backend/tests` and `planning/frontend/src`.
The integration adds `test_portal_sso.py` for the shared login. The local source
database and workbook are intentionally excluded from this repository.
