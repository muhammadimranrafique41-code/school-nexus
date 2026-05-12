# Implementation Plan: Bulk Import Feature — School-Nexus Dashboard

---

## 1. UI Mockup Analysis

The provided mockups reveal a two-tab **Bulk Upload** modal:

| Tab | Key Observations |
|-----|-----------------|
| **Upload Families** | Active by default; drag-and-drop CSV zone; "Download Sample CSV" top-right |
| **Upload Students** | Blue info banner: *"Families must be created before uploading students. Students reference families by CNIC number."*; same drag-and-drop zone |

**Critical design constraints derived from the UI:**

- Import is **sequentially dependent**: families must exist before students can be linked.
- The **CNIC number** is the foreign-key bridge between the `students` and `families` tables.
- A **sample CSV download** is expected for both entity types.
- The modal has `Cancel` and `Upload` (disabled until file selected) actions.

---

## 2. Frontend Integration

### 2.1 Button Placement

Place the **"Bulk Import"** trigger button in two locations:

```
Dashboard
 └── Student Management Page   → "Bulk Import" button (primary CTA, top-right toolbar)
 └── Admin Settings > Data     → "Bulk Import" card (secondary access point)
```

```tsx
// components/students/StudentPageHeader.tsx
<Button variant="outline" onClick={() => setImportModalOpen(true)}>
  <UploadCloud className="mr-2 h-4 w-4" />
  Bulk Import
</Button>
```

---

### 2.2 Modal Architecture

The modal is a **multi-step wizard** with 4 stages:

```
[Tab Select] → [File Drop] → [Preview & Validate] → [Result Summary]
```

#### Component Tree

```
<BulkImportModal>
  ├── <ImportTabSwitcher>          // "Upload Families" | "Upload Students"
  ├── <StudentImportWarningBanner> // Conditional — shown only on Students tab
  ├── <FileDropZone>               // Drag-and-drop or click-to-select
  ├── <PreviewTable>               // Shows first 10 rows + column headers
  ├── <ValidationErrorList>        // Row-level errors from pre-flight check
  └── <ImportResultSummary>        // Success/failure counts post-submission
```

#### State Machine

```ts
type ImportStep = 'select' | 'preview' | 'uploading' | 'result';

interface ImportState {
  activeTab:    'families' | 'students';
  step:         ImportStep;
  file:         File | null;
  previewRows:  Record<string, string>[];
  errors:       RowError[];
  result:       ImportResult | null;
}
```

#### File Drop Zone Behaviour

```tsx
// components/import/FileDropZone.tsx
const onDrop = useCallback((acceptedFiles: File[]) => {
  const file = acceptedFiles[0];
  if (!file) return;

  // Only .csv or .xlsx allowed
  const allowed = ['text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
  if (!allowed.includes(file.type)) {
    toast.error('Only CSV or Excel files are accepted.');
    return;
  }
  parsePreview(file); // parse first 10 rows client-side
  setStep('preview');
}, []);
```

#### Client-Side Preview Parsing

Use `papaparse` (CSV) and `xlsx` (Excel) for in-browser parsing before upload:

```ts
// lib/import/previewParser.ts
import Papa from 'papaparse';
import * as XLSX from 'xlsx';

export async function parsePreview(file: File): Promise<PreviewResult> {
  if (file.name.endsWith('.csv')) {
    return parseCsv(file);
  }
  return parseExcel(file);
}

function parseCsv(file: File): Promise<PreviewResult> {
  return new Promise((resolve) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      preview: 10, // Show first 10 rows only
      complete: (results) => resolve({
        headers: results.meta.fields ?? [],
        rows:    results.data as Record<string, string>[],
      }),
    });
  });
}
```

#### Sample CSV Download

```tsx
// hooks/useSampleCsv.ts
const FAMILY_HEADERS = ['cnic_number','guardian_name','phone','email','address','city'];
const STUDENT_HEADERS = ['first_name','last_name','family_cnic','class_id','date_of_birth','gender'];

export function downloadSampleCsv(type: 'families' | 'students') {
  const headers = type === 'families' ? FAMILY_HEADERS : STUDENT_HEADERS;
  const csv = [headers.join(','), headers.map(() => 'example').join(',')].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `sample_${type}.csv`;
  a.click();
}
```

---

## 3. Backend API & Service Layer

### 3.1 New Endpoints

```
POST /api/admin/import/families     — multipart/form-data, field: "file"
POST /api/admin/import/students     — multipart/form-data, field: "file"
GET  /api/admin/import/sample/:type — returns sample CSV download (type: families | students)
```

#### Route Definition (Express / Hono style)

```ts
// server/routes/import.routes.ts
import { Router } from 'express';
import multer from 'multer';
import { importFamilies, importStudents } from '../services/import.service';

const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 5 * 1024 * 1024 }, // 5 MB max
  fileFilter: (_req, file, cb) => {
    const allowed = ['text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
    cb(null, allowed.includes(file.mimetype));
  },
});

router.post('/import/families', upload.single('file'), importFamiliesHandler);
router.post('/import/students', upload.single('file'), importStudentsHandler);
router.get('/import/sample/:type', sampleCsvHandler);
```

#### Response Contract

```ts
// Unified response for both endpoints
interface ImportResponse {
  success:      boolean;
  imported:     number;         // rows successfully inserted
  skipped:      number;         // rows skipped (duplicates)
  errors:       RowError[];     // row-level validation failures
  message:      string;
}

interface RowError {
  row:     number;              // 1-based row number
  field:   string;              // which column failed
  value:   string;              // the offending value
  reason:  string;              // human-readable message
}
```

---

### 3.2 Service Layer — Parse & Import Logic

```
server/services/
 └── import.service.ts        — orchestrator (parse → validate → persist)
 └── import/
     ├── fileParser.ts         — CSV/Excel → raw row objects
     ├── familyImporter.ts     — validate + upsert families
     └── studentImporter.ts    — validate + upsert students
```

#### File Parser

```ts
// server/services/import/fileParser.ts
import Papa from 'papaparse';
import * as XLSX from 'xlsx';

export function parseBuffer(buffer: Buffer, mimetype: string): Record<string, string>[] {
  if (mimetype === 'text/csv') {
    const result = Papa.parse<Record<string, string>>(buffer.toString('utf-8'), {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim().toLowerCase(),
    });
    return result.data;
  }

  // Excel path
  const workbook  = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  return XLSX.utils.sheet_to_json<Record<string, string>>(workbook.Sheets[sheetName], {
    defval: '',
    raw:    false,
  });
}
```

---

### 3.3 Relational Complexity: Families → Students Linking

The **CNIC number** is the anchor. The import flow is:

```
Step 1:  Parse all rows from file
Step 2:  Validate each row against schema (see Section 4)
Step 3:  BEGIN TRANSACTION
Step 4:    Upsert families   → collect { cnic → family_id } map
Step 5:    For each student row → resolve family_id via cnic map
Step 6:    Insert students with resolved family_id FK
Step 7:  COMMIT  (or ROLLBACK on any error)
```

#### Family Importer (Drizzle ORM)

```ts
// server/services/import/familyImporter.ts
import { db }       from '../../db';
import { families } from '../../db/schema';
import { eq }       from 'drizzle-orm';

export async function upsertFamilies(
  rows: FamilyRow[],
  tx:   typeof db,          // transaction context passed from orchestrator
): Promise<Map<string, number>> {
  const cnicToId = new Map<string, number>();

  for (const row of rows) {
    // Check for existing family by CNIC
    const existing = await tx
      .select({ id: families.id })
      .from(families)
      .where(eq(families.cnicNumber, row.cnic_number))
      .limit(1);

    if (existing.length > 0) {
      cnicToId.set(row.cnic_number, existing[0].id);
      continue; // skip — family already exists
    }

    const [inserted] = await tx
      .insert(families)
      .values({
        cnicNumber:   row.cnic_number,
        guardianName: row.guardian_name,
        phone:        row.phone,
        email:        row.email,
        address:      row.address,
        city:         row.city,
      })
      .returning({ id: families.id });

    cnicToId.set(row.cnic_number, inserted.id);
  }

  return cnicToId;
}
```

#### Student Importer (Drizzle ORM)

```ts
// server/services/import/studentImporter.ts
import { db }       from '../../db';
import { students } from '../../db/schema';

export async function insertStudents(
  rows:      StudentRow[],
  cnicToId:  Map<string, number>,   // from familyImporter
  tx:        typeof db,
): Promise<{ inserted: number; errors: RowError[] }> {
  const errors: RowError[] = [];
  let inserted = 0;

  for (let i = 0; i < rows.length; i++) {
    const row      = rows[i];
    const familyId = cnicToId.get(row.family_cnic);

    if (!familyId) {
      errors.push({
        row:    i + 2,                // +2 for header row + 1-based
        field:  'family_cnic',
        value:  row.family_cnic,
        reason: `No family found with CNIC "${row.family_cnic}". Upload the family first.`,
      });
      continue;
    }

    await tx.insert(students).values({
      firstName:   row.first_name,
      lastName:    row.last_name,
      familyId:    familyId,
      classId:     parseInt(row.class_id),
      dateOfBirth: new Date(row.date_of_birth),
      gender:      row.gender as 'male' | 'female' | 'other',
    });

    inserted++;
  }

  return { inserted, errors };
}
```

#### Orchestrator with Transaction Wrapping

```ts
// server/services/import.service.ts
import { db }              from '../db';
import { parseBuffer }     from './import/fileParser';
import { upsertFamilies }  from './import/familyImporter';
import { insertStudents }  from './import/studentImporter';
import { validateFamilyRows, validateStudentRows } from './import/validators';

export async function importFamilies(buffer: Buffer, mimetype: string): Promise<ImportResponse> {
  const rows             = parseBuffer(buffer, mimetype);
  const { valid, errors } = validateFamilyRows(rows);

  if (errors.length > 0 && valid.length === 0) {
    return { success: false, imported: 0, skipped: 0, errors, message: 'Validation failed.' };
  }

  let imported = 0;
  let skipped  = 0;

  await db.transaction(async (tx) => {
    const cnicMap = await upsertFamilies(valid, tx);
    imported = [...cnicMap.values()].length;
    skipped  = rows.length - valid.length;
  });

  return { success: true, imported, skipped, errors, message: `${imported} families imported.` };
}

export async function importStudents(buffer: Buffer, mimetype: string): Promise<ImportResponse> {
  const rows              = parseBuffer(buffer, mimetype);
  const { valid, errors } = validateStudentRows(rows);

  let imported = 0;

  await db.transaction(async (tx) => {
    // Build the CNIC→ID map from existing families
    const allFamilyCnics = [...new Set(valid.map(r => r.family_cnic))];
    const cnicMap        = await resolveFamilyIds(allFamilyCnics, tx);

    const result = await insertStudents(valid, cnicMap, tx);
    imported     = result.inserted;
    errors.push(...result.errors);

    if (errors.length > 0) throw new Error('PARTIAL_FAILURE'); // triggers rollback
  }).catch(() => { /* rollback handled — errors already collected */ });

  return { success: errors.length === 0, imported, skipped: rows.length - valid.length, errors,
           message: `${imported} students imported.` };
}
```

> **Transaction strategy**: The entire batch runs inside a single `db.transaction()`. If any unrecoverable error occurs, Drizzle rolls back all inserts automatically. Row-level validation errors are collected and returned to the user without rolling back cleanly-validated rows (configurable via a `stopOnFirstError` flag).

---

## 4. Data Validation & Error Handling

### 4.1 Required CSV Schemas

#### Families CSV

| Column | Type | Required | Rules |
|--------|------|----------|-------|
| `cnic_number` | string | ✅ | Format: `XXXXX-XXXXXXX-X`; must be unique |
| `guardian_name` | string | ✅ | Min 2 chars |
| `phone` | string | ✅ | Valid PK phone format |
| `email` | string | ✅ | Valid email; must be unique in DB |
| `address` | string | ✅ | Min 5 chars |
| `city` | string | ✅ | Non-empty |

#### Students CSV

| Column | Type | Required | Rules |
|--------|------|----------|-------|
| `first_name` | string | ✅ | Min 2 chars |
| `last_name` | string | ✅ | Min 2 chars |
| `family_cnic` | string | ✅ | Must match an existing family CNIC |
| `class_id` | integer | ✅ | Must reference a valid class in DB |
| `date_of_birth` | date | ✅ | Format: `YYYY-MM-DD`; age 3–25 |
| `gender` | enum | ✅ | `male`, `female`, or `other` |

---

### 4.2 Validation Layer (Zod)

```ts
// server/services/import/validators.ts
import { z } from 'zod';

const cnicRegex = /^\d{5}-\d{7}-\d{1}$/;

export const FamilyRowSchema = z.object({
  cnic_number:   z.string().regex(cnicRegex, 'Invalid CNIC format (XXXXX-XXXXXXX-X)'),
  guardian_name: z.string().min(2,  'Guardian name too short'),
  phone:         z.string().min(10, 'Invalid phone number'),
  email:         z.string().email( 'Invalid email address'),
  address:       z.string().min(5,  'Address too short'),
  city:          z.string().min(1,  'City is required'),
});

export const StudentRowSchema = z.object({
  first_name:    z.string().min(2, 'First name too short'),
  last_name:     z.string().min(2, 'Last name too short'),
  family_cnic:   z.string().regex(cnicRegex, 'Invalid family CNIC format'),
  class_id:      z.string().regex(/^\d+$/, 'class_id must be a number'),
  date_of_birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD format'),
  gender:        z.enum(['male', 'female', 'other'], {
                   errorMap: () => ({ message: "Must be 'male', 'female', or 'other'" }),
                 }),
});

export function validateFamilyRows(rows: unknown[]): ValidationResult<FamilyRow> {
  return validateRows(rows, FamilyRowSchema);
}

export function validateStudentRows(rows: unknown[]): ValidationResult<StudentRow> {
  return validateRows(rows, StudentRowSchema);
}

function validateRows<T>(rows: unknown[], schema: z.ZodSchema<T>): ValidationResult<T> {
  const valid:  T[]         = [];
  const errors: RowError[]  = [];

  rows.forEach((row, index) => {
    const result = schema.safeParse(row);
    if (result.success) {
      valid.push(result.data);
    } else {
      result.error.errors.forEach((err) => {
        errors.push({
          row:    index + 2,
          field:  err.path[0] as string,
          value:  (row as Record<string, string>)[err.path[0] as string] ?? '',
          reason: err.message,
        });
      });
    }
  });

  return { valid, errors };
}
```

---

### 4.3 Duplicate Detection

```ts
// Within the service layer, before transaction
async function checkDuplicateEmails(emails: string[], tx: typeof db): Promise<Set<string>> {
  const existing = await tx
    .select({ email: families.email })
    .from(families)
    .where(inArray(families.email, emails));

  return new Set(existing.map(r => r.email));
}
```

Duplicate rows in the **same file** are detected by grouping by CNIC/email before insertion. The first occurrence is imported; subsequent duplicates are marked as `skipped`.

---

### 4.4 Frontend Error Display

```tsx
// components/import/ValidationErrorList.tsx
export function ValidationErrorList({ errors }: { errors: RowError[] }) {
  if (!errors.length) return null;

  return (
    <div className="mt-4 rounded-md border border-red-800 bg-red-950/30 p-4">
      <p className="mb-2 font-semibold text-red-400">
        {errors.length} row(s) have errors and will be skipped:
      </p>
      <div className="max-h-48 overflow-y-auto space-y-1">
        {errors.map((err, i) => (
          <p key={i} className="text-sm text-red-300">
            Row {err.row} · <span className="font-mono">{err.field}</span>:&nbsp;
            <span className="text-red-400">"{err.value}"</span> — {err.reason}
          </p>
        ))}
      </div>
    </div>
  );
}
```

---

## 5. Database Schema (Drizzle ORM)

```ts
// server/db/schema/families.ts
export const families = pgTable('families', {
  id:           serial('id').primaryKey(),
  cnicNumber:   varchar('cnic_number', { length: 15 }).notNull().unique(),
  guardianName: varchar('guardian_name', { length: 120 }).notNull(),
  phone:        varchar('phone', { length: 20 }).notNull(),
  email:        varchar('email', { length: 120 }).notNull().unique(),
  address:      text('address').notNull(),
  city:         varchar('city', { length: 60 }).notNull(),
  createdAt:    timestamp('created_at').defaultNow(),
});

// server/db/schema/students.ts
export const students = pgTable('students', {
  id:          serial('id').primaryKey(),
  firstName:   varchar('first_name', { length: 80 }).notNull(),
  lastName:    varchar('last_name', { length: 80 }).notNull(),
  familyId:    integer('family_id').notNull()
               .references(() => families.id, { onDelete: 'cascade' }),
  classId:     integer('class_id').notNull()
               .references(() => classes.id),
  dateOfBirth: date('date_of_birth').notNull(),
  gender:      varchar('gender', { length: 10 }).notNull(),
  createdAt:   timestamp('created_at').defaultNow(),
});
```

> **Migration**: Run `drizzle-kit generate:pg` then `drizzle-kit push:pg` after schema changes.

---

## 6. Implementation Roadmap

### Phase 1 — Foundation (Day 1–2)

- [ ] Add `multer` and `papaparse` / `xlsx` dependencies
- [ ] Create Drizzle schema for `families` and `students` (if not existing)
- [ ] Generate and run DB migration
- [ ] Build `fileParser.ts` utility (CSV + Excel)
- [ ] Define `ImportResponse` and `RowError` TypeScript interfaces

### Phase 2 — Backend Services (Day 3–4)

- [ ] Implement `validators.ts` with Zod schemas for both entity types
- [ ] Implement `familyImporter.ts` with CNIC upsert logic
- [ ] Implement `studentImporter.ts` with FK resolution via CNIC map
- [ ] Implement `import.service.ts` orchestrator with full transaction wrapping
- [ ] Wire up Express routes with multer middleware

### Phase 3 — Frontend Components (Day 5–6)

- [ ] Build `<FileDropZone>` component (react-dropzone)
- [ ] Build `<PreviewTable>` showing first 10 rows with column headers
- [ ] Build `<ValidationErrorList>` for row-level error display
- [ ] Build `<ImportResultSummary>` for post-upload success/failure counts
- [ ] Build `<BulkImportModal>` composing all above with tab switching
- [ ] Add `useBulkImport` React Query mutation hook
- [ ] Wire "Bulk Import" button to modal in Student Management page header
- [ ] Implement sample CSV download via `downloadSampleCsv()` utility

### Phase 4 — Integration & QA (Day 7–8)

- [ ] E2E test: upload valid families CSV → verify DB rows
- [ ] E2E test: upload students CSV referencing valid CNICs → verify FK links
- [ ] E2E test: upload students without families → verify error response
- [ ] Test duplicate CNIC handling (skip, not error)
- [ ] Test file size limit enforcement (>5MB rejection)
- [ ] Test invalid file type rejection (PDF, image)
- [ ] Test partial failure: some valid rows + some invalid rows

### Phase 5 — Polish (Day 9)

- [ ] Add progress indicator for large files (streaming upload)
- [ ] Add audit log entry on successful import (who imported, when, count)
- [ ] Add rate limiting on import endpoints (prevent abuse)
- [ ] Document sample CSV format in `/public/samples/`

---

## 7. Security Considerations

| Risk | Mitigation |
|------|-----------|
| Malicious file upload | `multer` fileFilter checks mimetype; server-side re-validation |
| CSV injection | Sanitize cell values; strip leading `=`, `+`, `-`, `@` from string fields |
| File size abuse | 5 MB hard limit in multer config |
| Unauthorized access | Route protected behind `requireRole('admin')` middleware |
| SQL injection via CSV data | Drizzle ORM parameterized queries — no raw SQL |
| Large batch DoS | Max row count cap (e.g., 1000 rows per upload) enforced in service layer |

---

## 8. Folder Structure Summary

```
school-nexus/
├── client/
│   └── src/
│       ├── components/
│       │   └── import/
│       │       ├── BulkImportModal.tsx
│       │       ├── FileDropZone.tsx
│       │       ├── PreviewTable.tsx
│       │       ├── ValidationErrorList.tsx
│       │       └── ImportResultSummary.tsx
│       ├── hooks/
│       │   └── useBulkImport.ts
│       └── lib/
│           └── import/
│               └── previewParser.ts
│               └── sampleCsv.ts
└── server/
    ├── routes/
    │   └── import.routes.ts
    ├── services/
    │   ├── import.service.ts
    │   └── import/
    │       ├── fileParser.ts
    │       ├── familyImporter.ts
    │       ├── studentImporter.ts
    │       └── validators.ts
    └── db/
        └── schema/
            ├── families.ts
            └── students.ts
```

---

*Generated for School-Nexus — Senior Full-Stack Implementation Plan v1.0*
