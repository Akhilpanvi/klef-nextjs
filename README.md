# KLEF Timetable System — Next.js + MongoDB

Full-stack rewrite of the KLEF timetable system as a Next.js 14 application.

## Stack
- **Frontend**: Next.js 14 App Router + React 18
- **Backend**: Next.js API Routes (no separate server needed)
- **Database**: MongoDB via Mongoose
- **Auth**: JWT (jsonwebtoken + bcryptjs)
- **CSV/Excel parsing**: SheetJS (xlsx) — handles CSV, XLSX, BOM, large files
- **Notifications**: react-hot-toast

---

## Quick Start

### 1. Prerequisites
- Node.js 18+
- MongoDB running locally or a MongoDB Atlas URI

### 2. Install & configure

```bash
cd klef-nextjs
npm install
cp .env.local.example .env.local
# Edit .env.local — set MONGODB_URI, JWT_SECRET, etc.
```

### 3. Create admin user

```bash
npm run seed
```

### 4. Run dev server

```bash
npm run dev
# → http://localhost:3000
```

---

## Authentication & Roles

| Role | Access |
|---|---|
| `admin` | Full access — upload, clear DB, manage all faculty, admin page |
| `manage_data` | Upload/clear timetable data; create/manage permitted faculty |
| `view_all_timetables` | Read-only access to all faculty timetables |
| `viewer` | Standard read features |

Passwords are hashed and stored in MongoDB. Default credentials are set via `.env.local`.

First-time login shows a hint to change password via `/change-password`.

---

## File Upload Format

The system accepts the same CSV/XLSX files used in the KLEF ERP system. **Headers are matched case-insensitively.**

### BTT Timetable CSV (`BTT-XXXXXX.csv`)
Required columns (others are stored but not critical):
| Column | Description |
|---|---|
| `umatdayid` | Day 1=Mon…6=Sat |
| `umat_hourno` | Period number (1–24) |
| `EMP ID` | Faculty employee ID |
| `F-Name` | Faculty name |
| `F-Dept` | Faculty department |
| `Course code` | Course code |
| `C-Name` | Course name |
| `YEAR` | Year (1/2/3/4) |
| `ROOM NO` | Room number |
| `main_sectionno` | Section |
| `associative_sectionno` | A/B/C/D/MA — clash filter |
| `REG` | Batch: R22/R23/R24/R25 |

### Room Data CSV (`KLEF-ERP-RD.csv`)
| Column | Description |
|---|---|
| `Room No` | Room number |
| `BLOCK` | Block letter |
| `CR/LAB` | Type: CR, LAB, HLAB, SPORTS… |
| `TOTAL` | Capacity |
| `ALLOTED TO` | COE/COR/CRT/FED/MHS |
| `DEPT ALLOTED TO` | e.g. R24-CSE-1 |

### Roomwise Timetable CSV (`Roomwise-TT-xx.xx.xxxx.csv`)
Used by the Free Rooms finder. All headers are matched case-insensitively (`Roomno` or `roomno`, `Mon1` or `mon1`, etc.).
| Column | Description |
|---|---|
| `Roomno` | Room identifier — also accepts `room no`, `room_no`, `roomnumber` |
| `Mon1`–`Mon24` | Period slots for Monday |
| `Tue1`–`Tue24` | Period slots for Tuesday |
| … | Wed, Thu, Fri, Sat, Sun (up to `Sun24`) |

Only non-empty, non-dash slots are stored (sparse format). Old data is replaced on each upload.

### ERP Room Data CSV (`ERP-ROOMDATA.csv`)
Maps ERP Room IDs to base room numbers. Sections (A/B/C/D/MA) are grouped under their base room — the MA section's ID is used as the primary ERP ID. Headers are case-insensitive.
| Column | Description |
|---|---|
| `ROOM -MA` | Full room identifier with section (e.g. A301-A) |
| `ROOM ID` | Numeric ERP room ID |
| `ROOM NAME` | Base room name (e.g. A301) |
| `Assoc` | Section suffix: A / B / C / D / MA |
| `description` | Room type (CLASSROOM, LAB, etc.) |
| `block` | Block name (e.g. FED Block) |

All sections (MA, A, B, C, D) are shown as individual badges next to the room number (e.g. `MA:96 A:97 B:98 C:99 D:100`) across all Room Availability views and Excel exports. Duplicate column headers in the CSV are handled automatically; blank-assoc rows are ignored.

### Faculty Profile CSV (`KLEF-FD.csv`)
Imports faculty profile fields (designation, department, email, etc.) matched by Employee ID.

---

## MongoDB Collections

| Collection | Purpose |
|---|---|
| `timetableentries` | All BTT rows, tagged by snapshot dataset |
| `timetablesnapshots` | Metadata per BTT upload (label, row count, active flag) |
| `roommetas` | Room metadata from ERP-RD (capacity, block, type) |
| `roomwiseentries` | Sparse slot entries from Roomwise-TT (for free room analysis) |
| `roomwisesnapshots` | Metadata per Roomwise-TT upload |
| `erproomdata` | ERP Room IDs grouped by base room name (from ERP-ROOMDATA CSV) |
| `users` | System users with hashed passwords and roles |

### Key Indexes
```
timetableentries:
  { dataset, umatdayid, umat_hourno, room_no }   ← clash detection pass 1
  { dataset, umatdayid, umat_hourno, emp_id }    ← clash detection pass 2
  { dataset, emp_id, umatdayid, umat_hourno }    ← faculty timetable
  { dataset, room_no, umatdayid, umat_hourno }   ← room timetable
  { dataset, course_code, year }                 ← course timetable
  { dataset, umatdayid, umat_hourno }            ← free-slot queries

roomwiseentries:
  { dataset, day, hour }                         ← free room queries
  { dataset, room_no, day }                      ← room-day slot lookup
```

---

## API Routes

All routes under `/api/`:

### Auth
| Method | Route | Description |
|---|---|---|
| POST | `/api/auth/login` | Login, returns JWT |
| GET  | `/api/auth/me` | Get current user (Bearer) |

### Timetable (Bearer required)
| Method | Route | Params |
|---|---|---|
| GET | `/api/timetable/faculty` | `q=<name\|id>` or `list=1` |
| GET | `/api/timetable/room` | `q=<roomNo>` or `list=1` |
| GET | `/api/timetable/course` | `q=<code\|name>&year=<1-4>` or `list=1[&year=][&reg=]` |

### Availability (Bearer required)
| Method | Route | Params |
|---|---|---|
| GET | `/api/free/faculty` | `day=<1-6>&periods=1,2,3` |
| GET | `/api/free/rooms` | `day=<1-6>&periods=1,2,3` |
| GET | `/api/free/room-stats` | Room occupancy statistics |
| GET | `/api/free/room-analyze` | Detailed room analysis |

### Clash (Bearer required)
| Method | Route | Description |
|---|---|---|
| POST | `/api/clash/run` | Runs full clash detection |

### Data Management (admin / manage_data Bearer required)
| Method | Route | Description |
|---|---|---|
| POST | `/api/upload` | Multipart: fields `timetable`, `rooms`, `master` |
| GET | `/api/upload/status` | Returns row counts |
| DELETE | `/api/upload/status?dataset=live\|master\|all` | Clear data |
| GET/POST | `/api/admin/roomwise` | Get status / upload Roomwise-TT |
| DELETE | `/api/admin/roomwise` | Clear Roomwise TT data |
| GET/POST | `/api/admin/erproom` | Get status / upload ERP Room Data CSV |
| DELETE | `/api/admin/erproom` | Clear ERP Room Data |
| POST | `/api/admin/upload-faculty` | Upload KLEF-FD faculty profile CSV |
| GET/POST | `/api/admin/faculty` | List / create faculty users |

---

## Pages

| URL | Description |
|---|---|
| `/faculty` | Faculty timetable search |
| `/rooms` | Room timetable search |
| `/courses` | Course timetable (filter by year + batch) |
| `/free-faculty` | Find free faculty by day + periods |
| `/free-rooms` | Find free rooms by day + periods, with stats and analytics |
| `/clash` | Run and filter clash detection |
| `/admin` | Admin dashboard — upload, status, clear, manage faculty |
| `/change-password` | Change own password |
| `/login` | Login screen |

---

## Deployment

### Environment Variables (`.env.local`)
```env
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/klef_portal
JWT_SECRET=<long random string — use openssl rand -base64 48>
JWT_EXPIRES_IN=7d
APP_PASSWORD=Klef2026
ADMIN_PASSWORD=Klvzacse2
UPLOAD_PASSWORD=<password gate for data uploads>
```

### Build & Start
```bash
npm run build
npm start
```

### Docker (optional)
Use a standard Node 18 Alpine image, copy project, `npm ci --production`, `npm run build`, `npm start`.

---

## Clash Detection Logic

1. **Room Overlap** (SEVERE) — Two different courses in the same room at the same time
2. **Dual Faculty** (WARNING) — Same course, same room, same time, assigned to 2+ different faculty; uses SRC-D role grouping; skipped when source dataset is absent
3. **Faculty Double-Booked** (INFO) — Same faculty in 2+ different non-additional sections simultaneously

`associative_sectionno` values A/B/C/D/MA mark "additional faculty" rows and are excluded from clash detection.
