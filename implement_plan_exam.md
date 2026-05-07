# School-Nexus — Examination Management Module
## Complete Implementation Plan (Pakistani Curriculum System)

> **Document Version:** 2.0  
> **Prepared by:** Senior Full-Stack Architect  
> **Target System:** School-Nexus SMS (TypeScript · Drizzle ORM · React 18 · Shadcn/ui)  
> **Standard:** Punjab / Federal Board Academic Calendar & Grading Norms  
> **Last Updated:** 2025

---

## Table of Contents

1. [Pakistani Examination System Overview](#1-pakistani-examination-system-overview)
2. [Architecture Decision Records](#2-architecture-decision-records)
3. [Database Schema (Module 1)](#3-database-schema--module-1-)
4. [Service Layer (Module 2)](#4-service-layer--module-2-)
5. [API Endpoints (Module 3)](#5-api-endpoints--module-3-)
6. [PDF Marksheet Engine (Module 4)](#6-pdf-marksheet-engine--module-4-)
7. [AI Grounding Integration (Module 5)](#7-ai-grounding-integration--module-5-)
8. [Frontend Implementation (Module 6)](#8-frontend-implementation--module-6-)
9. [Mark Entry System (Module 7)](#9-mark-entry-system--module-7-)
10. [Full Codex AI Prompt](#10-full-codex-ai-prompt)
11. [Quality Gates & Checklist](#11-quality-gates--checklist)
12. [File Tree Reference](#12-file-tree-reference)

---

## 1. Pakistani Examination System Overview

### 1.1 Examination Calendar (Academic Year: April – March)

| Examination Type         | Code   | Months             | Weight | Scope                        |
|--------------------------|--------|--------------------|--------|------------------------------|
| Monthly Assessment Test  | `MAT`  | May–Nov (monthly)  | 10%    | Per-month syllabus only      |
| Half-Yearly Examination  | `HALF` | November/December  | 40%    | Syllabus: April – November   |
| Annual Examination       | `ANN`  | April/May          | 50%    | Full year syllabus           |

> Monthly tests are conducted up to 7 times per year. Only the best 5 scores count
> toward the final MAT aggregate (configurable per school).

### 1.2 Official Pakistani Grading Scale (FBISE / Punjab Board Standard)

| Grade | Min % | Max % | GPA Points | Division        |
|-------|-------|-------|------------|-----------------|
| A+    | 90    | 100   | 4.00       | Distinction     |
| A     | 80    | 89    | 3.75       | First Division  |
| B     | 70    | 79    | 3.25       | First Division  |
| C     | 60    | 69    | 2.75       | Second Division |
| D     | 50    | 59    | 2.25       | Third Division  |
| E     | 40    | 49    | 1.75       | Pass (Marginal) |
| F     | 0     | 39    | 0.00       | Fail            |

### 1.3 Standard Subjects by Level

**Primary (Class I–V):** Urdu, English, Mathematics, General Knowledge, Islamiat  
**Middle (Class VI–VIII):** Urdu, English, Mathematics, Science, Social Studies, Islamiat, Computer  
**Secondary (Class IX–X):** Urdu, English, Mathematics, Physics, Chemistry, Biology/Computer, Pak Studies, Islamiat

### 1.4 Marksheet Design Requirements (B&W Printer)

- A4 portrait, 1-inch margins all sides
- School letterhead (name, address, phone, logo placeholder — B&W outline)
- Hard borders — no shaded/filled cells (printer ink conservation)
- Student panel: Name, Father's Name, Roll No., Admission No., Class, Section
- Subject table: Sr. | Subject | Max Marks | Theory | Practical | Total | Grade | Remarks
- Result panel: Total Obtained | Total Max | Percentage | Grade | Division | Position
- Attendance panel: Total Days | Present | Absent | Percentage
- Signature strip: Class Teacher | Subject Teacher | Principal
- Stamp box: Official School Stamp (outlined rectangle)
- Two marksheets per A4 page for bulk printing (cut-and-give format)

---

## 2. Architecture Decision Records

### ADR-001: Separate `examSessions` table for exam cycles
**Decision:** Introduce `examSessions` as the parent entity that groups an exam type + academic year. Avoids repeating year/term data across 100s of exam entries.

### ADR-002: Theory + Practical split in `examSubjects`
**Decision:** Pakistani subjects (Science, Computer) have separate theory and practical components. Store `maxTheory` + `maxPractical` (nullable) rather than a single `maxMarks` to avoid a transformation layer at PDF time.

### ADR-003: MAT aggregation in the service layer, not the database
**Decision:** MAT best-of-N logic is business logic that changes per school. Keep raw monthly scores in DB; compute aggregates in `examService.computeMATAggregate()`. Cache result in Redis (or in-memory) for 30 minutes.

### ADR-004: PDF generation on the server, streamed to client
**Decision:** Use `puppeteer` (headless Chrome) to render HTML → PDF. Reasons: (a) full CSS control for B&W print styling, (b) Urdu text rendering support via system fonts, (c) no ReportLab coordinate math. PDF is streamed via `res.setHeader('Content-Type', 'application/pdf')`.

### ADR-005: Bulk mark entry via spreadsheet-style UI
**Decision:** Use `@tanstack/react-table` with inline editing (not a form per row). Keyboard navigation: Tab moves right, Enter moves down, Escape reverts cell. This matches how Pakistani school teachers already use Excel.

---

## 3. Database Schema (Module 1)

### File: `shared/schema.ts` — append after existing tables

```typescript
// ══════════════════════════════════════════════════════
// EXAMINATION MANAGEMENT — Pakistani Curriculum System
// ══════════════════════════════════════════════════════

import {
  pgTable, serial, text, integer, timestamp, numeric,
  boolean, uniqueIndex, index
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

// ── Grade Scale (FBISE / Punjab Board standard) ────────
export const gradeScales = pgTable('grade_scales', {
  id:             serial('id').primaryKey(),
  grade:          text('grade').notNull().unique(),       // "A+", "A", "B", …
  minPercentage:  numeric('min_percentage', { precision: 5, scale: 2 }).notNull(),
  maxPercentage:  numeric('max_percentage', { precision: 5, scale: 2 }).notNull(),
  gpaPoints:      numeric('gpa_points',     { precision: 3, scale: 2 }).notNull(),
  division:       text('division').notNull(),             // "First Division", "Fail" …
  isActive:       boolean('is_active').notNull().default(true),
});
export type SelectGradeScale = typeof gradeScales.$inferSelect;
export type InsertGradeScale = typeof gradeScales.$inferInsert;

// ── Academic Session (e.g., "2024-2025") ──────────────
export const academicSessions = pgTable('academic_sessions', {
  id:         serial('id').primaryKey(),
  name:       text('name').notNull().unique(),            // "2024-2025"
  startDate:  timestamp('start_date').notNull(),
  endDate:    timestamp('end_date').notNull(),
  isCurrent:  boolean('is_current').notNull().default(false),
  createdAt:  timestamp('created_at').notNull().defaultNow(),
});
export type SelectAcademicSession = typeof academicSessions.$inferSelect;
export type InsertAcademicSession = typeof academicSessions.$inferInsert;

// ── Exam Session (the exam event within an academic year) ──
export const examSessions = pgTable('exam_sessions', {
  id:                serial('id').primaryKey(),
  academicSessionId: integer('academic_session_id').notNull()
                       .references(() => academicSessions.id, { onDelete: 'restrict' }),
  classId:           integer('class_id').notNull()
                       .references(() => classes.id, { onDelete: 'cascade' }),
  examType:          text('exam_type').notNull(),
                     // "MAT" | "HALF_YEARLY" | "ANNUAL"
  monthLabel:        text('month_label'),
                     // For MAT only: "September 2024", "October 2024", …
  title:             text('title').notNull(),
                     // "Monthly Test — October 2024" / "Half-Yearly Exam 2024"
  startDate:         timestamp('start_date').notNull(),
  endDate:           timestamp('end_date').notNull(),
  totalMarks:        integer('total_marks').notNull(),
  passingMarks:      integer('passing_marks').notNull(),
  isResultDeclared:  boolean('is_result_declared').notNull().default(false),
  declaredAt:        timestamp('declared_at'),
  createdBy:         integer('created_by').notNull()
                       .references(() => users.id, { onDelete: 'restrict' }),
  createdAt:         timestamp('created_at').notNull().defaultNow(),
  updatedAt:         timestamp('updated_at').notNull().defaultNow(),
}, (t) => ({
  uniqueSessionPerClass: uniqueIndex('uq_exam_session').on(
    t.academicSessionId, t.classId, t.examType, t.monthLabel
  ),
  classIdx: index('idx_exam_session_class').on(t.classId),
}));
export type SelectExamSession = typeof examSessions.$inferSelect;
export type InsertExamSession = typeof examSessions.$inferInsert;

// ── Exam Subjects (one per subject within a session) ──
export const examSubjects = pgTable('exam_subjects', {
  id:              serial('id').primaryKey(),
  examSessionId:   integer('exam_session_id').notNull()
                     .references(() => examSessions.id, { onDelete: 'cascade' }),
  subjectName:     text('subject_name').notNull(),
  subjectCode:     text('subject_code'),               // optional FBISE code
  maxTheoryMarks:  integer('max_theory_marks').notNull(),
  maxPracticalMarks: integer('max_practical_marks').notNull().default(0),
  examDate:        timestamp('exam_date').notNull(),
  examTime:        text('exam_time'),                  // "08:00 AM – 10:00 AM"
  venue:           text('venue'),
  sortOrder:       integer('sort_order').notNull().default(0),
}, (t) => ({
  sessionIdx: index('idx_exam_subject_session').on(t.examSessionId),
}));
export type SelectExamSubject = typeof examSubjects.$inferSelect;
export type InsertExamSubject = typeof examSubjects.$inferInsert;

// ── Exam Marks (per student per subject) ──────────────
export const examMarks = pgTable('exam_marks', {
  id:                serial('id').primaryKey(),
  examSubjectId:     integer('exam_subject_id').notNull()
                       .references(() => examSubjects.id, { onDelete: 'cascade' }),
  studentId:         integer('student_id').notNull()
                       .references(() => users.id, { onDelete: 'cascade' }),
  theoryMarks:       numeric('theory_marks',    { precision: 5, scale: 2 }),
  practicalMarks:    numeric('practical_marks', { precision: 5, scale: 2 }),
  totalObtained:     numeric('total_obtained',  { precision: 5, scale: 2 }),
  grade:             text('grade'),
  isAbsent:          boolean('is_absent').notNull().default(false),
  isExempted:        boolean('is_exempted').notNull().default(false),
  remarks:           text('remarks'),
  enteredBy:         integer('entered_by').references(() => users.id),
  enteredAt:         timestamp('entered_at').notNull().defaultNow(),
  updatedAt:         timestamp('updated_at').notNull().defaultNow(),
}, (t) => ({
  uniqueMark: uniqueIndex('uq_exam_mark').on(t.examSubjectId, t.studentId),
  studentIdx: index('idx_exam_marks_student').on(t.studentId),
}));
export type SelectExamMark = typeof examMarks.$inferSelect;
export type InsertExamMark = typeof examMarks.$inferInsert;

// ── Student Attendance per Exam Session ───────────────
export const examAttendance = pgTable('exam_attendance', {
  id:              serial('id').primaryKey(),
  examSessionId:   integer('exam_session_id').notNull()
                     .references(() => examSessions.id, { onDelete: 'cascade' }),
  studentId:       integer('student_id').notNull()
                     .references(() => users.id, { onDelete: 'cascade' }),
  totalDays:       integer('total_days').notNull().default(0),
  presentDays:     integer('present_days').notNull().default(0),
}, (t) => ({
  uniqueAttendance: uniqueIndex('uq_exam_attendance').on(t.examSessionId, t.studentId),
}));
export type SelectExamAttendance = typeof examAttendance.$inferSelect;
export type InsertExamAttendance = typeof examAttendance.$inferInsert;

// ── Drizzle Relations ──────────────────────────────────
export const examSessionsRelations = relations(examSessions, ({ one, many }) => ({
  academicSession: one(academicSessions, {
    fields: [examSessions.academicSessionId],
    references: [academicSessions.id],
  }),
  class:     one(classes,  { fields: [examSessions.classId],   references: [classes.id] }),
  createdBy: one(users,    { fields: [examSessions.createdBy], references: [users.id] }),
  subjects:  many(examSubjects),
  attendance: many(examAttendance),
}));

export const examSubjectsRelations = relations(examSubjects, ({ one, many }) => ({
  examSession: one(examSessions, {
    fields: [examSubjects.examSessionId],
    references: [examSessions.id],
  }),
  marks: many(examMarks),
}));

export const examMarksRelations = relations(examMarks, ({ one }) => ({
  subject:   one(examSubjects, { fields: [examMarks.examSubjectId], references: [examSubjects.id] }),
  student:   one(users,        { fields: [examMarks.studentId],     references: [users.id] }),
  enteredBy: one(users,        { fields: [examMarks.enteredBy],     references: [users.id] }),
}));
```

### Seed Data: Default Grade Scale

```typescript
// server/db/seeds/gradeScaleSeed.ts
export const defaultGradeScales = [
  { grade: 'A+', minPercentage: '90', maxPercentage: '100', gpaPoints: '4.00', division: 'Distinction' },
  { grade: 'A',  minPercentage: '80', maxPercentage: '89',  gpaPoints: '3.75', division: 'First Division' },
  { grade: 'B',  minPercentage: '70', maxPercentage: '79',  gpaPoints: '3.25', division: 'First Division' },
  { grade: 'C',  minPercentage: '60', maxPercentage: '69',  gpaPoints: '2.75', division: 'Second Division' },
  { grade: 'D',  minPercentage: '50', maxPercentage: '59',  gpaPoints: '2.25', division: 'Third Division' },
  { grade: 'E',  minPercentage: '40', maxPercentage: '49',  gpaPoints: '1.75', division: 'Pass' },
  { grade: 'F',  minPercentage: '0',  maxPercentage: '39',  gpaPoints: '0.00', division: 'Fail' },
];
```

---

## 4. Service Layer (Module 2)

### File: `server/services/examService.ts`

```typescript
// ══════════════════════════════════════════════════════
// Exam Service — Pakistani Curriculum Business Logic
// ══════════════════════════════════════════════════════

import { db } from '../db';
import { eq, and, gt, lte, desc, asc, sql, inArray } from 'drizzle-orm';
import {
  examSessions, examSubjects, examMarks, examAttendance,
  gradeScales, academicSessions, users
} from '../../shared/schema';
import { AppError, ValidationError } from '../errors';

// ── Types ─────────────────────────────────────────────

export interface CreateExamSessionPayload {
  academicSessionId: number;
  classId:           number;
  examType:          'MAT' | 'HALF_YEARLY' | 'ANNUAL';
  monthLabel?:       string;
  title:             string;
  startDate:         Date;
  endDate:           Date;
  totalMarks:        number;
  passingMarks:      number;
  createdBy:         number;
  subjects: {
    subjectName:       string;
    subjectCode?:      string;
    maxTheoryMarks:    number;
    maxPracticalMarks?: number;
    examDate:          Date;
    examTime?:         string;
    venue?:            string;
    sortOrder?:        number;
  }[];
}

export interface MarkEntryItem {
  studentId:       number;
  theoryMarks?:    number;
  practicalMarks?: number;
  isAbsent?:       boolean;
  isExempted?:     boolean;
  remarks?:        string;
}

export interface ExamStatistics {
  examSessionId:   number;
  totalStudents:   number;
  appeared:        number;
  absent:          number;
  classAverage:    number;
  highestMarks:    number;
  lowestMarks:     number;
  passCount:       number;
  failCount:       number;
  passRate:        number;
  gradeDistribution: Record<string, number>;
  topThree: { rank: number; studentId: number; name: string; obtained: number; percentage: number; grade: string }[];
  subjectAverages: { subjectName: string; average: number; highest: number; lowest: number }[];
}

export interface MATAggregate {
  studentId:       number;
  name:            string;
  monthlyScores:   { month: string; obtained: number; maxMarks: number; percentage: number }[];
  bestNScores:     number[];           // best-5 percentages
  aggregateMarks:  number;             // out of 50 (configurable)
}

export interface StudentMarksheetData {
  student: {
    id:          number;
    name:        string;
    fatherName:  string;
    rollNo:      string;
    admissionNo: string;
    className:   string;
    section:     string;
  };
  examSession: {
    title:      string;
    examType:   string;
    academicYear: string;
  };
  subjects: {
    sr:            number;
    subjectName:   string;
    subjectCode:   string | null;
    maxTheory:     number;
    maxPractical:  number;
    maxTotal:      number;
    theoryObtained:    number | null;
    practicalObtained: number | null;
    totalObtained:     number | null;
    grade:         string | null;
    isAbsent:      boolean;
    isExempted:    boolean;
    remarks:       string | null;
  }[];
  result: {
    totalMaxMarks:    number;
    totalObtained:    number;
    percentage:       number;
    grade:            string;
    division:         string;
    gpaPoints:        number;
    positionInClass:  number;
    isPassed:         boolean;
  };
  attendance: {
    totalDays:    number;
    presentDays:  number;
    absentDays:   number;
    percentage:   number;
  } | null;
}

// ── createExamSession ─────────────────────────────────

export async function createExamSession(
  payload: CreateExamSessionPayload
): Promise<SelectExamSession> {
  return db.transaction(async (tx) => {
    // Guard: no duplicate for same class+type+month
    const existing = await tx
      .select({ id: examSessions.id })
      .from(examSessions)
      .where(and(
        eq(examSessions.academicSessionId, payload.academicSessionId),
        eq(examSessions.classId,           payload.classId),
        eq(examSessions.examType,          payload.examType),
        payload.monthLabel
          ? eq(examSessions.monthLabel, payload.monthLabel)
          : sql`${examSessions.monthLabel} IS NULL`,
      ))
      .limit(1);

    if (existing.length > 0) {
      throw new AppError(
        `An exam session of type "${payload.examType}" already exists for this class.`,
        'DUPLICATE_EXAM_SESSION', 409
      );
    }

    const [session] = await tx
      .insert(examSessions)
      .values({
        academicSessionId: payload.academicSessionId,
        classId:           payload.classId,
        examType:          payload.examType,
        monthLabel:        payload.monthLabel,
        title:             payload.title,
        startDate:         payload.startDate,
        endDate:           payload.endDate,
        totalMarks:        payload.totalMarks,
        passingMarks:      payload.passingMarks,
        createdBy:         payload.createdBy,
      })
      .returning();

    const subjectRows = payload.subjects.map((s, idx) => ({
      examSessionId:    session.id,
      subjectName:      s.subjectName,
      subjectCode:      s.subjectCode ?? null,
      maxTheoryMarks:   s.maxTheoryMarks,
      maxPracticalMarks: s.maxPracticalMarks ?? 0,
      examDate:         s.examDate,
      examTime:         s.examTime ?? null,
      venue:            s.venue ?? null,
      sortOrder:        s.sortOrder ?? idx,
    }));

    await tx.insert(examSubjects).values(subjectRows);
    return session;
  });
}

// ── getGradeFromPercentage ────────────────────────────

export async function getGradeFromPercentage(
  percentage: number
): Promise<{ grade: string; division: string; gpaPoints: number }> {
  const scales = await db
    .select()
    .from(gradeScales)
    .where(and(
      lte(gradeScales.minPercentage, String(percentage)),
      gt(gradeScales.maxPercentage,  String(percentage - 0.001)),
    ))
    .orderBy(desc(gradeScales.minPercentage))
    .limit(1);

  if (!scales.length) {
    throw new AppError(
      'No grade scale configured for this percentage range. Please seed gradeScales.',
      'GRADE_SCALE_MISSING', 500
    );
  }

  return {
    grade:     scales[0].grade,
    division:  scales[0].division,
    gpaPoints: Number(scales[0].gpaPoints),
  };
}

// ── bulkUpsertMarks ──────────────────────────────────

export async function bulkUpsertMarks(
  examSubjectId: number,
  entries:       MarkEntryItem[],
  enteredBy:     number
): Promise<{ updated: number; errors: { studentId: number; message: string }[] }> {
  const subject = await db
    .select()
    .from(examSubjects)
    .where(eq(examSubjects.id, examSubjectId))
    .limit(1);

  if (!subject.length) {
    throw new AppError('Exam subject not found.', 'SUBJECT_NOT_FOUND', 404);
  }

  const { maxTheoryMarks, maxPracticalMarks } = subject[0];
  const validationErrors: { studentId: number; message: string }[] = [];

  // Validate all entries before writing any
  for (const entry of entries) {
    if (!entry.isAbsent && !entry.isExempted) {
      if (entry.theoryMarks !== undefined && entry.theoryMarks > maxTheoryMarks) {
        validationErrors.push({
          studentId: entry.studentId,
          message: `Theory marks ${entry.theoryMarks} exceed maximum ${maxTheoryMarks}.`,
        });
      }
      if (entry.practicalMarks !== undefined && entry.practicalMarks > maxPracticalMarks) {
        validationErrors.push({
          studentId: entry.studentId,
          message: `Practical marks ${entry.practicalMarks} exceed maximum ${maxPracticalMarks}.`,
        });
      }
    }
  }

  if (validationErrors.length > 0) {
    throw new ValidationError('Mark entry validation failed.', validationErrors);
  }

  let updated = 0;

  await db.transaction(async (tx) => {
    for (const entry of entries) {
      const totalObtained = entry.isAbsent || entry.isExempted
        ? null
        : ((entry.theoryMarks ?? 0) + (entry.practicalMarks ?? 0));

      const totalMax = maxTheoryMarks + maxPracticalMarks;
      const percentage = totalObtained !== null && totalMax > 0
        ? (totalObtained / totalMax) * 100
        : 0;

      let grade: string | null = null;
      if (totalObtained !== null) {
        const gradeResult = await getGradeFromPercentage(percentage);
        grade = gradeResult.grade;
      }

      await tx
        .insert(examMarks)
        .values({
          examSubjectId,
          studentId:      entry.studentId,
          theoryMarks:    entry.theoryMarks   !== undefined ? String(entry.theoryMarks)    : null,
          practicalMarks: entry.practicalMarks !== undefined ? String(entry.practicalMarks) : null,
          totalObtained:  totalObtained !== null ? String(totalObtained) : null,
          grade,
          isAbsent:    entry.isAbsent    ?? false,
          isExempted:  entry.isExempted  ?? false,
          remarks:     entry.remarks     ?? null,
          enteredBy,
          updatedAt:   new Date(),
        })
        .onConflictDoUpdate({
          target: [examMarks.examSubjectId, examMarks.studentId],
          set: {
            theoryMarks:    sql`excluded.theory_marks`,
            practicalMarks: sql`excluded.practical_marks`,
            totalObtained:  sql`excluded.total_obtained`,
            grade:          sql`excluded.grade`,
            isAbsent:       sql`excluded.is_absent`,
            isExempted:     sql`excluded.is_exempted`,
            remarks:        sql`excluded.remarks`,
            enteredBy:      sql`excluded.entered_by`,
            updatedAt:      sql`excluded.updated_at`,
          },
        });
      updated++;
    }
  });

  return { updated, errors: [] };
}

// ── calculateExamStatistics ───────────────────────────

export async function calculateExamStatistics(
  examSessionId: number
): Promise<ExamStatistics> {
  const session = await db
    .select()
    .from(examSessions)
    .where(eq(examSessions.id, examSessionId))
    .limit(1);

  if (!session.length) throw new AppError('Exam session not found.', 'NOT_FOUND', 404);

  const subjects = await db
    .select()
    .from(examSubjects)
    .where(eq(examSubjects.examSessionId, examSessionId));

  const subjectIds = subjects.map(s => s.id);

  // Aggregate per student
  const rawMarks = await db
    .select({
      studentId:    examMarks.studentId,
      studentName:  users.name,
      totalObtained: examMarks.totalObtained,
      isAbsent:     examMarks.isAbsent,
      subjectId:    examMarks.examSubjectId,
    })
    .from(examMarks)
    .innerJoin(users, eq(examMarks.studentId, users.id))
    .where(inArray(examMarks.examSubjectId, subjectIds));

  // Group by student
  const studentMap = new Map<number, { name: string; total: number; absent: boolean }>();
  for (const mark of rawMarks) {
    if (!studentMap.has(mark.studentId)) {
      studentMap.set(mark.studentId, { name: mark.studentName, total: 0, absent: false });
    }
    const rec = studentMap.get(mark.studentId)!;
    if (mark.isAbsent) rec.absent = true;
    rec.total += Number(mark.totalObtained ?? 0);
  }

  const totalMax = subjects.reduce((a, s) => a + s.maxTheoryMarks + s.maxPracticalMarks, 0);
  const students = Array.from(studentMap.entries()).map(([id, v]) => ({
    studentId:  id,
    name:       v.name,
    obtained:   v.total,
    absent:     v.absent,
    percentage: totalMax > 0 ? Math.round((v.total / totalMax) * 10000) / 100 : 0,
  }));

  const appeared = students.filter(s => !s.absent);
  const passed   = appeared.filter(s => s.obtained >= session[0].passingMarks);

  // Grade distribution
  const gradeDistribution: Record<string, number> = {};
  for (const s of appeared) {
    const g = (await getGradeFromPercentage(s.percentage)).grade;
    gradeDistribution[g] = (gradeDistribution[g] ?? 0) + 1;
  }

  const sorted = [...appeared].sort((a, b) => b.obtained - a.obtained);
  const classAverage = appeared.length > 0
    ? Math.round((appeared.reduce((a, s) => a + s.obtained, 0) / appeared.length) * 100) / 100
    : 0;

  // Subject averages
  const subjectAverages = await Promise.all(subjects.map(async (sub) => {
    const subMarks = rawMarks.filter(m => m.subjectId === sub.id && !m.isAbsent);
    const vals = subMarks.map(m => Number(m.totalObtained ?? 0));
    return {
      subjectName: sub.subjectName,
      average:     vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100 : 0,
      highest:     vals.length ? Math.max(...vals) : 0,
      lowest:      vals.length ? Math.min(...vals) : 0,
    };
  }));

  return {
    examSessionId,
    totalStudents:     students.length,
    appeared:          appeared.length,
    absent:            students.length - appeared.length,
    classAverage,
    highestMarks:      sorted[0]?.obtained ?? 0,
    lowestMarks:       sorted[sorted.length - 1]?.obtained ?? 0,
    passCount:         passed.length,
    failCount:         appeared.length - passed.length,
    passRate:          appeared.length > 0 ? Math.round((passed.length / appeared.length) * 10000) / 100 : 0,
    gradeDistribution,
    topThree: await Promise.all(sorted.slice(0, 3).map(async (s, i) => {
      const g = await getGradeFromPercentage(s.percentage);
      return { rank: i + 1, studentId: s.studentId, name: s.name, obtained: s.obtained, percentage: s.percentage, grade: g.grade };
    })),
    subjectAverages,
  };
}

// ── getStudentMarksheetData ────────────────────────────

export async function getStudentMarksheetData(
  examSessionId: number,
  studentId:     number
): Promise<StudentMarksheetData> {
  const [session] = await db
    .select({
      id:          examSessions.id,
      title:       examSessions.title,
      examType:    examSessions.examType,
      passingMarks: examSessions.passingMarks,
      academicYear: academicSessions.name,
    })
    .from(examSessions)
    .innerJoin(academicSessions, eq(examSessions.academicSessionId, academicSessions.id))
    .where(eq(examSessions.id, examSessionId))
    .limit(1);

  if (!session) throw new AppError('Exam session not found.', 'NOT_FOUND', 404);

  const [student] = await db
    .select()
    .from(users)
    .where(eq(users.id, studentId))
    .limit(1);

  if (!student) throw new AppError('Student not found.', 'NOT_FOUND', 404);

  const subjects = await db
    .select()
    .from(examSubjects)
    .where(eq(examSubjects.examSessionId, examSessionId))
    .orderBy(asc(examSubjects.sortOrder));

  const marks = await db
    .select()
    .from(examMarks)
    .where(and(
      inArray(examMarks.examSubjectId, subjects.map(s => s.id)),
      eq(examMarks.studentId, studentId)
    ));

  const markMap = new Map(marks.map(m => [m.examSubjectId, m]));

  let totalMax      = 0;
  let totalObtained = 0;
  const subjectRows = subjects.map((sub, idx) => {
    const mark    = markMap.get(sub.id);
    const maxTotal = sub.maxTheoryMarks + sub.maxPracticalMarks;
    totalMax += maxTotal;
    if (mark && !mark.isAbsent && !mark.isExempted) {
      totalObtained += Number(mark.totalObtained ?? 0);
    }
    return {
      sr:            idx + 1,
      subjectName:   sub.subjectName,
      subjectCode:   sub.subjectCode,
      maxTheory:     sub.maxTheoryMarks,
      maxPractical:  sub.maxPracticalMarks,
      maxTotal,
      theoryObtained:    mark ? Number(mark.theoryMarks)    : null,
      practicalObtained: mark ? Number(mark.practicalMarks) : null,
      totalObtained:     mark ? Number(mark.totalObtained)  : null,
      grade:     mark?.grade    ?? null,
      isAbsent:  mark?.isAbsent ?? false,
      isExempted: mark?.isExempted ?? false,
      remarks:   mark?.remarks   ?? null,
    };
  });

  const percentage  = totalMax > 0 ? Math.round((totalObtained / totalMax) * 10000) / 100 : 0;
  const gradeResult = await getGradeFromPercentage(percentage);
  const isPassed    = totalObtained >= session.passingMarks;

  // Position in class
  const allStats = await calculateExamStatistics(examSessionId);
  const sortedByMarks = allStats.topThree; // simplified — expand for full rank
  const position = sortedByMarks.findIndex(s => s.studentId === studentId) + 1 || 0;

  const [attendance] = await db
    .select()
    .from(examAttendance)
    .where(and(
      eq(examAttendance.examSessionId, examSessionId),
      eq(examAttendance.studentId, studentId)
    ))
    .limit(1);

  return {
    student: {
      id:          student.id,
      name:        student.name,
      fatherName:  (student as any).fatherName ?? '—',
      rollNo:      (student as any).rollNo     ?? '—',
      admissionNo: (student as any).admissionNo ?? '—',
      className:   (student as any).className  ?? '—',
      section:     (student as any).section    ?? '—',
    },
    examSession: {
      title:       session.title,
      examType:    session.examType,
      academicYear: session.academicYear,
    },
    subjects: subjectRows,
    result: {
      totalMaxMarks:   totalMax,
      totalObtained,
      percentage,
      grade:           gradeResult.grade,
      division:        gradeResult.division,
      gpaPoints:       gradeResult.gpaPoints,
      positionInClass: position,
      isPassed,
    },
    attendance: attendance ? {
      totalDays:   attendance.totalDays,
      presentDays: attendance.presentDays,
      absentDays:  attendance.totalDays - attendance.presentDays,
      percentage:  attendance.totalDays > 0
        ? Math.round((attendance.presentDays / attendance.totalDays) * 10000) / 100
        : 0,
    } : null,
  };
}

// ── computeMATAggregate ────────────────────────────────

export async function computeMATAggregate(
  classId:    number,
  sessionId:  number,
  bestOf:     number = 5,    // school-configurable
  aggregateOutOf: number = 50
): Promise<MATAggregate[]> {
  const matSessions = await db
    .select()
    .from(examSessions)
    .where(and(
      eq(examSessions.classId,           classId),
      eq(examSessions.academicSessionId, sessionId),
      eq(examSessions.examType,          'MAT'),
    ))
    .orderBy(asc(examSessions.startDate));

  if (!matSessions.length) return [];

  // Collect all student IDs in this class
  const studentList = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(and(
      eq((users as any).classId, classId),
      eq((users as any).role,    'student')
    ));

  const result: MATAggregate[] = [];

  for (const student of studentList) {
    const monthlyScores: MATAggregate['monthlyScores'] = [];

    for (const mat of matSessions) {
      const subjects = await db
        .select()
        .from(examSubjects)
        .where(eq(examSubjects.examSessionId, mat.id));

      const subjectIds = subjects.map(s => s.id);
      const marks = await db
        .select()
        .from(examMarks)
        .where(and(
          inArray(examMarks.examSubjectId, subjectIds),
          eq(examMarks.studentId, student.id)
        ));

      const totalMax      = subjects.reduce((a, s) => a + s.maxTheoryMarks + s.maxPracticalMarks, 0);
      const totalObtained = marks.reduce((a, m) => a + Number(m.totalObtained ?? 0), 0);
      const percentage    = totalMax > 0 ? Math.round((totalObtained / totalMax) * 10000) / 100 : 0;

      monthlyScores.push({
        month:      mat.monthLabel ?? mat.title,
        obtained:   totalObtained,
        maxMarks:   totalMax,
        percentage,
      });
    }

    const sorted   = [...monthlyScores].sort((a, b) => b.percentage - a.percentage);
    const bestN    = sorted.slice(0, bestOf).map(s => s.percentage);
    const avgBestN = bestN.length ? bestN.reduce((a, b) => a + b, 0) / bestN.length : 0;
    const aggregate = Math.round((avgBestN / 100) * aggregateOutOf * 100) / 100;

    result.push({
      studentId:       student.id,
      name:            student.name,
      monthlyScores,
      bestNScores:     bestN,
      aggregateMarks:  aggregate,
    });
  }

  return result.sort((a, b) => b.aggregateMarks - a.aggregateMarks);
}
```

---

## 5. API Endpoints (Module 3)

### File: `server/validators/examValidators.ts`

```typescript
import { z } from 'zod';

export const EXAM_TYPES = ['MAT', 'HALF_YEARLY', 'ANNUAL'] as const;
export const MONTH_LABELS = [
  'May', 'June', 'July', 'August', 'September',
  'October', 'November', 'February', 'March', 'April'
] as const;

export const createExamSessionSchema = z.object({
  academicSessionId: z.number().int().positive(),
  classId:           z.number().int().positive(),
  examType:          z.enum(EXAM_TYPES),
  monthLabel:        z.string().optional(),
  title:             z.string().min(3).max(120),
  startDate:         z.coerce.date(),
  endDate:           z.coerce.date(),
  totalMarks:        z.number().int().min(1).max(2000),
  passingMarks:      z.number().int().min(1),
  subjects: z.array(z.object({
    subjectName:       z.string().min(1).max(80),
    subjectCode:       z.string().max(20).optional(),
    maxTheoryMarks:    z.number().int().min(1),
    maxPracticalMarks: z.number().int().min(0).default(0),
    examDate:          z.coerce.date(),
    examTime:          z.string().optional(),
    venue:             z.string().max(100).optional(),
    sortOrder:         z.number().int().optional(),
  })).min(1).max(20),
}).refine(d => d.passingMarks < d.totalMarks, {
  message: 'Passing marks must be less than total marks.',
  path: ['passingMarks'],
}).refine(d => d.endDate >= d.startDate, {
  message: 'End date must be on or after start date.',
  path: ['endDate'],
}).refine(d => d.examType !== 'MAT' || !!d.monthLabel, {
  message: 'monthLabel is required for Monthly Assessment Tests.',
  path: ['monthLabel'],
});

export const bulkMarksSchema = z.object({
  marks: z.array(z.object({
    studentId:      z.number().int().positive(),
    theoryMarks:    z.number().min(0).optional(),
    practicalMarks: z.number().min(0).optional(),
    isAbsent:       z.boolean().default(false),
    isExempted:     z.boolean().default(false),
    remarks:        z.string().max(200).optional(),
  })).min(1).max(500),
});

export const marksheetQuerySchema = z.object({
  examSessionId: z.coerce.number().int().positive(),
  studentIds:    z.string().transform(s => s.split(',').map(Number)).optional(),
  format:        z.enum(['single', 'bulk']).default('single'),
});
```

### Routes to add in `server/routes.ts`

```
// ── Examination Management ─────────────────────────────────────────────

POST   /api/exam-sessions
  → createExamSession()                Auth: admin, teacher
  → 201 + session object

GET    /api/exam-sessions/class/:classId
  → list sessions for class + subjects Auth: any authenticated
  → ?academicSessionId=1&examType=MAT

GET    /api/exam-sessions/:id
  → single session with subjects       Auth: any authenticated

GET    /api/exam-sessions/:id/statistics
  → ExamStatistics                     Auth: admin, teacher

GET    /api/exam-sessions/:id/students
  → enrolled students with mark status Auth: admin, teacher

PATCH  /api/exam-subjects/:subjectId/marks
  → bulkUpsertMarks()                  Auth: admin, teacher
  → body: bulkMarksSchema

POST   /api/exam-sessions/:id/declare-result
  → set isResultDeclared = true        Auth: admin only

GET    /api/marksheets/single
  → ?examSessionId=&studentId=
  → streams PDF                        Auth: admin, teacher, self

GET    /api/marksheets/bulk
  → ?examSessionId=&classId=
  → streams PDF (all students)         Auth: admin, teacher

GET    /api/mat-aggregate/:classId
  → ?sessionId=&bestOf=5               Auth: admin, teacher

GET    /api/reports/student/:studentId
  → full academic history across years Auth: admin, teacher, self
```

---

## 6. PDF Marksheet Engine (Module 4)

### File: `server/services/marksheetService.ts`

```typescript
import puppeteer from 'puppeteer';
import { getStudentMarksheetData, StudentMarksheetData } from './examService';

// ── HTML template for a single marksheet (B&W, A5-half-of-A4) ─────────

function renderMarksheetHTML(data: StudentMarksheetData, schoolInfo: SchoolInfo): string {
  const { student, examSession, subjects, result, attendance } = data;

  const subjectRows = subjects.map(s => `
    <tr>
      <td class="center">${s.sr}</td>
      <td>${s.subjectName}${s.subjectCode ? ` <span class="code">(${s.subjectCode})</span>` : ''}</td>
      <td class="center">${s.maxTheory}</td>
      <td class="center">${s.maxPractical || '—'}</td>
      <td class="center bold">${s.maxTotal}</td>
      <td class="center">
        ${s.isAbsent ? '<span class="tag">Ab</span>' : s.isExempted ? '<span class="tag">Ex</span>' : (s.theoryObtained ?? '—')}
      </td>
      <td class="center">
        ${s.isAbsent || s.isExempted || !s.maxPractical ? '—' : (s.practicalObtained ?? '—')}
      </td>
      <td class="center bold">${s.isAbsent ? 'ABSENT' : s.isExempted ? 'EXM' : (s.totalObtained ?? '—')}</td>
      <td class="center bold">${s.grade ?? '—'}</td>
      <td>${s.remarks ?? ''}</td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Arial', sans-serif;
    font-size: 10pt;
    color: #000;
    background: #fff;
    width: 190mm;
    padding: 8mm;
  }
  .marksheet {
    border: 2.5pt solid #000;
    padding: 6mm;
    width: 100%;
  }

  /* ── Header ── */
  .header { text-align: center; border-bottom: 1.5pt solid #000; padding-bottom: 4mm; margin-bottom: 3mm; }
  .school-name { font-size: 15pt; font-weight: bold; text-transform: uppercase; letter-spacing: 1pt; }
  .school-address { font-size: 8pt; margin-top: 1mm; }
  .exam-title {
    margin-top: 3mm;
    font-size: 12pt;
    font-weight: bold;
    text-transform: uppercase;
    border: 1pt solid #000;
    display: inline-block;
    padding: 2mm 8mm;
    letter-spacing: 0.5pt;
  }
  .academic-year { font-size: 9pt; margin-top: 1mm; }

  /* ── Student Info ── */
  .student-info {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1mm 4mm;
    margin-bottom: 3mm;
    padding: 2mm;
    border: 1pt solid #000;
    font-size: 9pt;
  }
  .info-row { display: flex; gap: 2mm; }
  .info-label { font-weight: bold; min-width: 28mm; }
  .info-value { border-bottom: 0.5pt dotted #000; flex: 1; }

  /* ── Marks Table ── */
  table { width: 100%; border-collapse: collapse; margin-bottom: 3mm; }
  th, td {
    border: 1pt solid #000;
    padding: 1.5mm 2mm;
    font-size: 8.5pt;
  }
  th {
    background: #fff;
    font-weight: bold;
    text-align: center;
    font-size: 8pt;
  }
  .center { text-align: center; }
  .bold   { font-weight: bold; }
  .tag    { font-size: 7pt; font-weight: bold; }
  .code   { font-size: 7pt; color: #444; }

  /* ── Result Panel ── */
  .result-panel {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 2mm;
    margin-bottom: 3mm;
  }
  .result-box {
    border: 1pt solid #000;
    padding: 2mm;
    text-align: center;
  }
  .result-label { font-size: 7.5pt; font-weight: bold; text-transform: uppercase; }
  .result-value { font-size: 11pt; font-weight: bold; margin-top: 1mm; }

  /* ── Pass/Fail Banner ── */
  .status-banner {
    text-align: center;
    border: 2pt solid #000;
    padding: 2mm;
    margin-bottom: 3mm;
    font-size: 12pt;
    font-weight: bold;
    letter-spacing: 2pt;
  }

  /* ── Attendance ── */
  .attendance-row {
    display: flex;
    gap: 4mm;
    font-size: 8.5pt;
    margin-bottom: 3mm;
  }
  .att-box { border: 1pt solid #000; padding: 1.5mm 3mm; flex: 1; text-align: center; }
  .att-label { font-size: 7.5pt; font-weight: bold; }

  /* ── Signatures ── */
  .signature-strip {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 4mm;
    margin-top: 6mm;
  }
  .sig-box { text-align: center; }
  .sig-line { border-top: 1pt solid #000; margin-top: 8mm; padding-top: 1.5mm; font-size: 8pt; font-weight: bold; }

  /* ── Stamp ── */
  .stamp-area {
    border: 1.5pt dashed #000;
    width: 28mm;
    height: 28mm;
    margin: 0 auto;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 7pt;
    color: #666;
    margin-top: 4mm;
  }

  @media print {
    body { margin: 0; }
    .marksheet { page-break-inside: avoid; }
  }
</style>
</head>
<body>
<div class="marksheet">

  <div class="header">
    <div class="school-name">${schoolInfo.name}</div>
    <div class="school-address">${schoolInfo.address} | Tel: ${schoolInfo.phone}</div>
    <div class="exam-title">${examSession.title}</div>
    <div class="academic-year">Academic Year: ${examSession.academicYear}</div>
  </div>

  <div class="student-info">
    <div class="info-row">
      <span class="info-label">Student Name:</span>
      <span class="info-value">${student.name}</span>
    </div>
    <div class="info-row">
      <span class="info-label">Roll No.:</span>
      <span class="info-value">${student.rollNo}</span>
    </div>
    <div class="info-row">
      <span class="info-label">Father's Name:</span>
      <span class="info-value">${student.fatherName}</span>
    </div>
    <div class="info-row">
      <span class="info-label">Class:</span>
      <span class="info-value">${student.className} — ${student.section}</span>
    </div>
    <div class="info-row">
      <span class="info-label">Admission No.:</span>
      <span class="info-value">${student.admissionNo}</span>
    </div>
    <div class="info-row">
      <span class="info-label">Issue Date:</span>
      <span class="info-value">${new Date().toLocaleDateString('en-PK', { day:'2-digit', month:'long', year:'numeric' })}</span>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th rowspan="2" style="width:5%">Sr.</th>
        <th rowspan="2" style="width:22%">Subject</th>
        <th colspan="3">Maximum Marks</th>
        <th colspan="3">Marks Obtained</th>
        <th rowspan="2" style="width:7%">Grade</th>
        <th rowspan="2" style="width:10%">Remarks</th>
      </tr>
      <tr>
        <th style="width:7%">Theory</th>
        <th style="width:7%">Prac.</th>
        <th style="width:7%">Total</th>
        <th style="width:7%">Theory</th>
        <th style="width:7%">Prac.</th>
        <th style="width:8%">Total</th>
      </tr>
    </thead>
    <tbody>
      ${subjectRows}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="4" class="bold" style="text-align:right; padding-right: 3mm;">Grand Total:</td>
        <td class="center bold">${result.totalMaxMarks}</td>
        <td colspan="2"></td>
        <td class="center bold">${result.totalObtained}</td>
        <td class="center bold">${result.grade}</td>
        <td></td>
      </tr>
    </tfoot>
  </table>

  <div class="result-panel">
    <div class="result-box">
      <div class="result-label">Total Obtained</div>
      <div class="result-value">${result.totalObtained} / ${result.totalMaxMarks}</div>
    </div>
    <div class="result-box">
      <div class="result-label">Percentage</div>
      <div class="result-value">${result.percentage.toFixed(2)}%</div>
    </div>
    <div class="result-box">
      <div class="result-label">Grade / GPA</div>
      <div class="result-value">${result.grade} / ${result.gpaPoints.toFixed(2)}</div>
    </div>
    <div class="result-box">
      <div class="result-label">Position</div>
      <div class="result-value">${result.positionInClass > 0 ? result.positionInClass : '—'}</div>
    </div>
  </div>

  <div class="status-banner">
    ${result.isPassed
      ? `✓ PASSED — ${result.division}`
      : '✗ RESULT: FAIL — Compartment Required'}
  </div>

  ${attendance ? `
  <div class="attendance-row">
    <div class="att-box"><div class="att-label">Total Days</div>${attendance.totalDays}</div>
    <div class="att-box"><div class="att-label">Days Present</div>${attendance.presentDays}</div>
    <div class="att-box"><div class="att-label">Days Absent</div>${attendance.absentDays}</div>
    <div class="att-box"><div class="att-label">Attendance %</div>${attendance.percentage.toFixed(1)}%</div>
  </div>
  ` : ''}

  <div class="signature-strip">
    <div class="sig-box">
      <div class="sig-line">Class Teacher</div>
    </div>
    <div class="sig-box">
      <div class="stamp-area">Official Stamp</div>
    </div>
    <div class="sig-box">
      <div class="sig-line">Principal</div>
    </div>
  </div>

</div>
</body>
</html>`;
}

// ── generateSingleMarksheetPDF ────────────────────────

export async function generateSingleMarksheetPDF(
  examSessionId: number,
  studentId:     number,
  schoolInfo:    SchoolInfo
): Promise<Buffer> {
  const data    = await getStudentMarksheetData(examSessionId, studentId);
  const html    = renderMarksheetHTML(data, schoolInfo);
  return htmlToPDF(html, { format: 'A5', landscape: false });
}

// ── generateBulkMarksheetPDF ──────────────────────────
// Two A5 marksheets per A4 page (landscape) — cut-and-give format

export async function generateBulkMarksheetPDF(
  examSessionId: number,
  studentIds:    number[],
  schoolInfo:    SchoolInfo
): Promise<Buffer> {
  const allHTML: string[] = [];

  for (const sid of studentIds) {
    const data = await getStudentMarksheetData(examSessionId, sid);
    allHTML.push(renderMarksheetHTML(data, schoolInfo));
  }

  // Pair into A4 pages (2 per page)
  const pageHTML = pairMarksheets(allHTML);
  return htmlToPDF(pageHTML, { format: 'A4', landscape: false });
}

function pairMarksheets(marksheets: string[]): string {
  const pairs: string[] = [];
  for (let i = 0; i < marksheets.length; i += 2) {
    const top    = extractBodyContent(marksheets[i]);
    const bottom = marksheets[i + 1] ? extractBodyContent(marksheets[i + 1]) : '';
    pairs.push(`
      <div class="page">
        <div class="half">${top}</div>
        <div class="divider"></div>
        <div class="half">${bottom}</div>
      </div>
    `);
  }

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, sans-serif; font-size: 9.5pt; background: #fff; color: #000; }
  .page { width: 210mm; min-height: 297mm; padding: 5mm; page-break-after: always; }
  .half { width: 100%; height: 140mm; overflow: hidden; }
  .divider { border-top: 1.5pt dashed #000; margin: 3mm 0; }
  @media print { .page { page-break-after: always; } }
  /* Paste marksheet styles here or link stylesheet */
  ${SHARED_MARKSHEET_CSS}
</style>
</head>
<body>${pairs.join('')}</body>
</html>`;
}

async function htmlToPDF(
  html:    string,
  options: { format: string; landscape: boolean }
): Promise<Buffer> {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle0' });
  const pdf = await page.pdf({
    format:                 options.format as any,
    landscape:              options.landscape,
    printBackground:        false,       // pure B&W
    margin:                 { top: '8mm', bottom: '8mm', left: '8mm', right: '8mm' },
    displayHeaderFooter:    false,
  });
  await browser.close();
  return Buffer.from(pdf);
}
```

---

## 7. AI Grounding Integration (Module 5)

### Changes to `server/services/aiService.ts`

```typescript
// ── Add to collectGroundedContext() ──────────────────

const today     = new Date();
const todayISO  = today.toISOString();

const [upcomingExams, recentCompletedExam] = await Promise.all([
  db.select({
    id:       examSessions.id,
    title:    examSessions.title,
    examType: examSessions.examType,
    startDate: examSessions.startDate,
  })
  .from(examSessions)
  .where(gt(examSessions.startDate, today))
  .orderBy(asc(examSessions.startDate))
  .limit(5),

  db.select()
  .from(examSessions)
  .where(and(
    lte(examSessions.startDate, today),
    eq(examSessions.isResultDeclared, true),
  ))
  .orderBy(desc(examSessions.startDate))
  .limit(1),
]);

let recentStats = null;
if (recentCompletedExam.length > 0) {
  recentStats = await calculateExamStatistics(recentCompletedExam[0].id);
}

// ── Add to context.summary ────────────────────────────
context.summary.examinations = {
  upcomingExams: upcomingExams.map(e => ({
    title:     e.title,
    type:      e.examType,
    startDate: e.startDate.toDateString(),
  })),
  recentExam: recentCompletedExam[0]?.title ?? null,
  recentStats: recentStats ? {
    classAverage:  recentStats.classAverage,
    passRate:      recentStats.passRate,
    gradeDistribution: recentStats.gradeDistribution,
    topStudent:    recentStats.topThree[0]?.name ?? null,
    subjectAverages: recentStats.subjectAverages,
  } : null,
};

// ── System prompt addition (append to existing prompt) ────
`
## Pakistani Examination Context
You are aware of the Pakistani school examination system (MAT, Half-Yearly, Annual).
Use the following live data to answer questions precisely:

Upcoming Exams: ${JSON.stringify(context.summary.examinations.upcomingExams)}
Most Recent Completed Exam: "${context.summary.examinations.recentExam}"
Recent Exam Statistics: ${JSON.stringify(context.summary.examinations.recentStats)}

Guidelines:
- When asked about "class average", cite recentStats.classAverage.
- When asked "who is the top student", cite recentStats.topStudent.
- When asked about upcoming exams, list from upcomingExams.
- For MAT queries, clarify it is a Monthly Assessment Test.
- If data is null, respond: "Results have not been declared yet for this exam."
- Never fabricate marks, percentages, or student names.
`
```

---

## 8. Frontend Implementation (Module 6)

### File Tree

```
client/src/
├── features/
│   └── examination/
│       ├── ExaminationPage.tsx          ← tab shell
│       ├── ExamScheduleTab.tsx          ← schedule + list
│       ├── MarkEntryTab.tsx             ← spreadsheet-style entry
│       ├── ResultsTab.tsx               ← statistics + marksheets
│       ├── MATSummaryTab.tsx            ← monthly aggregate view
│       │
│       ├── components/
│       │   ├── ScheduleExamModal.tsx
│       │   ├── ExamSessionCard.tsx
│       │   ├── MarkEntryGrid.tsx         ← core inline-edit table
│       │   ├── MarkEntryToolbar.tsx
│       │   ├── StatisticsPanel.tsx
│       │   ├── GradeDistributionChart.tsx
│       │   ├── SubjectAverageChart.tsx
│       │   ├── PerformanceTrendChart.tsx
│       │   ├── MarksheetPreviewModal.tsx
│       │   ├── BulkMarksheetButton.tsx
│       │   └── MATAggregateTable.tsx
│       │
│       └── hooks/
│           ├── useExamSessions.ts
│           ├── useExamMarks.ts
│           ├── useMarksheetPDF.ts
│           └── useMATAggregate.ts
```

### Component Specifications

#### `MarkEntryGrid.tsx` (Spreadsheet-Style)

```typescript
// Key behaviour requirements:
// 1. Renders @tanstack/react-table with inline-editable cells
// 2. Columns: Roll No | Student Name | Theory | Practical | Total (computed) | Grade (live) | Absent | Remarks
// 3. Tab → moves to next cell right; at row end → jumps to next row col-1
// 4. Enter → moves down same column
// 5. Escape → reverts unsaved cell value
// 6. Cells with errors (marks > max) show red border and tooltip
// 7. "Total" and "Grade" columns are always read-only and computed live from inputs
// 8. Sticky header + sticky Roll No column for wide classes
// 9. Bulk actions: Mark All Absent, Clear All, Import from CSV
// 10. Bottom status bar: X / Y entered | Z absent | Save button
```

#### `MarksheetPreviewModal.tsx`

```typescript
// Preview the PDF before downloading:
// 1. Renders an <iframe> pointing to /api/marksheets/single?...
// 2. Has Download (single), Print, and Close buttons
// 3. For bulk: shows a list of students with checkboxes
//    → "Download Selected" calls /api/marksheets/bulk with selected IDs
//    → "Download All" sends all enrolled studentIds
// 4. Loading state shows a skeleton while PDF streams
```

#### Sidebar entry (in existing sidebar component)

```typescript
{
  label:        'Examination',
  icon:         GraduationCap,
  href:         '/examination',
  allowedRoles: ['admin', 'teacher'],
  badge:        upcomingCount > 0 ? String(upcomingCount) : undefined,
}
```

---

## 9. Mark Entry System (Module 7)

### UX Flow for Pakistani Teacher

```
Step 1 — Select Exam Session
  ↓  (filtered by teacher's assigned class)

Step 2 — Select Subject
  ↓  (shows exam date, max theory, max practical)

Step 3 — Spreadsheet Grid loads
  ↓  (all enrolled students pre-filled, sorted by Roll No.)

Step 4 — Enter marks per cell
  ↓  (Tab/Enter navigation, live total + grade shown)

Step 5 — Review & Save
  ↓  (validation errors highlighted before save)

Step 6 — Print / Download Marksheets
  ↓  (single or bulk PDF, B&W optimised)
```

### CSV Import Format (for bulk import from Excel)

```csv
roll_no,student_name,theory_marks,practical_marks,remarks
001,Ahmed Ali,72,18,
002,Fatima Khan,88,20,Well done
003,Usman Tariq,,,Absent
```

---

## 10. Full Codex AI Prompt

```
ROLE: Senior Full-Stack Engineer — Pakistani School Management System
PROJECT: School-Nexus SMS (TypeScript monorepo)
STACK: Node.js · Express · Drizzle ORM (PostgreSQL) · Zod · React 18 ·
       TailwindCSS · Shadcn/ui · Recharts · Puppeteer (PDF) · OpenRouter (LLM)
REFERENCE DOCUMENT: implement_plan_exam.md (read this first and follow exactly)
TASK: Implement the complete Examination Management module as specified in
      implement_plan_exam.md for the Pakistani curriculum (MAT, Half-Yearly, Annual).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EXECUTION CONSTRAINTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1.  Do NOT scaffold a new project. Integrate within the existing file tree only.
2.  Preserve every pre-existing export in every file you touch.
3.  Use Drizzle ORM query builder exclusively — never raw SQL strings.
4.  Every public function must have an explicit TypeScript return type. No `any`.
5.  All multi-table writes use db.transaction(). No exceptions.
6.  Zod validates every HTTP payload before it reaches the service layer (HTTP 422 on fail).
7.  Never expose raw DB or Puppeteer errors in HTTP responses — wrap them in
    { success: false; error: { code: string; message: string; details?: unknown } }.
8.  Every new React component is a named export in its own file under the feature folder.
9.  All server state uses TanStack Query v5 (useQuery / useMutation). No useEffect for fetching.
10. Implement modules in the order listed in implement_plan_exam.md (Schema → Service → API
    → PDF Engine → AI → Frontend → Mark Entry). Each depends on the prior.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MODULE 1 — SCHEMA  (shared/schema.ts)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Append EXACTLY the table definitions from implement_plan_exam.md §3.
Do not alter any existing table.
Tables to create:
  gradeScales · academicSessions · examSessions · examSubjects ·
  examMarks · examAttendance
Export Select* and Insert* inferred types for every table.
Define all Drizzle relations() as specified.
After schema creation, create the seed file:
  server/db/seeds/gradeScaleSeed.ts
  with defaultGradeScales (FBISE standard A+ through F).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MODULE 2 — SERVICE LAYER  (server/services/examService.ts)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Create this file from scratch. Implement exactly:
  createExamSession(payload)          → db.transaction, guard duplicates
  getGradeFromPercentage(pct)         → query gradeScales, throw AppError if no match
  bulkUpsertMarks(subjectId, entries) → validate ALL entries before writing any,
                                        use INSERT ... ON CONFLICT DO UPDATE,
                                        auto-compute grade per student after upsert
  calculateExamStatistics(sessionId)  → aggregate per-student totals, pass/fail,
                                        grade distribution, top 3, subject averages
  getStudentMarksheetData(sessionId, studentId) → returns StudentMarksheetData (typed)
  computeMATAggregate(classId, sessionId, bestOf, outOf) → best-N-of-M logic
Also create:
  server/errors.ts → AppError(message, code, statusCode) and ValidationError classes

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MODULE 3 — VALIDATORS & API  (server/validators/examValidators.ts · server/routes.ts)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
New file server/validators/examValidators.ts:
  createExamSessionSchema (with .refine for passingMarks < totalMarks
  and monthLabel required for MAT)
  bulkMarksSchema
  marksheetQuerySchema

Add all routes from implement_plan_exam.md §5 inside server/routes.ts.
Group under comment // ── Examination Management ─────────────────────────────.
Every route uses asyncHandler(). Role guards use the existing auth middleware.
HTTP response shape: { success: boolean; data?: T; error?: ErrorObject }

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MODULE 4 — PDF MARKSHEET ENGINE  (server/services/marksheetService.ts)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Install: npm install puppeteer
Create server/services/marksheetService.ts implementing:
  generateSingleMarksheetPDF(examSessionId, studentId, schoolInfo) → Buffer
  generateBulkMarksheetPDF(examSessionId, studentIds, schoolInfo)  → Buffer
    (Two A5 marksheets per A4 page, separated by dashed cut line)

PDF design requirements (STRICT — do not deviate):
  • A4 portrait, 8mm margins
  • Pure black ink only — no grey fills, no colour backgrounds
  • All borders: solid black, minimum 1pt weight
  • School letterhead: Name (bold caps) + address + phone
  • Student info panel: Name, Father's Name, Roll No., Admission No., Class + Section
  • Subject table: Sr | Subject | Max Theory | Max Practical | Max Total |
                   Theory Obtained | Practical Obtained | Total Obtained | Grade | Remarks
  • Grand Total row in tfoot, bold
  • Result panel: 4-box grid — Total Obtained/Max | Percentage | Grade+GPA | Position
  • Pass/Fail banner: "✓ PASSED — First Division" or "✗ FAIL"
  • Attendance row: Total Days | Present | Absent | Percentage
  • Signature strip: Class Teacher | [Official Stamp outlined box] | Principal
  • printBackground: false in Puppeteer (ensures pure B&W on mono printers)

Connect routes:
  GET /api/marksheets/single → streams single PDF
  GET /api/marksheets/bulk   → streams bulk PDF
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', 'inline; filename="marksheet.pdf"')

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MODULE 5 — AI GROUNDING  (server/services/aiService.ts)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DO NOT rewrite the file. Add only:
  • Inside collectGroundedContext(): fetch upcomingExams and recentCompletedExam
    using the exact Drizzle queries from implement_plan_exam.md §7.
  • Add context.summary.examinations property (typed).
  • Append the Pakistani examination context block to the system prompt string.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MODULE 6 — FRONTEND  (client/src/features/examination/)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Create the exact file tree from implement_plan_exam.md §8.

ExaminationPage.tsx:
  Shadcn Tabs: "Schedule" | "Mark Entry" | "Results" | "MAT Summary"
  Lazy-load each tab component. Wrap in Suspense + PageSkeleton.

ExamScheduleTab.tsx:
  Left: list of ExamSessionCards (filtered by class selector at top)
  Right: "Schedule New Exam" button → opens ScheduleExamModal
  ScheduleExamModal uses react-hook-form + zodResolver(createExamSessionSchema)
  Dynamic subject FieldArray (useFieldArray). Min 1 subject.

ResultsTab.tsx:
  Session selector → loads ExamStatistics from useExamStatistics(id)
  Renders: StatisticsPanel (6 metric cards) + GradeDistributionChart (BarChart)
           SubjectAverageChart (grouped BarChart) + top 3 students table
  Marksheet section: student list with checkboxes → single/bulk PDF download
  MarksheetPreviewModal shows <iframe> PDF preview before download

MATSummaryTab.tsx:
  Renders MATAggregateTable:
    Columns: Rank | Student Name | Roll No | [Month columns dynamic] | Best 5 Avg | Aggregate / 50
  Export to CSV button using papaparse

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MODULE 7 — MARK ENTRY SYSTEM
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MarkEntryGrid.tsx — critical requirements:
  • @tanstack/react-table with getCoreRowModel + inline editable cells
  • Columns: Roll No (sticky) | Name | Theory | Practical | Total (read-only) |
             Grade (read-only, computed live) | Absent (checkbox) | Remarks
  • Tab/Enter/Escape keyboard nav as described in implement_plan_exam.md §9
  • Cells exceeding maxMarks: red ring (outline-red-500 + tooltip)
  • If Absent checked: theory + practical cells become read-only and visually greyed
  • MarkEntryToolbar: Class selector → Exam selector → Subject selector → [Save All] button
  • Status bar: "12 / 35 entered · 2 absent · 21 pending"
  • "Import CSV" button: drag-and-drop or file picker → parse with papaparse
    → validate headers (roll_no, theory_marks, practical_marks, remarks)
    → auto-fill matching rows in grid

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SIDEBAR & ROUTER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
In the existing sidebar config, insert:
  { label: 'Examination', icon: GraduationCap, href: '/examination',
    allowedRoles: ['admin', 'teacher'],
    badge: upcomingExamCount (from useExamSessions query) }

In the router, add:
  { path: '/examination', element: React.lazy(() => import('./features/examination/ExaminationPage')) }

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
QUALITY GATES — verify before marking task complete
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
□ npx drizzle-kit generate produces zero errors for all 6 new tables.
□ npx tsc --noEmit produces zero errors. strict: true in tsconfig.
□ All service functions have test stubs in server/services/__tests__/examService.test.ts:
    createExamSession: happy path + duplicate guard error
    bulkUpsertMarks:   happy path + marks-exceed-max validation error + absent student
    getGradeFromPercentage: all 7 grade ranges + boundary values
    getStudentMarksheetData: complete data + missing attendance (null) case
□ All API routes return { success, data?, error? }. No raw thrown errors reach client.
□ No role names hardcoded — import from shared/constants/roles.ts → ROLES object.
□ All date comparisons use UTC (new Date() passed through .toISOString()).
□ Puppeteer PDF generation tested manually for:
    single student marksheet — A4, 8mm margins, B&W only
    bulk 2-per-page — cut line visible, no content overflow between halves
□ MarkEntryGrid Tab/Enter/Escape navigation verified in Chrome and Firefox.
□ CSV import tested with: valid file, missing columns, wrong roll numbers.
□ No prop drilling deeper than 2 levels. Use React context for examSessionId + classId.
□ Recharts charts wrapped in <ErrorBoundary fallback={<ChartError />}>.
□ computeMATAggregate bestOf and outOf values read from school settings, not hardcoded.
```

---

## 11. Quality Gates & Checklist

### Pre-Deployment Checklist

- [ ] All 6 schema tables migrated without data loss
- [ ] Grade scale seed data inserted for FBISE standard
- [ ] Puppeteer dependency added to package.json and installed
- [ ] PDF renders correctly on: Chrome print, Adobe Reader, B&W laser printer
- [ ] Mark entry grid tested with 40+ students (performance check)
- [ ] Bulk PDF tested with 50 students (memory/timeout check — set 5-min timeout)
- [ ] AI assistant correctly answers: "When is the next exam?", "Who topped the class?",
      "What is the Half-Yearly pass rate?"
- [ ] Role guard tested: student cannot access /api/marksheets/bulk for other students
- [ ] Absent student shows "ABSENT" in all subject cells on marksheet
- [ ] MAT aggregate: changing bestOf from 5 to 3 produces correct recalculation

---

## 12. File Tree Reference

```
shared/
  schema.ts                          ← +6 tables appended

server/
  errors.ts                          ← NEW: AppError, ValidationError
  routes.ts                          ← +12 routes appended
  db/
    seeds/
      gradeScaleSeed.ts              ← NEW
  services/
    examService.ts                   ← NEW
    marksheetService.ts              ← NEW
    aiService.ts                     ← MODIFIED (3 additions)
  validators/
    examValidators.ts                ← NEW

client/src/
  features/
    examination/
      ExaminationPage.tsx            ← NEW
      ExamScheduleTab.tsx            ← NEW
      MarkEntryTab.tsx               ← NEW
      ResultsTab.tsx                 ← NEW
      MATSummaryTab.tsx              ← NEW
      components/
        ScheduleExamModal.tsx        ← NEW
        ExamSessionCard.tsx          ← NEW
        MarkEntryGrid.tsx            ← NEW  ★ most complex component
        MarkEntryToolbar.tsx         ← NEW
        StatisticsPanel.tsx          ← NEW
        GradeDistributionChart.tsx   ← NEW
        SubjectAverageChart.tsx      ← NEW
        PerformanceTrendChart.tsx    ← NEW
        MarksheetPreviewModal.tsx    ← NEW
        BulkMarksheetButton.tsx      ← NEW
        MATAggregateTable.tsx        ← NEW
      hooks/
        useExamSessions.ts           ← NEW
        useExamMarks.ts              ← NEW
        useMarksheetPDF.ts           ← NEW
        useMATAggregate.ts           ← NEW
  router.tsx                         ← +1 route added
  components/
    Sidebar.tsx                      ← +1 nav item added
```

---

*This document is the single source of truth for the Examination Management module.
Any ambiguity in implementation must be resolved by re-reading this document before
making a judgment call. Do not deviate from the specified schema column names,
service function signatures, or PDF layout requirements.*
