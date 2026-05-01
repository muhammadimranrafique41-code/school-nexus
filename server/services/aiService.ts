import { and, eq } from "drizzle-orm";
import { db } from "../db.js";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" }); // <-- ensure .env.local is loaded before any process.env access
import {
  academics,
  attendance,
  classes,
  classTeachers,
  families,
  fees,
  financeVouchers,
  homeworkAssignments,
  homeworkDiary,
  studentSubmissions,
  users,
  type User,
} from "../../shared/schema.js";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type AiChatInput = {
  message: string;
  history: ChatMessage[];
};

type ScopedAccess = {
  role: "admin" | "teacher";
  classIds: number[];
  classNames: string[];
  classKeys: string[];
};

type AiChatResult = {
  answer: string;
  sources: string[];
  scopedTo: {
    role: "admin" | "teacher";
    classNames: string[];
  };
  generatedAt: string;
};

const attendedStatuses = new Set(["Present", "Late", "Excused"]);
const financeOpenStatuses = new Set(["Unpaid", "Partially Paid", "Overdue"]);

const buildClassLabel = (record: { grade: string; section: string; stream?: string | null }) =>
  `${record.grade} ${record.section}${record.stream ? ` - ${record.stream}` : ""}`.trim();

const buildClassKey = (record: { grade: string; section: string; stream?: string | null }) =>
  `${record.grade}-${record.section}${record.stream ? `-${record.stream}` : ""}`.trim();

const normalizeClass = (value: string | null | undefined) =>
  (value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

const numeric = (value: unknown) => {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value) || 0;
  return 0;
};

const percent = (value: number, total: number) => (total > 0 ? Math.round((value / total) * 1000) / 10 : 0);

const money = (value: number) =>
  new Intl.NumberFormat("en-PK", {
    maximumFractionDigits: 0,
    style: "currency",
    currency: "PKR",
  }).format(value);

const unique = <T>(values: T[]) => Array.from(new Set(values));

async function resolveScope(user: User): Promise<ScopedAccess> {
  if (user.role === "admin") {
    const classRows = await db.select().from(classes);
    return {
      role: "admin",
      classIds: classRows.map((row) => row.id),
      classNames: classRows.map(buildClassLabel),
      classKeys: classRows.flatMap((row) => [buildClassLabel(row), buildClassKey(row)]),
    };
  }

  const [assignedClasses, academicRows, classRows] = await Promise.all([
    db
      .select({ class: classes })
      .from(classTeachers)
      .innerJoin(classes, eq(classTeachers.classId, classes.id))
      .where(and(eq(classTeachers.teacherId, user.id), eq(classTeachers.isActive, true))),
    db.select({ className: academics.className }).from(academics).where(eq(academics.teacherUserId, user.id)),
    db.select().from(classes),
  ]);

  const byNormalizedName = new Map<string, (typeof classRows)[number]>();
  for (const classRow of classRows) {
    byNormalizedName.set(normalizeClass(buildClassLabel(classRow)), classRow);
    byNormalizedName.set(normalizeClass(buildClassKey(classRow)), classRow);
  }

  const scopedClassMap = new Map<number, (typeof classRows)[number]>();
  for (const row of assignedClasses) scopedClassMap.set(row.class.id, row.class);
  for (const row of academicRows) {
    if (!row.className) continue;
    const classRow = byNormalizedName.get(normalizeClass(row.className));
    if (classRow) scopedClassMap.set(classRow.id, classRow);
  }

  const scopedClasses = Array.from(scopedClassMap.values());
  return {
    role: "teacher",
    classIds: scopedClasses.map((row) => row.id),
    classNames: scopedClasses.map(buildClassLabel),
    classKeys: scopedClasses.flatMap((row) => [buildClassLabel(row), buildClassKey(row)]),
  };
}

function isStudentInScope(student: Pick<User, "className">, scope: ScopedAccess) {
  if (scope.role === "admin") return true;
  const allowed = new Set(scope.classKeys.map(normalizeClass));
  return allowed.has(normalizeClass(student.className));
}

async function collectGroundedContext(user: User) {
  const scope = await resolveScope(user);
  const today = new Date().toISOString().slice(0, 10);

  const [
    classRows,
    studentRows,
    teacherRows,
    attendanceRows,
    familyRows,
    feeRows,
    voucherRows,
    diaryRows,
    assignmentRows,
    submissionRows,
  ] = await Promise.all([
    db.select().from(classes),
    db.select().from(users).where(eq(users.role, "student")),
    db.select().from(users).where(eq(users.role, "teacher")),
    db.select().from(attendance),
    db.select().from(families),
    db.select().from(fees),
    db.select().from(financeVouchers),
    db.select().from(homeworkDiary),
    db.select().from(homeworkAssignments),
    db.select().from(studentSubmissions),
  ]);

  const scopedClassIds = new Set(scope.classIds);
  const scopedClasses = scope.role === "admin" ? classRows : classRows.filter((row) => scopedClassIds.has(row.id));
  const scopedStudents = studentRows.filter((student) => isStudentInScope(student, scope));
  const scopedStudentIds = new Set(scopedStudents.map((student) => student.id));
  const scopedFamilyIds = new Set(scopedStudents.map((student) => student.familyId).filter((id): id is number => typeof id === "number"));
  const scopedAssignments = assignmentRows.filter((assignment) => scope.role === "admin" || scopedClassIds.has(assignment.classId));
  const scopedAssignmentIds = new Set(scopedAssignments.map((assignment) => assignment.id));
  const scopedFees = feeRows.filter((fee) => scopedStudentIds.has(fee.studentId) && !fee.deletedAt);
  const scopedFeeIds = new Set(scopedFees.map((fee) => fee.id));

  const studentById = new Map(scopedStudents.map((student) => [student.id, student]));
  const teacherById = new Map(teacherRows.map((teacher) => [teacher.id, teacher]));
  const classById = new Map(classRows.map((classRow) => [classRow.id, classRow]));
  const submissionsByHomework = new Map<string, number>();
  for (const submission of submissionRows) {
    if (!scopedAssignmentIds.has(submission.homeworkId)) continue;
    submissionsByHomework.set(submission.homeworkId, (submissionsByHomework.get(submission.homeworkId) ?? 0) + 1);
  }

  const classSummaries = scopedClasses.map((classRow) => {
    const classNames = [buildClassLabel(classRow), buildClassKey(classRow)].map(normalizeClass);
    const students = scopedStudents.filter((student) => classNames.includes(normalizeClass(student.className)));
    const homeroomTeacher = classRow.homeroomTeacherId ? teacherById.get(classRow.homeroomTeacherId)?.name ?? null : null;
    return {
      classId: classRow.id,
      className: buildClassLabel(classRow),
      size: students.length || classRow.currentCount,
      capacity: classRow.capacity,
      status: classRow.status,
      homeroomTeacher,
      activeStudents: students.filter((student) => (student.studentStatus ?? "active") === "active").length,
      inactiveStudents: students.filter((student) => (student.studentStatus ?? "active") !== "active").length,
    };
  });

  const attendanceInScope = attendanceRows.filter((row) => scopedStudentIds.has(row.studentId));
  const attendanceByClass = classSummaries.map((classSummary) => {
    const classRow = classById.get(classSummary.classId);
    const classNames = classRow ? [buildClassLabel(classRow), buildClassKey(classRow)].map(normalizeClass) : [normalizeClass(classSummary.className)];
    const classStudents = scopedStudents.filter((student) => classNames.includes(normalizeClass(student.className)));
    const ids = new Set(classStudents.map((student) => student.id));
    const records = attendanceInScope.filter((row) => ids.has(row.studentId));
    const attended = records.filter((row) => attendedStatuses.has(row.status)).length;
    return {
      className: classSummary.className,
      records: records.length,
      attended,
      attendancePercentage: percent(attended, records.length),
    };
  });

  const attendanceByStudent = scopedStudents
    .map((student) => {
      const records = attendanceInScope.filter((row) => row.studentId === student.id);
      const attended = records.filter((row) => attendedStatuses.has(row.status)).length;
      return {
        studentId: student.id,
        studentName: student.name,
        className: student.className,
        records: records.length,
        attendancePercentage: percent(attended, records.length),
      };
    })
    .filter((row) => row.records > 0)
    .sort((left, right) => left.attendancePercentage - right.attendancePercentage)
    .slice(0, 12);

  const totalBilled = scopedFees.reduce((sum, fee) => sum + numeric(fee.amount), 0);
  const totalPaid = scopedFees.reduce((sum, fee) => sum + numeric(fee.paidAmount), 0);
  const totalOutstanding = scopedFees.reduce((sum, fee) => sum + numeric(fee.remainingBalance), 0);
  const overdueFees = scopedFees.filter((fee) => numeric(fee.remainingBalance) > 0 && (fee.status === "Overdue" || fee.dueDate < today));
  const openFees = scopedFees.filter((fee) => numeric(fee.remainingBalance) > 0 && financeOpenStatuses.has(fee.status));
  const scopedVouchers = voucherRows.filter((voucher) => scopedFeeIds.has(voucher.feeId));
  const scopedFamilies = familyRows.filter((family) => scopedFamilyIds.has(family.id) || scope.role === "admin");
  const walletBalanceTotal = scopedFamilies.reduce((sum, family) => sum + numeric(family.walletBalance), 0);

  const familyFinance = scopedFamilies
    .map((family) => {
      const familyStudents = scopedStudents.filter((student) => student.familyId === family.id);
      const familyStudentIds = new Set(familyStudents.map((student) => student.id));
      const familyFees = scopedFees.filter((fee) => familyStudentIds.has(fee.studentId));
      return {
        familyId: family.id,
        familyName: family.name,
        walletBalance: numeric(family.walletBalance),
        students: familyStudents.map((student) => student.name),
        outstanding: familyFees.reduce((sum, fee) => sum + numeric(fee.remainingBalance), 0),
        overdue: familyFees
          .filter((fee) => numeric(fee.remainingBalance) > 0 && (fee.status === "Overdue" || fee.dueDate < today))
          .reduce((sum, fee) => sum + numeric(fee.remainingBalance), 0),
      };
    })
    .filter((row) => row.outstanding > 0 || row.overdue > 0 || row.walletBalance !== 0)
    .sort((left, right) => right.overdue - left.overdue || right.outstanding - left.outstanding)
    .slice(0, 10);

  const homeworkByClass = scopedClasses.map((classRow) => {
    const assignments = scopedAssignments.filter((assignment) => assignment.classId === classRow.id);
    const activeAssignments = assignments.filter((assignment) => assignment.status === "active");
    const overdueAssignments = activeAssignments.filter((assignment) => String(assignment.dueDate) < today);
    return {
      className: buildClassLabel(classRow),
      activeAssignments: activeAssignments.length,
      overdueAssignments: overdueAssignments.length,
      diaryEntries: diaryRows.filter((diary) => diary.classId === classRow.id && diary.status === "published").length,
    };
  });

  const homeworkDetails = scopedAssignments
    .map((assignment) => {
      const classRow = classById.get(assignment.classId);
      const classSize = classRow?.currentCount ?? scopedStudents.filter((student) => normalizeClass(student.className) === normalizeClass(classRow ? buildClassLabel(classRow) : "")).length;
      const submissionCount = submissionsByHomework.get(assignment.id) ?? 0;
      return {
        id: assignment.id,
        title: assignment.title,
        subject: assignment.subject,
        className: classRow ? buildClassLabel(classRow) : `Class #${assignment.classId}`,
        dueDate: String(assignment.dueDate),
        status: assignment.status,
        submissionCount,
        pendingCount: Math.max(classSize - submissionCount, 0),
      };
    })
    .sort((left, right) => left.dueDate.localeCompare(right.dueDate))
    .slice(0, 12);

  return {
    scope,
    generatedAt: new Date().toISOString(),
    sources: [
      "attendance",
      "classes",
      "users",
      "class_teachers",
      "academics",
      "families",
      "fees",
      "finance_vouchers",
      "homework_diary",
      "homework_assignments",
      "student_submissions",
    ],
    summary: {
      totals: {
        classes: scopedClasses.length,
        students: scopedStudents.length,
        teachers: teacherRows.length,
      },
      classSummaries,
      attendanceByClass,
      lowAttendanceStudents: attendanceByStudent,
      finance: {
        totalBilled,
        totalPaid,
        totalOutstanding,
        overdueAmount: overdueFees.reduce((sum, fee) => sum + numeric(fee.remainingBalance), 0),
        openInvoices: openFees.length,
        overdueInvoices: overdueFees.length,
        generatedVouchers: scopedVouchers.length,
        walletBalanceTotal,
        collectionRate: percent(totalPaid, totalBilled),
        families: familyFinance,
      },
      homework: {
        byClass: homeworkByClass,
        assignments: homeworkDetails,
      },
    },
  };
}

function buildFallbackAnswer(question: string, context: Awaited<ReturnType<typeof collectGroundedContext>>) {
  const lowerQuestion = question.toLowerCase();
  const isGreeting = /^(hi|hello|hey|good morning|good afternoon|good evening|howdy|greetings?|what'?s up|sup)\b/i.test(lowerQuestion.trim());
  const wantsAttendance = /attendance|absent|present|late/.test(lowerQuestion);
  const wantsFinance = /fee|finance|voucher|wallet|overdue|paid|collection|balance/.test(lowerQuestion);
  const wantsHomework = /homework|assignment|diary|submission|pending|task/.test(lowerQuestion);
  const wantsClasses = /class|teacher|student|size|status|homeroom/.test(lowerQuestion);

  if (isGreeting) {
    return `Hello! I'm the Schooliee AI Assistant. How can I help you today?`;
  }

  const lines: string[] = [];
  lines.push(`I checked live records scoped to ${context.scope.role === "admin" ? "all classes" : context.scope.classNames.join(", ") || "your assigned classes"}.`);

  if (!wantsAttendance && !wantsFinance && !wantsHomework && !wantsClasses) {
    lines.push(`Snapshot: ${context.summary.totals.students} students across ${context.summary.totals.classes} classes.`);
  }

  if (wantsAttendance || (!wantsFinance && !wantsHomework && !wantsClasses)) {
    const top = context.summary.attendanceByClass.filter((row) => row.records > 0).slice(0, 6);
    lines.push(
      top.length
        ? `Attendance by class: ${top.map((row) => `${row.className} ${row.attendancePercentage}% (${row.attended}/${row.records})`).join("; ")}.`
        : "No attendance records were found for the scoped classes.",
    );
    if (context.summary.lowAttendanceStudents.length) {
      lines.push(`Lowest student attendance: ${context.summary.lowAttendanceStudents.slice(0, 5).map((row) => `${row.studentName} ${row.attendancePercentage}%`).join("; ")}.`);
    }
  }

  if (wantsClasses) {
    const classesLine = context.summary.classSummaries
      .slice(0, 8)
      .map((row) => `${row.className}: ${row.size}/${row.capacity} students, ${row.homeroomTeacher ?? "no homeroom teacher"}, ${row.activeStudents} active`)
      .join("; ");
    lines.push(classesLine ? `Classes: ${classesLine}.` : "No classes were found in scope.");
  }

  if (wantsFinance) {
    const finance = context.summary.finance;
    lines.push(
      `Finance: billed ${money(finance.totalBilled)}, paid ${money(finance.totalPaid)}, outstanding ${money(finance.totalOutstanding)}, overdue ${money(finance.overdueAmount)}, collection rate ${finance.collectionRate}%, vouchers generated ${finance.generatedVouchers}.`,
    );
    if (finance.families.length) {
      lines.push(`Largest family balances: ${finance.families.slice(0, 5).map((row) => `${row.familyName} outstanding ${money(row.outstanding)}, overdue ${money(row.overdue)}, wallet ${money(row.walletBalance)}`).join("; ")}.`);
    }
  }

  if (wantsHomework) {
    const homework = context.summary.homework;
    lines.push(
      homework.byClass.length
        ? `Homework by class: ${homework.byClass.slice(0, 8).map((row) => `${row.className} ${row.activeAssignments} active, ${row.overdueAssignments} overdue, ${row.diaryEntries} published diary entries`).join("; ")}.`
        : "No homework records were found in scope.",
    );
    if (homework.assignments.length) {
      lines.push(`Recent/pending assignments: ${homework.assignments.slice(0, 5).map((row) => `${row.title} (${row.className}) ${row.submissionCount} submitted, ${row.pendingCount} pending`).join("; ")}.`);
    }
  }

  return lines.join("\n\n");
}

async function askOpenRouter(input: AiChatInput, context: Awaited<ReturnType<typeof collectGroundedContext>>) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.warn("[AI Assistant] OPENROUTER_API_KEY not set, falling back to local summary");
    return null;
  }
  console.log("[AI Assistant] OpenRouter API key loaded, calling API with message:", input.message);

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.APP_URL ?? "http://localhost:5000",
        "X-Title": "Schooliee AI School Assistant",
      },
      body: JSON.stringify({
        model: process.env.OPENROUTER_MODEL ?? "google/gemini-2.0-flash-001",
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content:
              "You are the Schooliee AI School Assistant. Respond naturally to greetings, pleasantries, and general school‑related questions. Use the provided JSON context for factual answers about attendance, fees, homework, classes, etc., but feel free to answer off‑topic or general inquiries with your general knowledge. If you lack sufficient data, politely indicate that you don't have the information.",
          },
          ...input.history.slice(-8),
          {
            role: "user",
            content: `${input.message}\n\nGrounded JSON context:\n${JSON.stringify(context.summary, null, 2)}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      if (response.status === 404) {
        console.error("[AI Assistant] OpenRouter: model not found (404)", { body, status: response.status });
        return null;
      }
      if (response.status === 401 || response.status === 403) {
        console.error("[AI Assistant] OpenRouter: auth failed (" + response.status + ")", { body, status: response.status });
        return null;
      }
      console.error(`[AI Assistant] OpenRouter API error: ${response.status} ${response.statusText}`, { body, status: response.status });
      throw new Error(`OpenRouter request failed: ${response.status} ${body}`);
    }

    const payload = (await response.json()) as { choices?: { message?: { content?: string } }[] };
    const answer = payload.choices?.[0]?.message?.content?.trim();
    if (!answer) {
      console.warn("[AI Assistant] OpenRouter returned empty response");
      return null;
    }
    return answer;
  } catch (error) {
    console.error("[AI Assistant] OpenRouter request failed:", error);
    return null;
  }
}

export async function chatWithSchoolAssistant(user: User, input: AiChatInput): Promise<AiChatResult> {
  const context = await collectGroundedContext(user);
  const answer = await askOpenRouter(input, context);

  return {
    answer: answer ?? buildFallbackAnswer(input.message, context),
    sources: context.sources,
    scopedTo: {
      role: context.scope.role,
      classNames: context.scope.classNames,
    },
    generatedAt: context.generatedAt,
  };
}
