import type { Express, Request, Response } from "express";
import type { Server } from "http";
import { and, asc, avg, count, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { api } from "../shared/routes.js";
import {
  attendanceSessionSchema,
  attendanceStatusSchema,
  classTeachers,
  classes,
  dailyTeachingPulse,
  homeworkDiary,
  homeworkAssignments,
  studentSubmissions,
  timetableDays,
  users,
  type ResultWithStudent,
  type User,
  type InsertFamily,
} from "../shared/schema.js";
import { db } from "./db.js";
import { AssignTeacherSchema, CreateClassSchema } from "../lib/validators/classes.js";
import { registerQrAttendanceRoutes } from "./qr-attendance-routes.js";
import { createSessionMiddleware } from "./session.js";
import { storage } from "./storage.ts";
import { loadTimetableSettings, computePeriodTimeline } from "./lib/settings-loader.js";
import {
  cancelVoucherJob,
  getFreshJobProgress,
  clearJobZip,
  getJobProgress,
  getJobZip,
  previewVoucherJob,
  startVoucherJob,
  subscribeJobSse,
} from "./services/voucherService.js";
import { LedgerService } from "./services/ledgerService.js";
import { AuditService } from "./services/auditService.js";
import { createPresignedDownload, createPresignedUpload } from "./s3.js";
import {
  broadcastHomeworkDiaryPublish,
  broadcastDailyDiaryPublish,
  broadcastHomeworkAssignmentUpdate,
  notifyAdminPublishComplete,
} from "./socket.js";

declare module "express-session" {
  interface SessionData {
    userId: number;
  }
}

const attendedStatuses = new Set(["Present", "Late", "Excused"]);

const parseScalar = (value: unknown) => (Array.isArray(value) ? value[0] : value);

const parseNumberValue = (value: unknown) => {
  const raw = parseScalar(value);
  if (typeof raw !== "string" && typeof raw !== "number") return Number.NaN;
  return Number.parseInt(String(raw), 10);
};

const isUniqueViolation = (err: unknown): err is { code: string } =>
  typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === "23505";

const calculateGpa = (percentage: number) => {
  if (percentage >= 90) return 4;
  if (percentage >= 80) return 3.5;
  if (percentage >= 70) return 3;
  if (percentage >= 60) return 2.5;
  if (percentage >= 50) return 2;
  return 0;
};

const buildExamId = (record: Pick<ResultWithStudent, "examTitle" | "examType" | "term" | "examDate">) =>
  [record.examTitle ?? "Assessment", record.examType ?? "General", record.term ?? "Term", record.examDate ?? "undated"].join("::");

const buildExamLabel = (record: Pick<ResultWithStudent, "examTitle" | "examType" | "term" | "examDate">) =>
  record.examTitle || record.examType || record.term || record.examDate || "Assessment";

const sendApiSuccess = <T>(res: Response, data: T, message?: string, statusCode = 200) =>
  res.status(statusCode).json({ success: true, data, message });

const sendApiError = (res: Response, statusCode: number, error: string) => res.status(statusCode).json({ success: false, error });

const sendHomeworkSuccess = <T>(res: Response, data: T, meta?: Record<string, unknown>, statusCode = 200) =>
  res.status(statusCode).json({ data, error: null, meta });

const sendHomeworkError = (res: Response, statusCode: number, error: string, meta?: Record<string, unknown>) =>
  res.status(statusCode).json({ data: null, error, meta });

const buildClassLabel = (record: { grade: string; section: string; stream?: string | null }) =>
  `${record.grade} ${record.section}${record.stream ? ` - ${record.stream}` : ""}`.trim();

const buildClassNameKey = (record: { grade: string; section: string; stream?: string | null }) =>
  `${record.grade}-${record.section}${record.stream ? `-${record.stream}` : ""}`.trim();

const normalizeClassKey = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
const normalizeGradeOnly = (value: string) => normalizeClassKey(value).replace(/^grade/, "");

const findClassByNameKey = async (className: string | null) => {
  if (!className) return null;
  const trimmed = className.trim();
  const normalized = normalizeClassKey(trimmed);
  const normalizedGradeOnly = normalizeGradeOnly(trimmed);
  const classRows = await db
    .select({
      id: classes.id,
      grade: classes.grade,
      section: classes.section,
      stream: classes.stream,
      academicYear: classes.academicYear,
      capacity: classes.capacity,
      currentCount: classes.currentCount,
    })
    .from(classes);
  const exactMatch = classRows.find((row) => {
    const key = buildClassNameKey(row);
    return key === trimmed || normalizeClassKey(key) === normalized;
  });
  if (exactMatch) return exactMatch;

  if (normalizedGradeOnly) {
    const gradeOnlyMatches = classRows.filter((row) => normalizeGradeOnly(row.grade) === normalizedGradeOnly);
    if (gradeOnlyMatches.length === 1) return gradeOnlyMatches[0];
    if (gradeOnlyMatches.length > 1) {
      return gradeOnlyMatches.find((row) => row.section?.toUpperCase() === "A") ?? gradeOnlyMatches[0];
    }
  }

  return null;
};

const homeworkListStmt = db
  .select({
    id: homeworkAssignments.id,
    classId: homeworkAssignments.classId,
    teacherId: homeworkAssignments.teacherId,
    subject: homeworkAssignments.subject,
    title: homeworkAssignments.title,
    description: homeworkAssignments.description,
    dueDate: homeworkAssignments.dueDate,
    priority: homeworkAssignments.priority,
    files: homeworkAssignments.files,
    status: homeworkAssignments.status,
    createdAt: homeworkAssignments.createdAt,
    classIdRef: classes.id,
    classGrade: classes.grade,
    classSection: classes.section,
    classStream: classes.stream,
    classAcademicYear: classes.academicYear,
    classCapacity: classes.capacity,
    classCurrentCount: classes.currentCount,
    submissionCount: count(studentSubmissions.id),
    averageMarks: avg(studentSubmissions.marks),
  })
  .from(homeworkAssignments)
  .leftJoin(classes, eq(homeworkAssignments.classId, classes.id))
  .leftJoin(studentSubmissions, eq(studentSubmissions.homeworkId, homeworkAssignments.id))
  .where(
    and(
      eq(homeworkAssignments.teacherId, sql.placeholder("teacherId")),
      sql`${sql.placeholder("classId")}::int is null or ${homeworkAssignments.classId} = ${sql.placeholder("classId")}::int`,
      sql`${sql.placeholder("status")}::homework_status_enum is null or ${homeworkAssignments.status} = ${sql.placeholder("status")}::homework_status_enum`,
    ),
  )
  .groupBy(homeworkAssignments.id, classes.id)
  .orderBy(desc(homeworkAssignments.dueDate))
  .limit(sql.placeholder("limit"))
  .offset(sql.placeholder("offset"))
  .prepare("teacher_homework_list");

const homeworkCountStmt = db
  .select({ total: count() })
  .from(homeworkAssignments)
  .where(
    and(
      eq(homeworkAssignments.teacherId, sql.placeholder("teacherId")),
      sql`${sql.placeholder("classId")}::int is null or ${homeworkAssignments.classId} = ${sql.placeholder("classId")}::int`,
      sql`${sql.placeholder("status")}::homework_status_enum is null or ${homeworkAssignments.status} = ${sql.placeholder("status")}::homework_status_enum`,
    ),
  )
  .prepare("teacher_homework_count");

const studentHomeworkListStmt = db
  .select({
    id: homeworkAssignments.id,
    classId: homeworkAssignments.classId,
    teacherId: homeworkAssignments.teacherId,
    subject: homeworkAssignments.subject,
    title: homeworkAssignments.title,
    description: homeworkAssignments.description,
    dueDate: homeworkAssignments.dueDate,
    priority: homeworkAssignments.priority,
    files: homeworkAssignments.files,
    status: homeworkAssignments.status,
    createdAt: homeworkAssignments.createdAt,
    teacherName: users.name,
    classGrade: classes.grade,
    classSection: classes.section,
    classStream: classes.stream,
    classAcademicYear: classes.academicYear,
    classCapacity: classes.capacity,
    classCurrentCount: classes.currentCount,
    submissionId: studentSubmissions.id,
    submittedAt: studentSubmissions.submittedAt,
    marks: studentSubmissions.marks,
  })
  .from(homeworkAssignments)
  .leftJoin(classes, eq(homeworkAssignments.classId, classes.id))
  .leftJoin(users, eq(homeworkAssignments.teacherId, users.id))
  .leftJoin(
    studentSubmissions,
    and(
      eq(studentSubmissions.homeworkId, homeworkAssignments.id),
      eq(studentSubmissions.studentId, sql.placeholder("studentId")),
    ),
  )
  .where(
    and(
      eq(homeworkAssignments.classId, sql.placeholder("classId")),
      sql`${sql.placeholder("status")}::homework_status_enum is null or ${homeworkAssignments.status} = ${sql.placeholder("status")}::homework_status_enum`,
    ),
  )
  .orderBy(desc(homeworkAssignments.dueDate))
  .limit(sql.placeholder("limit"))
  .offset(sql.placeholder("offset"))
  .prepare("student_homework_list");

const studentHomeworkCountStmt = db
  .select({ total: count() })
  .from(homeworkAssignments)
  .where(
    and(
      eq(homeworkAssignments.classId, sql.placeholder("classId")),
      sql`${sql.placeholder("status")}::homework_status_enum is null or ${homeworkAssignments.status} = ${sql.placeholder("status")}::homework_status_enum`,
    ),
  )
  .prepare("student_homework_count");

const homeworkDetailStmt = db
  .select({
    id: homeworkAssignments.id,
    classId: homeworkAssignments.classId,
    teacherId: homeworkAssignments.teacherId,
    subject: homeworkAssignments.subject,
    title: homeworkAssignments.title,
    description: homeworkAssignments.description,
    dueDate: homeworkAssignments.dueDate,
    priority: homeworkAssignments.priority,
    files: homeworkAssignments.files,
    status: homeworkAssignments.status,
    createdAt: homeworkAssignments.createdAt,
    classIdRef: classes.id,
    classGrade: classes.grade,
    classSection: classes.section,
    classStream: classes.stream,
    classAcademicYear: classes.academicYear,
    classCapacity: classes.capacity,
    classCurrentCount: classes.currentCount,
  })
  .from(homeworkAssignments)
  .leftJoin(classes, eq(homeworkAssignments.classId, classes.id))
  .where(eq(homeworkAssignments.id, sql.placeholder("id")))
  .limit(1)
  .prepare("teacher_homework_detail");

const homeworkSubmissionsStmt = db
  .select({
    id: studentSubmissions.id,
    homeworkId: studentSubmissions.homeworkId,
    studentId: studentSubmissions.studentId,
    submissionFile: studentSubmissions.submissionFile,
    submittedAt: studentSubmissions.submittedAt,
    marks: studentSubmissions.marks,
    feedback: studentSubmissions.feedback,
    studentName: users.name,
    studentAvatar: users.studentPhotoUrl,
    studentClassName: users.className,
  })
  .from(studentSubmissions)
  .leftJoin(users, eq(studentSubmissions.studentId, users.id))
  .where(eq(studentSubmissions.homeworkId, sql.placeholder("homeworkId")))
  .prepare("teacher_homework_submissions");

function buildStudentResultsPayload(records: ResultWithStudent[]) {
  const sortedRecords = [...records].sort((left, right) => {
    const rightTime = new Date(right.examDate ?? 0).getTime();
    const leftTime = new Date(left.examDate ?? 0).getTime();
    const dateDelta = rightTime - leftTime;
    return Number.isNaN(dateDelta) || dateDelta === 0 ? right.id - left.id : dateDelta;
  });

  const examGroups = new Map<string, ResultWithStudent[]>();
  for (const record of records) {
    const examId = buildExamId(record);
    const bucket = examGroups.get(examId) ?? [];
    bucket.push(record);
    examGroups.set(examId, bucket);
  }

  const exams = Array.from(examGroups.entries())
    .map(([examId, examRecords]: [string, ResultWithStudent[]]) => {
      const obtainedMarks = examRecords.reduce((sum: number, record: ResultWithStudent) => sum + record.marks, 0);
      const totalMarks = examRecords.reduce((sum: number, record: ResultWithStudent) => sum + (record.totalMarks ?? 100), 0);
      const percentage = totalMarks > 0 ? Math.round((obtainedMarks / totalMarks) * 100) : 0;
      const gpa = calculateGpa(percentage);
      const sample = examRecords[0];
      return {
        examId,
        examTitle: sample.examTitle || buildExamLabel(sample),
        examType: sample.examType || "Assessment",
        term: sample.term || "General",
        examDate: sample.examDate || "",
        subjectsCount: examRecords.length,
        obtainedMarks,
        totalMarks,
        percentage,
        gpa,
        status: examRecords.every((record: ResultWithStudent) => record.grade !== "F") ? "Passed" : "Needs attention",
      };
    })
    .sort((left, right) => new Date(right.examDate).getTime() - new Date(left.examDate).getTime());

  const subjectGroups = new Map<string, ResultWithStudent[]>();
  for (const record of records) {
    const bucket = subjectGroups.get(record.subject) ?? [];
    bucket.push(record);
    subjectGroups.set(record.subject, bucket);
  }

  const subjectPerformance = Array.from(subjectGroups.entries())
    .map(([subject, subjectRecords]: [string, ResultWithStudent[]]) => {
      const averageMarks = Math.round(subjectRecords.reduce((sum: number, record: ResultWithStudent) => sum + record.marks, 0) / subjectRecords.length);
      const averagePercentage = Math.round(
        subjectRecords.reduce(
          (sum: number, record: ResultWithStudent) => sum + ((record.totalMarks ?? 100) > 0 ? (record.marks / (record.totalMarks ?? 100)) * 100 : 0),
          0,
        ) /
        subjectRecords.length,
      );
      const latestGrade = [...subjectRecords].sort((left, right) => right.id - left.id)[0]?.grade || "-";
      return { subject, averageMarks, averagePercentage, latestGrade };
    })
    .sort((left, right) => right.averagePercentage - left.averagePercentage);

  const strongestSubject = subjectPerformance[0]?.subject ?? null;
  const weakestSubject = subjectPerformance.at(-1)?.subject ?? null;
  const totalRecords = records.length;
  const passRate = totalRecords ? Math.round((records.filter((record) => record.grade !== "F").length / totalRecords) * 100) : 0;
  const averagePercentage = totalRecords
    ? Math.round(records.reduce((sum, record) => sum + ((record.totalMarks ?? 100) > 0 ? (record.marks / (record.totalMarks ?? 100)) * 100 : 0), 0) / totalRecords)
    : 0;

  const gradeMap = new Map<string, number>();
  for (const record of records) {
    gradeMap.set(record.grade, (gradeMap.get(record.grade) ?? 0) + 1);
  }

  return {
    overview: {
      currentGpa: exams[0]?.gpa ?? calculateGpa(averagePercentage),
      cumulativeGpa: exams.length ? Number((exams.reduce((sum, exam) => sum + exam.gpa, 0) / exams.length).toFixed(2)) : calculateGpa(averagePercentage),
      totalExams: exams.length,
      passRate,
      strongestSubject,
      weakestSubject,
    },
    exams,
    subjectPerformance,
    gradeDistribution: Array.from(gradeMap.entries()).map(([grade, count]) => ({ grade, count })).sort((left, right) => left.grade.localeCompare(right.grade)),
    trend: exams.map((exam) => ({ label: exam.examTitle, percentage: exam.percentage, gpa: exam.gpa })).reverse(),
    recentResults: sortedRecords.slice(0, 8),
  };
}

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  // Temporary debug route to fix DB schema issues
  app.get("/api/debug/fix-db", async (req, res) => {
    try {
      console.log("Running manual DB fix via debug route...");
      await db.execute(sql`ALTER TABLE fees ADD COLUMN IF NOT EXISTS paid_amount integer NOT NULL DEFAULT 0;`);
      await db.execute(sql`ALTER TABLE fees ADD COLUMN IF NOT EXISTS total_discount integer NOT NULL DEFAULT 0;`);
      await db.execute(sql`ALTER TABLE fee_payments ADD COLUMN IF NOT EXISTS discount integer NOT NULL DEFAULT 0;`);
      await db.execute(sql`ALTER TABLE fee_payments ADD COLUMN IF NOT EXISTS discount_reason text;`);
      await db.execute(sql`UPDATE fees SET remaining_balance = GREATEST(amount - paid_amount - total_discount, 0);`);
      res.json({ success: true, message: "Database columns verified/added and balances recalculated." });
    } catch (err: any) {
      console.error("Debug DB fix failed:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.use(createSessionMiddleware());

  const getSessionUser = async (req: Request) => (req.session.userId ? storage.getUser(req.session.userId) : undefined);

  const requireUser = async (req: Request, res: Response): Promise<User | undefined> => {
    const user = await getSessionUser(req);
    if (!user) {
      res.status(401).json({ message: "Not authenticated" });
      return undefined;
    }
    return user;
  };

  const requireRole = async (req: Request, res: Response, allowedRoles: string[]): Promise<User | undefined> => {
    const user = await requireUser(req, res);
    if (!user) return undefined;
    if (!allowedRoles.includes(user.role)) {
      res.status(403).json({ message: "Forbidden" });
      return undefined;
    }
    return user;
  };

  const getTeacherClassNames = async (teacherId: number) => new Set((await storage.getTeacherClasses(teacherId)).map((item) => item.className));

  const buildFamilyCard = async (familyId: number) => {
    const family = await storage.getFamilyWithMembers(familyId);
    if (!family) return undefined;

    const siblings = await Promise.all(
      family.siblings.map(async (sibling) => {
        const balance = await storage.getStudentBalance(sibling.id);
        return {
          ...sibling,
          outstandingBalance: balance.outstandingBalance,
          openInvoices: balance.openInvoices,
        };
      })
    );

    return {
      id: family.id,
      name: family.name,
      guardianDetails: family.guardianDetails ?? {},
      walletBalance: Number(family.walletBalance ?? 0),
      totalOutstanding: family.totalOutstanding,
      siblingCount: siblings.length,
      siblings,
    };
  };

  const buildFamilyVoucherPayload = async (
    familyId: number,
    billingMonths: string[],
    includeOverdue = true
  ) => {
    const family = await storage.getFamilyWithMembers(familyId);
    if (!family) return undefined;

    const sortedMonths = [...billingMonths].sort();
    const earliestMonth = sortedMonths[0];
    const fees = await storage.getFees();
    const siblingIds = new Set(family.siblings.map((sibling) => sibling.id));
    const scopedFees = fees.filter((fee) => siblingIds.has(fee.studentId));

    const siblings = family.siblings.map((sibling) => {
      const studentFees = scopedFees.filter((fee) => fee.studentId === sibling.id);
      const previousDues = includeOverdue
        ? studentFees.filter(
            (fee) =>
              fee.remainingBalance > 0 &&
              fee.billingMonth < earliestMonth &&
              ["Unpaid", "Partially Paid", "Overdue"].includes(fee.status)
          )
        : [];
      const currentFees = studentFees.filter(
        (fee) =>
          billingMonths.includes(fee.billingMonth) && fee.remainingBalance > 0
      );
      return {
        studentId: sibling.id,
        studentName: sibling.name,
        className: sibling.className ?? null,
        fatherName: sibling.fatherName ?? null,
        previousDues: previousDues.map((fee) => ({
          feeId: fee.id,
          invoiceNumber: fee.invoiceNumber ?? null,
          feeType: fee.feeType,
          billingPeriod: fee.billingPeriod,
          amount: fee.amount,
          remainingBalance: fee.remainingBalance,
        })),
        currentFees: currentFees.map((fee) => ({
          feeId: fee.id,
          invoiceNumber: fee.invoiceNumber ?? null,
          feeType: fee.feeType,
          billingPeriod: fee.billingPeriod,
          amount: fee.amount,
          remainingBalance: fee.remainingBalance,
        })),
        total:
          previousDues.reduce((sum, fee) => sum + fee.remainingBalance, 0) +
          currentFees.reduce((sum, fee) => sum + fee.remainingBalance, 0),
      };
    });

    const previousDuesTotal = siblings.reduce(
      (sum, sibling) =>
        sum +
        sibling.previousDues.reduce(
          (studentSum, fee) => studentSum + fee.remainingBalance,
          0
        ),
      0
    );
    const currentMonthsTotal = siblings.reduce(
      (sum, sibling) =>
        sum +
        sibling.currentFees.reduce(
          (studentSum, fee) => studentSum + fee.remainingBalance,
          0
        ),
      0
    );
    const { calculateSummary } = await import("../shared/finance.js");
    const summary = calculateSummary({
      previousDues: siblings.flatMap((sibling) =>
        sibling.previousDues.map((fee) => ({
          amount: fee.amount,
          remainingBalance: fee.remainingBalance,
        }))
      ),
      currentFees: siblings.flatMap((sibling) =>
        sibling.currentFees.map((fee) => ({
          amount: fee.remainingBalance,
        }))
      ),
      billingMonth: sortedMonths.at(-1) ?? new Date().toISOString().slice(0, 7),
    });

    return {
      family: {
        id: family.id,
        name: family.name,
        guardianDetails: family.guardianDetails ?? {},
        walletBalance: Number(family.walletBalance ?? 0),
        totalOutstanding: family.totalOutstanding,
        siblingCount: siblings.length,
      },
      siblings,
      voucherNumber: `FAM-${String(family.id).padStart(5, "0")}-${Date.now()}`,
      generatedAt: new Date().toISOString(),
      dueDate: summary.dueDate,
      summary: {
        previousDuesTotal,
        currentMonthsTotal,
        grossTotal: summary.grossTotal,
        discount: summary.discount,
        netPayable: summary.netPayable,
        lateFee: summary.lateFee,
        payableWithinDate: summary.payableWithinDate,
        payableAfterDueDate: summary.payableAfterDueDate,
        amountInWords: summary.amountInWords,
      },
    };
  };

  app.get(api.auth.me.path, async (req, res) => {
    const user = await requireUser(req, res);
    if (user) res.json(user);
  });

  app.post(api.auth.login.path, async (req, res) => {
    try {
      const input = api.auth.login.input.parse(req.body);
      const user = await storage.getUserByEmail(input.email);
      if (!user || user.password !== input.password) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      req.session.userId = user.id;
      await new Promise<void>((resolve, reject) => {
        req.session.save((err) => {
          if (err) {
            reject(err);
            return;
          }

          resolve();
        });
      });

      res.json(user);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post(api.auth.register.path, async (req, res) => {
    try {
      const input = api.auth.register.input.parse(req.body);
      const { familyName, guardianDetails, ...userInput } = input;
      const createdUser =
        userInput.role === "student"
          ? await storage.admitStudent({
              ...userInput,
              familyName,
              guardianDetails,
            })
          : await storage.createUser(userInput);
      res.status(201).json(createdUser);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res
          .status(400)
          .json({ message: err.errors[0].message, field: err.errors[0].path.join(".") });
      }
      if (isUniqueViolation(err)) {
        return res
          .status(409)
          .json({ message: "A user with this email already exists.", field: "email" });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post(api.auth.logout.path, (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ message: "Failed to log out" });
      }

      res.clearCookie("school-nexus.sid");
      return res.json({ success: true });
    });
  });

  app.post(api.uploads.presign.path, async (req, res) => {
    try {
      const user = await requireRole(req, res, ["teacher"]);
      if (!user) return;

      const input = api.uploads.presign.input.parse(req.body);
      const { key, url, expiresIn } = await createPresignedUpload({
        filename: input.filename,
        contentType: input.contentType,
        folder: input.folder || `homework/${user.id}`,
      });

      res.json({ key, url, expiresIn, method: "PUT" });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0]?.message ?? "Invalid payload" });
      }
      console.error("Failed to presign upload", err);
      res.status(500).json({ message: "Failed to presign upload" });
    }
  });

  app.get(api.uploads.download.path, async (req, res) => {
    try {
      const user = await requireRole(req, res, ["teacher"]);
      if (!user) return;

      const input = api.uploads.download.input.parse(req.query);
      const { url, expiresIn } = await createPresignedDownload({ key: input.key });
      res.json({ url, expiresIn });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0]?.message ?? "Invalid request" });
      }
      console.error("Failed to presign download", err);
      res.status(500).json({ message: "Failed to presign download" });
    }
  });

  app.get(api.settings.publicGet.path, async (_req, res) => {
    try {
      res.json(await storage.getPublicSchoolSettings());
    } catch (err) {
      console.error("Failed to load public settings", err);
      res.status(500).json({ message: "Failed to load public settings" });
    }
  });

  app.get(api.settings.adminGet.path, async (req, res) => {
    try {
      const user = await requireRole(req, res, ["admin"]);
      if (!user) return;
      res.json(await storage.getSchoolSettings());
    } catch (err) {
      console.error("Failed to load settings", err);
      res.status(500).json({ message: "Failed to load settings" });
    }
  });

  app.put(api.settings.update.path, async (req, res) => {
    try {
      const user = await requireRole(req, res, ["admin"]);
      if (!user) return;
      const input = api.settings.update.input.parse(req.body);
      res.json(await storage.updateSchoolSettings(input.data, user.id, input.changeSummary));
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0]?.message ?? "Invalid settings payload" });
      res.status(500).json({ message: "Failed to update settings" });
    }
  });

  app.post(api.settings.import.path, async (req, res) => {
    try {
      const user = await requireRole(req, res, ["admin"]);
      if (!user) return;
      const input = api.settings.import.input.parse(req.body);
      res.json(await storage.importSchoolSettings(input.data, user.id, input.changeSummary));
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0]?.message ?? "Invalid import payload" });
      res.status(500).json({ message: "Failed to import settings" });
    }
  });

  app.post(api.settings.restore.path, async (req, res) => {
    try {
      const user = await requireRole(req, res, ["admin"]);
      if (!user) return;
      const input = api.settings.restore.input.parse(req.body);
      const restored = await storage.restoreSchoolSettings(input.version, user.id, input.changeSummary);
      if (!restored) return res.status(404).json({ message: "Requested settings version was not found" });
      res.json(restored);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0]?.message ?? "Invalid restore payload" });
      res.status(500).json({ message: "Failed to restore settings" });
    }
  });

  app.get(api.settings.export.path, async (req, res) => {
    try {
      const user = await requireRole(req, res, ["admin"]);
      if (!user) return;
      res.json(await storage.exportSchoolSettings());
    } catch {
      res.status(500).json({ message: "Failed to export settings" });
    }
  });

  // Timetable settings moved to line 1340+

  app.get(api.users.list.path, async (req, res) => {
    const user = await requireRole(req, res, ["admin", "teacher"]);
    if (user) res.json(await storage.getUsers());
  });

  app.get(api.students.list.path, async (req, res) => {
    const user = await requireRole(req, res, ["admin", "teacher"]);
    if (user) res.json(await storage.getStudents());
  });

  app.post(api.students.admit.path, async (req, res) => {
    try {
      const user = await requireRole(req, res, ["admin"]);
      if (!user) return;
      const input = api.students.admit.input.parse(req.body);
      const createdUser = await storage.admitStudent(input);
      res.status(201).json(createdUser);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res
          .status(400)
          .json({ message: err.errors[0].message, field: err.errors[0].path.join(".") });
      }
      if (isUniqueViolation(err)) {
        return res
          .status(409)
          .json({ message: "A user with this email already exists.", field: "email" });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get(api.teachers.list.path, async (req, res) => {
    const user = await requireRole(req, res, ["admin", "teacher"]);
    if (user) res.json(await storage.getTeachers());
  });

  app.get(api.families.list.path, async (req, res) => {
    const user = await requireRole(req, res, ["admin"]);
    if (!user) return;
    const families = await storage.getFamiliesWithMembers();
    const cards = await Promise.all(families.map((family) => buildFamilyCard(family.id)));
    res.json(cards.filter(Boolean));
  });

  app.post(api.families.create.path, async (req, res) => {
    try {
      const user = await requireRole(req, res, ["admin"]);
      if (!user) return;
      const input = api.families.create.input.parse(req.body);
      const timestamp = new Date().toISOString();
      const created = await storage.createFamily({
        name: input.name,
        guardianDetails: input.guardianDetails ?? {},
        walletBalance: "0",
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      res.status(201).json({
        ...created,
        walletBalance: Number(created.walletBalance ?? 0),
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res
          .status(400)
          .json({ message: err.errors[0].message, field: err.errors[0].path.join(".") });
      }
      if (err instanceof Error) {
        return res.status(400).json({ message: err.message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get(api.families.detail.path, async (req, res) => {
    const user = await requireRole(req, res, ["admin"]);
    if (!user) return;
    const familyId = parseNumberValue(req.params.id);
    if (Number.isNaN(familyId)) {
      return res.status(400).json({ message: "Invalid family id", field: "id" });
    }
    const family = await buildFamilyCard(familyId);
    if (!family) return res.status(404).json({ message: "Family not found" });
    res.json(family);
  });

  app.patch(api.families.update.path, async (req, res) => {
    try {
      const user = await requireRole(req, res, ["admin"]);
      if (!user) return;
      const familyId = parseNumberValue(req.params.id);
      if (Number.isNaN(familyId)) {
        return res.status(400).json({ message: "Invalid family id", field: "id" });
      }
      const input = api.families.update.input.parse(req.body);
      const updates: Record<string, unknown> = {};
      if (input.name !== undefined) updates.name = input.name;
      if (input.guardianDetails !== undefined) updates.guardianDetails = input.guardianDetails ?? {};
      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ message: "No fields supplied to update" });
      }
      const updated = await storage.updateFamily(familyId, updates as Partial<InsertFamily>);
      if (!updated) return res.status(404).json({ message: "Family not found" });
      res.json({
        ...updated,
        walletBalance: Number(updated.walletBalance ?? 0),
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res
          .status(400)
          .json({ message: err.errors[0].message, field: err.errors[0].path.join(".") });
      }
      if (err instanceof Error) {
        return res.status(400).json({ message: err.message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete(api.families.delete.path, async (req, res) => {
    try {
      const user = await requireRole(req, res, ["admin"]);
      if (!user) return;
      const familyId = parseNumberValue(req.params.id);
      if (Number.isNaN(familyId)) {
        return res.status(400).json({ message: "Invalid family id", field: "id" });
      }
      const deleted = await storage.deleteFamily(familyId);
      if (!deleted) return res.status(404).json({ message: "Family not found" });
      res.json({ success: true, message: "Family deleted" });
    } catch (err) {
      const error = err as Error & { code?: string; linkedCount?: number };
      if (error?.code === "FAMILY_HAS_MEMBERS") {
        return res
          .status(409)
          .json({ message: error.message, linkedCount: error.linkedCount ?? 0 });
      }
      if (err instanceof Error) {
        return res.status(400).json({ message: err.message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get(api.families.dashboard.path, async (req, res) => {
    const user = await requireRole(req, res, ["student", "admin"]);
    if (!user) return;
    const familyId = user.familyId;
    if (!familyId) return res.status(404).json({ message: "Family not found" });
    const family = await buildFamilyCard(familyId);
    if (!family) return res.status(404).json({ message: "Family not found" });
    res.json(family);
  });

  app.post(api.families.pay.path, async (req, res) => {
    try {
      const user = await requireRole(req, res, ["admin"]);
      if (!user) return;
      const familyId = parseNumberValue(req.params.id);
      if (Number.isNaN(familyId)) {
        return res.status(400).json({ message: "Invalid family id", field: "id" });
      }
      const input = api.families.pay.input.parse(req.body);
      const result = await storage.payFamily(familyId, input, user.id);
      res.json({
        family: {
          id: result.family.id,
          name: result.family.name,
          guardianDetails: result.family.guardianDetails ?? {},
          walletBalance: result.walletBalance,
          totalOutstanding: result.family.totalOutstanding,
        },
        paymentAmount: input.amount,
        walletBalance: result.walletBalance,
        allocations: result.allocations,
        transactions: result.transactions.map((transaction) => ({
          id: transaction.id,
          amount: transaction.amount,
          type: transaction.type,
          method: transaction.method ?? null,
          reference: transaction.reference ?? null,
          notes: transaction.notes ?? null,
          createdAt: transaction.createdAt,
        })),
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res
          .status(400)
          .json({ message: err.errors[0].message, field: err.errors[0].path.join(".") });
      }
      if (err instanceof Error) {
        return res.status(400).json({ message: err.message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post(api.users.create.path, async (req, res) => {
    try {
      const user = await requireRole(req, res, ["admin"]);
      if (!user) return;
      const input = api.users.create.input.parse(req.body);
      const { familyName, guardianDetails, ...userInput } = input;
      const createdUser =
        userInput.role === "student"
          ? await storage.admitStudent({
              ...userInput,
              familyName,
              guardianDetails,
            })
          : await storage.createUser(userInput);
      res.status(201).json(createdUser);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join(".") });
      if (isUniqueViolation(err)) return res.status(409).json({ message: "A user with this email already exists.", field: "email" });
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put(api.users.update.path, async (req, res) => {
    try {
      const user = await requireRole(req, res, ["admin"]);
      if (!user) return;
      const updatedUser = await storage.updateUser(parseNumberValue(req.params.id), api.users.update.input.parse(req.body));
      if (!updatedUser) return res.status(404).json({ message: "User not found" });
      res.json(updatedUser);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join(".") });
      if (isUniqueViolation(err)) return res.status(409).json({ message: "A user with this email already exists.", field: "email" });
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete(api.users.delete.path, async (req, res) => {
    const user = await requireRole(req, res, ["admin"]);
    if (!user) return;
    const deleted = await storage.deleteUser(parseNumberValue(req.params.id));
    if (!deleted) return res.status(404).json({ message: "User not found" });
    res.json({ success: true });
  });

  app.get(api.academics.list.path, async (req, res) => {
    const user = await requireUser(req, res);
    if (user) res.json(await storage.getAcademics());
  });

  app.post(api.academics.create.path, async (req, res) => {
    try {
      const user = await requireRole(req, res, ["teacher", "admin"]);
      if (!user) return;
      const input = api.academics.create.input.parse(req.body);
      if (input.teacherUserId) {
        const teacher = await storage.getUser(input.teacherUserId);
        if (!teacher || teacher.role !== "teacher") return res.status(400).json({ message: "Invalid teacher user id", field: "teacherUserId" });
      }
      res.status(201).json(await storage.createAcademic(input));
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join(".") });
      if (isUniqueViolation(err)) return res.status(409).json({ message: "A subject with this code already exists.", field: "code" });
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put(api.academics.update.path, async (req, res) => {
    try {
      const user = await requireRole(req, res, ["admin"]);
      if (!user) return;
      const input = api.academics.update.input.parse(req.body);
      if (input.teacherUserId) {
        const teacher = await storage.getUser(input.teacherUserId);
        if (!teacher || teacher.role !== "teacher") return res.status(400).json({ message: "Invalid teacher user id", field: "teacherUserId" });
      }
      const record = await storage.updateAcademic(parseNumberValue(req.params.id), input);
      if (!record) return res.status(404).json({ message: "Academic record not found" });
      res.json(record);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join(".") });
      if (isUniqueViolation(err)) return res.status(409).json({ message: "A subject with this code already exists.", field: "code" });
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete(api.academics.delete.path, async (req, res) => {
    const user = await requireRole(req, res, ["admin"]);
    if (!user) return;
    const deleted = await storage.deleteAcademic(parseNumberValue(req.params.id));
    if (!deleted) return res.status(404).json({ message: "Academic record not found" });
    res.json({ success: true });
  });

  app.get(api.attendance.list.path, async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    if (user.role === "student") return res.json(await storage.getAttendanceByStudent(user.id));
    if (user.role === "teacher") return res.json(await storage.getAttendanceByTeacher(user.id));
    res.json(await storage.getAttendance());
  });

  app.post(api.attendance.create.path, async (req, res) => {
    try {
      const user = await requireRole(req, res, ["teacher", "admin"]);
      if (!user) return;
      const input = api.attendance.create.input.parse(req.body);
      const student = await storage.getUser(input.studentId);
      if (!student || student.role !== "student") return res.status(400).json({ message: "Invalid student id", field: "studentId" });
      attendanceStatusSchema.parse(input.status);
      attendanceSessionSchema.parse(input.session ?? "Full Day");
      res.status(201).json(await storage.createAttendance({ ...input, teacherId: user.id }));
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join(".") });
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get(api.results.list.path, async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    if (user.role === "student") return res.json(await storage.getResultsByStudent(user.id));
    if (user.role === "teacher") {
      const subject = user.subject?.trim();
      const results = await storage.getResults();
      return res.json(subject ? results.filter((record) => record.subject === subject) : []);
    }
    res.json(await storage.getResults());
  });

  app.post(api.results.create.path, async (req, res) => {
    try {
      const user = await requireRole(req, res, ["teacher", "admin"]);
      if (!user) return;
      const input = api.results.create.input.parse(req.body);
      const student = await storage.getUser(input.studentId);
      if (!student || student.role !== "student") return res.status(400).json({ message: "Invalid student id", field: "studentId" });
      const subject = user.role === "teacher" ? user.subject?.trim() || input.subject.trim() : input.subject.trim();
      if (!subject) return res.status(400).json({ message: "Subject is required", field: "subject" });
      res.status(201).json(await storage.createResult({ ...input, subject }));
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join(".") });
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put(api.results.update.path, async (req, res) => {
    try {
      const user = await requireRole(req, res, ["teacher", "admin"]);
      if (!user) return;
      const id = parseNumberValue(req.params.id);
      const existing = await storage.getResult(id);
      if (!existing) return res.status(404).json({ message: "Result not found" });
      const input = api.results.update.input.parse(req.body);
      if (input.studentId) {
        const student = await storage.getUser(input.studentId);
        if (!student || student.role !== "student") return res.status(400).json({ message: "Invalid student id", field: "studentId" });
      }
      if (user.role === "teacher" && existing.subject !== (user.subject?.trim() || existing.subject)) return res.status(403).json({ message: "Forbidden" });
      const record = await storage.updateResult(id, { ...input, subject: user.role === "teacher" ? user.subject?.trim() || existing.subject : input.subject });
      if (!record) return res.status(404).json({ message: "Result not found" });
      res.json(record);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join(".") });
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete(api.results.delete.path, async (req, res) => {
    const user = await requireRole(req, res, ["teacher", "admin"]);
    if (!user) return;
    const id = parseNumberValue(req.params.id);
    const existing = await storage.getResult(id);
    if (!existing) return res.status(404).json({ message: "Result not found" });
    if (user.role === "teacher" && existing.subject !== (user.subject?.trim() || existing.subject)) return res.status(403).json({ message: "Forbidden" });
    if (!(await storage.deleteResult(id))) return res.status(404).json({ message: "Result not found" });
    res.json({ success: true });
  });

  app.get(api.student.attendance.list.path, async (req, res) => {
    const user = await requireRole(req, res, ["student"]);
    if (user) res.json(await storage.getAttendanceByStudent(user.id));
  });

  app.get(api.student.attendance.summary.path, async (req, res) => {
    const user = await requireRole(req, res, ["student"]);
    if (!user) return;
    const records = (await storage.getAttendanceByStudent(user.id)).sort((left, right) => left.date.localeCompare(right.date));
    const attendedRecords = records.filter((record) => attendedStatuses.has(record.status)).length;
    const absentRecords = records.filter((record) => record.status === "Absent").length;
    const lateRecords = records.filter((record) => record.status === "Late").length;
    const excusedRecords = records.filter((record) => record.status === "Excused").length;
    let currentStreak = 0;
    for (const record of [...records].reverse()) {
      if (!attendedStatuses.has(record.status)) break;
      currentStreak += 1;
    }

    const monthMap = new Map<string, { label: string; present: number; absent: number; late: number; excused: number }>();
    for (const record of records) {
      const date = new Date(record.date);
      const label = Number.isNaN(date.getTime()) ? record.date.slice(0, 7) : new Intl.DateTimeFormat("en-US", { month: "short", year: "2-digit" }).format(date);
      const bucket = monthMap.get(label) ?? { label, present: 0, absent: 0, late: 0, excused: 0 };
      if (record.status === "Present") bucket.present += 1;
      if (record.status === "Absent") bucket.absent += 1;
      if (record.status === "Late") bucket.late += 1;
      if (record.status === "Excused") bucket.excused += 1;
      monthMap.set(label, bucket);
    }

    res.json({
      totalRecords: records.length,
      attendedRecords,
      absentRecords,
      lateRecords,
      excusedRecords,
      attendanceRate: records.length ? Math.round((attendedRecords / records.length) * 100) : 0,
      currentStreak,
      monthlyTrend: Array.from(monthMap.values()).map((item) => ({
        ...item,
        attendanceRate: item.present + item.absent + item.late + item.excused
          ? Math.round(((item.present + item.late + item.excused) / (item.present + item.absent + item.late + item.excused)) * 100)
          : 0,
      })),
      statusBreakdown: ["Present", "Absent", "Late", "Excused"].map((status) => ({
        status: attendanceStatusSchema.parse(status),
        count: records.filter((record) => record.status === status).length,
      })),
    });
  });

  app.get(api.student.homework.list.path, async (req, res) => {
    try {
      const user = await requireRole(req, res, ["student"]);
      if (!user) return;

      const filters = api.student.homework.list.input?.parse(req.query) ?? {};
      const page = filters.page ?? 1;
      const limit = filters.limit ?? 20;
      const offset = (page - 1) * limit;
      const status = filters.status ?? "active";

      const classRecord = await findClassByNameKey(user.className ?? null);
      if (!classRecord) {
        return sendHomeworkSuccess(res, [], { page, limit, total: 0, className: user.className ?? null });
      }

      const [rows, totals] = await Promise.all([
        studentHomeworkListStmt.execute({
          classId: classRecord.id,
          studentId: user.id,
          status,
          limit,
          offset,
        }),
        studentHomeworkCountStmt.execute({
          classId: classRecord.id,
          status,
        }),
      ]);

      const total = Number(totals[0]?.total ?? 0);
      const classLabel = buildClassLabel(classRecord);

      const data = rows.map((row) => ({
        id: row.id,
        classId: row.classId,
        teacherId: row.teacherId,
        subject: row.subject,
        title: row.title,
        description: row.description ?? null,
        dueDate: row.dueDate instanceof Date ? row.dueDate.toISOString().slice(0, 10) : String(row.dueDate),
        priority: row.priority,
        files: row.files ?? [],
        status: row.status,
        createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt ?? null,
        classLabel,
        teacherName: row.teacherName ?? null,
        submissionId: row.submissionId ?? null,
        submittedAt: row.submittedAt
          ? row.submittedAt instanceof Date
            ? row.submittedAt.toISOString()
            : String(row.submittedAt)
          : null,
        marks: row.marks !== null && row.marks !== undefined ? Number(row.marks) : null,
      }));

      sendHomeworkSuccess(res, data, { page, limit, total, classLabel, classId: classRecord.id });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return sendHomeworkError(res, 400, err.errors[0]?.message ?? "Invalid query");
      }
      console.error("Failed to fetch student homework list", err);
      sendHomeworkError(res, 500, "Failed to fetch homework list");
    }
  });

  app.get(api.student.timetable.list.path, async (req, res) => {
    try {
      console.log(`[AUDIT] Start student timetable fetch`);
      const user = await requireRole(req, res, ["student"]);
      if (!user) {
        console.log(`[AUDIT] requireRole failed or user not found`);
        return;
      }
      const className = user.className?.trim();
      console.log(`[AUDIT] User: id=${user.id}, className="${className}"`);
      if (!className) {
        console.log(`[AUDIT] No className found for student`);
        return res.json({ className: "Unassigned", items: [], days: [...timetableDays] });
      }
      
      const { timetables: ttTable, timetablesPeriods: periodsTable, classes } = await import("../shared/schema.js");
      const { loadTimetableSettings, computePeriodTimeline } = await import("./lib/settings-loader.js");
      
      const normalizeName = (name: string) => name.toLowerCase().replace(/^(grade|year)\s+/i, "").replace(/[^a-z0-9]/g, "");
      const targetClassName = normalizeName(className);
      console.log(`[AUDIT] Raw className: "${className}", Normalized: "${targetClassName}"`);

      const allClasses = await db.select().from(classes);
      const matchedClass = allClasses.find((c) => {
        const cGrade = c.grade ?? "";
        const cSection = c.section ?? "";
        const cStream = c.stream ? `-${c.stream}` : "";
        const fullName = `${cGrade}-${cSection}${cStream}`;
        
        // 1. Literal match check
        if (fullName === className) return true;
        if (`Grade ${fullName}` === className || `Year ${fullName}` === className) return true;

        // 2. Normalized match check
        const constructedName = normalizeName(fullName);
        return constructedName === targetClassName;
      });

      if (matchedClass) {
        console.log(`[AUDIT] Matched Class ID: ${matchedClass.id}`);
        const [published] = await db.select().from(ttTable)
          .where(and(eq(ttTable.classId, matchedClass.id), eq(ttTable.status, "published")))
          .limit(1);

        if (published) {
          console.log(`[AUDIT] Found Published Timetable ID: ${published.id}`);
          const periods = await db.select().from(periodsTable).where(eq(periodsTable.timetableId, published.id));
          const settings = await loadTimetableSettings();
          // Identify all period numbers we need times for to ensure a full timeline is calculated
          const requestedPeriodIds = Array.from(new Set(periods.map(p => p.period)));
          const timeline = computePeriodTimeline(settings, requestedPeriodIds);
          
          const daysMap = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

          const mappedItems = [];
          for (const p of periods) {
            if (!p.subject && !p.teacherId && !p.room) continue;
            
            // Period matching logic
            const timeSlot = timeline.find(t => t.periodNumber === p.period);
            
            let teacherName = null;
            if (p.teacherId) {
              const tUser = await storage.getUser(p.teacherId);
              teacherName = tUser?.name ?? null;
            }
            
            // Use calculated times from our expanded timeline
            const startTime = timeSlot?.startTime ?? "TBA";
            const endTime = timeSlot?.endTime ?? "TBA";

            mappedItems.push({
              id: p.id,
              academicId: null,
              className: className,
              dayOfWeek: daysMap[p.dayOfWeek],
              periodLabel: `Period ${p.period}`,
              startTime,
              endTime,
              room: p.room,
              classType: "Class",
              teacherId: p.teacherId,
              teacherName,
              subject: p.subject ?? "Class",
              subjectCode: null,
              sortOrder: p.period,
            });
          }
          
          console.log(`[AUDIT] Student Timetable: class="${className}", items=${mappedItems.length}/${periods.length} mapped`);

          const activeDays = settings.workingDays.map(d => daysMap[d]);
          return res.json({
            className,
            items: mappedItems,
            days: activeDays,
          });
        } else {
          console.log(`[AUDIT] No published timetable found for class ${matchedClass.id}`);
        }
      } else {
        console.log(`[AUDIT] No class found matching "${targetClassName}" in allClasses (total=${allClasses.length})`);
      }

      console.log(`[AUDIT] Falling back to storage.getTimetableByClass for "${className}"`);
      const items = await storage.getTimetableByClass(className);
      res.json({
        className,
        items: items.map((item) => ({
          id: item.id,
          academicId: item.academicId,
          className: item.className,
          dayOfWeek: item.dayOfWeek as (typeof timetableDays)[number],
          periodLabel: item.periodLabel,
          startTime: item.startTime,
          endTime: item.endTime,
          room: item.room,
          classType: item.classType,
          teacherId: item.teacherId,
          teacherName: item.teacher?.name ?? null,
          subject: item.academic?.title ?? item.classType ?? "Class",
          subjectCode: item.academic?.code ?? null,
          sortOrder: item.sortOrder,
        })),
        days: [...timetableDays],
      });
    } catch (error) {
      console.error("[AUDIT] Student timetable error:", error);
      res.status(500).json({ message: "Failed to load student timetable" });
    }
  });

  app.get(api.student.results.list.path, async (req, res) => {
    const user = await requireRole(req, res, ["student"]);
    if (user) res.json(buildStudentResultsPayload(await storage.getResultsByStudent(user.id)));
  });

  app.get(api.student.results.detail.path, async (req, res) => {
    const user = await requireRole(req, res, ["student"]);
    if (!user) return;
    const records = await storage.getResultsByStudent(user.id);
    const examId = typeof req.params.examId === "string" ? req.params.examId : "";
    const examRecords = records.filter((record) => buildExamId(record) === examId);
    if (examRecords.length === 0) return res.status(404).json({ message: "Exam result not found" });
    res.json({ exam: buildStudentResultsPayload(examRecords).exams[0], records: examRecords, generatedAt: new Date().toISOString() });
  });

  app.get(api.teacher.classes.list.path, async (req, res) => {
    const user = await requireRole(req, res, ["teacher", "admin"]);
    if (!user) return;
    if (user.role === "admin") {
      const students = await storage.getStudents();
      const classMap = new Map<string, number>();
      for (const student of students) {
        if (!student.className) continue;
        classMap.set(student.className, (classMap.get(student.className) ?? 0) + 1);
      }
      return res.json(Array.from(classMap.entries()).map(([className, studentCount]) => ({ className, studentCount, subjects: [] })));
    }
    res.json(await storage.getTeacherClasses(user.id));
  });

  app.get(api.teacher.pulse.today.path, async (req, res) => {
    const user = await requireRole(req, res, ["teacher"]);
    if (!user) return;

    const today = new Date().toISOString().slice(0, 10);

    const periods = await db
      .select()
      .from(dailyTeachingPulse)
      .where(and(eq(dailyTeachingPulse.teacherId, user.id), eq(dailyTeachingPulse.date, today as unknown as Date)))
      .orderBy(asc(dailyTeachingPulse.period));

    const stats = {
      total: periods.length,
      completed: periods.filter((item) => item.status === "completed").length,
      missed: periods.filter((item) => item.status === "missed").length,
      pending: periods.filter((item) => item.status === "scheduled").length,
    };

    res.json({ periods, stats, date: today });
  });

  app.put(api.teacher.pulse.complete.path, async (req, res) => {
    try {
      const user = await requireRole(req, res, ["teacher"]);
      if (!user) return;

      const id = parseNumberValue(req.params.id);
      if (Number.isNaN(id)) return res.status(400).json({ message: "Invalid pulse id", field: "id" });

      const input = api.teacher.pulse.complete.input.parse(req.body);

      const [existing] = await db
        .select()
        .from(dailyTeachingPulse)
        .where(eq(dailyTeachingPulse.id, id))
        .limit(1);

      if (!existing) return res.status(404).json({ message: "Pulse record not found" });
      if (existing.teacherId !== user.id) return res.status(403).json({ message: "Forbidden" });

      await db
        .update(dailyTeachingPulse)
        .set({
          status: "completed",
          markedAt: new Date().toISOString(),
          note: input.note ?? null,
        })
        .where(eq(dailyTeachingPulse.id, id));

      res.json({ success: true });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join(".") });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ---------- Teacher Homework Diary (Assignments) ----------

  app.get(api.teacher.homework.classes.path, async (req, res) => {
    try {
      const user = await requireRole(req, res, ["teacher"]);
      if (!user) return;

      const rows = await db
        .select({
          classId: classes.id,
          grade: classes.grade,
          section: classes.section,
          stream: classes.stream,
          academicYear: classes.academicYear,
          capacity: classes.capacity,
          currentCount: classes.currentCount,
          subjects: classTeachers.subjects,
        })
        .from(classTeachers)
        .innerJoin(classes, eq(classTeachers.classId, classes.id))
        .where(and(eq(classTeachers.teacherId, user.id), eq(classTeachers.isActive, true)));

      const classMap = new Map<number, { record: typeof rows[number]; subjects: Set<string> }>();
      for (const row of rows) {
        const existing = classMap.get(row.classId);
        const subjects = existing?.subjects ?? new Set<string>();
        for (const subject of row.subjects ?? []) subjects.add(subject);
        classMap.set(row.classId, { record: row, subjects });
      }

      const payload = Array.from(classMap.values()).map(({ record, subjects }) => ({
        id: record.classId,
        grade: record.grade,
        section: record.section,
        stream: record.stream,
        academicYear: record.academicYear,
        capacity: record.capacity,
        currentCount: record.currentCount,
        homeroomTeacherId: null,
        status: "active",
        label: buildClassLabel(record),
        subjects: Array.from(subjects).sort(),
      }));

      sendHomeworkSuccess(res, payload);
    } catch (err) {
      console.error("Failed to fetch homework classes", err);
      sendHomeworkError(res, 500, "Failed to fetch homework classes");
    }
  });

  app.get(api.teacher.homework.list.path, async (req, res) => {
    try {
      const user = await requireRole(req, res, ["teacher"]);
      if (!user) return;

      const filters = api.teacher.homework.list.input?.parse(req.query) ?? {};
      const page = filters.page ?? 1;
      const limit = filters.limit ?? 20;
      const offset = (page - 1) * limit;
      const classId = filters.classId ?? null;
      const status = filters.status ?? null;

      const [rows, totals] = await Promise.all([
        homeworkListStmt.execute({
          teacherId: user.id,
          classId,
          status,
          limit,
          offset,
        }),
        homeworkCountStmt.execute({ teacherId: user.id, classId, status }),
      ]);

      const total = Number(totals[0]?.total ?? 0);

      const data = rows.map((row) => {
        const classRecord = row.classIdRef
          ? {
            id: row.classIdRef,
            grade: row.classGrade,
            section: row.classSection,
            stream: row.classStream,
            academicYear: row.classAcademicYear,
            capacity: row.classCapacity,
            currentCount: row.classCurrentCount,
            homeroomTeacherId: null,
            status: "active",
          }
          : undefined;

        const classSize = classRecord?.currentCount ?? 0;
        return {
          id: row.id,
          classId: row.classId,
          teacherId: row.teacherId,
          subject: row.subject,
          title: row.title,
          description: row.description ?? null,
          dueDate: row.dueDate instanceof Date ? row.dueDate.toISOString().slice(0, 10) : String(row.dueDate),
          priority: row.priority,
          files: row.files ?? [],
          status: row.status,
          createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt ?? null,
          class: classRecord,
          classLabel: classRecord ? buildClassLabel(classRecord) : "Unknown class",
          submissionCount: Number(row.submissionCount ?? 0),
          averageMarks: row.averageMarks !== null && row.averageMarks !== undefined ? Number(row.averageMarks) : null,
          classSize,
        };
      });

      sendHomeworkSuccess(res, data, { page, limit, total });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return sendHomeworkError(res, 400, err.errors[0]?.message ?? "Invalid query");
      }
      console.error("Failed to fetch homework list", err);
      sendHomeworkError(res, 500, "Failed to fetch homework list");
    }
  });

  app.post(api.teacher.homework.create.path, async (req, res) => {
    try {
      const user = await requireRole(req, res, ["teacher"]);
      if (!user) return;

      const input = api.teacher.homework.create.input.parse(req.body);

      const [classAssignment] = await db
        .select()
        .from(classTeachers)
        .where(and(eq(classTeachers.classId, input.classId), eq(classTeachers.teacherId, user.id), eq(classTeachers.isActive, true)))
        .limit(1);

      if (!classAssignment) {
        return sendHomeworkError(res, 403, "You are not assigned to this class");
      }

      const [created] = await db
        .insert(homeworkAssignments)
        .values({
          classId: input.classId,
          teacherId: user.id,
          subject: input.subject,
          title: input.title,
          description: input.description ?? null,
          dueDate: input.dueDate as unknown as Date,
          priority: input.priority,
          files: input.files ?? [],
          status: "active",
        })
        .returning();

      sendHomeworkSuccess(
        res,
        {
          ...created,
          dueDate: created.dueDate instanceof Date ? created.dueDate.toISOString().slice(0, 10) : String(created.dueDate),
          createdAt: created.createdAt instanceof Date ? created.createdAt.toISOString() : created.createdAt ?? null,
        },
        undefined,
        201,
      );
    } catch (err) {
      if (err instanceof z.ZodError) {
        return sendHomeworkError(res, 400, err.errors[0]?.message ?? "Invalid payload");
      }
      if (isUniqueViolation(err)) {
        return sendHomeworkError(res, 409, "Homework already exists for this class, date, and subject");
      }
      console.error("Failed to create homework", err);
      sendHomeworkError(res, 500, "Failed to create homework");
    }
  });

  app.get(api.teacher.homework.detail.path, async (req, res) => {
    try {
      const user = await requireRole(req, res, ["teacher"]);
      if (!user) return;

      const id = String(req.params.id);
      const [record] = await homeworkDetailStmt.execute({ id });
      if (!record) return sendHomeworkError(res, 404, "Homework not found");
      if (record.teacherId !== user.id) return sendHomeworkError(res, 403, "Forbidden");

      const classRecord = record.classIdRef
        ? {
          id: record.classIdRef,
          grade: record.classGrade,
          section: record.classSection,
          stream: record.classStream,
          academicYear: record.classAcademicYear,
          capacity: record.classCapacity,
          currentCount: record.classCurrentCount,
          homeroomTeacherId: null,
          status: "active",
        }
        : undefined;

      const classLabel = classRecord ? buildClassLabel(classRecord) : "Unknown class";
      const classNameKey = classRecord ? buildClassNameKey(classRecord) : null;

      const [submissionRows, studentRows] = await Promise.all([
        homeworkSubmissionsStmt.execute({ homeworkId: id }),
        classNameKey
          ? db
            .select({
              id: users.id,
              name: users.name,
              avatarUrl: users.studentPhotoUrl,
              className: users.className,
            })
            .from(users)
            .where(and(eq(users.role, "student"), eq(users.className, classNameKey)))
          : Promise.resolve([]),
      ]);

      const submissionMap = new Map<number, typeof submissionRows[number]>();
      for (const submission of submissionRows) {
        submissionMap.set(submission.studentId, submission);
      }

      const submissions = studentRows.map((student) => {
        const submission = submissionMap.get(student.id);
        return {
          id: submission?.id ?? null,
          homeworkId: id,
          studentId: student.id,
          submissionFile: submission?.submissionFile ?? null,
          submittedAt: submission?.submittedAt
            ? submission.submittedAt instanceof Date
              ? submission.submittedAt.toISOString()
              : String(submission.submittedAt)
            : null,
          marks: submission?.marks !== null && submission?.marks !== undefined ? Number(submission.marks) : null,
          feedback: submission?.feedback ?? null,
          student: {
            id: student.id,
            name: student.name,
            avatarUrl: student.avatarUrl ?? null,
            className: student.className ?? null,
          },
        };
      });

      const submissionCount = submissions.filter((item) => item.submittedAt).length;
      const classSize = Math.max(classRecord?.currentCount ?? 0, submissions.length);

      sendHomeworkSuccess(res, {
        id: record.id,
        classId: record.classId,
        teacherId: record.teacherId,
        subject: record.subject,
        title: record.title,
        description: record.description ?? null,
        dueDate: record.dueDate instanceof Date ? record.dueDate.toISOString().slice(0, 10) : String(record.dueDate),
        priority: record.priority,
        files: record.files ?? [],
        status: record.status,
        createdAt: record.createdAt instanceof Date ? record.createdAt.toISOString() : record.createdAt ?? null,
        class: classRecord,
        classLabel,
        classSize,
        submissionCount,
        submissions,
      });
    } catch (err) {
      console.error("Failed to fetch homework detail", err);
      sendHomeworkError(res, 500, "Failed to fetch homework detail");
    }
  });

  app.patch(api.teacher.homework.update.path, async (req, res) => {
    try {
      const user = await requireRole(req, res, ["teacher"]);
      if (!user) return;

      const id = String(req.params.id);
      const [existing] = await homeworkDetailStmt.execute({ id });
      if (!existing) return sendHomeworkError(res, 404, "Homework not found");
      if (existing.teacherId !== user.id) return sendHomeworkError(res, 403, "Forbidden");

      const input = api.teacher.homework.update.input.parse(req.body);
      if (input.classId !== undefined && input.classId !== existing.classId) {
        const [classAssignment] = await db
          .select()
          .from(classTeachers)
          .where(and(eq(classTeachers.classId, input.classId), eq(classTeachers.teacherId, user.id), eq(classTeachers.isActive, true)))
          .limit(1);
        if (!classAssignment) {
          return sendHomeworkError(res, 403, "You are not assigned to this class");
        }
      }
      const updates: Record<string, unknown> = {};
      if (input.classId !== undefined) updates.classId = input.classId;
      if (input.subject !== undefined) updates.subject = input.subject;
      if (input.title !== undefined) updates.title = input.title;
      if (input.description !== undefined) updates.description = input.description ?? null;
      if (input.dueDate !== undefined) updates.dueDate = input.dueDate as unknown as Date;
      if (input.priority !== undefined) updates.priority = input.priority;
      if (input.files !== undefined) updates.files = input.files;
      if (input.status !== undefined) updates.status = input.status;

      const [updated] = await db.update(homeworkAssignments).set(updates).where(eq(homeworkAssignments.id, id)).returning();
      if (!updated) return sendHomeworkError(res, 404, "Homework not found");

      broadcastHomeworkAssignmentUpdate(updated.classId, {
        id: updated.id,
        classId: updated.classId,
        subject: updated.subject,
        title: updated.title,
        dueDate: updated.dueDate instanceof Date ? updated.dueDate.toISOString().slice(0, 10) : String(updated.dueDate),
        status: updated.status,
      });

      sendHomeworkSuccess(res, {
        ...updated,
        dueDate: updated.dueDate instanceof Date ? updated.dueDate.toISOString().slice(0, 10) : String(updated.dueDate),
        createdAt: updated.createdAt instanceof Date ? updated.createdAt.toISOString() : updated.createdAt ?? null,
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return sendHomeworkError(res, 400, err.errors[0]?.message ?? "Invalid payload");
      }
      console.error("Failed to update homework", err);
      sendHomeworkError(res, 500, "Failed to update homework");
    }
  });

  app.delete(api.teacher.homework.cancel.path, async (req, res) => {
    try {
      const user = await requireRole(req, res, ["teacher"]);
      if (!user) return;

      const id = String(req.params.id);
      const [existing] = await homeworkDetailStmt.execute({ id });
      if (!existing) return sendHomeworkError(res, 404, "Homework not found");
      if (existing.teacherId !== user.id) return sendHomeworkError(res, 403, "Forbidden");

      const [updated] = await db
        .update(homeworkAssignments)
        .set({ status: "cancelled" })
        .where(eq(homeworkAssignments.id, id))
        .returning();

      if (!updated) return sendHomeworkError(res, 404, "Homework not found");

      broadcastHomeworkAssignmentUpdate(updated.classId, {
        id: updated.id,
        classId: updated.classId,
        subject: updated.subject,
        title: updated.title,
        dueDate: updated.dueDate instanceof Date ? updated.dueDate.toISOString().slice(0, 10) : String(updated.dueDate),
        status: updated.status,
      });

      sendHomeworkSuccess(res, { id: updated.id, status: updated.status });
    } catch (err) {
      console.error("Failed to cancel homework", err);
      sendHomeworkError(res, 500, "Failed to cancel homework");
    }
  });

  app.patch(api.teacher.homework.grade.path, async (req, res) => {
    try {
      const user = await requireRole(req, res, ["teacher"]);
      if (!user) return;

      const homeworkId = String(req.params.id);
      const submissionId = String(req.params.submissionId);
      const [homework] = await homeworkDetailStmt.execute({ id: homeworkId });
      if (!homework) return sendHomeworkError(res, 404, "Homework not found");
      if (homework.teacherId !== user.id) return sendHomeworkError(res, 403, "Forbidden");

      const input = api.teacher.homework.grade.input.parse(req.body);

      const [existing] = await db
        .select()
        .from(studentSubmissions)
        .where(and(eq(studentSubmissions.id, submissionId), eq(studentSubmissions.homeworkId, homeworkId)))
        .limit(1);

      if (!existing) return sendHomeworkError(res, 404, "Submission not found");

      const [updated] = await db
        .update(studentSubmissions)
        .set({ marks: String(input.marks), feedback: input.feedback })
        .where(eq(studentSubmissions.id, submissionId))
        .returning();

      const [student] = await db
        .select({
          id: users.id,
          name: users.name,
          avatarUrl: users.studentPhotoUrl,
          className: users.className,
        })
        .from(users)
        .where(eq(users.id, updated.studentId))
        .limit(1);

      sendHomeworkSuccess(res, {
        id: updated.id,
        homeworkId: updated.homeworkId,
        studentId: updated.studentId,
        submissionFile: updated.submissionFile ?? null,
        submittedAt: updated.submittedAt instanceof Date ? updated.submittedAt.toISOString() : updated.submittedAt ?? null,
        marks: updated.marks !== null && updated.marks !== undefined ? Number(updated.marks) : null,
        feedback: updated.feedback ?? null,
        student: {
          id: student?.id ?? updated.studentId,
          name: student?.name ?? `Student #${updated.studentId}`,
          avatarUrl: student?.avatarUrl ?? null,
          className: student?.className ?? null,
        },
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return sendHomeworkError(res, 400, err.errors[0]?.message ?? "Invalid payload");
      }
      console.error("Failed to grade submission", err);
      sendHomeworkError(res, 500, "Failed to grade submission");
    }
  });

  app.get(api.teacher.attendance.students.path, async (req, res) => {
    const user = await requireRole(req, res, ["teacher", "admin"]);
    if (!user) return;
    const className = typeof parseScalar(req.query.className) === "string" ? String(parseScalar(req.query.className)) : undefined;
    if (className) {
      if (user.role === "teacher" && !(await getTeacherClassNames(user.id)).has(className)) return res.status(403).json({ message: "Forbidden" });
      return res.json(await storage.getStudentsByClass(className));
    }
    if (user.role === "admin") return res.json(await storage.getStudents());
    const classNames = Array.from(await getTeacherClassNames(user.id));
    const groups = await Promise.all(classNames.map((item) => storage.getStudentsByClass(item)));
    const unique = new Map<number, User>();
    for (const group of groups) for (const student of group) unique.set(student.id, student);
    res.json(Array.from(unique.values()).sort((left, right) => left.name.localeCompare(right.name)));
  });

  app.get(api.teacher.attendance.history.path, async (req, res) => {
    const user = await requireRole(req, res, ["teacher", "admin"]);
    if (!user) return;
    const className = typeof parseScalar(req.query.className) === "string" ? String(parseScalar(req.query.className)) : undefined;
    const date = typeof parseScalar(req.query.date) === "string" ? String(parseScalar(req.query.date)) : undefined;
    if (user.role === "teacher" && className && !(await getTeacherClassNames(user.id)).has(className)) return res.status(403).json({ message: "Forbidden" });
    const records = user.role === "teacher" ? await storage.getAttendanceByTeacher(user.id) : await storage.getAttendance();
    res.json(records.filter((record) => (!className || record.student?.className === className) && (!date || record.date === date)));
  });

  app.post(api.teacher.attendance.bulkUpsert.path, async (req, res) => {
    try {
      const user = await requireRole(req, res, ["teacher", "admin"]);
      if (!user) return;
      const input = api.teacher.attendance.bulkUpsert.input.parse(req.body);
      if (user.role === "teacher" && !(await getTeacherClassNames(user.id)).has(input.className)) return res.status(403).json({ message: "Forbidden" });
      const classStudents = await storage.getStudentsByClass(input.className);
      const allowedIds = new Set(classStudents.map((student) => student.id));
      for (const record of input.records) {
        if (!allowedIds.has(record.studentId)) return res.status(400).json({ message: "One or more students do not belong to the selected class." });
      }
      const saved = await storage.upsertAttendanceRecords(
        input.records.map((record) => ({
          studentId: record.studentId,
          teacherId: user.id,
          date: input.date,
          status: record.status,
          session: input.session,
          remarks: record.remarks,
        })),
      );
      res.json(saved);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join(".") });
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put(api.teacher.attendance.update.path, async (req, res) => {
    try {
      const user = await requireRole(req, res, ["teacher", "admin"]);
      if (!user) return;
      const id = parseNumberValue(req.params.id);
      const existing = await storage.getAttendanceRecord(id);
      if (!existing) return res.status(404).json({ message: "Attendance record not found" });
      if (user.role === "teacher" && existing.teacherId !== user.id) return res.status(403).json({ message: "Forbidden" });
      const input = api.teacher.attendance.update.input.parse(req.body);
      const updated = await storage.updateAttendance(id, { ...input, teacherId: existing.teacherId, studentId: existing.studentId, date: existing.date });
      if (!updated) return res.status(404).json({ message: "Attendance record not found" });
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join(".") });
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get(api.fees.list.path, async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    if (user.role === "student") return res.json(await storage.getFeesByStudent(user.id));
    res.json(await storage.getFees());
  });

  app.get(api.fees.payments.list.path, async (req, res) => {
    try {
      const user = await requireRole(req, res, ["admin", "student"]);
      if (!user) return;
      const filters = api.fees.payments.list.input.parse(req.query);
      if (user.role === "student" && filters.studentId && filters.studentId !== user.id) {
        return res.status(403).json({ message: "Forbidden" });
      }
      res.json(await storage.getFeePayments({ ...filters, studentId: user.role === "student" ? user.id : filters.studentId }));
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join(".") });
      if (err instanceof Error) return res.status(400).json({ message: err.message });
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get(api.fees.payments.receipt.path, async (req, res) => {
    const user = await requireRole(req, res, ["admin", "student"]);
    if (!user) return;
    const receipt = await storage.getPaymentReceipt(parseNumberValue(req.params.paymentId));
    if (!receipt) return res.status(404).json({ message: "Payment receipt not found" });
    if (user.role === "student" && receipt.invoice.studentId !== user.id) return res.status(403).json({ message: "Forbidden" });
    res.json(receipt);
  });

  app.get(api.fees.balances.summary.path, async (req, res) => {
    const user = await requireRole(req, res, ["admin"]);
    if (!user) return;
    res.json(await storage.getFeeBalanceSummary());
  });

  app.get(api.fees.balances.overdue.path, async (req, res) => {
    const user = await requireRole(req, res, ["admin"]);
    if (!user) return;
    res.json(await storage.getOverdueBalances());
  });

  app.get(api.fees.balances.student.path, async (req, res) => {
    const user = await requireRole(req, res, ["admin", "student"]);
    if (!user) return;
    const requestedId = parseNumberValue(req.params.studentId);
    if (Number.isNaN(requestedId)) return res.status(400).json({ message: "Invalid student id", field: "studentId" });
    if (user.role === "student" && requestedId !== user.id) return res.status(403).json({ message: "Forbidden" });
    const studentId = user.role === "student" ? user.id : requestedId;
    const student = await storage.getUser(studentId);
    if (!student || student.role !== "student") return res.status(404).json({ message: "Student not found" });
    res.json(await storage.getStudentBalance(studentId));
  });

  app.post(api.fees.create.path, async (req, res) => {
    try {
      const user = await requireRole(req, res, ["admin"]);
      if (!user) return;
      const input = api.fees.create.input.parse(req.body);
      const student = await storage.getUser(input.studentId);
      if (!student || student.role !== "student") return res.status(400).json({ message: "Invalid student id", field: "studentId" });
      res.status(201).json(await storage.createFee(input));
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join(".") });
      if (err instanceof Error) return res.status(400).json({ message: err.message });
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put(api.fees.update.path, async (req, res) => {
    try {
      const user = await requireRole(req, res, ["admin"]);
      if (!user) return;
      const input = api.fees.update.input.parse(req.body);
      if (input.studentId) {
        const student = await storage.getUser(input.studentId);
        if (!student || student.role !== "student") return res.status(400).json({ message: "Invalid student id", field: "studentId" });
      }
      const updated = await storage.updateFee(parseNumberValue(req.params.id), input);
      if (!updated) return res.status(404).json({ message: "Fee record not found" });
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join(".") });
      if (err instanceof Error) return res.status(400).json({ message: err.message });
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete(api.fees.delete.path, async (req, res) => {
    const user = await requireRole(req, res, ["admin"]);
    if (!user) return;
    if (!(await storage.deleteFee(parseNumberValue(req.params.id)))) return res.status(404).json({ message: "Fee record not found" });
    res.json({ success: true });
  });

  app.post(api.fees.payments.record.path, async (req, res) => {
    try {
      const user = await requireRole(req, res, ["admin"]);
      if (!user) return;
      const input = api.fees.payments.record.input.parse(req.body);
      const updated = await storage.recordFeePayment(parseNumberValue(req.params.id), input, user.id);
      if (!updated) return res.status(404).json({ message: "Invoice not found" });
      res.status(201).json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join(".") });
      if (err instanceof Error) return res.status(400).json({ message: err.message });
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get(api.fees.adjustments.list.path, async (req, res) => {
    const user = await requireRole(req, res, ["admin"]);
    if (!user) return;
    const adjustments = await storage.getFeeAdjustments(parseNumberValue(req.params.id));
    res.json(adjustments);
  });

  app.post(api.fees.adjustments.create.path, async (req, res) => {
    try {
      const user = await requireRole(req, res, ["admin"]);
      if (!user) return;
      const input = api.fees.adjustments.create.input.parse(req.body);
      const updated = await storage.createFeeAdjustment(parseNumberValue(req.params.id), input, user.id);
      if (!updated) return res.status(404).json({ message: "Invoice not found" });
      res.status(201).json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join(".") });
      if (err instanceof Error) return res.status(400).json({ message: err.message });
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get(api.fees.profiles.list.path, async (req, res) => {
    const user = await requireRole(req, res, ["admin"]);
    if (!user) return;
    res.json(await storage.getBillingProfiles());
  });

  app.post(api.fees.profiles.upsert.path, async (req, res) => {
    try {
      const user = await requireRole(req, res, ["admin"]);
      if (!user) return;
      const input = api.fees.profiles.upsert.input.parse(req.body);
      const student = await storage.getUser(input.studentId);
      if (!student || student.role !== "student") return res.status(400).json({ message: "Invalid student id", field: "studentId" });
      res.json(await storage.upsertBillingProfile(input));
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join(".") });
      if (err instanceof Error) return res.status(400).json({ message: err.message });
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post(api.fees.generateMonthly.path, async (req, res) => {
    try {
      const user = await requireRole(req, res, ["admin"]);
      if (!user) return;
      const input = api.fees.generateMonthly.input.parse(req.body);
      res.json(await storage.generateMonthlyFees(input));
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join(".") });
      if (err instanceof Error) return res.status(400).json({ message: err.message });
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get(api.fees.report.path, async (req, res) => {
    try {
      const user = await requireRole(req, res, ["admin"]);
      if (!user) return;
      const filters = api.fees.report.input.parse(req.query);
      res.json(await storage.getFinanceReport(filters));
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join(".") });
      if (err instanceof Error) return res.status(400).json({ message: err.message });
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get(api.fees.detail.path, async (req, res) => {
    const user = await requireRole(req, res, ["admin", "student"]);
    if (!user) return;
    const invoice = await storage.getFee(parseNumberValue(req.params.id));
    if (!invoice) return res.status(404).json({ message: "Invoice not found" });
    if (user.role === "student" && invoice.studentId !== user.id) return res.status(403).json({ message: "Forbidden" });
    res.json(invoice);
  });

  // ─── Voucher / Bulk Print Routes ─────────────────────────────────────────────

  app.post(api.fees.vouchers.preview.path, async (req, res) => {
    try {
      const user = await requireRole(req, res, ["admin"]);
      if (!user) return;
      const input = api.fees.vouchers.preview.input.parse(req.body);
      res.json(await previewVoucherJob(input));
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0]?.message ?? "Invalid input" });
      if (err instanceof Error) {
        const statusCode = err.message.startsWith("No fee structure found for") ? 404 : 400;
        return res.status(statusCode).json({ message: err.message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post(api.fees.vouchers.start.path, async (req, res) => {
    try {
      const user = await requireRole(req, res, ["admin"]);
      if (!user) return;
      const input = api.fees.vouchers.start.input.parse(req.body);
      const operation = await startVoucherJob(input, user.id);
      res.status(201).json(operation);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0]?.message ?? "Invalid input" });
      if (err instanceof Error) {
        const statusCode = err.message.includes("already running") ? 409 : 400;
        return res.status(statusCode).json({ message: err.message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get(api.fees.vouchers.recent.path, async (req, res) => {
    try {
      const user = await requireRole(req, res, ["admin"]);
      if (!user) return;
      const limit = Math.min(Number(req.query.limit) || 10, 50);
      res.json(await storage.listFinanceVoucherOperations(limit));
    } catch {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get(api.fees.vouchers.detail.path, async (req, res) => {
    try {
      const user = await requireRole(req, res, ["admin"]);
      if (!user) return;
      const id = parseNumberValue(req.params.operationId);
      if (Number.isNaN(id)) return res.status(400).json({ message: "Invalid operation id" });
      const operation = await storage.getFinanceVoucherOperation(id);
      if (!operation) return res.status(404).json({ message: "Voucher operation not found" });
      res.json(operation);
    } catch {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post(api.fees.vouchers.cancel.path, async (req, res) => {
    try {
      const user = await requireRole(req, res, ["admin"]);
      if (!user) return;
      const id = parseNumberValue(req.params.operationId);
      if (Number.isNaN(id)) return res.status(400).json({ message: "Invalid operation id" });
      const operation = await cancelVoucherJob(id);
      if (!operation) return res.status(404).json({ message: "Voucher operation not found" });
      res.json(operation);
    } catch {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get(api.fees.vouchers.progress.path, async (req, res) => {
    try {
      const user = await requireRole(req, res, ["admin"]);
      if (!user) return;
      const id = parseNumberValue(req.params.operationId);
      if (Number.isNaN(id)) return res.status(400).json({ message: "Invalid operation id" });
      const shouldRefresh = (progress?: {
        status?: string;
        totalInvoices?: number;
        generatedCount?: number;
        skippedCount?: number;
        failedCount?: number;
      }) => {
        if (!progress || progress.status !== "running") return false;
        if ((progress.totalInvoices ?? 0) <= 0) return false;
        const accounted = (progress.generatedCount ?? 0) + (progress.skippedCount ?? 0) + (progress.failedCount ?? 0);
        return accounted >= (progress.totalInvoices ?? 0);
      };

      let progress = getJobProgress(id);
      if (!progress) {
        progress = await getFreshJobProgress(id);
      }

      if (!progress) return res.status(404).json({ message: "Voucher operation not found" });

      if (shouldRefresh(progress)) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        const refreshed = await getFreshJobProgress(id, true);
        if (refreshed) progress = refreshed;
      }

      res.json(progress);
    } catch {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get(api.fees.vouchers.events.path, async (req, res) => {
    const user = await requireRole(req, res, ["admin"]);
    if (!user) return;
    const id = parseNumberValue(req.params.operationId);
    if (Number.isNaN(id)) return res.status(400).json({ message: "Invalid operation id" });

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    const send = (chunk: string) => { res.write(chunk); };
    send(`: connected\n\n`);

    const unsub = subscribeJobSse(id, send);
    req.on("close", () => { unsub(); });
  });

  app.get(api.fees.vouchers.download.path, async (req, res) => {
    try {
      const user = await requireRole(req, res, ["admin"]);
      if (!user) return;
      const id = parseNumberValue(req.params.operationId);
      if (Number.isNaN(id)) return res.status(400).json({ message: "Invalid operation id" });
      const zipBuffer = getJobZip(id);
      if (!zipBuffer) return res.status(404).json({ message: "ZIP download not available. The job may have expired or hasn't completed yet." });
      const operation = await storage.getFinanceVoucherOperation(id);
      const fileName = `vouchers-job-${id}-${new Date().toISOString().slice(0, 10)}.zip`;
      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
      res.setHeader("Content-Length", zipBuffer.length);
      res.end(zipBuffer);
      // Clean up after download (optional — comment out to allow multiple downloads)
      // clearJobZip(id);
    } catch {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ─── Finance Ledger Routes ─────────────────────────────────────────────────

  app.get(api.fees.ledger.student.path, async (req, res) => {
    try {
      const user = await requireRole(req, res, ["admin"]);
      if (!user) return;

      const { studentId } = req.params;
      const limit = Math.min(Math.max(1, parseInt(req.query.limit as string) || 100), 1000);

      if (!studentId || isNaN(parseInt(studentId))) {
        return res.status(400).json({ message: "Invalid student ID" });
      }

      const ledgerService = new LedgerService();
      const entries = await ledgerService.getStudentLedger(parseInt(studentId));

      sendApiSuccess(res, entries.slice(-limit));
    } catch (err) {
      sendApiError(res, err, "Failed to fetch student ledger");
    }
  });

  app.get(api.fees.ledger.fee.path, async (req, res) => {
    try {
      const user = await requireRole(req, res, ["admin"]);
      if (!user) return;

      const { feeId } = req.params;
      const limit = Math.min(Math.max(1, parseInt(req.query.limit as string) || 100), 1000);

      if (!feeId || isNaN(parseInt(feeId))) {
        return res.status(400).json({ message: "Invalid fee ID" });
      }

      const ledgerService = new LedgerService();
      const entries = await ledgerService.getFeeLedger(parseInt(feeId));

      sendApiSuccess(res, entries.slice(-limit));
    } catch (err) {
      sendApiError(res, err, "Failed to fetch fee ledger");
    }
  });

  // ─── Finance Audit Routes ──────────────────────────────────────────────────

  app.get(api.fees.audit.student.path, async (req, res) => {
    try {
      const user = await requireRole(req, res, ["admin"]);
      if (!user) return;

      const { studentId } = req.params;
      const limit = Math.min(Math.max(1, parseInt(req.query.limit as string) || 100), 1000);

      if (!studentId || isNaN(parseInt(studentId))) {
        return res.status(400).json({ message: "Invalid student ID" });
      }

      const auditService = new AuditService();
      const logs = await auditService.getStudentAuditLog(parseInt(studentId), limit);

      sendApiSuccess(res, logs);
    } catch (err) {
      sendApiError(res, err, "Failed to fetch student audit logs");
    }
  });

  app.get(api.fees.audit.fee.path, async (req, res) => {
    try {
      const user = await requireRole(req, res, ["admin"]);
      if (!user) return;

      const { feeId } = req.params;
      const limit = Math.min(Math.max(1, parseInt(req.query.limit as string) || 100), 1000);

      if (!feeId || isNaN(parseInt(feeId))) {
        return res.status(400).json({ message: "Invalid fee ID" });
      }

      const auditService = new AuditService();
      const logs = await auditService.getFeeAuditLog(parseInt(feeId));

      sendApiSuccess(res, logs.slice(-limit));
    } catch (err) {
      sendApiError(res, err, "Failed to fetch fee audit logs");
    }
  });

  app.get(api.fees.audit.action.path, async (req, res) => {
    try {
      const user = await requireRole(req, res, ["admin"]);
      if (!user) return;

      const { action } = req.params;
      const limit = Math.min(Math.max(1, parseInt(req.query.limit as string) || 100), 1000);

      const validActions = ["create", "update", "delete", "payment", "adjustment"];
      if (!validActions.includes(action)) {
        return res.status(400).json({ 
          message: `Invalid action. Must be one of: ${validActions.join(", ")}` 
        });
      }

      const auditService = new AuditService();
      const logs = await auditService.getAuditLogsByAction(action as any, limit);

      sendApiSuccess(res, logs);
    } catch (err) {
      sendApiError(res, err, "Failed to fetch audit logs by action");
    }
  });

  // ─── QR Attendance ──────────────────────────────────────────────────────────

  registerQrAttendanceRoutes(app, {
    storage,
    requireRole,
    sendApiSuccess,
    sendApiError,
    parseNumberValue,
    getTeacherClassNames,
  });

  app.get(api.dashboard.adminStats.path, async (req, res) => {
    const user = await requireRole(req, res, ["admin"]);
    if (user) res.json(await storage.getAdminDashboardStats());
  });

  app.get(api.dashboard.studentStats.path, async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    const requestedId = parseNumberValue(req.query.id);
    const studentId = user.role === "student" ? user.id : requestedId;
    if (!["student", "teacher", "admin"].includes(user.role)) return res.status(403).json({ message: "Forbidden" });
    if (Number.isNaN(studentId)) return res.status(400).json({ message: "Invalid student id", field: "id" });
    const student = await storage.getUser(studentId);
    if (!student || student.role !== "student") return res.status(404).json({ message: "Student not found" });
    res.json(await storage.getStudentDashboardStats(studentId));
  });

  app.get(api.dashboard.teacherStats.path, async (req, res) => {
    const user = await requireRole(req, res, ["teacher"]);
    if (!user) return;
    const classes = await storage.getTeacherClasses(user.id);
    const classNames = classes.map((item) => item.className);
    const uniqueStudents = new Set<number>();
    for (const className of classNames) {
      for (const student of await storage.getStudentsByClass(className)) uniqueStudents.add(student.id);
    }
    const dayName = new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(new Date()) as (typeof timetableDays)[number];
    const timetableGroups = await Promise.all(classNames.map((className) => storage.getTimetableByClass(className)));
    const classesToday = timetableGroups.flat().filter((item) => item.dayOfWeek === dayName && (!item.teacherId || item.teacherId === user.id)).length;
    const subjectResults = (await storage.getResults()).filter((record) => record.subject === user.subject);
    const averageClassPerformance = subjectResults.length ? Math.round(subjectResults.reduce((sum, record) => sum + record.marks, 0) / subjectResults.length) : 0;
    res.json({ totalStudents: uniqueStudents.size, classesToday, averageClassPerformance });
  });

  // ─── Class & Class-Teacher Assignment Routes (per-class teacher allocation) ──

  // POST /api/v1/classes
  app.post("/api/v1/classes", async (req, res) => {
    try {
      const user = await requireRole(req, res, ["admin"]);
      if (!user) return;

      const input = CreateClassSchema.parse(req.body);
      const [inserted] = await db
        .insert(classes)
        .values({
          grade: input.grade,
          section: input.section,
          stream: input.stream,
          academicYear: input.academicYear,
          capacity: input.capacity,
          currentCount: 0,
          status: "active",
        })
        .returning();

      return res.status(201).json(inserted);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0]?.message ?? "Invalid payload" });
      }
      if (isUniqueViolation(err)) {
        return res.status(409).json({ message: "A class with this grade/section/year already exists" });
      }
      console.error("Failed to create class", err);
      return res.status(500).json({ message: "Failed to create class" });
    }
  });

  // ─── Class & Class-Teacher Assignment Routes (per-class teacher allocation) ──

  // GET  /api/v1/classes?academicYear=&grade=
  app.get("/api/v1/classes", async (req, res) => {
    try {
      const academicYear = typeof parseScalar(req.query.academicYear) === "string" ? String(parseScalar(req.query.academicYear)) : undefined;
      const grade = typeof parseScalar(req.query.grade) === "string" ? String(parseScalar(req.query.grade)) : undefined;

      const conditions = [];
      if (academicYear) conditions.push(eq(classes.academicYear, academicYear));
      if (grade) conditions.push(eq(classes.grade, grade));

      const rows = await db
        .select()
        .from(classes)
        .where(conditions.length ? and(...conditions) : undefined);

      res.json({ data: rows, total: rows.length });
    } catch (err) {
      console.error("Failed to list classes", err);
      res.status(500).json({ message: "Failed to list classes" });
    }
  });

  // GET  /api/v1/classes/:id/teachers
  app.get("/api/v1/classes/:id/teachers", async (req, res) => {
    try {
      const classId = parseNumberValue(req.params.id);
      if (Number.isNaN(classId)) return res.status(400).json({ message: "Invalid class id" });

      const teachersRows = await db
        .select()
        .from(classTeachers)
        .where(eq(classTeachers.classId, classId));

      res.json(teachersRows);
    } catch (err) {
      console.error("Failed to list class teachers", err);
      res.status(500).json({ message: "Failed to list class teachers" });
    }
  });

  // POST /api/v1/classes/:id/assign-teacher
  app.post("/api/v1/classes/:id/assign-teacher", async (req, res) => {
    try {
      const user = await requireRole(req, res, ["admin"]);
      if (!user) return;

      const classId = parseNumberValue(req.params.id);
      if (Number.isNaN(classId)) return res.status(400).json({ message: "Invalid class id" });

      const { teacherId, subjects, periodsPerWeek, priority } = AssignTeacherSchema.parse(req.body);

      const teacherUser = await storage.getUser(teacherId);
      if (!teacherUser || teacherUser.role !== "teacher") {
        return res.status(400).json({ message: "Invalid teacher id" });
      }

      await db.transaction(async (tx) => {
        const existing = await tx
          .select()
          .from(classTeachers)
          .where(eq(classTeachers.classId, classId));

        if (existing.length >= 6) {
          throw new Error("Max 6 teachers per class");
        }

        const totalPeriods = existing.reduce((sum, item) => sum + item.periodsPerWeek, 0);
        if (totalPeriods + periodsPerWeek > 40) {
          throw new Error("Exceeds 40 periods/week");
        }

        await tx.insert(classTeachers).values({
          classId,
          teacherId,
          subjects,
          periodsPerWeek,
          priority,
        });
      });

      res.json({ success: true });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0]?.message ?? "Invalid payload" });
      }
      if (err instanceof Error && err.message) {
        return res.status(400).json({ message: err.message });
      }
      console.error("Failed to assign teacher to class", err);
      res.status(500).json({ message: "Failed to assign teacher to class" });
    }
  });

  // DELETE /api/v1/classes/:id/teachers/:teacherId
  app.delete("/api/v1/classes/:id/teachers/:teacherId", async (req, res) => {
    try {
      const classId = parseNumberValue(req.params.id);
      const teacherId = parseNumberValue(req.params.teacherId);
      if (Number.isNaN(classId) || Number.isNaN(teacherId)) {
        return res.status(400).json({ message: "Invalid class or teacher id" });
      }

      await db
        .delete(classTeachers)
        .where(and(eq(classTeachers.classId, classId), eq(classTeachers.teacherId, teacherId)));

      res.json({ success: true });
    } catch (err) {
      console.error("Failed to remove class teacher", err);
      res.status(500).json({ message: "Failed to remove class teacher" });
    }
  });

  // ─── Timetable Management ──────────────────────────────────────────────────
  
  // GET /api/v1/timetables/settings — common settings for all roles
  app.get("/api/v1/timetables/settings", async (req, res) => {
    try {
      const user = await requireUser(req, res);
      if (!user) return;
      console.log(`[DEBUG] GET /api/v1/timetables/settings: Hit by user ${user.id} (${user.role})`);
      const settings = await loadTimetableSettings();
      res.json(settings);
    } catch (error) {
      console.error("GET timetableSettings error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // PUT /api/v1/timetables/settings — admin only
  app.put("/api/v1/timetables/settings", async (req, res) => {
    try {
      const user = await requireRole(req, res, ["admin"]);
      if (!user) return;
      
      const { timetableSettings, timetableSettingsVersion } = await import("../shared/schema.js");
      const input = api.settings.timetableUpdate.input.parse(req.body);
      
      const recordToUpsert = {
        schoolId: 1,
        startTime: input.startTime,
        endTime: input.endTime,
        workingDays: input.workingDays,
        periodDuration: input.periodDuration,
        breakAfterPeriod: input.breakAfterPeriod,
        breakDuration: input.breakDuration,
        totalPeriods: 8, // Initial calc, will be refined in loop if needed
        updatedAt: new Date(),
      };

      // Recalculate totalPeriods based on duration if needed (re-implement logic)
      const [startH, startM] = input.startTime.split(':').map(Number);
      const [endH, endM] = input.endTime.split(':').map(Number);
      const totalMinutes = (endH * 60 + endM) - (startH * 60 + startM);
      const breaksTotalMinutes = input.breakAfterPeriod.length * input.breakDuration;
      const teachingMinutes = totalMinutes - breaksTotalMinutes;
      recordToUpsert.totalPeriods = Math.floor(teachingMinutes / input.periodDuration);

      const result = await db.transaction(async (tx) => {
        const [saved] = await tx.insert(timetableSettings)
          .values(recordToUpsert)
          .onConflictDoUpdate({
            target: timetableSettings.schoolId,
            set: recordToUpsert,
          }).returning();
          
        await tx.insert(timetableSettingsVersion).values({
          settingsId: saved.id,
          changedBy: user.id,
          snapshot: saved,
        });
        
        return saved;
      });
      
      res.json(result);
    } catch (err) {
      console.error("PUT timetableSettings error:", err);
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0]?.message });
      res.status(500).json({ message: "Failed to update timetable settings" });
    }
  });

  // Must be before /api/v1/timetables/:id to avoid conflict
  app.get("/api/v1/timetables/teacher/mine", async (req, res) => {
    try {
      const user = await requireRole(req, res, ["teacher"]);
      if (!user) return;

      const { timetables: timetablesTable, timetablesPeriods: periodsTable } = await import("../shared/schema.js");

      const published = await db
        .select()
        .from(timetablesTable)
        .where(eq(timetablesTable.status, "published"));

      if (published.length === 0) return res.json([]);

      const allPeriods = [];
      for (const tt of published) {
        const classRow = (await db.select().from(classes).where(eq(classes.id, tt.classId)).limit(1))[0];
        if (!classRow) continue;
        const className = `${classRow.grade}-${classRow.section}${classRow.stream ? `-${classRow.stream}` : ""}`;
        const rows = await db
          .select()
          .from(periodsTable)
          .where(and(eq(periodsTable.timetableId, tt.id), eq(periodsTable.teacherId, user.id)));
        for (const row of rows) {
          allPeriods.push({ ...row, classId: classRow.id, className });
        }
      }

      res.json(allPeriods);
    } catch (err) {
      console.error("Failed to fetch teacher timetable", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // GET /api/v1/timetables — admin list
  app.get("/api/v1/timetables", async (req, res) => {
    try {
      const user = await requireRole(req, res, ["admin"]);
      if (!user) return;

      const { timetables: timetablesTable } = await import("../shared/schema.js");

      const rows = await db.select().from(timetablesTable);
      const result = await Promise.all(
        rows.map(async (tt) => {
          const [classRow] = await db.select().from(classes).where(eq(classes.id, tt.classId)).limit(1);
          return {
            ...tt,
            publishedAt: tt.publishedAt ? tt.publishedAt.toISOString() : null,
            createdAt: tt.createdAt ? tt.createdAt.toISOString() : null,
            updatedAt: tt.updatedAt ? tt.updatedAt.toISOString() : null,
            class: classRow ?? undefined,
          };
        }),
      );
      res.json(result);
    } catch (err) {
      console.error("Failed to list timetables", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // POST /api/v1/timetables — admin create
  app.post("/api/v1/timetables", async (req, res) => {
    try {
      const user = await requireRole(req, res, ["admin"]);
      if (!user) return;

      const { classId } = z.object({ classId: z.number().int().positive() }).parse(req.body);
      const { timetables: timetablesTable } = await import("../shared/schema.js");

      const [classRow] = await db.select().from(classes).where(eq(classes.id, classId)).limit(1);
      if (!classRow) return res.status(404).json({ message: "Class not found" });

      const [inserted] = await db
        .insert(timetablesTable)
        .values({ classId, status: "draft" })
        .returning();

      res.status(201).json({ ...inserted, publishedAt: null });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0]?.message ?? "Invalid payload" });
      if (isUniqueViolation(err)) return res.status(409).json({ message: "A timetable already exists for this class" });
      console.error("Failed to create timetable", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // GET /api/v1/timetables/:id — admin get one with periods
  app.get("/api/v1/timetables/:id", async (req, res) => {
    try {
      const user = await requireRole(req, res, ["admin"]);
      if (!user) return;

      const id = parseNumberValue(req.params.id);
      if (Number.isNaN(id)) return res.status(400).json({ message: "Invalid timetable id" });

      const { timetables: timetablesTable, timetablesPeriods: periodsTable } = await import("../shared/schema.js");

      const [tt] = await db.select().from(timetablesTable).where(eq(timetablesTable.id, id)).limit(1);
      if (!tt) return res.status(404).json({ message: "Timetable not found" });

      const [classRow] = await db.select().from(classes).where(eq(classes.id, tt.classId)).limit(1);
      const periodsRows = await db.select().from(periodsTable).where(eq(periodsTable.timetableId, id));

      // Enrich with teacher names
      const periodsWithNames = await Promise.all(
        periodsRows.map(async (p) => {
          let teacherName: string | null = null;
          if (p.teacherId) {
            const teacher = await storage.getUser(p.teacherId);
            teacherName = teacher?.name ?? null;
          }
          return { ...p, teacherName };
        }),
      );

      res.json({
        ...tt,
        publishedAt: tt.publishedAt ? tt.publishedAt.toISOString() : null,
        createdAt: tt.createdAt ? tt.createdAt.toISOString() : null,
        updatedAt: tt.updatedAt ? tt.updatedAt.toISOString() : null,
        class: classRow ?? undefined,
        periods: periodsWithNames,
      });
    } catch (err) {
      console.error("Failed to get timetable", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // PUT /api/v1/timetables/:id/periods — bulk upsert periods
  app.put("/api/v1/timetables/:id/periods", async (req, res) => {
    try {
      const user = await requireRole(req, res, ["admin"]);
      if (!user) return;

      const id = parseNumberValue(req.params.id);
      if (Number.isNaN(id)) return res.status(400).json({ message: "Invalid timetable id" });

      const { timetables: timetablesTable, timetablesPeriods: periodsTable } = await import("../shared/schema.js");

      const [tt] = await db.select().from(timetablesTable).where(eq(timetablesTable.id, id)).limit(1);
      if (!tt) return res.status(404).json({ message: "Timetable not found" });

      const body = z
        .object({
          periods: z.array(
            z.object({
              dayOfWeek: z.number().int().min(1).max(6),
              period: z.number().int().min(1).max(8),
              subject: z.string().nullable().optional(),
              teacherId: z.number().int().positive().nullable().optional(),
              room: z.string().nullable().optional(),
            }),
          ),
        })
        .parse(req.body);

      // Detect conflicts: same teacher in same day+period across this timetable
      const conflictKeys = new Set<string>();
      const teacherSlots = new Map<string, number>();
      for (const p of body.periods) {
        if (!p.teacherId) continue;
        const key = `${p.teacherId}:${p.dayOfWeek}:${p.period}`;
        const count = (teacherSlots.get(key) ?? 0) + 1;
        teacherSlots.set(key, count);
        if (count > 1) conflictKeys.add(key);
      }

      await db.transaction(async (tx) => {
        await tx.delete(periodsTable).where(eq(periodsTable.timetableId, id));
        if (body.periods.length > 0) {
          await tx.insert(periodsTable).values(
            body.periods.map((p) => ({
              timetableId: id,
              dayOfWeek: p.dayOfWeek,
              period: p.period,
              subject: p.subject ?? null,
              teacherId: p.teacherId ?? null,
              room: p.room ?? null,
              isConflict: p.teacherId ? conflictKeys.has(`${p.teacherId}:${p.dayOfWeek}:${p.period}`) : false,
            })),
          );
        }
        await tx.update(timetablesTable).set({ updatedAt: new Date() }).where(eq(timetablesTable.id, id));
      });

      res.json({ success: true, conflictCount: conflictKeys.size });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0]?.message ?? "Invalid payload" });
      console.error("Failed to upsert periods", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // POST /api/v1/timetables/:id/publish — publish timetable
  app.post("/api/v1/timetables/:id/publish", async (req, res) => {
    try {
      const user = await requireRole(req, res, ["admin"]);
      if (!user) return;

      const id = parseNumberValue(req.params.id);
      if (Number.isNaN(id)) return res.status(400).json({ message: "Invalid timetable id" });

      const { timetables: timetablesTable, timetablesPeriods: periodsTable } = await import("../shared/schema.js");

      const [tt] = await db.select().from(timetablesTable).where(eq(timetablesTable.id, id)).limit(1);
      if (!tt) return res.status(404).json({ message: "Timetable not found" });

      const periods = await db.select().from(periodsTable).where(eq(periodsTable.timetableId, id));

      // Re-detect conflicts across ALL published timetables (teacher double-booked globally)
      const allPublished = await db
        .select()
        .from(timetablesTable)
        .where(and(eq(timetablesTable.status, "published")));

      const globalTeacherSlots = new Map<string, number>();
      for (const published of allPublished) {
        if (published.id === id) continue;
        const publishedPeriods = await db.select().from(periodsTable).where(eq(periodsTable.timetableId, published.id));
        for (const p of publishedPeriods) {
          if (!p.teacherId) continue;
          const key = `${p.teacherId}:${p.dayOfWeek}:${p.period}`;
          globalTeacherSlots.set(key, (globalTeacherSlots.get(key) ?? 0) + 1);
        }
      }

      const conflictKeys = new Set<string>();
      for (const p of periods) {
        if (!p.teacherId) continue;
        const key = `${p.teacherId}:${p.dayOfWeek}:${p.period}`;
        const globalCount = (globalTeacherSlots.get(key) ?? 0) + 1;
        if (globalCount > 1) conflictKeys.add(`${p.id}`);
      }

      // Also check within-timetable conflicts
      const withinSlots = new Map<string, number[]>();
      for (const p of periods) {
        if (!p.teacherId) continue;
        const key = `${p.teacherId}:${p.dayOfWeek}:${p.period}`;
        const bucket = withinSlots.get(key) ?? [];
        bucket.push(p.id);
        withinSlots.set(key, bucket);
      }
      for (const ids of withinSlots.values()) {
        if (ids.length > 1) ids.forEach((pid) => conflictKeys.add(String(pid)));
      }

      const totalPeriods = periods.filter((p) => p.subject || p.teacherId).length;
      const conflictCount = conflictKeys.size;
      const fitnessScore = totalPeriods > 0 ? Math.round(((totalPeriods - conflictCount) / totalPeriods) * 100) : 100;

      await db.transaction(async (tx) => {
        // Update isConflict on each period
        for (const p of periods) {
          await tx
            .update(periodsTable)
            .set({ isConflict: conflictKeys.has(String(p.id)) })
            .where(eq(periodsTable.id, p.id));
        }
        await tx
          .update(timetablesTable)
          .set({
            status: "published",
            publishedAt: new Date(),
            fitnessScore: String(fitnessScore),
            updatedAt: new Date(),
          })
          .where(eq(timetablesTable.id, id));
      });

      res.json({
        id,
        status: "published",
        publishedAt: new Date().toISOString(),
        fitnessScore: String(fitnessScore),
        conflictCount,
      });
    } catch (err) {
      console.error("Failed to publish timetable", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ─── Homework Diary Routes ──────────────────────────────────────────────

  // POST /api/admin/homework-diary — Create diary (adminAuth)
  app.post(api.homeworkDiary.admin.create.path, async (req, res) => {
    try {
      const user = await requireRole(req, res, ["admin"]);
      if (!user) return;

      const input = api.homeworkDiary.admin.create.input.parse(req.body);

      const existing = await storage.getHomeworkDiaryByClassDate(input.classId, input.date);
      if (existing) {
        return res.status(409).json({ message: "Homework diary already exists for this class and date" });
      }

      const diary = await storage.createHomeworkDiary({
        classId: input.classId,
        date: input.date,
        entries: input.entries,
        createdBy: user.id,
      });

      res.status(201).json(diary);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0]?.message ?? "Invalid payload" });
      console.error("Failed to create homework diary", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // GET /api/admin/homework-diary/:classId/:date — Fetch by class+date
  app.get(api.homeworkDiary.admin.getByClassDate.path, async (req, res) => {
    try {
      const user = await requireRole(req, res, ["admin"]);
      if (!user) return;

      const classId = parseNumberValue(req.params.classId);
      const date = String(req.params.date);

      if (Number.isNaN(classId)) return res.status(400).json({ message: "Invalid class id" });
      if (!date.match(/^\d{4}-\d{2}-\d{2}$/)) return res.status(400).json({ message: "Invalid date format (YYYY-MM-DD)" });

      const diary = await storage.getHomeworkDiaryByClassDate(classId, date);
      res.json(diary ?? null);
    } catch (err) {
      console.error("Failed to fetch homework diary", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // PUT /api/admin/homework-diary/:id — Update entries/status
  app.put(api.homeworkDiary.admin.update.path, async (req, res) => {
    try {
      const user = await requireRole(req, res, ["admin"]);
      if (!user) return;

      const id = parseNumberValue(req.params.id);
      if (Number.isNaN(id)) return res.status(400).json({ message: "Invalid diary id" });

      const input = api.homeworkDiary.admin.update.input.parse(req.body);

      // Get existing diary to check class ID
      const existingDiary = await db
        .select()
        .from(homeworkDiary)
        .where(eq(homeworkDiary.id, id))
        .limit(1)
        .then((rows) => rows[0]);

      if (!existingDiary) return res.status(404).json({ message: "Homework diary not found" });

      const diary = await storage.updateHomeworkDiary(id, input);
      if (!diary) return res.status(404).json({ message: "Homework diary not found" });

      // Emit publish event via Socket.io if status is being published
      if (input.status === "published") {
        broadcastHomeworkDiaryPublish(diary.classId, {
          id: diary.id,
          classId: diary.classId,
          date: diary.date as unknown as string,
          entries: diary.entries as any,
          status: diary.status,
        });
      }

      res.json(diary);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0]?.message ?? "Invalid payload" });
      console.error("Failed to update homework diary", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // DELETE /api/admin/homework-diary/:id — Remove entry
  app.delete(api.homeworkDiary.admin.delete.path, async (req, res) => {
    try {
      const user = await requireRole(req, res, ["admin"]);
      if (!user) return;

      const id = parseNumberValue(req.params.id);
      if (Number.isNaN(id)) return res.status(400).json({ message: "Invalid diary id" });

      const deleted = await storage.deleteHomeworkDiary(id);
      if (!deleted) return res.status(404).json({ message: "Homework diary not found" });

      res.json({ success: true });
    } catch (err) {
      console.error("Failed to delete homework diary", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // GET /api/homework-diary/class/:classId — List published diaries by class (MUST come before :classId/:date)
  app.get(api.homeworkDiary.student.listByClass.path, async (req, res) => {
    try {
      const user = await requireUser(req, res);
      if (!user) return;

      const classId = parseNumberValue(req.params.classId);
      if (Number.isNaN(classId)) return res.status(400).json({ message: "Invalid class id" });

      const diaries = await storage.getHomeworkDiariesByClass(classId);

      // Only return published diaries to students
      if (user.role === "student") {
        return res.json(diaries.filter((d) => d.status === "published"));
      }

      res.json(diaries);
    } catch (err) {
      console.error("Failed to fetch homework diaries", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // GET /api/homework-diary/:classId/:date — Student-facing read-only diary
  app.get(api.homeworkDiary.student.getByClassDate.path, async (req, res) => {
    try {
      const user = await requireUser(req, res);
      if (!user) return;

      const classId = parseNumberValue(req.params.classId);
      const date = String(req.params.date);

      if (Number.isNaN(classId)) return res.status(400).json({ message: "Invalid class id" });
      if (!date.match(/^\d{4}-\d{2}-\d{2}$/)) return res.status(400).json({ message: "Invalid date format (YYYY-MM-DD)" });

      const diary = await storage.getHomeworkDiaryByClassDate(classId, date);

      // Only return published diaries to students
      if (user.role === "student" && diary && diary.status !== "published") {
        return res.json(null);
      }

      res.json(diary ?? null);
    } catch (err) {
      console.error("Failed to fetch homework diary", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ============ DIARY TEMPLATE ROUTES ============

  // POST /api/admin/diary-template — Create template
  app.post(api.diaryTemplate.admin.create.path, async (req, res) => {
    try {
      const user = await requireRole(req, res, ["admin"]);
      if (!user) return;

      const input = api.diaryTemplate.admin.create.input.parse(req.body);
      const template = await storage.createDiaryTemplate({
        classId: input.classId,
        title: input.title,
        questions: input.questions,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      res.status(201).json(template);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0]?.message ?? "Invalid payload" });
      console.error("Failed to create diary template", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // GET /api/admin/diary-template/:classId — List templates by class
  app.get(api.diaryTemplate.admin.list.path, async (req, res) => {
    try {
      const user = await requireRole(req, res, ["admin"]);
      if (!user) return;

      const classId = parseNumberValue(req.params.classId);
      if (Number.isNaN(classId)) return res.status(400).json({ message: "Invalid class id" });

      const templates = await storage.getDiaryTemplatesByClass(classId);
      res.json(templates);
    } catch (err) {
      console.error("Failed to fetch templates", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // PUT /api/admin/diary-template/:id — Update template
  app.put(api.diaryTemplate.admin.update.path, async (req, res) => {
    try {
      const user = await requireRole(req, res, ["admin"]);
      if (!user) return;

      const id = parseNumberValue(req.params.id);
      if (Number.isNaN(id)) return res.status(400).json({ message: "Invalid template id" });

      const input = api.diaryTemplate.admin.update.input.parse(req.body);
      const template = await storage.updateDiaryTemplate(id, input);

      if (!template) return res.status(404).json({ message: "Template not found" });
      res.json(template);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0]?.message ?? "Invalid payload" });
      console.error("Failed to update template", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ============ DAILY DIARY ROUTES ============

  // POST /api/admin/daily-diary — Create daily diary
  app.post(api.dailyDiary.admin.create.path, async (req, res) => {
    try {
      const user = await requireRole(req, res, ["admin"]);
      if (!user) return;

      const input = api.dailyDiary.admin.create.input.parse(req.body);

      // Check if diary already exists for this template and date
      const existing = await storage.getDailyDiaryByTemplateAndDate(input.templateId, input.date);
      if (existing) {
        return res.status(409).json({ message: "Diary already exists for this template and date" });
      }

      const diary = await storage.createDailyDiary({
        templateId: input.templateId,
        classId: input.classId,
        date: input.date,
        content: input.content,
        createdBy: user.id,
        status: "draft",
      });

      res.status(201).json(diary);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0]?.message ?? "Invalid payload" });
      console.error("Failed to create daily diary", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // GET /api/admin/daily-diary/:classId/:date — Fetch diary by date
  app.get(api.dailyDiary.admin.getByDate.path, async (req, res) => {
    try {
      const user = await requireRole(req, res, ["admin"]);
      if (!user) return;

      const classId = parseNumberValue(req.params.classId);
      const date = String(req.params.date);

      if (Number.isNaN(classId)) return res.status(400).json({ message: "Invalid class id" });
      if (!date.match(/^\d{4}-\d{2}-\d{2}$/)) return res.status(400).json({ message: "Invalid date format (YYYY-MM-DD)" });

      const diary = await storage.getDailyDiariesByClassAndDate(classId, date);
      res.json(diary ?? null);
    } catch (err) {
      console.error("Failed to fetch daily diary", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // PUT /api/admin/daily-diary/:id — Update diary
  app.put(api.dailyDiary.admin.update.path, async (req, res) => {
    try {
      const user = await requireRole(req, res, ["admin"]);
      if (!user) return;

      const id = parseNumberValue(req.params.id);
      if (Number.isNaN(id)) return res.status(400).json({ message: "Invalid diary id" });

      const input = api.dailyDiary.admin.update.input.parse(req.body);
      const diary = await storage.updateDailyDiary(id, input);

      if (!diary) return res.status(404).json({ message: "Diary not found" });

      // Emit publish event via Socket.io if status is being published
      if (input.status === "published") {
        broadcastDailyDiaryPublish(diary.classId, diary);
      }

      res.json(diary);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0]?.message ?? "Invalid payload" });
      console.error("Failed to update daily diary", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // DELETE /api/admin/daily-diary/:id — Delete diary
  app.delete(api.dailyDiary.admin.delete.path, async (req, res) => {
    try {
      const user = await requireRole(req, res, ["admin"]);
      if (!user) return;

      const id = parseNumberValue(req.params.id);
      if (Number.isNaN(id)) return res.status(400).json({ message: "Invalid diary id" });

      const deleted = await storage.deleteDailyDiary(id);
      if (!deleted) return res.status(404).json({ message: "Diary not found" });

      res.json({ success: true });
    } catch (err) {
      console.error("Failed to delete daily diary", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // GET /api/daily-diary/class/:classId — List published diaries by class (MUST come before :classId/:date)
  app.get(api.dailyDiary.student.listByClass.path, async (req, res) => {
    try {
      const user = await requireUser(req, res);
      if (!user) return;

      const classId = parseNumberValue(req.params.classId);
      if (Number.isNaN(classId)) return res.status(400).json({ message: "Invalid class id" });

      const diaries = await storage.getDailyDiariesByClass(classId);

      // Only return published diaries to students
      if (user.role === "student") {
        return res.json(diaries.filter((d) => d.status === "published"));
      }

      res.json(diaries);
    } catch (err) {
      console.error("Failed to fetch daily diaries", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // GET /api/daily-diary/:classId/:date — Student read-only diary
  app.get(api.dailyDiary.student.getByDate.path, async (req, res) => {
    try {
      const user = await requireUser(req, res);
      if (!user) return;

      const classId = parseNumberValue(req.params.classId);
      const date = String(req.params.date);

      if (Number.isNaN(classId)) return res.status(400).json({ message: "Invalid class id" });
      if (!date.match(/^\d{4}-\d{2}-\d{2}$/)) return res.status(400).json({ message: "Invalid date format (YYYY-MM-DD)" });

      const diary = await storage.getDailyDiariesByClassAndDate(classId, date);

      // Only return published diaries to students
      if (user.role === "student" && diary && diary.status !== "published") {
        return res.json(null);
      }

      res.json(diary ?? null);
    } catch (err) {
      console.error("Failed to fetch daily diary", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ─── Consolidated Voucher Routes ──────────────────────────────────────────

  app.get(api.fees.vouchers.previewFamilies.path, async (req, res) => {
    try {
      const user = await requireRole(req, res, ["admin"]);
      if (!user) return;

      const rawMonths = req.query.billingMonths;
      const billingMonths = (Array.isArray(rawMonths) ? rawMonths : [rawMonths]).filter(
        (month): month is string => typeof month === "string" && /^\d{4}-\d{2}$/.test(month)
      );
      if (billingMonths.length === 0) {
        return res.status(400).json({ message: "billingMonths is required" });
      }

      const families = await storage.getFamiliesWithMembers();
      const payloads = await Promise.all(
        families.map((family) => buildFamilyVoucherPayload(family.id, billingMonths))
      );
      const previews = payloads
        .filter(Boolean)
        .map((payload) => ({
          familyId: payload!.family.id,
          familyName: payload!.family.name,
          totalOutstanding: payload!.family.totalOutstanding,
          totalCurrentFees: payload!.summary.currentMonthsTotal,
          siblingCount: payload!.family.siblingCount,
          siblings: payload!.siblings.map((sibling) => ({
            studentId: sibling.studentId,
            studentName: sibling.studentName,
            className: sibling.className,
            previousDuesTotal: sibling.previousDues.reduce((sum, fee) => sum + fee.remainingBalance, 0),
            selectedMonthsTotal: sibling.currentFees.reduce((sum, fee) => sum + fee.remainingBalance, 0),
            total: sibling.total,
          })),
        }))
        .filter((family) => family.totalOutstanding > 0 || family.totalCurrentFees > 0);

      res.json({
        summary: {
          totalFamilies: previews.length,
          totalStudents: previews.reduce((sum, family) => sum + family.siblingCount, 0),
          totalOutstanding: previews.reduce((sum, family) => sum + family.totalOutstanding, 0),
        },
        families: previews.sort((left, right) => right.totalOutstanding - left.totalOutstanding),
      });
    } catch (err) {
      console.error("preview-families error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get(api.fees.vouchers.familyVoucher.path, async (req, res) => {
    try {
      const user = await requireRole(req, res, ["admin"]);
      if (!user) return;

      const familyId = parseNumberValue(req.params.familyId);
      if (Number.isNaN(familyId)) return res.status(400).json({ message: "Invalid family id" });

      const rawMonths = req.query.billingMonths;
      const billingMonths = (Array.isArray(rawMonths) ? rawMonths : [rawMonths]).filter(
        (month): month is string => typeof month === "string" && /^\d{4}-\d{2}$/.test(month)
      );
      if (billingMonths.length === 0) {
        return res.status(400).json({ message: "billingMonths is required" });
      }

      const payload = await buildFamilyVoucherPayload(familyId, billingMonths);
      if (!payload) return res.status(404).json({ message: "Family not found" });
      res.json(payload);
    } catch (err) {
      console.error("family voucher error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post(api.fees.vouchers.generateFamilyVouchers.path, async (req, res) => {
    try {
      const user = await requireRole(req, res, ["admin"]);
      if (!user) return;
      const input = api.fees.vouchers.generateFamilyVouchers.input.parse(req.body);
      const families = await storage.generateFamilyVouchers(input);
      res.status(201).json({
        generatedCount: families.length,
        families,
      });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0]?.message ?? "Invalid input" });
      if (err instanceof Error) return res.status(400).json({ message: err.message });
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // GET /api/fees/vouchers/preview-students
  app.get("/api/fees/vouchers/preview-students", async (req, res) => {
    try {
      const user = await requireRole(req, res, ["admin"]);
      if (!user) return;

      const rawMonths = req.query.billingMonths;
      const billingMonths = (Array.isArray(rawMonths) ? rawMonths : [rawMonths]).filter(
        (m): m is string => typeof m === "string" && /^\d{4}-\d{2}$/.test(m),
      );
      if (billingMonths.length === 0) {
        return res.status(400).json({ message: "billingMonths is required" });
      }
      const includeOverdue = req.query.includeOverdue !== "false";
      const rawClassNames = req.query.classNames;
      const classNames = (Array.isArray(rawClassNames) ? rawClassNames : rawClassNames ? [rawClassNames] : []).filter(
        (c): c is string => typeof c === "string",
      );

      const sortedMonths = [...billingMonths].sort();
      const earliestMonth = sortedMonths[0];

      // Fetch all fees
      const allFees = await storage.getFees();

      // Filter by class if specified
      const filteredFees = classNames.length > 0
        ? allFees.filter((f) => f.student?.className && classNames.includes(f.student.className))
        : allFees;

      // Group by student
      const studentMap = new Map<number, {
        name: string;
        className?: string | null;
        fatherName?: string | null;
        previousDues: typeof filteredFees;
        currentFees: typeof filteredFees;
      }>();

      for (const fee of filteredFees) {
        const isPrevious = includeOverdue &&
          fee.remainingBalance > 0 &&
          fee.billingMonth < earliestMonth &&
          (fee.status === "Unpaid" || fee.status === "Partially Paid" || fee.status === "Overdue");
        const isCurrent = billingMonths.includes(fee.billingMonth) &&
          fee.status !== "Paid";

        if (!isPrevious && !isCurrent) continue;

        const entry = studentMap.get(fee.studentId) ?? {
          name: fee.student?.name ?? `Student #${fee.studentId}`,
          className: fee.student?.className ?? null,
          fatherName: fee.student?.fatherName ?? null,
          previousDues: [],
          currentFees: [],
        };
        if (isPrevious) entry.previousDues.push(fee);
        if (isCurrent) entry.currentFees.push(fee);
        studentMap.set(fee.studentId, entry);
      }

      const students = Array.from(studentMap.entries()).map(([studentId, data]) => {
        const previousDuesTotal = data.previousDues.reduce((s, f) => s + f.remainingBalance, 0);
        const selectedMonthsTotal = data.currentFees.reduce((s, f) => s + f.remainingBalance, 0);
        const grandTotal = previousDuesTotal + selectedMonthsTotal;

        let status: "overdue" | "current" | "advance" | "paid" = "current";
        if (grandTotal === 0) status = "paid";
        else if (previousDuesTotal > 0) status = "overdue";
        else if (data.currentFees.every((f) => f.billingMonth > new Date().toISOString().slice(0, 7))) status = "advance";

        return {
          studentId,
          name: data.name,
          className: data.className,
          fatherName: data.fatherName,
          previousDuesTotal,
          selectedMonthsTotal,
          grandTotal,
          status,
          breakdown: {
            previousDues: data.previousDues.map((f) => ({
              feeId: f.id,
              vNo: f.invoiceNumber,
              feeType: f.feeType,
              month: f.billingPeriod,
              amount: f.amount,
              balance: f.remainingBalance,
            })),
            currentMonths: data.currentFees.map((f) => ({
              feeId: f.id,
              vNo: f.invoiceNumber,
              feeType: f.feeType,
              month: f.billingPeriod,
              amount: f.remainingBalance,
            })),
          },
        };
      });

      const activeStudents = students.filter((s) => s.status !== "paid");
      res.json({
        summary: {
          total: activeStudents.length,
          overdue: activeStudents.filter((s) => s.status === "overdue").length,
          currentOnly: activeStudents.filter((s) => s.status === "current").length,
          alreadyPaid: students.filter((s) => s.status === "paid").length,
        },
        students: activeStudents.sort((a, b) => b.grandTotal - a.grandTotal),
      });
    } catch (err) {
      console.error("preview-students error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // GET /api/fees/vouchers/:studentId/consolidated
  app.get("/api/fees/vouchers/:studentId/consolidated", async (req, res) => {
    try {
      const user = await requireRole(req, res, ["admin"]);
      if (!user) return;

      const studentId = parseNumberValue(req.params.studentId);
      if (Number.isNaN(studentId)) return res.status(400).json({ message: "Invalid student id" });

      const rawMonths = req.query.billingMonths;
      const billingMonths = (Array.isArray(rawMonths) ? rawMonths : [rawMonths]).filter(
        (m): m is string => typeof m === "string" && /^\d{4}-\d{2}$/.test(m),
      );
      if (billingMonths.length === 0) {
        return res.status(400).json({ message: "billingMonths is required" });
      }
      const includeOverdue = req.query.includeOverdue !== "false";
      const sortedMonths = [...billingMonths].sort();
      const earliestMonth = sortedMonths[0];

      const student = await storage.getUser(studentId);
      if (!student || student.role !== "student") {
        return res.status(404).json({ message: "Student not found" });
      }

      const allFees = await storage.getFeesByStudent(studentId);

      const previousDues = includeOverdue
        ? allFees.filter(
            (f) =>
              f.remainingBalance > 0 &&
              f.billingMonth < earliestMonth &&
              (f.status === "Unpaid" || f.status === "Partially Paid" || f.status === "Overdue"),
          )
        : [];

      const currentFees = allFees.filter(
        (f) => billingMonths.includes(f.billingMonth) && f.status !== "Paid",
      );

      const { calculateSummary, formatBillingPeriod, buildDocumentNumber } = await import("../shared/finance.js");

      const summary = calculateSummary({
        previousDues: previousDues.map((f) => ({ amount: f.amount, remainingBalance: f.remainingBalance })),
        currentFees: currentFees.map((f) => ({ amount: f.remainingBalance })),
        billingMonth: sortedMonths[sortedMonths.length - 1],
      });

      const voucherNumber = buildDocumentNumber("CV", studentId);

      res.json({
        student: {
          id: student.id,
          name: student.name,
          fatherName: student.fatherName,
          className: student.className,
        },
        voucherNumber,
        generatedAt: new Date().toISOString(),
        dueDate: summary.dueDate,
        sections: {
          previousDues: previousDues.map((f, i) => ({
            sno: i + 1,
            vNo: f.invoiceNumber,
            feeType: f.feeType,
            month: f.billingPeriod,
            amount: f.amount,
            balance: f.remainingBalance,
          })),
          currentMonths: currentFees.map((f, i) => ({
            sno: previousDues.length + i + 1,
            vNo: f.invoiceNumber,
            feeType: f.feeType,
            month: f.billingPeriod,
            amount: f.remainingBalance,
          })),
        },
        summary: {
          previousDuesTotal: summary.previousDuesTotal,
          currentMonthsTotal: summary.currentMonthsTotal,
          grossTotal: summary.grossTotal,
          discount: summary.discount,
          netPayable: summary.netPayable,
          lateFee: summary.lateFee,
          payableWithinDate: summary.payableWithinDate,
          payableAfterDueDate: summary.payableAfterDueDate,
          amountInWords: summary.amountInWords,
        },
      });
    } catch (err) {
      console.error("consolidated voucher error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // POST /api/fees/vouchers/generate-batch (consolidated mode)
  app.post("/api/fees/vouchers/generate-batch", async (req, res) => {
    try {
      const user = await requireRole(req, res, ["admin"]);
      if (!user) return;

      const input = z.object({
        billingMonths: z.array(z.string().regex(/^\d{4}-\d{2}$/)).min(1).max(12),
        classNames: z.array(z.string()).optional().default([]),
        studentIds: z.array(z.number().int().positive()).optional().default([]),
        includeOverdue: z.boolean().optional().default(true),
        force: z.boolean().optional().default(false),
      }).parse(req.body);

      // Reuse existing voucher job infrastructure with consolidatedMode flag
      const operation = await startVoucherJob(
        {
          billingMonths: input.billingMonths,
          classNames: input.classNames,
          studentIds: input.studentIds,
          force: input.force,
          consolidatedMode: true,
          includeOverdue: input.includeOverdue,
        },
        user.id,
      );

      res.status(201).json({ operationId: operation.id });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0]?.message ?? "Invalid input" });
      if (err instanceof Error) return res.status(400).json({ message: err.message });
      res.status(500).json({ message: "Internal server error" });
    }
  });

  return httpServer;
}
