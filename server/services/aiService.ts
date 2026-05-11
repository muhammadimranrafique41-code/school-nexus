import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db.js";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" }); // <-- ensure .env.local is loaded before any process.env access
import {
  academics,
  activityLogs,
  announcements,
  attendance,
  chatMessages,
  classes,
  classTeachers,
  classPromotionMapping,
  dailyTeachingPulse,
  examAttendance,
  examMarks,
  examSessions,
  examSubjects,
  families,
  feePayments,
  fees,
  feeStructures,
  financeVouchers,
  homeworkAssignments,
  homeworkDiary,
  ledger,
  expenses,
  parentWallets,
  promotionHistory,
  academicSessions,
  schoolSettings,
  sessionPromotions,
  staff,
  salaryPayments,
  staffLoans,
  studentSubmissions,
  students,
  todos,
  users,
  walletTransactions,
  whatsappMessages,
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

export type ScopedAccess = {
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

// stream/subject intentionally excluded from class identity label
const buildClassLabel = (record: { grade: string; section: string; stream?: string | null }) =>
  `${record.grade} ${record.section}`.trim();

const buildClassKey = (record: { grade: string; section: string; stream?: string | null }) =>
  `${record.grade}-${record.section}`.trim();

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

export async function resolveScope(user: User): Promise<ScopedAccess> {
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

  // ── NEW: Ledger and Expenses query (admin-only for authoritative financial data) ─────────────
  const isAdmin = scope.role === "admin";
  const [
    ledgerRows, expenseRows, staffRows, salaryPaymentRows, staffLoanRows,
    activityLogRows, whatsappMessageRows, schoolSettingsRows, feeStructureRows,
    dailyPulseRows, chatMessageRows, announcementRows, todoRows,
  ] = isAdmin
    ? await Promise.all([
        db.select().from(ledger).orderBy(desc(ledger.transactionDate)).limit(100),
        db.select().from(expenses).orderBy(desc(expenses.expenseDate)).limit(50),
        db.select().from(staff),
        db.select().from(salaryPayments).orderBy(desc(salaryPayments.paymentDate)).limit(20),
        db.select().from(staffLoans).where(eq(staffLoans.status, "active")),
        db.select().from(activityLogs).orderBy(desc(activityLogs.createdAt)).limit(30),
        db.select().from(whatsappMessages).orderBy(desc(whatsappMessages.createdAt)).limit(30),
        db.select().from(schoolSettings).orderBy(desc(schoolSettings.updatedAt)).limit(1),
        db.select().from(feeStructures).where(eq(feeStructures.isActive, true)),
        db.select().from(dailyTeachingPulse).orderBy(desc(dailyTeachingPulse.date)).limit(50),
        db.select().from(chatMessages).orderBy(desc(chatMessages.createdAt)).limit(30),
        db.select().from(announcements).where(eq(announcements.isActive, true)).orderBy(desc(announcements.createdAt)).limit(20),
        db.select().from(todos).orderBy(desc(todos.createdAt)).limit(30),
      ])
    : [[], [], [], [], [], [], [], [], [], [], [], [], []];

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
    walletRows,
    recentWalletTxRows,
    examRows,
    examMarkRows,
    examSubjectRows,
    feePaymentRows,
    academicSessionRows,
    promotionHistoryRows,
    sessionPromotionRows,
    classPromotionMappingRows,
    studentMappingRows,
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
    // ── NEW: per-student wallets ──────────────────────────────────────────
    db.select().from(parentWallets),
    // ── NEW: last 20 wallet transactions for AI context ───────────────────
    db
      .select()
      .from(walletTransactions)
      .orderBy(desc(walletTransactions.createdAt))
      .limit(20),
    db.select().from(examSessions).orderBy(desc(examSessions.startDate)),
    // ── NEW: exam marks + subjects + fee payments + sessions + promotion ──
    db.select().from(examMarks),
    db.select().from(examSubjects),
    db.select().from(feePayments).orderBy(desc(feePayments.paymentDate)).limit(100),
    db.select().from(academicSessions).orderBy(desc(academicSessions.isCurrent)),
    db.select().from(promotionHistory).orderBy(desc(promotionHistory.promotionDate)).limit(100),
    db.select().from(sessionPromotions).orderBy(desc(sessionPromotions.promotedAt)).limit(100),
    db.select().from(classPromotionMapping),
    db.select().from(students),
  ]);

  const scopedClassIds = new Set(scope.classIds);
  const scopedClasses = scope.role === "admin" ? classRows : classRows.filter((row) => scopedClassIds.has(row.id));

  // ── Current session filtering ────────────────────────────────────────────────
  const currentSessionId = academicSessionRows.find((s) => s.isCurrent)?.id ?? null;
  const sessionStudentIds = currentSessionId
    ? new Set(
        studentMappingRows
          .filter((sm) => sm.academicSessionId === currentSessionId)
          .map((sm) => sm.userId)
      )
    : null;

  const scopedStudents = studentRows.filter((student) => {
    if (!isStudentInScope(student, scope)) return false;
    if (sessionStudentIds && currentSessionId) {
      return sessionStudentIds.has(student.id);
    }
    return true;
  });
  const scopedStudentIds = new Set(scopedStudents.map((student) => student.id));
  const scopedFamilyIds = new Set(scopedStudents.map((student) => student.familyId).filter((id): id is number => typeof id === "number"));
  const scopedAssignments = assignmentRows.filter((assignment) => scope.role === "admin" || scopedClassIds.has(assignment.classId));
  const scopedAssignmentIds = new Set(scopedAssignments.map((assignment) => assignment.id));
  const scopedFees = feeRows.filter((fee) => scopedStudentIds.has(fee.studentId) && !fee.deletedAt);
  const scopedFeeIds = new Set(scopedFees.map((fee) => fee.id));

  // ── NEW: wallet data scoped to visible students ───────────────────────────
  const scopedWallets = walletRows.filter((w) => scopedStudentIds.has(w.studentId));
  const scopedWalletIds = new Set(scopedWallets.map((w) => w.id));
  // Filter recent transactions to wallets in scope
  const scopedWalletTxs = recentWalletTxRows.filter((tx) => scopedWalletIds.has(tx.walletId));

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

  // ── NEW: overdueAmount from fees remaining balances ───────────────────────
  const overdueAmount = scopedFees
    .filter((fee) => numeric(fee.remainingBalance) > 0 && (fee.status === "Overdue" || fee.dueDate < today))
    .reduce((sum, fee) => sum + numeric(fee.remainingBalance), 0);

  // ── NEW: recent wallet transactions summary for AI context ────────────────
  const recentWalletTransactionsSummary = scopedWalletTxs.slice(0, 10).map((tx) => ({
    type: tx.type,
    amount: numeric(tx.amount),
    description: tx.description ?? "",
    createdAt: tx.createdAt instanceof Date ? tx.createdAt.toISOString() : String(tx.createdAt),
  }));

  // ── NEW: Ledger authoritative financial summary (admin-only) ───────────────
  const ledgerIncome = ledgerRows
    .filter((row) => row.entryType === "income")
    .reduce((sum, row) => sum + numeric(row.amount), 0);
  const ledgerExpense = ledgerRows
    .filter((row) => row.entryType === "expense")
    .reduce((sum, row) => sum + numeric(row.amount), 0);
  const ledgerByCategory: Record<string, number> = {};
  for (const row of ledgerRows) {
    const cat = row.category ?? "other";
    ledgerByCategory[cat] = (ledgerByCategory[cat] ?? 0) + numeric(row.amount);
  }
  const ledgerSummary = {
    totalIncome: ledgerIncome,
    totalExpense: ledgerExpense,
    netBalance: ledgerIncome - ledgerExpense,
    byCategory: ledgerByCategory,
    recentTransactions: ledgerRows.slice(0, 10).map((row) => ({
      entryType: row.entryType,
      category: row.category,
      amount: numeric(row.amount),
      description: row.description ?? "",
      date: row.transactionDate instanceof Date ? row.transactionDate.toISOString() : String(row.transactionDate),
      sourceModule: row.sourceModule ?? "",
    })),
  };

  // ── NEW: Expenses summary (admin-only) ─────────────────────────────────────
  const totalExpenses = expenseRows.reduce((sum, exp) => sum + numeric(exp.amount), 0);
  const expensesByCategory: Record<string, number> = {};
  for (const exp of expenseRows) {
    expensesByCategory[exp.category] = (expensesByCategory[exp.category] ?? 0) + numeric(exp.amount);
  }
  const expensesSummary = {
    totalExpenses,
    byCategory: expensesByCategory,
    recentExpenses: expenseRows.slice(0, 8).map((exp) => ({
      amount: numeric(exp.amount),
      category: exp.category,
      description: exp.description ?? "",
      date: String(exp.expenseDate),
    })),
  };

  // ── NEW: Staff financials - salaries and loans (admin-only) ────────────────
  const staffById = new Map(staffRows.map((s) => [s.id, s]));
  const totalSalaryPaid = salaryPaymentRows.reduce((sum, p) => sum + numeric(p.netSalary), 0);
  const salaryByMonth: Record<string, number> = {};
  for (const p of salaryPaymentRows) {
    const month = String(p.paymentMonth).slice(0, 7);
    salaryByMonth[month] = (salaryByMonth[month] ?? 0) + numeric(p.netSalary);
  }
  const activeStaffLoans = staffLoanRows.map((loan) => {
    const staffMember = staffById.get(loan.staffId);
    return {
      staffId: loan.staffId,
      staffName: staffMember ? `${staffMember.firstName} ${staffMember.lastName}` : `Staff #${loan.staffId}`,
      loanType: loan.loanType,
      amount: numeric(loan.amount),
      outstandingBalance: numeric(loan.outstandingBalance),
      monthlyInstallment: numeric(loan.monthlyInstallment),
      installmentsPaid: loan.installmentsPaid,
      totalInstallments: loan.totalInstallments,
    };
  });
  const totalLoanOutstanding = staffLoanRows.reduce((sum, loan) => sum + numeric(loan.outstandingBalance), 0);
  const staffFinancials = {
    totalSalaryPaid,
    salaryByMonth,
    activeLoans: activeStaffLoans,
    totalLoanOutstanding,
    staffCount: staffRows.length,
  };

  // ── NEW: Standardized wallet (parentWallets as authoritative source) ─────
  const walletBalanceTotal = scopedWallets.reduce((sum, w) => sum + numeric(w.balance), 0);

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

  const now = new Date();
  const scopedExamRows = examRows.filter((exam) => scope.role === "admin" || scopedClassIds.has(exam.classId));
  const upcomingExams = scopedExamRows
    .filter((exam) => new Date(exam.startDate).getTime() >= now.getTime())
    .sort((left, right) => new Date(left.startDate).getTime() - new Date(right.startDate).getTime())
    .slice(0, 8)
    .map((exam) => {
      const classRow = classById.get(exam.classId);
      return {
        id: exam.id,
        title: exam.title,
        examType: exam.examType,
        monthLabel: exam.monthLabel,
        className: classRow ? buildClassLabel(classRow) : `Class #${exam.classId}`,
        startDate: exam.startDate instanceof Date ? exam.startDate.toISOString() : String(exam.startDate),
        endDate: exam.endDate instanceof Date ? exam.endDate.toISOString() : String(exam.endDate),
        totalMarks: exam.totalMarks,
      };
    });
  const recentCompletedExam = scopedExamRows
    .filter((exam) => exam.isResultDeclared || new Date(exam.endDate).getTime() < now.getTime())
    .sort((left, right) => new Date(right.endDate).getTime() - new Date(left.endDate).getTime())
    .slice(0, 1)
    .map((exam) => {
      const classRow = classById.get(exam.classId);
      return {
        id: exam.id,
        title: exam.title,
        examType: exam.examType,
        className: classRow ? buildClassLabel(classRow) : `Class #${exam.classId}`,
        endDate: exam.endDate instanceof Date ? exam.endDate.toISOString() : String(exam.endDate),
        isResultDeclared: exam.isResultDeclared,
      };
    })[0] ?? null;

  // ── NEW: Academic sessions ──────────────────────────────────────────────────
  const currentSession = academicSessionRows.find((s) => s.isCurrent) ?? null;
  const nextSession = academicSessionRows.find((s) => s.isNext) ?? null;
  const academicSessionSummary = {
    current: currentSession
      ? { id: currentSession.id, name: currentSession.name, startDate: currentSession.startDate, endDate: currentSession.endDate, promotionExecuted: currentSession.promotionExecuted }
      : null,
    next: nextSession
      ? { id: nextSession.id, name: nextSession.name, startDate: nextSession.startDate, endDate: nextSession.endDate }
      : null,
    all: academicSessionRows.map((s) => ({ id: s.id, name: s.name, isCurrent: s.isCurrent, isNext: s.isNext, promotionExecuted: s.promotionExecuted })),
  };

  // ── NEW: Class teacher assignments ──────────────────────────────────────────
  const classTeacherRowsResolved = isAdmin
    ? await db.select().from(classTeachers).where(eq(classTeachers.isActive, true))
    : await db.select().from(classTeachers).where(
        and(eq(classTeachers.isActive, true), inArray(classTeachers.classId, scope.classIds))
      );
  const teachersByClass = new Map<number, { teacherId: number; teacherName: string; subjects: string[] }[]>();
  for (const ct of classTeacherRowsResolved) {
    const t = teacherById.get(ct.teacherId);
    if (!t) continue;
    const entry = { teacherId: ct.teacherId, teacherName: t.name, subjects: [...ct.subjects] };
    const existing = teachersByClass.get(ct.classId);
    if (existing) existing.push(entry);
    else teachersByClass.set(ct.classId, [entry]);
  }
  const classSummariesWithTeachers = classSummaries.map((cs) => ({
    ...cs,
    teachers: teachersByClass.get(cs.classId) ?? [],
  }));

  // ── NEW: Exam marks performance summary ─────────────────────────────────────
  const examSubjectById = new Map(examSubjectRows.map((s) => [s.id, s]));
  const scopedExamMarkRows = examMarkRows.filter((m) => scopedStudentIds.has(m.studentId));
  const marksByExamSubject = new Map<number, typeof scopedExamMarkRows>();
  for (const m of scopedExamMarkRows) {
    const existing = marksByExamSubject.get(m.examSubjectId);
    if (existing) existing.push(m);
    else marksByExamSubject.set(m.examSubjectId, [m]);
  }
  // Per-exam subject performance
  const examSubjectPerformance = Array.from(marksByExamSubject.entries()).map(([subjectId, marks]) => {
    const subject = examSubjectById.get(subjectId);
    const numericMarks = marks.map((m) => numeric(m.totalObtained));
    const valid = numericMarks.filter((v) => v > 0);
    const avg = valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : 0;
    const passed = marks.filter((m) => !m.isAbsent && !m.isExempted && m.grade && m.grade !== "F").length;
    const totalAssessed = marks.filter((m) => !m.isAbsent).length;
    return {
      examSubjectId: subjectId,
      subjectName: subject?.subjectName ?? `Subject #${subjectId}`,
      studentCount: marks.length,
      averageMarks: Math.round(avg * 10) / 10,
      passCount: passed,
      failCount: totalAssessed - passed,
      passRate: percent(passed, totalAssessed),
    };
  });
  // Per-exam overall summary
  const examIdsInScope = new Set(scopedExamRows.map((e) => e.id));
  const recentExamIds = new Set(
    scopedExamRows
      .filter((e) => e.isResultDeclared || new Date(e.endDate).getTime() < now.getTime())
      .slice(0, 2)
      .map((e) => e.id)
  );
  const examPerformanceSummary = Array.from(recentExamIds).map((examId) => {
    const exam = scopedExamRows.find((e) => e.id === examId);
    const subjectIds = examSubjectRows.filter((s) => s.examSessionId === examId).map((s) => s.id);
    const marksForExam = scopedExamMarkRows.filter((m) => subjectIds.includes(m.examSubjectId));
    const uniqueStudents = new Set(marksForExam.map((m) => m.studentId)).size;
    const graded = marksForExam.filter((m) => !m.isAbsent && m.grade);
    const passCount = graded.filter((m) => m.grade !== "F").length;
    const gradeDist: Record<string, number> = {};
    for (const m of graded) {
      if (m.grade) gradeDist[m.grade] = (gradeDist[m.grade] ?? 0) + 1;
    }
    // Top 3 scorers (aggregate per student across subjects)
    const studentTotals = new Map<number, number>();
    for (const m of marksForExam) {
      if (!m.isAbsent && m.totalObtained) {
        studentTotals.set(m.studentId, (studentTotals.get(m.studentId) ?? 0) + numeric(m.totalObtained));
      }
    }
    const topScorers = Array.from(studentTotals.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([sid, total]) => ({
        studentId: sid,
        studentName: studentById.get(sid)?.name ?? `Student #${sid}`,
        totalMarks: total,
      }));
    return {
      examId,
      examTitle: exam?.title ?? `Exam #${examId}`,
      totalStudentsAssessed: uniqueStudents,
      overallPassCount: passCount,
      overallFailCount: graded.length - passCount,
      overallPassRate: percent(passCount, graded.length),
      gradeDistribution: gradeDist,
      topScorers,
    };
  });

  // ── NEW: Fee payment breakdown ──────────────────────────────────────────────
  const scopedFeePayments = feePaymentRows.filter((p) => scopedStudentIds.has(p.studentId) && !p.deletedAt);
  const paymentMethodBreakdown: Record<string, number> = {};
  const paymentByMonth: Record<string, number> = {};
  for (const p of scopedFeePayments) {
    const method = p.method ?? "unknown";
    paymentMethodBreakdown[method] = (paymentMethodBreakdown[method] ?? 0) + numeric(p.amount);
    const month = String(p.paymentDate).slice(0, 7);
    paymentByMonth[month] = (paymentByMonth[month] ?? 0) + numeric(p.amount);
  }
  const recentPayments = scopedFeePayments.slice(0, 10).map((p) => ({
    id: p.id,
    receiptNumber: p.receiptNumber,
    amount: numeric(p.amount),
    method: p.method,
    studentName: studentById.get(p.studentId)?.name ?? `Student #${p.studentId}`,
    paymentDate: p.paymentDate,
    gateway: p.gateway,
    gatewayStatus: p.gatewayStatus,
  }));

  // ── NEW: Promotion history ──────────────────────────────────────────────────
  const scopedPromotions = promotionHistoryRows.filter((ph) => scopedStudentIds.has(ph.studentId));
  const recentPromotions = scopedPromotions.slice(0, 15).map((ph) => ({
    studentId: ph.studentId,
    studentName: studentById.get(ph.studentId)?.name ?? `Student #${ph.studentId}`,
    fromClassId: ph.fromClassId,
    toClassId: ph.toClassId,
    academicSessionId: ph.academicSessionId,
    promotionDate: ph.promotionDate,
    notes: ph.notes,
  }));

  // ── NEW: Session promotions (enhanced audit trail) ──────────────────────────
  const scopedSessionPromotions = sessionPromotionRows.filter((sp) =>
    scopedStudentIds.has(sp.studentId)
  );
  const recentSessionPromotions = scopedSessionPromotions.slice(0, 15).map((sp) => ({
    id: sp.id,
    studentId: sp.studentId,
    studentName: studentById.get(sp.studentId)?.name ?? `Student #${sp.studentId}`,
    fromSessionId: sp.fromSessionId,
    toSessionId: sp.toSessionId,
    fromClassId: sp.fromClassId,
    toClassId: sp.toClassId,
    promotedAt: sp.promotedAt instanceof Date ? sp.promotedAt.toISOString() : String(sp.promotedAt),
    triggeredBy: sp.triggeredBy,
    remarks: sp.remarks,
  }));

  // ── NEW: Class promotion mapping (configuration) ────────────────────────────
  const promotionMappingSummary = classPromotionMappingRows.map((cpm) => {
    const fromClass = classById.get(cpm.fromClassId);
    const toClass = classById.get(cpm.toClassId);
    return {
      id: cpm.id,
      fromClassId: cpm.fromClassId,
      fromClassName: fromClass ? buildClassLabel(fromClass) : `Class #${cpm.fromClassId}`,
      toClassId: cpm.toClassId,
      toClassName: toClass ? buildClassLabel(toClass) : `Class #${cpm.toClassId}`,
      academicSessionId: cpm.academicSessionId,
      isDefault: cpm.isDefault,
    };
  });

  // ── NEW: Teaching pulse summary (admin-only) ────────────────────────────────
  const pulseByStatus: Record<string, number> = {};
  for (const p of dailyPulseRows) {
    pulseByStatus[p.status] = (pulseByStatus[p.status] ?? 0) + 1;
  }
  const pulseByTeacher: Record<string, { completed: number; missed: number; total: number }> = {};
  for (const p of dailyPulseRows) {
    const tName = teacherById.get(p.teacherId)?.name ?? `Teacher #${p.teacherId}`;
    if (!pulseByTeacher[tName]) pulseByTeacher[tName] = { completed: 0, missed: 0, total: 0 };
    pulseByTeacher[tName].total++;
    if (p.status === "completed") pulseByTeacher[tName].completed++;
    else if (p.status === "missed") pulseByTeacher[tName].missed++;
  }
  const teachingPulseSummary = isAdmin
    ? {
        totalScheduled: dailyPulseRows.length,
        byStatus: pulseByStatus,
        byTeacher: Object.entries(pulseByTeacher).slice(0, 10).map(([name, stats]) => ({
          teacherName: name,
          ...stats,
          completionRate: percent(stats.completed, stats.total),
        })),
      }
    : null;

  // ── NEW: Activity log summary (admin-only) ──────────────────────────────────
  const activityLogSummary = isAdmin
    ? {
        recentActions: activityLogRows.slice(0, 10).map((log) => ({
          action: log.action,
          entityType: log.entityType,
          userEmail: log.userEmail,
          createdAt: log.createdAt instanceof Date ? log.createdAt.toISOString() : String(log.createdAt),
        })),
        actionBreakdown: Object.entries(
          activityLogRows.reduce<Record<string, number>>((acc, log) => {
            acc[log.action] = (acc[log.action] ?? 0) + 1;
            return acc;
          }, {})
        ).map(([action, count]) => ({ action, count })),
      }
    : null;

  // ── NEW: WhatsApp message stats (admin-only) ────────────────────────────────
  const whatsappStats = isAdmin
    ? {
        totalSent: whatsappMessageRows.length,
        byStatus: Object.entries(
          whatsappMessageRows.reduce<Record<string, number>>((acc, msg) => {
            acc[msg.status] = (acc[msg.status] ?? 0) + 1;
            return acc;
          }, {})
        ).map(([status, count]) => ({ status, count })),
        recentMessages: whatsappMessageRows.slice(0, 8).map((msg) => ({
          recipientNumber: msg.recipientNumber,
          status: msg.status,
          createdAt: msg.createdAt instanceof Date ? msg.createdAt.toISOString() : String(msg.createdAt),
        })),
      }
    : null;

  // ── NEW: School settings (admin-only) ───────────────────────────────────────
  const schoolSettingsSummary = isAdmin && schoolSettingsRows.length > 0
    ? { version: schoolSettingsRows[0].version, updatedAt: schoolSettingsRows[0].updatedAt }
    : null;

  // ── NEW: Fee structures reference (admin-only) ──────────────────────────────
  const feeStructureSummary = isAdmin
    ? feeStructureRows.map((fs) => ({
        className: fs.className,
        term: fs.term,
        baseRate: numeric(fs.baseRate),
        transportRate: numeric(fs.transportRate),
        miscRate: numeric(fs.miscRate),
        chargeItems: fs.chargeItems,
      }))
    : null;

  // ── NEW: Chat messages summary (admin-only) ─────────────────────────────────
  const chatSummary = isAdmin
    ? {
        totalMessages: chatMessageRows.length,
        recentMessages: chatMessageRows.slice(0, 8).map((msg) => ({
          senderId: msg.senderId,
          receiverId: msg.receiverId,
          messageBody: msg.messageBody.length > 100 ? msg.messageBody.slice(0, 100) + "..." : msg.messageBody,
          isRead: msg.isRead,
          createdAt: msg.createdAt instanceof Date ? msg.createdAt.toISOString() : String(msg.createdAt),
        })),
        unreadCount: chatMessageRows.filter((msg) => !msg.isRead).length,
      }
    : null;

  // ── NEW: Announcements (admin-only) ─────────────────────────────────────────
  const announcementSummary = isAdmin
    ? announcementRows.map((a) => ({
        id: a.id,
        title: a.title,
        category: a.category,
        targetRole: a.targetRole,
        pinned: a.pinned,
        createdAt: a.createdAt instanceof Date ? a.createdAt.toISOString() : String(a.createdAt),
      }))
    : null;

  // ── NEW: To-do tasks (admin-only) ───────────────────────────────────────────
  const todoSummary = isAdmin
    ? {
        total: todoRows.length,
        byStatus: Object.entries(
          todoRows.reduce<Record<string, number>>((acc, t) => {
            acc[t.status] = (acc[t.status] ?? 0) + 1;
            return acc;
          }, {})
        ).map(([status, count]) => ({ status, count })),
        byPriority: Object.entries(
          todoRows.reduce<Record<string, number>>((acc, t) => {
            acc[t.priority] = (acc[t.priority] ?? 0) + 1;
            return acc;
          }, {})
        ).map(([priority, count]) => ({ priority, count })),
        overdue: todoRows.filter((t) => t.status !== "completed" && t.status !== "cancelled" && t.dueDate && new Date(t.dueDate).getTime() < now.getTime()).length,
        recent: todoRows.slice(0, 10).map((t) => ({
          title: t.title,
          status: t.status,
          priority: t.priority,
          dueDate: t.dueDate instanceof Date ? t.dueDate.toISOString() : String(t.dueDate ?? ""),
        })),
      }
    : null;

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
      // ── NEW wallet sources ──────────────────────────────────────────────
      "parent_wallets",
      "wallet_transactions",
      "exam_sessions",
      // ── NEW: Authoritative financial & staff sources ────────────────────
      "ledger",
      "expenses",
      "staff",
      "salary_payments",
      "staff_loans",
      // ── NEW: Academic & system sources ──────────────────────────────────
      "exam_marks",
      "exam_subjects",
      "fee_payments",
      "academic_sessions",
      "promotion_history",
      "session_promotions",
      "class_promotion_mapping",
      "daily_teaching_pulse",
      "activity_logs",
      "whatsapp_messages",
      "school_settings",
      "fee_structures",
      // ── NEW: Communication & task sources ───────────────────────────────
      "chat_messages",
      "announcements",
      "todos",
    ],
    summary: {
      totals: {
        classes: scopedClasses.length,
        students: scopedStudents.length,
        teachers: teacherRows.length,
        staff: isAdmin ? staffRows.length : 0,
      },
      classSummaries: classSummariesWithTeachers,
      attendanceByClass,
      lowAttendanceStudents: attendanceByStudent,
      academicSession: academicSessionSummary,
      finance: {
        totalBilled,
        totalPaid,
        totalOutstanding,
        /** overdueAmount: sum of remainingBalance for all overdue fees */
        overdueAmount,
        openInvoices: openFees.length,
        overdueInvoices: overdueFees.length,
        generatedVouchers: scopedVouchers.length,
        /**
         * walletBalanceTotal: summed from parentWallets (authoritative source).
         */
        walletBalanceTotal,
        collectionRate: percent(totalPaid, totalBilled),
        families: familyFinance,
        /** Per-student wallet summary for AI context */
        studentWallets: scopedWallets
          .filter((w) => numeric(w.balance) > 0)
          .map((w) => {
            const student = scopedStudents.find((s) => s.id === w.studentId);
            return {
              studentId: w.studentId,
              studentName: student?.name ?? `Student #${w.studentId}`,
              balance: numeric(w.balance),
            };
          })
          .sort((a, b) => b.balance - a.balance)
          .slice(0, 10),
        /** Last 10 wallet transactions across all scoped students */
        recentWalletTransactions: recentWalletTransactionsSummary,
        // ── NEW: Fee payment breakdown ────────────────────────────────────
        paymentMethodBreakdown,
        paymentByMonth,
        recentPayments,
        // ── NEW: Authoritative ledger summary (admin-only) ────────────────
        ledger: isAdmin ? ledgerSummary : null,
      },
      // ── NEW: Expenses section (admin-only) ────────────────────────────────
      expenses: isAdmin ? expensesSummary : null,
      // ── NEW: Staff financials section (admin-only) ──────────────────────
      staffFinancials: isAdmin ? staffFinancials : null,
      homework: {
        byClass: homeworkByClass,
        assignments: homeworkDetails,
      },
      examinations: {
        upcomingExams,
        recentCompletedExam,
        // ── NEW: per-subject performance ──────────────────────────────────
        subjectPerformance: examSubjectPerformance,
        // ── NEW: per-exam overall performance ─────────────────────────────
        performanceSummary: examPerformanceSummary,
      },
      // ── NEW: Promotion history ────────────────────────────────────────────
      promotionHistory: recentPromotions.length > 0 ? recentPromotions : null,
      // ── NEW: Enhanced session promotions audit trail ──────────────────────
      sessionPromotions: recentSessionPromotions.length > 0 ? recentSessionPromotions : null,
      // ── NEW: Class promotion mapping configuration ─────────────────────────
      classPromotionMapping: promotionMappingSummary.length > 0 ? promotionMappingSummary : null,
      // ── NEW: Teaching pulse (admin-only) ─────────────────────────────────
      teachingPulse: teachingPulseSummary,
      // ── NEW: Activity log (admin-only) ───────────────────────────────────
      activityLog: activityLogSummary,
      // ── NEW: WhatsApp delivery stats (admin-only) ────────────────────────
      whatsappStats,
      // ── NEW: School settings (admin-only) ───────────────────────────────
      schoolSettings: schoolSettingsSummary,
      // ── NEW: Fee structures reference (admin-only) ──────────────────────
      feeStructures: feeStructureSummary,
      // ── NEW: Chat messages (admin-only) ──────────────────────────────────
      chat: chatSummary,
      // ── NEW: Announcements (admin-only) ──────────────────────────────────
      announcements: announcementSummary,
      // ── NEW: To-do tasks (admin-only) ────────────────────────────────────
      todos: todoSummary,
    },
  };
}

function buildFallbackAnswer(question: string, context: Awaited<ReturnType<typeof collectGroundedContext>>) {
  const lowerQuestion = question.toLowerCase();
  const isGreeting = /^(hi|hello|hey|good morning|good afternoon|good evening|howdy|greetings?|what'?s up|sup)\b/i.test(lowerQuestion.trim());
  const wantsAttendance = /attendance|absent|present|late/.test(lowerQuestion);
  const wantsFinance = /fee|finance|voucher|wallet|overdue|paid|collection|balance/.test(lowerQuestion);
  const wantsHomework = /homework|assignment|diary|submission|pending/.test(lowerQuestion);
  const wantsClasses = /class|teacher|student|size|status|homeroom/.test(lowerQuestion);
  const wantsExams = /exam|test|marksheet|result|grade|mat|half.year|annual|top|pass rate|performance|scorer|average|subject|theory|practical/.test(lowerQuestion);
  // ── NEW: Finance & Staff keyword checks ─────────────────────────────────
  const wantsLedger = /ledger|cash.flow|income.*expense|transaction|pos|net balance/.test(lowerQuestion);
  const wantsExpenses = /expense|utilities|maintenance|supplies|rent|transport|food|spending/.test(lowerQuestion);
  const wantsStaffPayroll = /staff|teacher|salary|payroll|payout|monthly.*salary|net pay/.test(lowerQuestion);
  const wantsStaffLoans = /loan|advance|borrowed|repayment|installment/.test(lowerQuestion);
  // ── NEW: Academic & system keyword checks ───────────────────────────────
  const wantsSession = /session|academic year|current.*year|school year/.test(lowerQuestion);
  const wantsPromotion = /promot|class change|transition|move.*class|next class/.test(lowerQuestion);
  const wantsTeachingPulse = /pulse|taught|today.*class|period.*teach|cancelled.*class|missed.*class/.test(lowerQuestion);
  const wantsActivity = /audit|activity|change.*made|recent.*action|who.*(create|update|delete)/.test(lowerQuestion);
  const wantsWhatsApp = /whatsapp|message.*sent|delivery|notification.*status/.test(lowerQuestion);
  const wantsTodos = /to.?do|task|pending.*item|checklist|assigned.*task/.test(lowerQuestion);
  const wantsAnnouncements = /announce|notice|circular|news|update.*school/.test(lowerQuestion);
  const wantsChat = /chat|message.*(parent|teacher|staff)|conversation/.test(lowerQuestion);

  if (isGreeting) {
    return `Hello! I'm the Schooliee AI Assistant. How can I help you today?`;
  }

  const lines: string[] = [];
  lines.push(`I checked live records scoped to ${context.scope.role === "admin" ? "all classes" : context.scope.classNames.join(", ") || "your assigned classes"}.`);

  if (!wantsAttendance && !wantsFinance && !wantsHomework && !wantsClasses && !wantsExams && !wantsLedger && !wantsExpenses && !wantsStaffPayroll && !wantsStaffLoans && !wantsSession && !wantsPromotion && !wantsTeachingPulse && !wantsActivity && !wantsWhatsApp && !wantsTodos && !wantsAnnouncements && !wantsChat) {
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
    if (finance.walletBalanceTotal > 0) {
      lines.push(`Total wallet credit held: ${money(finance.walletBalanceTotal)}.`);
    }
    if (finance.studentWallets && finance.studentWallets.length > 0) {
      lines.push(
        `Top student wallet balances: ${finance.studentWallets.slice(0, 5).map((w) => `${w.studentName} ${money(w.balance)}`).join("; ")}.`
      );
    }
    if (finance.recentWalletTransactions && finance.recentWalletTransactions.length > 0) {
      lines.push(
        `Recent wallet activity: ${finance.recentWalletTransactions.slice(0, 5).map((tx) => `${tx.type} ${money(Math.abs(tx.amount))}${tx.description ? ` (${tx.description.slice(0, 60)})` : ""}`).join("; ")}.`
      );
    }
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

  if (wantsExams) {
    const examinations = context.summary.examinations;
    lines.push(
      examinations.upcomingExams.length
        ? `Upcoming exams: ${examinations.upcomingExams.slice(0, 5).map((exam) => `${exam.title} for ${exam.className} on ${exam.startDate.slice(0, 10)}`).join("; ")}.`
        : "No upcoming exams were found in scope.",
    );
    if (examinations.recentCompletedExam) {
      lines.push(`Recent completed exam: ${examinations.recentCompletedExam.title} for ${examinations.recentCompletedExam.className}, ended ${examinations.recentCompletedExam.endDate.slice(0, 10)}.`);
    }
  }

  // ── NEW: Ledger response (admin-only) ─────────────────────────────────────
  if (wantsLedger) {
    if (context.scope.role !== "admin") {
      lines.push("Ledger data is only available to administrators.");
    } else if (context.summary.finance?.ledger) {
      const ledger = context.summary.finance.ledger;
      lines.push(
        `Ledger: income ${money(ledger.totalIncome)}, expenses ${money(ledger.totalExpense)}, net ${money(ledger.netBalance)}.`
      );
      if (Object.keys(ledger.byCategory).length > 0) {
        const catSummary = Object.entries(ledger.byCategory)
          .map(([cat, amt]) => `${cat} ${money(amt)}`)
          .join("; ");
        lines.push(`By category: ${catSummary}.`);
      }
      if (ledger.recentTransactions?.length) {
        lines.push(
          `Recent transactions: ${ledger.recentTransactions.slice(0, 5).map((t) => `${t.entryType} ${t.category} ${money(t.amount)}${t.description ? ` (${t.description.slice(0, 30)})` : ""}`).join("; ")}.`
        );
      }
    } else {
      lines.push("No ledger transactions found.");
    }
  }

  // ── NEW: Expenses response (admin-only) ───────────────────────────────────
  if (wantsExpenses) {
    if (context.scope.role !== "admin") {
      lines.push("Expense data is only available to administrators.");
    } else if (context.summary.expenses) {
      const expenses = context.summary.expenses;
      lines.push(`Expenses: total ${money(expenses.totalExpenses)}.`);
      if (Object.keys(expenses.byCategory).length > 0) {
        const catSummary = Object.entries(expenses.byCategory)
          .map(([cat, amt]) => `${cat} ${money(amt)}`)
          .join("; ");
        lines.push(`By category: ${catSummary}.`);
      }
      if (expenses.recentExpenses?.length) {
        lines.push(
          `Recent expenses: ${expenses.recentExpenses.slice(0, 5).map((e) => `${e.category} ${money(e.amount)} on ${String(e.date).slice(0, 10)}`).join("; ")}.`
        );
      }
    } else {
      lines.push("No expense records found.");
    }
  }

  // ── NEW: Staff Payroll response (admin-only) ──────────────────────────────
  if (wantsStaffPayroll || wantsStaffLoans) {
    if (context.scope.role !== "admin") {
      lines.push("Staff payroll data is only available to administrators.");
    } else if (context.summary.staffFinancials) {
      const staffFin = context.summary.staffFinancials;
      if (wantsStaffPayroll && !wantsStaffLoans) {
        lines.push(`Staff: ${staffFin.staffCount} total, total salary paid ${money(staffFin.totalSalaryPaid)}.`);
        if (Object.keys(staffFin.salaryByMonth).length > 0) {
          const monthSummary = Object.entries(staffFin.salaryByMonth)
            .slice(-6)
            .map(([month, amt]) => `${month}: ${money(amt)}`)
            .join("; ");
          lines.push(`Monthly breakdown: ${monthSummary}.`);
        }
      }
      if (wantsStaffLoans) {
        lines.push(`Active staff loans: ${staffFin.activeLoans.length} totaling ${money(staffFin.totalLoanOutstanding)}.`);
        if (staffFin.activeLoans.length > 0) {
          lines.push(
            `Staff with outstanding loans: ${staffFin.activeLoans.slice(0, 5).map((l) => `${l.staffName} ${money(l.outstandingBalance)} (${l.installmentsPaid}/${l.totalInstallments} installments)`).join("; ")}.`
          );
        }
      }
    } else {
      lines.push("No staff payroll records found.");
    }
  }

  // ── NEW: Exam performance response (enhanced) ──────────────────────────────
  if (wantsExams) {
    const perf = context.summary.examinations.performanceSummary;
    if (perf && perf.length > 0) {
      for (const exam of perf) {
        lines.push(
          `${exam.examTitle}: ${exam.totalStudentsAssessed} students, pass rate ${exam.overallPassRate}% (${exam.overallPassCount} passed, ${exam.overallFailCount} failed).`
        );
        if (exam.topScorers.length > 0) {
          lines.push(`Top scorers: ${exam.topScorers.map((s) => `${s.studentName} (${s.totalMarks} marks)`).join(", ")}.`);
        }
        if (Object.keys(exam.gradeDistribution).length > 0) {
          const grades = Object.entries(exam.gradeDistribution).map(([g, c]) => `${g}: ${c}`).join(", ");
          lines.push(`Grade distribution: ${grades}.`);
        }
      }
    }
    const subjPerf = context.summary.examinations.subjectPerformance;
    if (subjPerf && subjPerf.length > 0) {
      lines.push(
        `Subject averages: ${subjPerf.slice(0, 6).map((s) => `${s.subjectName} avg ${s.averageMarks}, pass rate ${s.passRate}%`).join("; ")}.`
      );
    }
  }

  // ── NEW: Academic session response ──────────────────────────────────────────
  if (wantsSession) {
    const session = context.summary.academicSession;
    if (session.current) {
      lines.push(`Current academic session: ${session.current.name} (${session.current.startDate} to ${session.current.endDate})${session.current.promotionExecuted ? " [promotion completed]" : " [promotion pending]"}.`);
    }
    if (session.next) {
      lines.push(`Next academic session: ${session.next.name} (${session.next.startDate} to ${session.next.endDate}).`);
    }
    if (!session.current && session.all.length > 0) {
      lines.push(`Available sessions: ${session.all.map((s) => `${s.name}${s.isCurrent ? " (current)" : ""}${s.isNext ? " (next)" : ""}${s.promotionExecuted ? " [promoted]" : ""}`).join(", ")}.`);
    }
    if (session.all.length === 0) {
      lines.push("No academic sessions found.");
    }
  }

  // ── NEW: Promotion history response ─────────────────────────────────────────
  if (wantsPromotion) {
    const promotions = context.summary.promotionHistory;
    const sessionPromo = context.summary.sessionPromotions;
    if (promotions && promotions.length > 0) {
      lines.push(`Recent promotions: ${promotions.slice(0, 8).map((p) => `${p.studentName} promoted on ${p.promotionDate}${p.notes ? ` (${p.notes})` : ""}`).join("; ")}.`);
    }
    if (sessionPromo && sessionPromo.length > 0) {
      lines.push(`Session-based promotions: ${sessionPromo.slice(0, 8).map((p) => `${p.studentName} from session ${p.fromSessionId} to ${p.toSessionId}${p.remarks ? ` (${p.remarks})` : ""}`).join("; ")}.`);
    }
    const mappings = context.summary.classPromotionMapping;
    if (mappings && mappings.length > 0) {
      lines.push(`Configured promotion paths: ${mappings.slice(0, 6).map((m) => `${m.fromClassName} -> ${m.toClassName}${m.isDefault ? " (default)" : ""}`).join("; ")}.`);
    }
    if (!promotions?.length && !sessionPromo?.length) {
      lines.push("No promotion records found in scope.");
    }
  }

  // ── NEW: Teaching pulse response (admin-only) ───────────────────────────────
  if (wantsTeachingPulse) {
    if (context.scope.role !== "admin") {
      lines.push("Teaching pulse data is only available to administrators.");
    } else if (context.summary.teachingPulse) {
      const pulse = context.summary.teachingPulse;
      const statusLine = Object.entries(pulse.byStatus).map(([s, c]) => `${s}: ${c}`).join(", ");
      lines.push(`Teaching pulse — ${statusLine}.`);
      if (pulse.byTeacher.length > 0) {
        lines.push(
          `By teacher: ${pulse.byTeacher.slice(0, 5).map((t) => `${t.teacherName} ${t.completionRate}% completed`).join("; ")}.`
        );
      }
    } else {
      lines.push("No teaching pulse records found.");
    }
  }

  // ── NEW: Activity log response (admin-only) ─────────────────────────────────
  if (wantsActivity) {
    if (context.scope.role !== "admin") {
      lines.push("Activity logs are only available to administrators.");
    } else if (context.summary.activityLog) {
      const log = context.summary.activityLog;
      if (log.recentActions.length > 0) {
        lines.push(`Recent activity: ${log.recentActions.slice(0, 5).map((a) => `${a.action} ${a.entityType} by ${a.userEmail}`).join("; ")}.`);
      }
    } else {
      lines.push("No activity logs found.");
    }
  }

  // ── NEW: WhatsApp stats response (admin-only) ───────────────────────────────
  if (wantsWhatsApp) {
    if (context.scope.role !== "admin") {
      lines.push("WhatsApp delivery data is only available to administrators.");
    } else if (context.summary.whatsappStats) {
      const stats = context.summary.whatsappStats;
      const statusLine = stats.byStatus.map((s) => `${s.status}: ${s.count}`).join(", ");
      lines.push(`WhatsApp messages — ${statusLine}.`);
    } else {
      lines.push("No WhatsApp message records found.");
    }
  }

  // ── NEW: To-do tasks response (admin-only) ──────────────────────────────────
  if (wantsTodos) {
    if (context.scope.role !== "admin") {
      lines.push("To-do task data is only available to administrators.");
    } else if (context.summary.todos) {
      const todos = context.summary.todos;
      const statusLine = todos.byStatus.map((s) => `${s.status}: ${s.count}`).join(", ");
      lines.push(`Tasks — ${statusLine} (${todos.overdue} overdue).`);
      if (todos.recent.length > 0) {
        lines.push(`Recent tasks: ${todos.recent.slice(0, 5).map((t) => `${t.title} [${t.status}] (${t.priority})`).join("; ")}.`);
      }
    } else {
      lines.push("No to-do tasks found.");
    }
  }

  // ── NEW: Announcements response (admin-only) ────────────────────────────────
  if (wantsAnnouncements) {
    if (context.scope.role !== "admin") {
      lines.push("Announcement data is only available to administrators.");
    } else if (context.summary.announcements && context.summary.announcements.length > 0) {
      lines.push(
        `Announcements: ${context.summary.announcements.slice(0, 6).map((a) => `${a.title} (${a.category})${a.pinned ? " [pinned]" : ""}`).join("; ")}.`
      );
    } else {
      lines.push("No active announcements found.");
    }
  }

  // ── NEW: Chat summary response (admin-only) ─────────────────────────────────
  if (wantsChat) {
    if (context.scope.role !== "admin") {
      lines.push("Chat message data is only available to administrators.");
    } else if (context.summary.chat) {
      const chat = context.summary.chat;
      lines.push(`Chat messages: ${chat.totalMessages} total, ${chat.unreadCount} unread.`);
    } else {
      lines.push("No chat messages found.");
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
              "You are the Schooliee AI School Assistant. Respond naturally to greetings, pleasantries, and general school-related questions. Use the provided JSON context for factual answers about attendance, fees, homework, classes, examinations, academic sessions, class teachers, promotions, staff payroll, ledger, expenses, activity logs, announcements, chat messages, to-do tasks, teaching pulse, WhatsApp delivery stats, school settings, and fee structures. When answering exam performance questions, look for the `examinations.performanceSummary` array which contains per-exam overall results (pass rates, grade distribution, top scorers) and `examinations.subjectPerformance` for per-subject averages and pass rates. The `academicSession` field tells you the current school year (`current`), the upcoming session (`next`), and the full list (`all`). `classSummaries` includes a `teachers` array per class. `promotionHistory` shows student class transitions. `sessionPromotions` is the enhanced session-based audit trail with `fromSessionId`, `toSessionId`, and `remarks`. `classPromotionMapping` lists configured promotion paths (e.g., Grade 1 -> Grade 2). The `academicSession.current.promotionExecuted` flag indicates whether the automated promotion workflow has been completed. `finance.paymentMethodBreakdown` and `finance.paymentByMonth` show fee payment patterns. For the system prompt context: MAT means Monthly Assessment Test, HALF_YEARLY means Half-Yearly Examination, and ANNUAL means Annual Examination. Standard grading follows A+ 90-100, A 80-89, B 70-79, C 60-69, D 50-59, E 40-49, F below 40. Admin-only sections (ledger, expenses, staffFinancials, activityLog, whatsappStats, schoolSettings, feeStructures, teachingPulse, chat, announcements, todos) are null for non-admin users — do not fabricate data. If you lack sufficient data, politely indicate that you don't have the information.",
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
