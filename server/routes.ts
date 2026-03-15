import type { Express, Request, Response } from "express";
import type { Server } from "http";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { api } from "../shared/routes.js";
import {
  attendanceSessionSchema,
  attendanceStatusSchema,
  classTeachers,
  classes,
  dailyTeachingPulse,
  homeworkDiary,
  timetableDays,
  type ResultWithStudent,
  type User,
} from "../shared/schema.js";
import { db } from "./db.js";
import { AssignTeacherSchema, CreateClassSchema } from "../lib/validators/classes.js";
import { registerQrAttendanceRoutes } from "./qr-attendance-routes.js";
import { createSessionMiddleware } from "./session.js";
import { storage } from "./storage.js";
import { loadTimetableSettings, computePeriodTimeline } from "./lib/settings-loader.js";
import {
  cancelVoucherJob,
  clearJobZip,
  getJobProgress,
  getJobZip,
  previewVoucherJob,
  startVoucherJob,
  subscribeJobSse,
} from "./services/voucherService.js";
import { broadcastHomeworkDiaryPublish, broadcastDailyDiaryPublish, notifyAdminPublishComplete } from "./socket.js";

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

  app.post(api.auth.logout.path, (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ message: "Failed to log out" });
      }

      res.clearCookie("school-nexus.sid");
      return res.json({ success: true });
    });
  });

  app.get(api.settings.publicGet.path, async (_req, res) => {
    try {
      res.json(await storage.getPublicSchoolSettings());
    } catch {
      res.status(500).json({ message: "Failed to load public settings" });
    }
  });

  app.get(api.settings.adminGet.path, async (req, res) => {
    try {
      const user = await requireRole(req, res, ["admin"]);
      if (!user) return;
      res.json(await storage.getSchoolSettings());
    } catch {
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

  app.get(api.teachers.list.path, async (req, res) => {
    const user = await requireRole(req, res, ["admin", "teacher"]);
    if (user) res.json(await storage.getTeachers());
  });

  app.post(api.users.create.path, async (req, res) => {
    try {
      const user = await requireRole(req, res, ["admin"]);
      if (!user) return;
      const createdUser = await storage.createUser(api.users.create.input.parse(req.body));
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
      if (err instanceof Error) return res.status(400).json({ message: err.message });
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
      if (err instanceof Error) return res.status(400).json({ message: err.message });
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
      const progress = getJobProgress(id);
      if (progress) return res.json(progress);
      // Fall back to DB
      const operation = await storage.getFinanceVoucherOperation(id);
      if (!operation) return res.status(404).json({ message: "Voucher operation not found" });
      res.json({ ...operation, phase: operation.status, message: null });
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

  return httpServer;
}