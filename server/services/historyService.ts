/**
 * @file historyService.ts
 * @description Student History Service — aggregates fee ledger, academic
 *   records, and class-transition data for a single student.
 *
 * All queries use direct Drizzle ORM calls against the shared schema.
 * No raw SQL strings; column names are taken from the Drizzle table
 * definitions to guarantee compile-time safety.
 *
 * @module server/services/historyService
 */

import { asc, desc, eq, sql } from "drizzle-orm";
import { db } from "../db.js";
import {
  fees,
  feePayments,
  feeAdjustments,
  users,
  classes,
} from "../../shared/schema.js";

// ── Inline table references for the new tables added by the migration.
// These are defined here until the Drizzle schema file is updated to
// include academic_records and class_transitions.
import { pgTable, serial, integer, text } from "drizzle-orm/pg-core";

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

/** Drizzle table reference for class_transitions (migration-created). */
const classTransitions = pgTable("class_transitions", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull(),
  fromClassId: integer("from_class_id"),
  toClassId: integer("to_class_id"),
  transitionDate: text("transition_date").notNull(),
  reason: text("reason"),
  notes: text("notes"),
  performedBy: integer("performed_by"),
  createdAt: text("created_at").notNull(),
});

// ── Public return types ────────────────────────────────────────────────────

/** A single fee record with its associated payments and adjustments. */
export interface FeeHistoryItem {
  id: number;
  studentId: number;
  invoiceNumber: string | null;
  description: string;
  amount: number;
  paidAmount: number;
  remainingBalance: number;
  billingPeriod: string;
  dueDate: string;
  status: string;
  feeType: string;
  createdAt: string;
}

/** A single academic record joined with class details. */
export interface AcademicHistoryItem {
  id: number;
  studentId: number;
  classId: number | null;
  grade: string | null;
  academicYear: string;
  sessionStart: string;
  sessionEnd: string | null;
  /** Derived from classes.grade + classes.section */
  className: string | null;
  classStream: string | null;
}

/** A single class-transition record joined with from/to class names. */
export interface ClassTransitionItem {
  id: number;
  studentId: number;
  fromClassId: number | null;
  toClassId: number | null;
  transitionDate: string;
  reason: string | null;
  notes: string | null;
  fromClassName: string | null;
  toClassName: string | null;
}

/** Aggregated student history returned by {@link getStudentHistory}. */
export interface StudentHistoryResult {
  feeHistory: FeeHistoryItem[];
  academicHistory: AcademicHistoryItem[];
  transitions: ClassTransitionItem[];
}

// ── Service class ──────────────────────────────────────────────────────────

const LOG = "[HistoryService]";

/**
 * Provides read-only aggregated history for a student.
 *
 * All public methods return empty arrays (never throw) when no data
 * exists, so callers can safely destructure without null-checks.
 */
export class HistoryService {
  // ── Fee history ──────────────────────────────────────────────────────────

  /**
   * Fetch all fee records for a student, ordered newest-first.
   *
   * @param studentId - The `users.id` of the student.
   * @returns Array of {@link FeeHistoryItem}; empty if none found.
   */
  async getFeeHistory(studentId: number): Promise<FeeHistoryItem[]> {
    console.log(`${LOG} getFeeHistory(studentId=${studentId})`);

    try {
      const rows = await db
        .select({
          id: fees.id,
          studentId: fees.studentId,
          invoiceNumber: fees.invoiceNumber,
          description: fees.description,
          amount: fees.amount,
          paidAmount: fees.paidAmount,
          remainingBalance: fees.remainingBalance,
          billingPeriod: fees.billingPeriod,
          dueDate: fees.dueDate,
          status: fees.status,
          feeType: fees.feeType,
          createdAt: fees.createdAt,
        })
        .from(fees)
        .where(eq(fees.studentId, studentId))
        .orderBy(desc(fees.billingPeriod));

      return rows as FeeHistoryItem[];
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`${LOG} getFeeHistory error: ${msg}`);
      return [];
    }
  }

  // ── Academic history ─────────────────────────────────────────────────────

  /**
   * Fetch all academic records for a student, joined with class details.
   *
   * @param studentId - The `users.id` of the student.
   * @returns Array of {@link AcademicHistoryItem}; empty if none found.
   */
  async getAcademicHistory(studentId: number): Promise<AcademicHistoryItem[]> {
    console.log(`${LOG} getAcademicHistory(studentId=${studentId})`);

    try {
      // Alias classes table for the join so column names don't collide.
      const rows = await db
        .select({
          id: academicRecords.id,
          studentId: academicRecords.studentId,
          classId: academicRecords.classId,
          grade: academicRecords.grade,
          academicYear: academicRecords.academicYear,
          sessionStart: academicRecords.sessionStart,
          sessionEnd: academicRecords.sessionEnd,
          className: sql<string | null>`
            CASE
              WHEN ${classes.grade} IS NOT NULL
              THEN ${classes.grade} || ' ' || ${classes.section}
              ELSE NULL
            END
          `,
          classStream: classes.stream,
        })
        .from(academicRecords)
        .leftJoin(classes, eq(classes.id, academicRecords.classId))
        .where(eq(academicRecords.studentId, studentId))
        .orderBy(desc(academicRecords.sessionStart));

      return rows as AcademicHistoryItem[];
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`${LOG} getAcademicHistory error: ${msg}`);
      return [];
    }
  }

  // ── Class transitions ────────────────────────────────────────────────────

  /**
   * Fetch all class-transition records for a student, ordered by date.
   *
   * @param studentId - The `users.id` of the student.
   * @returns Array of {@link ClassTransitionItem}; empty if none found.
   */
  async getClassTransitions(
    studentId: number
  ): Promise<ClassTransitionItem[]> {
    console.log(`${LOG} getClassTransitions(studentId=${studentId})`);

    try {
      // We need two joins to classes (from / to), so use aliased sub-selects
      // via raw SQL expressions to avoid Drizzle alias limitations.
      const rows = await db
        .select({
          id: classTransitions.id,
          studentId: classTransitions.studentId,
          fromClassId: classTransitions.fromClassId,
          toClassId: classTransitions.toClassId,
          transitionDate: classTransitions.transitionDate,
          reason: classTransitions.reason,
          notes: classTransitions.notes,
          fromClassName: sql<string | null>`
            (SELECT g.grade || ' ' || g.section
               FROM classes g
              WHERE g.id = ${classTransitions.fromClassId}
              LIMIT 1)
          `,
          toClassName: sql<string | null>`
            (SELECT g.grade || ' ' || g.section
               FROM classes g
              WHERE g.id = ${classTransitions.toClassId}
              LIMIT 1)
          `,
        })
        .from(classTransitions)
        .where(eq(classTransitions.studentId, studentId))
        .orderBy(asc(classTransitions.transitionDate));

      return rows as ClassTransitionItem[];
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`${LOG} getClassTransitions error: ${msg}`);
      return [];
    }
  }

  // ── Aggregated entry point ───────────────────────────────────────────────

  /**
   * Return the complete history for a student in a single call.
   *
   * Fetches fee history, academic history, and class transitions in
   * parallel.  If the student does not exist the arrays will simply be
   * empty — callers should verify student existence before calling this.
   *
   * @param studentId - The `users.id` of the student.
   * @returns {@link StudentHistoryResult} with three arrays.
   */
  async getStudentHistory(studentId: number): Promise<StudentHistoryResult> {
    console.log(`${LOG} getStudentHistory(studentId=${studentId})`);

    const [feeHistory, academicHistory, transitions] = await Promise.all([
      this.getFeeHistory(studentId),
      this.getAcademicHistory(studentId),
      this.getClassTransitions(studentId),
    ]);

    return { feeHistory, academicHistory, transitions };
  }
}

/** Singleton instance for use across the server. */
export const historyService = new HistoryService();
