/**
 * @file academicRecordService.ts
 * @description Academic Record Service — handles student academic performance
 *   tracking using direct Drizzle ORM queries against the shared schema.
 *
 * The `academic_records` table is created by migration
 * `server/migrations/20250601_add_student_history_schema.sql`.
 * Until the Drizzle schema file is regenerated, the table reference is
 * defined inline here (same pattern as `historyService.ts`).
 *
 * @module server/services/academicRecordService
 */

import { and, desc, eq, gte, lte } from "drizzle-orm";
import { pgTable, serial, integer, text } from "drizzle-orm/pg-core";
import { db } from "../db.js";
import { classes, users } from "../../shared/schema.js";

// ── Inline table reference (migration-created) ─────────────────────────────

/** Drizzle table reference for academic_records (migration-created). */
const academicRecords = pgTable("academic_records", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull(),
  classId: integer("class_id"),
  grade: text("grade"),
  academicYear: text("academic_year").notNull(),
  sessionStart: text("session_start").notNull(),
  sessionEnd: text("session_end"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

const LOG = "[AcademicRecordService]";

// ── Public types ───────────────────────────────────────────────────────────

export interface AcademicRecordRow {
  id: number;
  studentId: number;
  classId: number | null;
  grade: string | null;
  academicYear: string;
  sessionStart: string;
  sessionEnd: string | null;
  createdAt: string;
  updatedAt: string;
  /** Derived: classes.section */
  className: string | null;
  /** Derived: classes.grade */
  classGrade: string | null;
  /** Derived: classes.stream */
  classStream: string | null;
  /** Derived: users.name */
  studentName: string | null;
}

export interface AcademicSummary {
  currentGrade: string | null;
  currentClassId: number | null;
  className: string | null;
  averageGrade: number | null;
  totalSemesters: number;
}

export class AcademicRecordService {
  // ── Grade conversion map ─────────────────────────────────────────────────

  private static readonly GRADE_POINTS: Record<string, number> = {
    "A+": 4.0,
    A: 4.0,
    "A-": 3.7,
    "B+": 3.3,
    B: 3.0,
    "B-": 2.7,
    "C+": 2.3,
    C: 2.0,
    "C-": 1.7,
    D: 1.0,
    F: 0.0,
  };

  // ── Queries ──────────────────────────────────────────────────────────────

  /**
   * Get all academic records for a student, joined with class and student
   * details, ordered newest-first.
   *
   * @param studentId - The `users.id` of the student.
   * @returns Array of {@link AcademicRecordRow}; empty if none found.
   */
  async getAcademicRecordsByStudent(
    studentId: number
  ): Promise<AcademicRecordRow[]> {
    console.log(`${LOG} getAcademicRecordsByStudent(studentId=${studentId})`);

    try {
      const rows = await db
        .select({
          id: academicRecords.id,
          studentId: academicRecords.studentId,
          classId: academicRecords.classId,
          grade: academicRecords.grade,
          academicYear: academicRecords.academicYear,
          sessionStart: academicRecords.sessionStart,
          sessionEnd: academicRecords.sessionEnd,
          createdAt: academicRecords.createdAt,
          updatedAt: academicRecords.updatedAt,
          className: classes.section,
          classGrade: classes.grade,
          classStream: classes.stream,
          studentName: users.name,
        })
        .from(academicRecords)
        .leftJoin(classes, eq(classes.id, academicRecords.classId))
        .leftJoin(users, eq(users.id, academicRecords.studentId))
        .where(eq(academicRecords.studentId, studentId))
        .orderBy(desc(academicRecords.sessionStart));

      return rows as AcademicRecordRow[];
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`${LOG} getAcademicRecordsByStudent error: ${msg}`);
      return [];
    }
  }

  /**
   * Get academic records for a student within a session date range.
   *
   * @param studentId - The `users.id` of the student.
   * @param startDate - ISO date string for the lower bound of `session_start`.
   * @param endDate   - ISO date string for the upper bound of `session_end`.
   * @returns Array of {@link AcademicRecordRow}; empty if none found.
   */
  async getAcademicRecordsByDateRange(
    studentId: number,
    startDate: string,
    endDate: string
  ): Promise<AcademicRecordRow[]> {
    console.log(
      `${LOG} getAcademicRecordsByDateRange(studentId=${studentId}, ` +
        `start=${startDate}, end=${endDate})`
    );

    try {
      const rows = await db
        .select({
          id: academicRecords.id,
          studentId: academicRecords.studentId,
          classId: academicRecords.classId,
          grade: academicRecords.grade,
          academicYear: academicRecords.academicYear,
          sessionStart: academicRecords.sessionStart,
          sessionEnd: academicRecords.sessionEnd,
          createdAt: academicRecords.createdAt,
          updatedAt: academicRecords.updatedAt,
          className: classes.section,
          classGrade: classes.grade,
          classStream: classes.stream,
          studentName: users.name,
        })
        .from(academicRecords)
        .leftJoin(classes, eq(classes.id, academicRecords.classId))
        .leftJoin(users, eq(users.id, academicRecords.studentId))
        .where(
          and(
            eq(academicRecords.studentId, studentId),
            // Text comparison works for ISO date strings (YYYY-MM-DD)
            gte(academicRecords.sessionStart, startDate),
            lte(academicRecords.sessionEnd, endDate)
          )
        )
        .orderBy(desc(academicRecords.sessionStart));

      return rows as AcademicRecordRow[];
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`${LOG} getAcademicRecordsByDateRange error: ${msg}`);
      return [];
    }
  }

  /**
   * Create a new academic record.
   *
   * @param input - Fields for the new record.
   * @returns The created row.
   */
  async createAcademicRecord(input: {
    studentId: number;
    classId?: number | null;
    grade?: string | null;
    academicYear: string;
    sessionStart: string;
    sessionEnd?: string | null;
  }): Promise<typeof academicRecords.$inferSelect> {
    console.log(
      `${LOG} createAcademicRecord(studentId=${input.studentId}, ` +
        `academicYear=${input.academicYear})`
    );

    const now = new Date().toISOString();
    const [result] = await db
      .insert(academicRecords)
      .values({
        studentId: input.studentId,
        classId: input.classId ?? null,
        grade: input.grade ?? null,
        academicYear: input.academicYear,
        sessionStart: input.sessionStart,
        sessionEnd: input.sessionEnd ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return result;
  }

  /**
   * Update an existing academic record.
   *
   * @param recordId - The `academic_records.id` to update.
   * @param updates  - Partial fields to apply.
   * @returns The updated row, or `undefined` if not found.
   */
  async updateAcademicRecord(
    recordId: number,
    updates: Partial<{
      studentId: number;
      classId: number | null;
      grade: string | null;
      academicYear: string;
      sessionStart: string;
      sessionEnd: string | null;
    }>
  ): Promise<typeof academicRecords.$inferSelect | undefined> {
    console.log(`${LOG} updateAcademicRecord(recordId=${recordId})`);

    const [result] = await db
      .update(academicRecords)
      .set({
        ...updates,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(academicRecords.id, recordId))
      .returning();

    return result;
  }

  /**
   * Compute a summary of a student's academic history.
   *
   * @param studentId - The `users.id` of the student.
   * @returns {@link AcademicSummary} with current grade and GPA average.
   */
  async getAcademicSummary(studentId: number): Promise<AcademicSummary> {
    console.log(`${LOG} getAcademicSummary(studentId=${studentId})`);

    const records = await this.getAcademicRecordsByStudent(studentId);

    if (records.length === 0) {
      return {
        currentGrade: null,
        currentClassId: null,
        className: null,
        averageGrade: null,
        totalSemesters: 0,
      };
    }

    // Records are ordered newest-first
    const mostRecent = records[0];

    const gradePoints: number[] = records
      .filter((r): r is AcademicRecordRow & { grade: string } => r.grade !== null)
      .map((r): number => AcademicRecordService.GRADE_POINTS[r.grade] ?? 0);

    const averageGrade: number | null =
      gradePoints.length > 0
        ? gradePoints.reduce((a: number, b: number) => a + b, 0) / gradePoints.length
        : null;

    return {
      currentGrade: mostRecent.grade,
      currentClassId: mostRecent.classId,
      className: mostRecent.className,
      averageGrade,
      totalSemesters: records.length,
    };
  }
}

/** Singleton instance for use across the server. */
export const academicRecordService = new AcademicRecordService();
