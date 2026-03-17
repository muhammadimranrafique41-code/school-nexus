# Student System — Architecture & Design Reference

> **School Nexus** · Full-Stack TypeScript (React + Express) · Deployed on Vercel  
> Last updated: 2025 · Status: Production

---

## 1. System Overview

The Student System is the central pillar of School Nexus. Every other module — attendance, finance, results, timetable, QR identity, homework — is anchored to a student record. Students are not stored in a dedicated table; they are a **role-scoped projection of the shared `users` table**, with a thin `students` profile table that carries class assignment.

### Architecture at a Glance

```
users (id, name, email, password, role='student', className, fatherName, studentPhotoUrl)
  └── students (userId FK → users.id, className)          ← profile sync table
        ├── attendance (studentId FK)
        ├── results (studentId FK)
        ├── fees (studentId FK)
        ├── fee_payments (studentId FK)
        ├── student_billing_profiles (studentId PK FK)
        ├── qr_profiles (userId FK)
        ├── qr_attendance_events (userId FK)
        ├── student_submissions (studentId FK)
        └── homework_assignments → classes → className match
```

The `students` table is kept in sync automatically via `syncRoleProfiles()` in `DatabaseStorage`, which runs on every user read/write operation. This means the `users` table is the single source of truth and `students` is a derived, always-consistent projection.

---

## 2. Data Model

### 2.1 Core Student Record

**Table: `users`** (role-filtered to `'student'`)

| Column | Type | Notes |
|---|---|---|
| `id` | `serial PK` | Auto-increment, used as `studentId` everywhere |
| `name` | `text NOT NULL` | Full display name |
| `email` | `text UNIQUE NOT NULL` | Login credential, must be unique |
| `password` | `text NOT NULL` | Stored as plain text — **must be hashed in production** |
| `role` | `text NOT NULL` | Fixed to `'student'` |
| `className` | `text` | Class assignment string e.g. `"Grade-5-A"` |
| `fatherName` | `text` | Guardian name, shown on ID card and fee vouchers |
| `studentPhotoUrl` | `text` | URL to portrait image, used on ID card |

**Table: `students`** (sync projection)

| Column | Type | Notes |
|---|---|---|
| `userId` | `integer PK FK → users.id` | CASCADE delete |
| `className` | `text NOT NULL` | Mirrors `users.className`, default `'Unassigned'` |

### 2.2 Class Assignment

Students are assigned to a class via the `className` string field. This string is matched against the `classes` table using a fuzzy normalization algorithm in `findClassByNameKey()`:

1. Exact key match (`Grade-5-A`)
2. Normalized match (strips non-alphanumeric, lowercases)
3. Grade-only match with section fallback (`A` preferred)

This design allows flexible class naming while still resolving to a structured `classes` record for timetable, homework, and diary features.

### 2.3 Identity Fields (Migration 0004)

```sql
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS father_name text,
  ADD COLUMN IF NOT EXISTS student_photo_url text;
```

These were added post-launch to support the QR ID card and fee voucher PDF generation.

---

## 3. Student Lifecycle

### 3.1 Creation

**Route:** `POST /api/users` (admin only)  
**Validation schema:** `insertUserSchema` + `studentSchema` (client-side)

Required fields:
- `name`, `email`, `password`, `role: 'student'`, `className`

Optional fields:
- `fatherName`, `studentPhotoUrl`

On creation, `DatabaseStorage.createUser()` runs a transaction:
1. Inserts into `users`
2. Inserts/upserts into `students` with `className`

```typescript
// server/storage.ts — createUser()
await tx.insert(students).values({ userId: user.id, className: user.className ?? 'Unassigned' })
  .onConflictDoUpdate({ target: students.userId, set: { className: user.className ?? 'Unassigned' } });
```

### 3.2 Update

**Route:** `PUT /api/users/:id` (admin only)

After update, `syncRoleProfiles()` is called to keep the `students` projection consistent. This handles edge cases like role changes (student → teacher) by deleting stale rows from the wrong profile table.

### 3.3 Deletion

**Route:** `DELETE /api/users/:id` (admin only)

Cascade deletes propagate to:
- `students` (CASCADE)
- `attendance` (CASCADE)
- `results` (CASCADE)
- `fees` (CASCADE)
- `fee_payments` (CASCADE)
- `qr_profiles` (CASCADE)
- `qr_attendance_events` (CASCADE)
- `student_submissions` (CASCADE)
- `student_billing_profiles` (CASCADE)

---

## 4. Student Portal — Pages & Features

The student portal is a role-gated React SPA. All routes under `/student/*` are wrapped in `ProtectedRoute` with `allowedRoles={['student']}`.

### 4.1 Dashboard (`/student`)

**Component:** `StudentDashboard`  
**Data sources:** `useStudentStats`, `useStudentAttendance`, `useStudentAttendanceSummary`, `useStudentResultsOverview`, `useStudentTimetable`, `useFees`

The dashboard is a unified command center showing:

| Widget | Data | API |
|---|---|---|
| Hero banner | User name, role | `GET /api/me` |
| Academic pulse | Streak, classes, exams, open invoices | `GET /api/dashboard/student/stats` |
| Attendance rate | % rate, streak | `GET /api/student/attendance/summary` |
| Outstanding balance | Sum of `remainingBalance` | `GET /api/fees` |
| Open invoices | Count of unpaid/overdue | `GET /api/fees` |
| Latest grade | Most recent result | `GET /api/student/results` |
| Quick access cards | Attendance, Timetable, Results | Links |
| Daily diary card | Published diary for student's class | Socket + REST |
| Recent attendance | Last 5 records | `GET /api/student/attendance` |
| Fee invoice summary | Top 4 open invoices | `GET /api/fees` |
| Recent results | Last 3 subject results | `GET /api/student/results` |

### 4.2 Attendance (`/student/attendance`)

**Component:** `StudentAttendance`  
**Data sources:** `useStudentAttendance`, `useStudentAttendanceSummary`

Features:
- **Date range filter** — presets (7/30/90 days) or custom from/to
- **Status filter** — Present / Absent / Late / Excused
- **Session filter** — Full Day / Morning / Afternoon
- **Attendance gauge** — Radial bar chart showing % score
- **Monthly trend chart** — Stacked bar chart (Recharts)
- **Calendar heatmap** — Month-by-month grid with color-coded status tiles
- **Records table** — Filterable, sortable session list
- **Export CSV** — Downloads filtered records
- **Print / Save PDF** — Opens formatted print window with summary + table

**API endpoints used:**
```
GET /api/student/attendance          → session-level records
GET /api/student/attendance/summary  → rate, streak, monthly trend, status breakdown
```

### 4.3 Results / Grades (`/student/results`, `/student/grades`)

**Component:** `StudentGrades`  
**Data sources:** `useStudentResultsOverview`, `useStudentResultDetail`

Features:
- **Overview KPIs** — Current GPA, Cumulative GPA, Pass rate, Strongest/Weakest subject
- **Performance trend** — Line chart (percentage + GPA over time)
- **Grade distribution** — Bar chart of grade letter counts
- **Subject performance** — Horizontal bar chart + detail cards with latest grade
- **Exam-wise table** — Per-exam summary with drill-down dialog
- **Exam detail dialog** — Subject-level marks, grades, remarks + print
- **Recent results table** — Latest subject records
- **Export CSV** — Exam summary export
- **Print report card** — Formatted academic report

**API endpoints used:**
```
GET /api/student/results             → overview, exams, subject performance, trend
GET /api/student/results/:examId     → subject-level detail for one exam
```

**GPA calculation logic** (server-side in `routes.ts`):
```
≥90% → 4.0 | ≥80% → 3.5 | ≥70% → 3.0 | ≥60% → 2.5 | ≥50% → 2.0 | <50% → 0
```

### 4.4 Fees / Invoices (`/student/fees`)

**Component:** `StudentFees`  
**Data sources:** `useFees`, `useStudentBalance`

Features:
- **Balance KPIs** — Outstanding, open invoices, overdue, due soon, total paid
- **Payment reminders** — Invoices overdue or due within 7 days
- **Account balance summary** — Total billed / paid / outstanding / overdue
- **Invoice register** — Full table with print-per-invoice action
- **Payment history** — All recorded payments with receipt print
- **Open balance follow-up** — Top 5 open invoices with print action
- **Export CSV** — Invoice register export

**API endpoints used:**
```
GET /api/fees                              → student's own invoices (role-scoped)
GET /api/fees/balances/students/:studentId → balance summary, reminders, overdue
```

Students can only see their own fees. The server enforces this:
```typescript
if (user.role === 'student') return res.json(await storage.getFeesByStudent(user.id));
```

### 4.5 Timetable (`/student/timetable`)

**Component:** `StudentTimetable`  
**Data sources:** `useStudentTimetable`, `useLiveSettingsFull`

Features:
- **Summary KPIs** — Class name, weekly classes, subjects, teachers, first class time
- **Weekly matrix table** — Period rows × day columns with subject/teacher/room/type
- **Break rows** — Automatically inserted from timetable settings
- **Day cards** — Per-day class list with full details
- **Export CSV** — Timetable export
- **Print timetable** — Full formatted weekly schedule

The timetable resolution logic:
1. Looks up student's `className`
2. Normalizes the name and matches against `classes` table
3. Finds the published `timetables` record for that class
4. Fetches `timetables_periods` and enriches with teacher names
5. Falls back to legacy `timetable` table if no published record exists

**API endpoint used:**
```
GET /api/student/timetable  → { className, items[], days[] }
```

### 4.6 QR ID Card (`/student/qr-card`)

**Component:** `StudentQrCard`  
**Data sources:** `useMyQrCard`, `usePublicSchoolSettings`, `useUser`

Features:
- **Premium ID card preview** — Full visual card with school branding, portrait, QR code
- **Print ID card** — Opens print-optimized HTML with image pre-loading
- **Copy fallback token** — Manual token for offline/camera-less scanning
- **Card metadata** — Public ID, status, issued date, last used date
- **Recent QR activity** — Last 8 scan events (direction, status, method)

**ID card data fields:**
```typescript
type StudentIdCardData = {
  schoolName, shortName, motto, logoUrl,
  studentName, className, fatherName,
  publicId, qrUrl, portraitUrl,
  isActive, academicYear, currentTerm,
  authenticityLine
}
```

**API endpoint used:**
```
GET /api/qr-attendance/me  → { profile, token, recentEvents }
```

### 4.7 Homework Diary (`/student/homework`)

Students view published homework assignments for their class, filtered by status. Submissions can be tracked with marks and feedback.

**API endpoint used:**
```
GET /api/student/teacher-homework  → paginated homework list for student's class
```

### 4.8 Daily Diary (`/student/daily-diary/:date`)

Students view published daily diary entries for their class on a specific date.

---

## 5. API Reference — Student Endpoints

### Authentication & Identity

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/me` | Any | Current session user |
| `GET` | `/api/students` | admin, teacher | All students list |
| `POST` | `/api/users` | admin | Create student |
| `PUT` | `/api/users/:id` | admin | Update student |
| `DELETE` | `/api/users/:id` | admin | Delete student |

### Student-Scoped Data

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/student/attendance` | student | Own attendance records |
| `GET` | `/api/student/attendance/summary` | student | Rate, streak, monthly trend |
| `GET` | `/api/student/results` | student | Results overview + GPA |
| `GET` | `/api/student/results/:examId` | student | Exam detail |
| `GET` | `/api/student/timetable` | student | Weekly timetable |
| `GET` | `/api/student/teacher-homework` | student | Homework for student's class |
| `GET` | `/api/fees` | student | Own invoices (role-scoped) |
| `GET` | `/api/fees/balances/students/:studentId` | admin, student | Balance summary |
| `GET` | `/api/dashboard/student/stats` | any | Dashboard KPIs |
| `GET` | `/api/qr-attendance/me` | student, teacher | QR card + token |

### Admin Student Management

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/fees` | admin | All fees (admin sees all) |
| `POST` | `/api/fees` | admin | Create invoice for student |
| `POST` | `/api/fees/:id/payments` | admin | Record payment |
| `POST` | `/api/fees/generate-monthly` | admin | Bulk monthly fee generation |
| `GET` | `/api/fees/balances/summary` | admin | School-wide balance summary |
| `GET` | `/api/fees/balances/overdue` | admin | All overdue invoices |
| `POST` | `/api/teacher/attendance/bulk` | teacher, admin | Bulk attendance upsert |
| `POST` | `/api/results` | teacher, admin | Add result for student |

---

## 6. Frontend Data Flow

### React Query Cache Keys

All student data is cached by TanStack Query. Cache invalidation is coordinated across related queries on mutation:

```typescript
// use-users.ts — invalidateUserRelatedQueries()
queryClient.invalidateQueries({ queryKey: [api.users.list.path] });
queryClient.invalidateQueries({ queryKey: [api.students.list.path] });
queryClient.invalidateQueries({ queryKey: [api.attendance.list.path] });
queryClient.invalidateQueries({ queryKey: [api.results.list.path] });
queryClient.invalidateQueries({ queryKey: [api.fees.list.path] });
queryClient.invalidateQueries({ queryKey: [api.dashboard.adminStats.path] });
```

### Role-Based Data Scoping

The server enforces data isolation at the route level. Students never receive other students' data:

```typescript
// Attendance
if (user.role === 'student') return res.json(await storage.getAttendanceByStudent(user.id));

// Results
if (user.role === 'student') return res.json(await storage.getResultsByStudent(user.id));

// Fees
if (user.role === 'student') return res.json(await storage.getFeesByStudent(user.id));

// Student balance — explicit ID check
if (user.role === 'student' && requestedId !== user.id) return res.status(403).json({ message: 'Forbidden' });
```

---

## 7. Admin Student Management UI

**Page:** `/admin/students` → `StudentManagement` component

### Form Fields

| Field | Validation | Notes |
|---|---|---|
| Name | Required, min 1 | Full display name |
| Email | Valid email format | Must be unique |
| Password | Min 6 chars (create), optional (edit) | Not hashed — production risk |
| Class Name | Required, min 1 | Free-text, matched to classes table |
| Father's Name | Optional | Shown on ID card and vouchers |
| Student Photo URL | Valid URL or empty | Used on ID card portrait |

### Table Columns

Name · Email · Class · Father · Actions (Edit / Delete)

Students are filtered from the full users list client-side:
```typescript
const students = users?.filter(u => u.role === 'student') || [];
```

---

## 8. QR Identity System

Each student gets a QR profile that serves as their digital identity credential.

### QR Profile Fields

| Field | Description |
|---|---|
| `userId` | FK to student's user record |
| `publicId` | Unique public identifier shown on card |
| `tokenCiphertext` | Encrypted QR token |
| `tokenHash` | SHA hash for fast lookup on scan |
| `isActive` | Whether the card is scannable |
| `issuedAt` | First issue timestamp |
| `regeneratedAt` | Last token regeneration |
| `lastUsedAt` | Last scan timestamp |
| `generatedBy` | Admin/teacher who issued it |

### QR Scan Flow

```
Student presents QR → Scanner reads token
  → Server hashes token → looks up qr_profiles by tokenHash
  → Validates isActive + user role
  → Creates qr_attendance_events record (direction: Check In/Out)
  → If student + Check In → creates attendance record automatically
  → Returns event + duplicate flag + attendanceRecord
```

### ID Card Print Flow

```
Student clicks "Print ID card"
  → resolveStudentPortraitUrl() fetches portrait (with CORS proxy fallback)
  → buildStudentIdCardPrintHtml() generates self-contained HTML
  → Opens print window
  → Script waits for all images to load + decode
  → Calls window.print() after 120ms delay
  → window.close() on afterprint event
```

---

## 9. Attendance System

### Data Model

```
attendance (
  id, studentId FK, teacherId FK,
  date TEXT (YYYY-MM-DD),
  status TEXT ('Present'|'Absent'|'Late'|'Excused'),
  session TEXT ('Full Day'|'Morning'|'Afternoon'),
  remarks TEXT
)
```

### Upsert Logic

Attendance is upserted by `(studentId, date, session)` — no duplicate records per student per session per day:

```typescript
// If existing record found → UPDATE status/remarks
// If not found → INSERT new record
```

### Attendance Summary Computation

The summary is computed server-side in the route handler:

```typescript
attendanceRate = Math.round((attendedRecords / totalRecords) * 100)
// attendedStatuses = { 'Present', 'Late', 'Excused' }

currentStreak = consecutive attended sessions from most recent backwards
```

Monthly trend is grouped by `YYYY-MM` label and returned as an array.

---

## 10. Results System

### Data Model

```
results (
  id, studentId FK,
  subject TEXT, marks INT, grade TEXT,
  totalMarks INT, examTitle TEXT, examType TEXT,
  term TEXT, examDate TEXT, remarks TEXT
)
```

### Server-Side Aggregation

Results are grouped into **exams** by a composite key:
```typescript
buildExamId = (examTitle ?? 'Assessment') + '::' + (examType ?? 'General') + '::' + (term ?? 'Term') + '::' + (examDate ?? 'undated')
```

For each exam group:
- `obtainedMarks` = sum of all subject marks
- `totalMarks` = sum of all subject totals
- `percentage` = `Math.round((obtained / total) * 100)`
- `gpa` = mapped from percentage via GPA scale
- `status` = `'Passed'` if no grade is `'F'`, else `'Needs attention'`

Subject performance is averaged across all exams per subject.

---

## 11. Student Dashboard Stats API

**Endpoint:** `GET /api/dashboard/student/stats`

Computed in `getStudentDashboardStats(studentId)`:

```typescript
{
  attendanceRate: Math.round((attendedCount / totalRecords) * 100),
  unpaidFees: sum of remainingBalance across all invoices,
  openInvoices: count of invoices with remainingBalance > 0,
  overdueInvoices: count of invoices with status === 'Overdue'
}
```

---

## 12. Sidebar Navigation (Student Portal)

```
Overview
  └── Dashboard (/student)

Academics
  ├── Homework Diary (/student/homework)       [New]
  ├── My Attendance (/student/attendance)      [New] [pulse]
  ├── My QR Card (/student/qr-card)            [QR]
  ├── My Timetable (/student/timetable)        [New]
  └── My Results (/student/results)            [New]

Billing
  └── My Fees (/student/fees)
```

---

## 13. Known Issues & Gaps

### Critical

| Issue | Location | Impact |
|---|---|---|
| Passwords stored in plain text | `users.password` | Security — must hash with bcrypt before production |
| No student enrollment number / roll number | `users` table | Cannot generate official documents without a unique student ID |
| `className` is a free-text string | `users.className` | Fragile class matching; normalization can fail on unusual names |

### Structural

| Issue | Location | Recommendation |
|---|---|---|
| No date of birth field | `users` table | Required for age-based reports, admission forms |
| No admission date | `users` table | Required for enrollment tracking |
| No gender field | `users` table | Required for demographic reports |
| No address / contact fields | `users` table | Required for parent communication |
| No student status (active/inactive/graduated) | `users` table | Cannot archive graduated students without deleting |
| `students` table is a sync projection, not a true profile | Schema design | Adds complexity; consider merging into `users` or a richer `student_profiles` table |

### Frontend

| Issue | Location | Recommendation |
|---|---|---|
| Student list filtered client-side from all users | `admin/students.tsx` | Should use `GET /api/students` directly for performance at scale |
| No pagination on student list | `admin/students.tsx` | Will degrade at 500+ students |
| No search/filter on student management page | `admin/students.tsx` | Add name/class/email search |
| Photo URL is manually entered | Student form | Should use S3 presigned upload (already available for homework) |

---

## 14. Recommended Enhancements

### A. Student Profile Enrichment

Add to `users` table (or a new `student_profiles` table):

```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS roll_number text UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS date_of_birth date;
ALTER TABLE users ADD COLUMN IF NOT EXISTS gender text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS admission_date date;
ALTER TABLE users ADD COLUMN IF NOT EXISTS status text DEFAULT 'active'; -- active/inactive/graduated
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS emergency_contact text;
```

### B. Student Search & Filtering API

```
GET /api/students?className=Grade-5-A&search=Ahmed&status=active&page=1&limit=20
```

### C. Student Profile Page

A dedicated `/admin/students/:id` page showing:
- Profile details + edit form
- Attendance summary
- Fee balance
- Recent results
- QR card status
- Billing profile

### D. Bulk Student Import

```
POST /api/students/import  → CSV upload with name, email, className, fatherName
```

### E. Student Status Management

Soft-delete / archive instead of hard delete:
```typescript
status: 'active' | 'inactive' | 'graduated' | 'transferred'
```

### F. Photo Upload via S3

Replace URL input with presigned upload (already implemented for homework):
```typescript
POST /api/uploads/presign → { key, url, expiresIn }
// Upload to S3 → store key as studentPhotoUrl
```

### G. Parent/Guardian Portal

A `guardian` role with read-only access to their linked student's:
- Attendance records
- Fee invoices
- Results
- Timetable

---

## 15. Deployment Notes (Vercel)

- All student API routes run as serverless functions via `api/index.ts`
- Session-based auth uses `express-session` with PostgreSQL session store
- Student photo URLs must be publicly accessible (S3 or CDN) — no local file storage
- QR token encryption uses server-side secrets from environment variables
- The `syncRoleProfiles()` call on every user read is a performance concern at scale — consider replacing with a database trigger or event-driven sync

---

## 16. File Reference

| File | Purpose |
|---|---|
| `shared/schema.ts` | `users`, `students`, `attendance`, `results` table definitions |
| `shared/routes.ts` | All API route definitions with Zod schemas |
| `server/storage.ts` | `DatabaseStorage` — all student data access methods |
| `server/routes.ts` | Express route handlers for student endpoints |
| `client/src/pages/admin/students.tsx` | Admin student management UI |
| `client/src/pages/student/dashboard.tsx` | Student dashboard |
| `client/src/pages/student/attendance.tsx` | Attendance heatmap + filters |
| `client/src/pages/student/grades.tsx` | Results + GPA analysis |
| `client/src/pages/student/fees.tsx` | Invoice register + payment history |
| `client/src/pages/student/timetable.tsx` | Weekly timetable matrix |
| `client/src/pages/student/qr-card.tsx` | QR ID card + print |
| `client/src/components/qr-student-id-card.tsx` | ID card component + print HTML builder |
| `client/src/hooks/use-users.ts` | User CRUD mutations + cache invalidation |
| `client/src/hooks/use-attendance.ts` | Attendance queries + mutations |
| `client/src/hooks/use-results.ts` | Results queries + mutations |
| `client/src/hooks/use-fees.ts` | Fee queries + mutations |
| `migrations/0004_student_identity_fields.sql` | Added `fatherName`, `studentPhotoUrl` |
