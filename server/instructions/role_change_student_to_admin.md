# Developer Instruction: Changing a User's Role from `student` to `admin`

## Overview

This document describes the procedure for changing a user's role from `student` to `admin` in the `users` table. The operation must nullify student-specific fields, clean up dependent records, and follow the Drizzle ORM patterns established in this project (see `implement_plan_aggregation.md` for schema context).

---

## 1. Schema Context (`shared/schema.ts`)

The `users` table (`shared/schema.ts:116`) includes fields that are meaningful only for the `student` role:

| Field | Type | Description |
|---|---|---|
| `className` | `text("class_name")` | Free-text class assignment (no FK to `classes`) |
| `studentStatus` | `text("student_status")` | e.g. `"active"`, `"graduated"`, `"transferred"` |
| `rollNumber` | `text("roll_number")` | Student roll number |
| `fatherName` | `text("father_name")` | Parent/guardian name |
| `studentPhotoUrl` | `text("student_photo_url")` | Student photo |
| `dateOfBirth` | `text("date_of_birth")` | Date of birth |
| `gender` | `text("gender")` | Gender |
| `admissionDate` | `text("admission_date")` | Admission date |
| `familyId` | `integer("family_id")` → `families.id` | Family group FK |

A separate `students` table (`shared/schema.ts:153`) mirrors `users.class_name` via `syncRoleProfiles()` (`server/storage.ts:1049`).

---

## 2. Procedure

### Step 1 — Nullify Student-Specific Fields

Use `db.update()` with Drizzle ORM to set the role to `'admin'` and nullify all student-only columns:

```typescript
import { db } from "./server/db";
import { users } from "./shared/schema";
import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";

async function changeStudentToAdmin(userId: number): Promise<void> {
  await db.update(users)
    .set({
      role: "admin",
      className: null,
      studentStatus: null,
      rollNumber: null,
      fatherName: null,
      studentPhotoUrl: null,
      dateOfBirth: null,
      gender: null,
      admissionDate: null,
      familyId: null,
    })
    .where(eq(users.id, userId));
}
```

**⚠️ Warning**: Setting `familyId = null` breaks the link to the `families` table. If the user shares a `familyId` with other active students, consider setting `familyId = null` only after confirming no sibling records depend on it.

### Step 2 — Clean Up the `students` Table

Call `syncRoleProfiles()` (`server/storage.ts:1049`). This method runs:

```sql
DELETE FROM students
USING users
WHERE students.user_id = users.id
  AND users.role <> 'student';
```

This removes the orphaned row from `students`. If using `storage.ts`'s existing `updateUser()` method, this cleanup happens automatically (see `server/storage.ts:1177-1181`).

### Step 3 — Handle Historical Finance Records

The `fees` and `fee_payments` tables reference `users.id` via `student_id` foreign keys. These rows **must NOT be deleted** — they constitute the historical audit trail required by the aggregation views (`monthly_fee_summary`, `daily_fee_collection_report`, `overdue_fees_snapshot`). The views filter by `u.role = 'student'` at query time, so historical records for a now-admin user will simply stop appearing in student-role reports.

If the user's fee/payment history must remain visible for accounting, confirm that the reporting layer filters on `role` rather than relying on the current role remaining `'student'`.

### Step 4 — Verify

1. Confirm `users.role = 'admin'` for the target user ID.
2. Confirm student-specific columns are `NULL`.
3. Confirm `students` table no longer has a row for this user ID.

---

## 3. Complete Example (Recommended)

Use the existing `storage.ts` facade to guarantee `syncRoleProfiles()` is called:

```typescript
import { storage } from "./server/storage";

async function promoteToAdmin(userId: number): Promise<void> {
  const updated = await storage.updateUser(userId, {
    role: "admin",
    className: null,
    studentStatus: null,
    rollNumber: null,
    fatherName: null,
    studentPhotoUrl: null,
    dateOfBirth: null,
    gender: null,
    admissionDate: null,
    familyId: null,
  });

  if (!updated) {
    throw new Error(`User ${userId} not found or update failed.`);
  }

  console.log(`User ${updated.name} (ID ${updated.id}) promoted to admin.`);
}
```

The `updateUser()` method (`server/storage.ts:1177`) runs `syncRoleProfiles()` after the update, which removes the orphaned `students` row automatically.

---

## 4. Related Records — Additional Considerations

### `fee_payments` (receipt numbers, payment methods)
- **Action**: Leave untouched. Historical payments remain valid for accounting.

### `fees` (invoices, billing periods)
- **Action**: Leave untouched. The aggregation views will exclude these rows because the user's role is no longer `'student'`.

### `attendance`
- **Action**: Orphaned attendance rows for this user ID remain. Evaluate whether to delete them or keep for historical analytics.

### `academic_records` / `class_transitions` / `promotion_history`
- **Action**: These tables use FK to `users.id` (not role-dependent). Retain rows for the academic audit trail.

### `classTeachers` / `academics`
- **Action**: These tables reference `users.id` for teacher assignments, not student records, so they are unaffected.
