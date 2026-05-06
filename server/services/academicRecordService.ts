/**
 * Academic Record Service - Handles student academic performance tracking
 * Status: New service for student history feature
 */

import { db } from "./db.js";
import {
  academic_records,
  classes,
  students,
} from "../shared/schema.js";
import { and, desc, eq } from "drizzle-orm";

export class AcademicRecordService {
  /**
   * Get all academic records for a student
   */
  async getAcademicRecordsByStudent(studentId: number) {
    const records = await db
      .select({
        id: academic_records.id,
        student_id: academic_records.student_id,
        class_id: academic_records.class_id,
        grade: academic_records.grade,
        academic_year: academic_records.academic_year,
        session_start: academic_records.session_start,
        session_end: academic_records.session_end,
        created_at: academic_records.created_at,
        updated_at: academic_records.updated_at,
        className: classes.section,
        classGrade: classes.grade,
        classStream: classes.stream,
        studentName: students.name,
      })
      .from(academic_records)
      .leftJoin(classes, eq(classes.id, academic_records.class_id))
      .leftJoin(students, eq(students.id, academic_records.student_id))
      .where(eq(academic_records.student_id, studentId))
      .orderBy(desc(academic_records.session_start));

    return records;
  }

  /**
   * Get academic records for a student within a date range
   */
  async getAcademicRecordsByDateRange(
    studentId: number,
    startDate: string,
    endDate: string
  ) {
    const records = await db
      .select({
        id: academic_records.id,
        student_id: academic_records.student_id,
        class_id: academic_records.class_id,
        grade: academic_records.grade,
        academic_year: academic_records.academic_year,
        session_start: academic_records.session_start,
        session_end: academic_records.session_end,
        created_at: academic_records.created_at,
        updated_at: academic_records.updated_at,
        className: classes.section,
        classGrade: classes.grade,
        classStream: classes.stream,
        studentName: students.name,
      })
      .from(academic_records)
      .leftJoin(classes, eq(classes.id, academic_records.class_id))
      .leftJoin(students, eq(students.id, academic_records.student_id))
      .where(
        and(
          eq(academic_records.student_id, studentId),
          academic_records.session_start >= startDate,
          academic_records.session_end <= endDate
        )
      )
      .orderBy(desc(academic_records.session_start));

    return records;
  }

  /**
   * Create a new academic record
   */
  async createAcademicRecord(input: any) {
    const [result] = await db
      .insert(academic_records)
      .values({
        student_id: input.student_id,
        class_id: input.class_id,
        grade: input.grade,
        academic_year: input.academic_year,
        session_start: input.session_start,
        session_end: input.session_end,
      })
      .returning();

    return result;
  }

  /**
   * Update an existing academic record
   */
  async updateAcademicRecord(recordId: number, updates: any) {
    const [result] = await db
      .update(academic_records)
      .set({
        student_id: updates.student_id,
        class_id: updates.class_id,
        grade: updates.grade,
        academic_year: updates.academic_year,
        session_start: updates.session_start,
        session_end: updates.session_end,
        updated_at: new Date().toISOString(),
      })
      .where(eq(academic_records.id, recordId))
      .returning();

    return result;
  }

  /**
   * Get academic summary for a student
   */
  async getAcademicSummary(studentId: number) {
    const records = await this.getAcademicRecordsByStudent(studentId);

    if (!records.length) {
      return {
        currentGrade: null,
        currentClassId: null,
        averageGrade: null,
        totalSemesters: 0,
      };
    }

    // Find the most recent record
    const mostRecent = records[0];

    // Calculate grade statistics
    const grades = records
      .filter((r) => r.grade)
      .map((r) => {
        // Simple grade to points conversion
        const gradeMap: { [key: string]: number } = {
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
        return gradeMap[r.grade] || 0;
      });

    const averageGrade =
      grades.length > 0
        ? grades.reduce((a, b) => a + b, 0) / grades.length
        : null;

    return {
      currentGrade: mostRecent.grade,
      currentClassId: mostRecent.class_id,
      className: mostRecent.className,
      averageGrade,
      totalSemesters: records.length,
    };
  }
}

export const academicRecordService = new AcademicRecordService();