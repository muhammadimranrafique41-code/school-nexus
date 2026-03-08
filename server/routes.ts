import type { Express, Request, Response } from "express";
import type { Server } from "http";
import session from "express-session";
import MemoryStore from "memorystore";
import { z } from "zod";
import { api } from "@shared/routes";
import { attendanceSessionSchema, attendanceStatusSchema, timetableDays, type ResultWithStudent, type User } from "@shared/schema";
import { storage } from "./storage";

const SessionStore = MemoryStore(session);

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
  app.use(
    session({
      secret: "school-nexus-secret-key",
      resave: false,
      saveUninitialized: false,
      store: new SessionStore({ checkPeriod: 86400000 }),
      cookie: { secure: false },
    }),
  );

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
      res.json(user);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post(api.auth.logout.path, (req, res) => {
    req.session.destroy(() => res.json({ success: true }));
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
    const user = await requireRole(req, res, ["student"]);
    if (!user) return;
    const className = user.className?.trim();
    if (!className) return res.json({ className: "Unassigned", items: [], days: [...timetableDays] });
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

  return httpServer;
}