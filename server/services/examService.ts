import { and, asc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db } from "../db.js";
import { AppError, ValidationError } from "../errors.js";
import {
  academicSessions,
  classes,
  examAttendance,
  examMarks,
  examSessions,
  examSubjects,
  gradeScales,
  users,
  type SelectExamMark,
  type SelectExamSession,
  type SelectExamSubject,
  type SelectGradeScale,
} from "../../shared/schema.js";

export type ExamType = "MAT" | "HALF_YEARLY" | "ANNUAL";

export interface CreateExamSessionPayload {
  academicSessionId: number;
  classId: number;
  examType: ExamType;
  monthLabel?: string;
  title: string;
  startDate: Date;
  endDate: Date;
  totalMarks: number;
  passingMarks: number;
  createdBy: number;
  subjects: {
    subjectName: string;
    subjectCode?: string;
    maxTheoryMarks: number;
    maxPracticalMarks?: number;
    examDate: Date;
    examTime?: string;
    venue?: string;
    sortOrder?: number;
  }[];
}

export interface MarkEntryItem {
  studentId: number;
  theoryMarks?: number;
  practicalMarks?: number;
  isAbsent?: boolean;
  isExempted?: boolean;
  remarks?: string;
  enteredBy?: number;
}

export interface ExamStatistics {
  examSessionId: number;
  totalStudents: number;
  appeared: number;
  absent: number;
  classAverage: number;
  highestMarks: number;
  lowestMarks: number;
  passCount: number;
  failCount: number;
  passRate: number;
  gradeDistribution: Record<string, number>;
  topThree: { rank: number; studentId: number; name: string; obtained: number; percentage: number; grade: string }[];
  subjectAverages: { subjectName: string; average: number; highest: number; lowest: number }[];
}

export interface MATAggregate {
  studentId: number;
  name: string;
  rollNo: string;
  monthlyScores: { month: string; obtained: number; maxMarks: number; percentage: number }[];
  bestNScores: number[];
  aggregateMarks: number;
}

export interface StudentMarksheetData {
  student: {
    id: number;
    name: string;
    fatherName: string;
    rollNo: string;
    admissionNo: string;
    className: string;
    section: string;
  };
  examSession: {
    title: string;
    examType: string;
    academicYear: string;
  };
  subjects: {
    sr: number;
    subjectName: string;
    subjectCode: string | null;
    maxTheory: number;
    maxPractical: number;
    maxTotal: number;
    theoryObtained: number | null;
    practicalObtained: number | null;
    totalObtained: number | null;
    grade: string | null;
    isAbsent: boolean;
    isExempted: boolean;
    remarks: string | null;
  }[];
  result: {
    totalMaxMarks: number;
    totalObtained: number;
    percentage: number;
    grade: string;
    division: string;
    gpaPoints: number;
    positionInClass: number;
    isPassed: boolean;
  };
  attendance: {
    totalDays: number;
    presentDays: number;
    absentDays: number;
    percentage: number;
  } | null;
}

export type ExamSessionWithSubjects = SelectExamSession & {
  className: string;
  academicYear: string;
  subjects: SelectExamSubject[];
};

export type MarkEntryStudent = {
  studentId: number;
  name: string;
  rollNo: string;
  theoryMarks: number | null;
  practicalMarks: number | null;
  totalObtained: number | null;
  grade: string | null;
  isAbsent: boolean;
  remarks: string | null;
};

const toNumber = (value: unknown): number => {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value) || 0;
  return 0;
};

const round2 = (value: number): number => Math.round(value * 100) / 100;

const classLabel = (row: { grade: string; section: string; stream?: string | null }): string =>
  `${row.grade} ${row.section}${row.stream ? ` - ${row.stream}` : ""}`.trim();

const classKeys = (row: { grade: string; section: string; stream?: string | null }): string[] => [
  classLabel(row),
  `${row.grade}-${row.section}${row.stream ? `-${row.stream}` : ""}`.trim(),
];

async function getSessionOrThrow(examSessionId: number): Promise<SelectExamSession> {
  const [session] = await db.select().from(examSessions).where(eq(examSessions.id, examSessionId)).limit(1);
  if (!session) throw new AppError("Exam session not found", "EXAM_SESSION_NOT_FOUND", 404);
  return session;
}

async function getSubjectOrThrow(subjectId: number): Promise<SelectExamSubject> {
  const [subject] = await db.select().from(examSubjects).where(eq(examSubjects.id, subjectId)).limit(1);
  if (!subject) throw new AppError("Exam subject not found", "EXAM_SUBJECT_NOT_FOUND", 404);
  return subject;
}

async function getClassStudents(classId: number): Promise<Array<typeof users.$inferSelect>> {
  const [classRow] = await db.select().from(classes).where(eq(classes.id, classId)).limit(1);
  if (!classRow) throw new AppError("Class not found", "CLASS_NOT_FOUND", 404);
  const keys = classKeys(classRow);
  return db.select().from(users).where(and(eq(users.role, "student"), inArray(users.className, keys)));
}

export async function createExamSession(payload: CreateExamSessionPayload): Promise<ExamSessionWithSubjects> {
  if (payload.passingMarks >= payload.totalMarks) {
    throw new ValidationError("Passing marks must be less than total marks");
  }
  if (payload.examType === "MAT" && !payload.monthLabel?.trim()) {
    throw new ValidationError("Month label is required for monthly assessment tests");
  }
  if (payload.subjects.length === 0) {
    throw new ValidationError("At least one subject is required");
  }

  return db.transaction(async (tx) => {
    const duplicate = await tx
      .select({ id: examSessions.id })
      .from(examSessions)
      .where(
        and(
          eq(examSessions.academicSessionId, payload.academicSessionId),
          eq(examSessions.classId, payload.classId),
          eq(examSessions.examType, payload.examType),
          payload.monthLabel ? eq(examSessions.monthLabel, payload.monthLabel) : sql`${examSessions.monthLabel} is null`
        )
      )
      .limit(1);

    if (duplicate[0]) {
      throw new AppError("An exam session already exists for this class, type, and month", "EXAM_SESSION_DUPLICATE", 409);
    }

    const [created] = await tx
      .insert(examSessions)
      .values({
        academicSessionId: payload.academicSessionId,
        classId: payload.classId,
        examType: payload.examType,
        monthLabel: payload.monthLabel?.trim() || null,
        title: payload.title.trim(),
        startDate: payload.startDate,
        endDate: payload.endDate,
        totalMarks: payload.totalMarks,
        passingMarks: payload.passingMarks,
        createdBy: payload.createdBy,
      })
      .returning();

    const createdSubjects = await tx
      .insert(examSubjects)
      .values(
        payload.subjects.map((subject, index) => ({
          examSessionId: created.id,
          subjectName: subject.subjectName.trim(),
          subjectCode: subject.subjectCode?.trim() || null,
          maxTheoryMarks: subject.maxTheoryMarks,
          maxPracticalMarks: subject.maxPracticalMarks ?? 0,
          examDate: subject.examDate,
          examTime: subject.examTime?.trim() || null,
          venue: subject.venue?.trim() || null,
          sortOrder: subject.sortOrder ?? index + 1,
        }))
      )
      .returning();

    const [classRow] = await tx.select().from(classes).where(eq(classes.id, created.classId)).limit(1);
    const [academicRow] = await tx.select().from(academicSessions).where(eq(academicSessions.id, created.academicSessionId)).limit(1);

    return {
      ...created,
      className: classRow ? classLabel(classRow) : `Class #${created.classId}`,
      academicYear: academicRow?.name ?? "",
      subjects: createdSubjects,
    };
  });
}

export async function getGradeFromPercentage(percentage: number): Promise<SelectGradeScale> {
  const [direct] = await db
    .select()
    .from(gradeScales)
    .where(and(eq(gradeScales.isActive, true), lte(gradeScales.minPercentage, String(percentage)), gte(gradeScales.maxPercentage, String(percentage))))
    .limit(1);
  if (direct) return direct;

  const scales = await db.select().from(gradeScales).where(eq(gradeScales.isActive, true)).orderBy(asc(gradeScales.minPercentage));
  const fallback = scales.find((scale) => percentage >= toNumber(scale.minPercentage) && percentage < toNumber(scale.maxPercentage) + 1);
  if (!fallback) throw new AppError("No active grade scale matches the percentage", "GRADE_SCALE_NOT_FOUND", 500);
  return fallback;
}

export async function bulkUpsertMarks(subjectId: number, entries: MarkEntryItem[]): Promise<SelectExamMark[]> {
  const subject = await getSubjectOrThrow(subjectId);
  if (entries.length === 0) throw new ValidationError("At least one mark entry is required");

  const maxTheory = subject.maxTheoryMarks;
  const maxPractical = subject.maxPracticalMarks;
  const seen = new Set<number>();
  for (const entry of entries) {
    if (seen.has(entry.studentId)) throw new ValidationError(`Duplicate mark entry for student #${entry.studentId}`);
    seen.add(entry.studentId);
    if (entry.isAbsent || entry.isExempted) continue;
    const theory = entry.theoryMarks ?? 0;
    const practical = entry.practicalMarks ?? 0;
    if (theory < 0 || theory > maxTheory) throw new ValidationError(`Theory marks exceed maximum for student #${entry.studentId}`);
    if (practical < 0 || practical > maxPractical) throw new ValidationError(`Practical marks exceed maximum for student #${entry.studentId}`);
  }

  const values = await Promise.all(
    entries.map(async (entry) => {
      const total = entry.isAbsent || entry.isExempted ? null : round2((entry.theoryMarks ?? 0) + (entry.practicalMarks ?? 0));
      const maxTotal = maxTheory + maxPractical;
      const grade = total === null ? null : (await getGradeFromPercentage((total / maxTotal) * 100)).grade;
      return {
        examSubjectId: subjectId,
        studentId: entry.studentId,
        theoryMarks: entry.isAbsent || entry.isExempted ? null : String(entry.theoryMarks ?? 0),
        practicalMarks: entry.isAbsent || entry.isExempted ? null : String(entry.practicalMarks ?? 0),
        totalObtained: total === null ? null : String(total),
        grade,
        isAbsent: entry.isAbsent ?? false,
        isExempted: entry.isExempted ?? false,
        remarks: entry.remarks?.trim() || null,
        enteredBy: entry.enteredBy ?? null,
        updatedAt: new Date(),
      };
    })
  );

  return db.transaction(async (tx) =>
    tx
      .insert(examMarks)
      .values(values)
      .onConflictDoUpdate({
        target: [examMarks.examSubjectId, examMarks.studentId],
        set: {
          theoryMarks: sql`excluded.theory_marks`,
          practicalMarks: sql`excluded.practical_marks`,
          totalObtained: sql`excluded.total_obtained`,
          grade: sql`excluded.grade`,
          isAbsent: sql`excluded.is_absent`,
          isExempted: sql`excluded.is_exempted`,
          remarks: sql`excluded.remarks`,
          enteredBy: sql`excluded.entered_by`,
          updatedAt: new Date(),
        },
      })
      .returning()
  );
}

export async function calculateExamStatistics(examSessionId: number): Promise<ExamStatistics> {
  const session = await getSessionOrThrow(examSessionId);
  const [subjects, students] = await Promise.all([
    db.select().from(examSubjects).where(eq(examSubjects.examSessionId, examSessionId)).orderBy(asc(examSubjects.sortOrder)),
    getClassStudents(session.classId),
  ]);
  const marks = subjects.length
    ? await db.select().from(examMarks).where(inArray(examMarks.examSubjectId, subjects.map((subject) => subject.id)))
    : [];
  const subjectById = new Map(subjects.map((subject) => [subject.id, subject]));
  const studentTotals = students.map((student) => {
    const studentMarks = marks.filter((mark) => mark.studentId === student.id);
    const obtained = studentMarks.reduce((sum, mark) => sum + toNumber(mark.totalObtained), 0);
    const absent = studentMarks.some((mark) => mark.isAbsent);
    const max = subjects.reduce((sum, subject) => sum + subject.maxTheoryMarks + subject.maxPracticalMarks, 0);
    return { student, obtained, max, absent, percentage: max > 0 ? round2((obtained / max) * 100) : 0 };
  });

  const enriched = await Promise.all(
    studentTotals.map(async (row) => ({ ...row, grade: (await getGradeFromPercentage(row.percentage)).grade }))
  );
  const appeared = enriched.filter((row) => !row.absent).length;
  const passCount = enriched.filter((row) => row.obtained >= session.passingMarks).length;
  const gradeDistribution = enriched.reduce<Record<string, number>>((acc, row) => {
    acc[row.grade] = (acc[row.grade] ?? 0) + 1;
    return acc;
  }, {});

  const subjectAverages = subjects.map((subject) => {
    const subjectMarks = marks.filter((mark) => mark.examSubjectId === subject.id && !mark.isAbsent).map((mark) => toNumber(mark.totalObtained));
    return {
      subjectName: subject.subjectName,
      average: round2(subjectMarks.reduce((sum, value) => sum + value, 0) / Math.max(subjectMarks.length, 1)),
      highest: subjectMarks.length ? Math.max(...subjectMarks) : 0,
      lowest: subjectMarks.length ? Math.min(...subjectMarks) : 0,
    };
  });

  return {
    examSessionId,
    totalStudents: students.length,
    appeared,
    absent: students.length - appeared,
    classAverage: round2(enriched.reduce((sum, row) => sum + row.percentage, 0) / Math.max(enriched.length, 1)),
    highestMarks: enriched.length ? Math.max(...enriched.map((row) => row.obtained)) : 0,
    lowestMarks: enriched.length ? Math.min(...enriched.map((row) => row.obtained)) : 0,
    passCount,
    failCount: Math.max(students.length - passCount, 0),
    passRate: round2((passCount / Math.max(students.length, 1)) * 100),
    gradeDistribution,
    topThree: enriched
      .sort((left, right) => right.obtained - left.obtained)
      .slice(0, 3)
      .map((row, index) => ({
        rank: index + 1,
        studentId: row.student.id,
        name: row.student.name,
        obtained: row.obtained,
        percentage: row.percentage,
        grade: row.grade,
      })),
    subjectAverages,
  };
}

export async function getStudentMarksheetData(examSessionId: number, studentId: number): Promise<StudentMarksheetData> {
  const [session] = await db
    .select({
      exam: examSessions,
      academicYear: academicSessions.name,
      classGrade: classes.grade,
      classSection: classes.section,
      classStream: classes.stream,
    })
    .from(examSessions)
    .innerJoin(academicSessions, eq(examSessions.academicSessionId, academicSessions.id))
    .innerJoin(classes, eq(examSessions.classId, classes.id))
    .where(eq(examSessions.id, examSessionId))
    .limit(1);
  if (!session) throw new AppError("Exam session not found", "EXAM_SESSION_NOT_FOUND", 404);

  const [student] = await db.select().from(users).where(eq(users.id, studentId)).limit(1);
  if (!student) throw new AppError("Student not found", "STUDENT_NOT_FOUND", 404);

  const subjects = await db.select().from(examSubjects).where(eq(examSubjects.examSessionId, examSessionId)).orderBy(asc(examSubjects.sortOrder));
  const marks = subjects.length
    ? await db.select().from(examMarks).where(and(inArray(examMarks.examSubjectId, subjects.map((subject) => subject.id)), eq(examMarks.studentId, studentId)))
    : [];
  const markBySubject = new Map(marks.map((mark) => [mark.examSubjectId, mark]));
  const subjectRows = subjects.map((subject, index) => {
    const mark = markBySubject.get(subject.id);
    return {
      sr: index + 1,
      subjectName: subject.subjectName,
      subjectCode: subject.subjectCode,
      maxTheory: subject.maxTheoryMarks,
      maxPractical: subject.maxPracticalMarks,
      maxTotal: subject.maxTheoryMarks + subject.maxPracticalMarks,
      theoryObtained: mark?.theoryMarks === null || mark?.theoryMarks === undefined ? null : toNumber(mark.theoryMarks),
      practicalObtained: mark?.practicalMarks === null || mark?.practicalMarks === undefined ? null : toNumber(mark.practicalMarks),
      totalObtained: mark?.totalObtained === null || mark?.totalObtained === undefined ? null : toNumber(mark.totalObtained),
      grade: mark?.grade ?? null,
      isAbsent: mark?.isAbsent ?? false,
      isExempted: mark?.isExempted ?? false,
      remarks: mark?.remarks ?? null,
    };
  });

  const totalMaxMarks = subjectRows.reduce((sum, subject) => sum + subject.maxTotal, 0);
  const totalObtained = subjectRows.reduce((sum, subject) => sum + (subject.totalObtained ?? 0), 0);
  const percentage = totalMaxMarks > 0 ? round2((totalObtained / totalMaxMarks) * 100) : 0;
  const grade = await getGradeFromPercentage(percentage);
  const statistics = await calculateExamStatistics(examSessionId);
  const position = statistics.topThree.find((row) => row.studentId === studentId)?.rank ?? 0;
  const [attendance] = await db
    .select()
    .from(examAttendance)
    .where(and(eq(examAttendance.examSessionId, examSessionId), eq(examAttendance.studentId, studentId)))
    .limit(1);

  return {
    student: {
      id: student.id,
      name: student.name,
      fatherName: student.fatherName ?? "",
      rollNo: student.rollNumber ?? "",
      admissionNo: String(student.id),
      className: `${session.classGrade}${session.classStream ? ` - ${session.classStream}` : ""}`,
      section: session.classSection,
    },
    examSession: {
      title: session.exam.title,
      examType: session.exam.examType,
      academicYear: session.academicYear,
    },
    subjects: subjectRows,
    result: {
      totalMaxMarks,
      totalObtained,
      percentage,
      grade: grade.grade,
      division: grade.division,
      gpaPoints: toNumber(grade.gpaPoints),
      positionInClass: position,
      isPassed: totalObtained >= session.exam.passingMarks,
    },
    attendance: attendance
      ? {
          totalDays: attendance.totalDays,
          presentDays: attendance.presentDays,
          absentDays: Math.max(attendance.totalDays - attendance.presentDays, 0),
          percentage: round2((attendance.presentDays / Math.max(attendance.totalDays, 1)) * 100),
        }
      : null,
  };
}

export async function computeMATAggregate(classId: number, academicSessionId: number, bestOf: number, outOf: number): Promise<MATAggregate[]> {
  const students = await getClassStudents(classId);
  const sessions = await db
    .select()
    .from(examSessions)
    .where(and(eq(examSessions.classId, classId), eq(examSessions.academicSessionId, academicSessionId), eq(examSessions.examType, "MAT")))
    .orderBy(asc(examSessions.startDate));
  const subjects = sessions.length
    ? await db.select().from(examSubjects).where(inArray(examSubjects.examSessionId, sessions.map((session) => session.id)))
    : [];
  const marks = subjects.length
    ? await db.select().from(examMarks).where(inArray(examMarks.examSubjectId, subjects.map((subject) => subject.id)))
    : [];
  const subjectsBySession = new Map<number, SelectExamSubject[]>();
  for (const subject of subjects) {
    const list = subjectsBySession.get(subject.examSessionId) ?? [];
    list.push(subject);
    subjectsBySession.set(subject.examSessionId, list);
  }

  return students
    .map((student) => {
      const monthlyScores = sessions.map((session) => {
        const sessionSubjects = subjectsBySession.get(session.id) ?? [];
        const subjectIds = new Set(sessionSubjects.map((subject) => subject.id));
        const maxMarks = sessionSubjects.reduce((sum, subject) => sum + subject.maxTheoryMarks + subject.maxPracticalMarks, 0);
        const obtained = marks
          .filter((mark) => mark.studentId === student.id && subjectIds.has(mark.examSubjectId))
          .reduce((sum, mark) => sum + toNumber(mark.totalObtained), 0);
        return {
          month: session.monthLabel ?? session.title,
          obtained,
          maxMarks,
          percentage: maxMarks > 0 ? round2((obtained / maxMarks) * 100) : 0,
        };
      });
      const bestNScores = monthlyScores
        .map((score) => score.percentage)
        .sort((left, right) => right - left)
        .slice(0, bestOf);
      const bestAverage = bestNScores.reduce((sum, value) => sum + value, 0) / Math.max(bestNScores.length, 1);
      return {
        studentId: student.id,
        name: student.name,
        rollNo: student.rollNumber ?? "",
        monthlyScores,
        bestNScores,
        aggregateMarks: round2((bestAverage / 100) * outOf),
      };
    })
    .sort((left, right) => right.aggregateMarks - left.aggregateMarks);
}

export async function listExamSessions(classId?: number): Promise<ExamSessionWithSubjects[]> {
  const sessionRows = await db
    .select({
      exam: examSessions,
      classGrade: classes.grade,
      classSection: classes.section,
      classStream: classes.stream,
      academicYear: academicSessions.name,
    })
    .from(examSessions)
    .innerJoin(classes, eq(examSessions.classId, classes.id))
    .innerJoin(academicSessions, eq(examSessions.academicSessionId, academicSessions.id))
    .where(classId ? eq(examSessions.classId, classId) : undefined)
    .orderBy(asc(examSessions.startDate));
  const subjectRows = sessionRows.length
    ? await db.select().from(examSubjects).where(inArray(examSubjects.examSessionId, sessionRows.map((row) => row.exam.id))).orderBy(asc(examSubjects.sortOrder))
    : [];
  return sessionRows.map((row) => ({
    ...row.exam,
    className: classLabel({ grade: row.classGrade, section: row.classSection, stream: row.classStream }),
    academicYear: row.academicYear,
    subjects: subjectRows.filter((subject) => subject.examSessionId === row.exam.id),
  }));
}

export async function getMarkEntryRows(subjectId: number): Promise<MarkEntryStudent[]> {
  const subject = await getSubjectOrThrow(subjectId);
  const session = await getSessionOrThrow(subject.examSessionId);
  const students = await getClassStudents(session.classId);
  const marks = await db.select().from(examMarks).where(eq(examMarks.examSubjectId, subjectId));
  const markByStudent = new Map(marks.map((mark) => [mark.studentId, mark]));
  return students.map((student) => {
    const mark = markByStudent.get(student.id);
    return {
      studentId: student.id,
      name: student.name,
      rollNo: student.rollNumber ?? "",
      theoryMarks: mark?.theoryMarks === null || mark?.theoryMarks === undefined ? null : toNumber(mark.theoryMarks),
      practicalMarks: mark?.practicalMarks === null || mark?.practicalMarks === undefined ? null : toNumber(mark.practicalMarks),
      totalObtained: mark?.totalObtained === null || mark?.totalObtained === undefined ? null : toNumber(mark.totalObtained),
      grade: mark?.grade ?? null,
      isAbsent: mark?.isAbsent ?? false,
      remarks: mark?.remarks ?? null,
    };
  });
}
