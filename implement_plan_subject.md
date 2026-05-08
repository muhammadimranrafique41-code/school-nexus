# Subject Management System — Implementation Plan

## Overview

This document outlines the technical strategy for migrating from the current "stream" implementation (a misused column on the `classes` table) to a dedicated **Subject** management system. The goal is to provide a clean, first-class CRUD interface for school subjects while decoupling class definitions from stream identifiers.

---

## 1. Problem Statement

The `classes` table currently has a `stream` column (`text`, nullable) that was historically used to store subject-like identifiers (e.g., "Urdu", "Computer", "Chemistry"). This caused:

- Ambiguous class naming (e.g., "Grade-9 A - Urdu" vs "Grade-9 A")
- Student `class_name` mismatches in the database
- No canonical subject registry — subjects were free-text strings scattered across multiple tables

---

## 2. Target Architecture

```
subjects (new table)
  id          serial PK
  name        text NOT NULL UNIQUE   — e.g. "Mathematics"
  code        text UNIQUE            — e.g. "MATH-101" (optional)
  description text                   — optional long description
  createdAt   timestamp

classes (modified)
  id, grade, section, academicYear, capacity, currentCount,
  homeroomTeacherId, status
  ← stream column DROPPED
  ← unique index rebuilt on (grade, section, academicYear)
```

---

## 3. Database Schema Changes (Drizzle ORM)

### 3.1 New `subjects` Table — `shared/schema.ts`

```ts
export const subjects = pgTable("subjects", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  code: text("code"),
  description: text("description"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  uniqueNameIdx: uniqueIndex("subjects_name_idx").on(table.name),
  uniqueCodeIdx: uniqueIndex("subjects_code_idx").on(table.code),
}));
```

### 3.2 Modified `classes` Table

- Remove `stream` column
- Rebuild unique index: `(grade, section, academicYear)` — no stream

---

## 4. Migration File

**`migrations/0021_subjects_and_drop_stream.sql`**

```sql
-- Create subjects table
CREATE TABLE IF NOT EXISTS "subjects" (
  "id" serial PRIMARY KEY,
  "name" text NOT NULL,
  "code" text,
  "description" text,
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "subjects_name_idx" ON "subjects" ("name");
CREATE UNIQUE INDEX IF NOT EXISTS "subjects_code_idx" ON "subjects" ("code") WHERE "code" IS NOT NULL;

-- Drop stream from classes
ALTER TABLE "classes" DROP COLUMN IF EXISTS "stream";
DROP INDEX IF EXISTS "classes_grade_section_stream_year_idx";
CREATE UNIQUE INDEX IF NOT EXISTS "classes_grade_section_year_idx"
  ON "classes" ("grade", "section", "academic_year");
```

---

## 5. Backend API Endpoints

All endpoints are under `/api/v1/subjects` and require admin authentication.

| Method | Path                    | Description              |
|--------|-------------------------|--------------------------|
| GET    | `/api/v1/subjects`      | List all subjects        |
| POST   | `/api/v1/subjects`      | Create a new subject     |
| PUT    | `/api/v1/subjects/:id`  | Update a subject         |
| DELETE | `/api/v1/subjects/:id`  | Delete a subject         |

### Request/Response Schemas

**POST / PUT body:**
```json
{ "name": "Mathematics", "code": "MATH-101", "description": "Core mathematics curriculum" }
```

**GET response:**
```json
[{ "id": 1, "name": "Mathematics", "code": "MATH-101", "description": "...", "createdAt": "..." }]
```

---

## 6. Service Layer

**`server/services/subjectService.ts`**

- `listSubjects()` — returns all subjects ordered by name
- `createSubject(input)` — validates uniqueness, inserts
- `updateSubject(id, input)` — validates uniqueness, updates
- `deleteSubject(id)` — deletes (with guard if subject is referenced)

---

## 7. Frontend Component Hierarchy

```
/admin/subjects  (new page)
└── AdminSubjects (client/src/pages/admin/subjects.tsx)
    ├── KPI strip (total subjects count)
    ├── SubjectTable — searchable data table
    │   └── SubjectRow — inline edit/delete actions
    ├── CreateSubjectDialog — Dialog with form (name, code, description)
    └── EditSubjectDialog — Dialog with pre-filled form

Sidebar: "Subjects" added under Management section
App.tsx: Route /admin/subjects → AdminSubjects
```

### React Query Hooks — `client/src/hooks/use-subjects.ts`

- `useSubjects()` — GET /api/v1/subjects
- `useCreateSubject()` — POST mutation
- `useUpdateSubject()` — PUT mutation
- `useDeleteSubject()` — DELETE mutation

---

## 8. Class Page Refactor

**`client/src/pages/admin/classes.tsx`** changes:
- Remove "Stream" column from table header and row cells
- Remove `stream` field from `CreateClassSchema` form
- Remove `stream` from `defaultValues` and `form.reset()`
- Remove stream from the summary preview chip
- Update page subtitle text

**`lib/validators/classes.ts`** changes:
- Remove `stream` field from `CreateClassSchema`

**`shared/routes.ts`** changes:
- Remove `stream` from `classSchema`

---

## 9. Type Safety Checklist

- [ ] `shared/schema.ts` — `classes` table type no longer has `stream`
- [ ] `shared/routes.ts` — `classSchema` no longer has `stream`
- [ ] `lib/validators/classes.ts` — `CreateClassSchema` no longer has `stream`
- [ ] `server/routes.ts` — class creation handler no longer reads `stream`
- [ ] `client/src/pages/admin/classes.tsx` — no `stream` references
- [ ] All `classLabel()` / `buildClassLabel()` functions already updated (previous fix)

---

## 10. Rollout Order

1. `shared/schema.ts` — add `subjects` table, remove `stream` from `classes`
2. `migrations/0021_subjects_and_drop_stream.sql` — DDL migration
3. `server/services/subjectService.ts` — service layer
4. `shared/routes.ts` — add subject API definitions, update classSchema
5. `server/routes.ts` — register subject routes
6. `lib/validators/classes.ts` — remove stream from validator
7. `client/src/hooks/use-subjects.ts` — React Query hooks
8. `client/src/pages/admin/subjects.tsx` — new admin page
9. `client/src/pages/admin/classes.tsx` — remove stream UI
10. `client/src/App.tsx` — add /admin/subjects route
11. `client/src/components/app-sidebar.tsx` — add Subjects nav item
