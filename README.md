# KLEF Timetable Portal — Next.js + MongoDB

Full-stack rewrite of the KLEF portal as a Next.js 14 application.

## Stack
- **Frontend**: Next.js 14 App Router + React 18
- **Backend**: Next.js API Routes (no separate server needed)
- **Database**: MongoDB via Mongoose
- **Auth**: JWT (jsonwebtoken + bcryptjs)
- **CSV parsing**: PapaParse (handles BOM, encoding, large files)
- **Excel export**: SheetJS (xlsx)

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

## Authentication

| Login | Password (default) | Role | Access |
|---|---|---|---|
| `viewer` | `Klef2026` | viewer | All read features |
| `admin`  | `Klvzacse2` | admin  | Upload data, clear DB, admin page |

Passwords are set in `.env.local`. Change them before deploying.

---

## File Upload Format

The portal accepts the **exact same CSV files** used originally.

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

---

## MongoDB Collections

| Collection | Documents | Purpose |
|---|---|---|
| `timetableentries` | ~12,000/upload | All BTT rows, tagged `dataset: live\|master` |
| `roommetas` | ~1,000 | Room metadata from ERP-RD |
| `users` | few | Portal users with hashed passwords |

### Key Indexes
```
timetableentries:
  { dataset, umatdayid, umat_hourno, room_no }   ← clash detection pass 1
  { dataset, umatdayid, umat_hourno, emp_id }    ← clash detection pass 2
  { dataset, emp_id, umatdayid, umat_hourno }    ← faculty timetable
  { dataset, room_no, umatdayid, umat_hourno }   ← room timetable
  { dataset, course_code, year }                 ← course timetable
  { dataset, umatdayid, umat_hourno }            ← free-slot queries
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

### Clash (Bearer required)
| Method | Route | Description |
|---|---|---|
| POST | `/api/clash/run` | Runs full clash detection |

### Data Management (admin Bearer required)
| Method | Route | Description |
|---|---|---|
| POST | `/api/upload` | Multipart: fields `timetable`, `rooms`, `master` |
| GET | `/api/upload/status` | Returns row counts |
| DELETE | `/api/upload/status?dataset=live\|master\|all` | Clear data |

---

## Pages

| URL | Description |
|---|---|
| `/faculty` | Faculty timetable search |
| `/rooms` | Room timetable search |
| `/courses` | Course timetable (filter by year + batch) |
| `/free-faculty` | Find free faculty by day + periods |
| `/free-rooms` | Find free rooms by day + periods |
| `/clash` | Run and filter clash detection |
| `/admin` | Admin dashboard — upload, status, clear (admin only) |
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

Identical to the original app:

1. **Room Overlap** (SEVERE) — Two different courses in the same room at the same time
2. **Dual Faculty** (WARNING) — Same course, same room, same time, but assigned to 2+ different faculty (skipped for LAB rooms where multi-faculty is normal)
3. **Faculty Double-Booked** (INFO) — Same faculty in 2+ different non-additional sections simultaneously

`associative_sectionno` values A/B/C/D/MA mark "additional faculty" rows and are excluded from clash detection.
