import { z } from "zod";
import {
  insertAcademicSchema,
  insertAttendanceSchema,
  insertResultSchema,
  insertUserSchema,
  attendanceSessionSchema,
  attendanceStatusSchema,
  classes,
  classTeachers,
  dailyTeachingPulseStatusSchema,
  qrAttendanceDirectionSchema,
  qrAttendanceMarkStatusSchema,
  qrAttendanceMethodSchema,
  timetableDaySchema,
  insertTimetableSettingsSchema,
  insertFinanceVoucherSchema,
} from "./schema.js";
import {
  CreateHomeworkSchema,
  UpdateHomeworkSchema,
  GradeSubmissionSchema,
  HomeworkListQuerySchema,
  StudentHomeworkListQuerySchema,
  homeworkPrioritySchema,
  homeworkStatusSchema,
} from "../schemas/homework.schema.js";
import {
  billingMonthSchema,
  billingProfileInputSchema,
  financeVoucherOperationStatusSchema,
  financeVoucherPreviewInputSchema,
  financeVoucherSelectionInputSchema,
  financeVoucherStartInputSchema,
  createFeeInputSchema,
  feeLineItemSchema,
  feeStatusSchema,
  generateMonthlyFeesInputSchema,
  invoiceSourceSchema,
  paymentMethodSchema,
  recordFeePaymentInputSchema,
  updateFeeInputSchema,
} from "./finance.js";
import {
  adminSchoolSettingsResponseSchema,
  exportSchoolSettingsResponseSchema,
  publicSchoolSettingsSchema,
  restoreSchoolSettingsInputSchema,
  updateSchoolSettingsInputSchema,
} from "./settings.js";

const optionalUserTextFieldSchema = z.preprocess(
  (value) => typeof value === "string" ? value.trim() || null : value,
  z.string().max(120).nullable().optional(),
);

const optionalStudentPhotoUrlSchema = z.preprocess(
  (value) => typeof value === "string" ? value.trim() || null : value,
  z.string().url("Student photo URL must be a valid URL").max(500).nullable().optional(),
);

const optionalTeacherPhotoUrlSchema = z.preprocess(
  (value) => typeof value === "string" ? value.trim() || null : value,
  z.string().url("Teacher photo URL must be a valid URL").max(500).nullable().optional(),
);

const userWriteSchema = insertUserSchema.extend({
  name: z.string().trim().min(1, "Name is required").max(120),
  email: z.string().trim().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
  role: z.enum(["admin", "teacher", "student"]),
  subject: optionalUserTextFieldSchema,
  designation: optionalUserTextFieldSchema,
  department: optionalUserTextFieldSchema,
  employeeId: optionalUserTextFieldSchema,
  teacherPhotoUrl: optionalTeacherPhotoUrlSchema,
  className: optionalUserTextFieldSchema,
  fatherName: optionalUserTextFieldSchema,
  studentPhotoUrl: optionalStudentPhotoUrlSchema,
});

const userUpdateSchema = userWriteSchema.partial();

const userSchema = z.object({
  id: z.number(),
  name: z.string(),
  email: z.string(),
  role: z.string(),
  subject: z.string().nullable().optional(),
  designation: z.string().nullable().optional(),
  department: z.string().nullable().optional(),
  employeeId: z.string().nullable().optional(),
  teacherPhotoUrl: z.string().nullable().optional(),
  className: z.string().nullable().optional(),
  fatherName: z.string().nullable().optional(),
  studentPhotoUrl: z.string().nullable().optional(),
});

const apiEnvelope = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.boolean(),
    data: dataSchema.optional(),
    error: z.string().optional(),
    message: z.string().optional(),
  });

const academicSchema = z.object({
  id: z.number(),
  title: z.string(),
  code: z.string(),
  description: z.string().nullable().optional(),
  className: z.string().nullable().optional(),
  teacherUserId: z.number().nullable().optional(),
  teacher: userSchema.optional(),
});

const attendanceRecordSchema = z.object({
  id: z.number(),
  studentId: z.number(),
  teacherId: z.number(),
  date: z.string(),
  status: attendanceStatusSchema,
  session: attendanceSessionSchema,
  remarks: z.string().nullable().optional(),
  student: userSchema.optional(),
  teacher: userSchema.optional(),
});

const resultRecordSchema = z.object({
  id: z.number(),
  studentId: z.number(),
  subject: z.string(),
  marks: z.number(),
  grade: z.string(),
  totalMarks: z.number().nullable().optional(),
  examTitle: z.string().nullable().optional(),
  examType: z.string().nullable().optional(),
  term: z.string().nullable().optional(),
  examDate: z.string().nullable().optional(),
  remarks: z.string().nullable().optional(),
  student: userSchema.optional(),
});

const feePaymentSchema = z.object({
  id: z.number(),
  feeId: z.number(),
  studentId: z.number(),
  amount: z.number(),
  paymentDate: z.string(),
  method: paymentMethodSchema,
  receiptNumber: z.string().nullable().optional(),
  reference: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  createdAt: z.string(),
  createdBy: z.number().nullable().optional(),
  createdByUser: userSchema.optional(),
});

const billingProfileSchema = z.object({
  studentId: z.number(),
  monthlyAmount: z.number(),
  dueDay: z.number(),
  isActive: z.boolean(),
  notes: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  student: userSchema.optional(),
});

const feeSchema = z.object({
  id: z.number(),
  studentId: z.number(),
  amount: z.number(),
  paidAmount: z.number(),
  remainingBalance: z.number(),
  dueDate: z.string(),
  status: feeStatusSchema,
  invoiceNumber: z.string().nullable().optional(),
  billingMonth: z.string(),
  billingPeriod: z.string(),
  description: z.string(),
  feeType: z.string(),
  source: invoiceSourceSchema,
  generatedMonth: z.string().nullable().optional(),
  lineItems: z.array(feeLineItemSchema),
  notes: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  isOverdue: z.boolean(),
  paymentCount: z.number(),
  student: userSchema.optional(),
  payments: z.array(feePaymentSchema).optional(),
});

const financeReportSchema = z.object({
  summary: z.object({
    totalInvoices: z.number(),
    totalBilled: z.number(),
    totalPaid: z.number(),
    totalOutstanding: z.number(),
    paidInvoices: z.number(),
    partiallyPaidInvoices: z.number(),
    unpaidInvoices: z.number(),
    overdueInvoices: z.number(),
    paymentsCount: z.number(),
    collectionRate: z.number(),
    overdueBalance: z.number(),
    studentsWithOutstanding: z.number(),
    studentsWithOverdue: z.number(),
  }),
  monthlyRevenue: z.array(
    z.object({
      month: z.string(),
      billed: z.number(),
      paid: z.number(),
    }),
  ),
  statusBreakdown: z.array(
    z.object({
      status: feeStatusSchema,
      count: z.number(),
      amount: z.number(),
    }),
  ),
  outstandingStudents: z.array(
    z.object({
      studentId: z.number(),
      studentName: z.string(),
      className: z.string().nullable().optional(),
      outstandingBalance: z.number(),
      overdueBalance: z.number(),
      invoiceCount: z.number(),
      oldestDueDate: z.string().optional(),
      maxDaysOverdue: z.number(),
    }),
  ),
  paymentMethodBreakdown: z.array(
    z.object({
      method: paymentMethodSchema,
      count: z.number(),
      amount: z.number(),
    }),
  ),
  classBreakdown: z.array(
    z.object({
      className: z.string(),
      studentCount: z.number(),
      invoiceCount: z.number(),
      billed: z.number(),
      paid: z.number(),
      outstanding: z.number(),
      overdueBalance: z.number(),
      collectionRate: z.number(),
    }),
  ),
  invoices: z.array(feeSchema),
  payments: z.array(feePaymentSchema),
});

const feePaymentListFiltersSchema = z.object({
  month: billingMonthSchema.optional(),
  studentId: z.coerce.number().int().positive().optional(),
  method: paymentMethodSchema.optional(),
});

const feeBalanceSummarySchema = z.object({
  totalBilled: z.number(),
  totalPaid: z.number(),
  totalOutstanding: z.number(),
  totalOverdue: z.number(),
  studentsWithOutstanding: z.number(),
  studentsWithOverdue: z.number(),
  openInvoices: z.number(),
  overdueInvoices: z.number(),
  dueSoonInvoices: z.number(),
});

const studentBalanceSummarySchema = z.object({
  studentId: z.number(),
  studentName: z.string(),
  className: z.string().nullable().optional(),
  totalBilled: z.number(),
  totalPaid: z.number(),
  outstandingBalance: z.number(),
  overdueBalance: z.number(),
  openInvoices: z.number(),
  overdueInvoices: z.number(),
  dueSoonInvoices: z.number(),
  nextDueDate: z.string().optional(),
  nextDueInvoiceId: z.number().optional(),
  maxDaysOverdue: z.number(),
  paymentReminders: z.array(
    z.object({
      invoiceId: z.number(),
      invoiceNumber: z.string().nullable().optional(),
      billingPeriod: z.string(),
      dueDate: z.string(),
      remainingBalance: z.number(),
      daysUntilDue: z.number(),
      status: feeStatusSchema,
    }),
  ),
});

const overdueBalanceItemSchema = z.object({
  invoiceId: z.number(),
  invoiceNumber: z.string().nullable().optional(),
  studentId: z.number(),
  studentName: z.string(),
  className: z.string().nullable().optional(),
  billingPeriod: z.string(),
  dueDate: z.string(),
  remainingBalance: z.number(),
  daysOverdue: z.number(),
  status: feeStatusSchema,
});

const paymentReceiptSchema = z.object({
  invoice: feeSchema,
  payment: feePaymentSchema,
});

const financeVoucherPreviewInvoiceSchema = z.object({
  feeId: z.number(),
  studentId: z.number(),
  studentName: z.string(),
  className: z.string().nullable().optional(),
  invoiceNumber: z.string().nullable().optional(),
  billingMonth: billingMonthSchema,
  billingPeriod: z.string(),
  amount: z.number(),
  remainingBalance: z.number(),
  dueDate: z.string(),
  hasExistingVoucher: z.boolean(),
  existingVoucherDocumentNumber: z.string().nullable().optional(),
  existingVoucherGeneratedAt: z.string().nullable().optional(),
});

const financeVoucherOperationSchema = z.object({
  id: z.number(),
  status: financeVoucherOperationStatusSchema,
  billingMonths: z.array(billingMonthSchema),
  classNames: z.array(z.string()),
  studentIds: z.array(z.number()),
  force: z.boolean(),
  totalInvoices: z.number(),
  generatedCount: z.number(),
  skippedCount: z.number(),
  failedCount: z.number(),
  archiveSizeBytes: z.number(),
  requestedBy: z.number().nullable().optional(),
  requestedByName: z.string().nullable().optional(),
  errorMessage: z.string().nullable().optional(),
  startedAt: z.string().nullable().optional(),
  completedAt: z.string().nullable().optional(),
  cancelledAt: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const financeVoucherPreviewSchema = z.object({
  selection: financeVoucherSelectionInputSchema,
  targetInvoiceCount: z.number(),
  targetStudentCount: z.number(),
  existingVoucherCount: z.number(),
  skippedExistingCount: z.number(),
  readyToGenerateCount: z.number(),
  sampleInvoices: z.array(financeVoucherPreviewInvoiceSchema),
});

const financeVoucherProgressSchema = financeVoucherOperationSchema.extend({
  currentInvoiceId: z.number().nullable().optional(),
  currentInvoiceNumber: z.string().nullable().optional(),
  currentStudentName: z.string().nullable().optional(),
  phase: z.enum(["queued", "planning", "rendering", "archiving", "completed", "cancelled", "failed"]),
  message: z.string(),
});

const timetableItemSchema = z.object({
  id: z.number(),
  academicId: z.number().nullable().optional(),
  className: z.string(),
  dayOfWeek: timetableDaySchema,
  periodLabel: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  room: z.string().nullable().optional(),
  classType: z.string().nullable().optional(),
  teacherId: z.number().nullable().optional(),
  teacherName: z.string().nullable().optional(),
  subject: z.string(),
  subjectCode: z.string().nullable().optional(),
  sortOrder: z.number(),
});

const teacherClassSchema = z.object({
  className: z.string(),
  studentCount: z.number(),
  subjects: z.array(z.string()),
});

const classSchema = z.object({
  id: z.number(),
  grade: z.string(),
  section: z.string(),
  stream: z.string().nullable().optional(),
  academicYear: z.string(),
  capacity: z.number(),
  currentCount: z.number(),
  homeroomTeacherId: z.number().nullable().optional(),
  status: z.string(),
});

const classTeacherSchema = z.object({
  id: z.number(),
  classId: z.number(),
  teacherId: z.number(),
  subjects: z.array(z.string()),
  periodsPerWeek: z.number(),
  priority: z.number(),
  isActive: z.boolean(),
});

const homeworkEnvelope = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    data: dataSchema.nullable(),
    error: z.string().nullable(),
    meta: z.record(z.unknown()).optional(),
  });

const homeworkClassSchema = classSchema.extend({
  label: z.string(),
  subjects: z.array(z.string()),
});

const homeworkAssignmentSchema = z.object({
  id: z.string(),
  classId: z.number(),
  teacherId: z.number(),
  subject: z.string(),
  title: z.string(),
  description: z.string().nullable().optional(),
  dueDate: z.string(),
  priority: homeworkPrioritySchema,
  files: z.array(z.string()),
  status: homeworkStatusSchema,
  createdAt: z.string().nullable().optional(),
  class: classSchema.optional(),
});

const homeworkListItemSchema = homeworkAssignmentSchema.extend({
  submissionCount: z.number(),
  averageMarks: z.number().nullable().optional(),
  classLabel: z.string(),
  classSize: z.number(),
});

const homeworkSubmissionSchema = z.object({
  id: z.string().nullable(),
  homeworkId: z.string(),
  studentId: z.number(),
  submissionFile: z.string().nullable(),
  submittedAt: z.string().nullable(),
  marks: z.number().nullable().optional(),
  feedback: z.string().nullable().optional(),
  student: z.object({
    id: z.number(),
    name: z.string(),
    avatarUrl: z.string().nullable().optional(),
    className: z.string().nullable().optional(),
  }),
});

const homeworkDetailSchema = homeworkAssignmentSchema.extend({
  classLabel: z.string(),
  classSize: z.number(),
  submissionCount: z.number(),
  submissions: z.array(homeworkSubmissionSchema),
});

const studentHomeworkListItemSchema = homeworkAssignmentSchema.extend({
  classLabel: z.string(),
  teacherName: z.string().nullable().optional(),
  submissionId: z.string().nullable(),
  submittedAt: z.string().nullable(),
  marks: z.number().nullable().optional(),
});

const dailyTeachingPulseItemSchema = z.object({
  id: z.number(),
  teacherId: z.number(),
  classId: z.number(),
  subject: z.string(),
  period: z.number(),
  startTime: z.string(),
  endTime: z.string(),
  room: z.string().nullable().optional(),
  date: z.string(),
  status: dailyTeachingPulseStatusSchema,
  markedAt: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
});

const teacherPulseStatsSchema = z.object({
  total: z.number(),
  completed: z.number(),
  missed: z.number(),
  pending: z.number(),
});

const teacherPulseTodayResponseSchema = z.object({
  periods: z.array(dailyTeachingPulseItemSchema),
  stats: teacherPulseStatsSchema,
  date: z.string(),
});

const teacherPulseMarkCompleteInputSchema = z.object({
  note: z.string().max(255).optional(),
});

const qrProfileSchema = z.object({
  userId: z.number(),
  publicId: z.string(),
  isActive: z.boolean(),
  issuedAt: z.string(),
  regeneratedAt: z.string(),
  lastUsedAt: z.string().nullable().optional(),
  lastUsedBy: z.number().nullable().optional(),
  generatedBy: z.number().nullable().optional(),
  user: userSchema.optional(),
  generatedByUser: userSchema.optional(),
  lastUsedByUser: userSchema.optional(),
});

const qrAttendanceEventSchema = z.object({
  id: z.number(),
  userId: z.number(),
  scannedBy: z.number(),
  attendanceDate: z.string(),
  scannedAt: z.string(),
  roleSnapshot: z.string(),
  direction: qrAttendanceDirectionSchema,
  status: qrAttendanceMarkStatusSchema.nullable().optional(),
  scanMethod: qrAttendanceMethodSchema,
  terminalLabel: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  user: userSchema.optional(),
  scannedByUser: userSchema.optional(),
});

const qrRosterItemSchema = z.object({
  user: userSchema,
  profile: qrProfileSchema.nullable(),
  todayDirections: z.array(qrAttendanceDirectionSchema),
});

const qrSummarySchema = z.object({
  eligibleUsers: z.number(),
  issuedProfiles: z.number(),
  activeProfiles: z.number(),
  scansToday: z.number(),
  studentProfiles: z.number(),
  teacherProfiles: z.number(),
});

const uploadPresignInputSchema = z.object({
  filename: z.string().min(1).max(200),
  contentType: z.string().min(1).max(120),
  folder: z.string().max(80).optional(),
});

const uploadPresignResponseSchema = z.object({
  key: z.string(),
  url: z.string().url(),
  expiresIn: z.number(),
  method: z.enum(["PUT"]),
});

const uploadDownloadResponseSchema = z.object({
  url: z.string().url(),
  expiresIn: z.number(),
});

const attendanceSummarySchema = z.object({
  totalRecords: z.number(),
  attendedRecords: z.number(),
  absentRecords: z.number(),
  lateRecords: z.number(),
  excusedRecords: z.number(),
  attendanceRate: z.number(),
  currentStreak: z.number(),
  monthlyTrend: z.array(
    z.object({
      label: z.string(),
      present: z.number(),
      absent: z.number(),
      late: z.number(),
      excused: z.number(),
      attendanceRate: z.number(),
    }),
  ),
  statusBreakdown: z.array(
    z.object({
      status: attendanceStatusSchema,
      count: z.number(),
    }),
  ),
});

const studentResultExamSchema = z.object({
  examId: z.string(),
  examTitle: z.string(),
  examType: z.string(),
  term: z.string(),
  examDate: z.string(),
  subjectsCount: z.number(),
  obtainedMarks: z.number(),
  totalMarks: z.number(),
  percentage: z.number(),
  gpa: z.number(),
  status: z.string(),
});

export const api = {
  auth: {
    login: {
      path: "/api/auth/login",
      method: "POST",
      input: z.object({ email: z.string().email(), password: z.string().min(1) }),
      responses: { 200: userSchema, 401: z.object({ message: z.string() }) },
    },
    register: {
      path: "/api/auth/register",
      method: "POST",
      input: userWriteSchema,
      responses: { 201: userSchema },
    },
    logout: {
      path: "/api/auth/logout",
      method: "POST",
      input: z.object({}).optional(),
      responses: { 200: z.object({ success: z.boolean().optional(), message: z.string().optional() }) },
    },
    me: {
      path: "/api/me",
      method: "GET",
      responses: { 200: userSchema },
    },
  },
  users: {
    list: {
      path: "/api/users",
      method: "GET",
      responses: { 200: z.array(userSchema) },
    },
    create: {
      path: "/api/users",
      method: "POST",
      input: userWriteSchema,
      responses: { 201: userSchema },
    },
    update: {
      path: "/api/users/:id",
      method: "PUT",
      input: userUpdateSchema,
      responses: { 200: userSchema },
    },
    delete: {
      path: "/api/users/:id",
      method: "DELETE",
      responses: { 200: z.object({ success: z.boolean().optional(), message: z.string().optional() }) },
    },
  },
  students: {
    list: {
      path: "/api/students",
      method: "GET",
      responses: { 200: z.array(userSchema) },
    },
  },
  teachers: {
    list: {
      path: "/api/teachers",
      method: "GET",
      responses: { 200: z.array(userSchema) },
    },
  },
  academics: {
    list: {
      path: "/api/academics",
      method: "GET",
      responses: { 200: z.array(academicSchema) },
    },
    create: {
      path: "/api/academics",
      method: "POST",
      input: insertAcademicSchema,
      responses: { 201: academicSchema },
    },
    update: {
      path: "/api/academics/:id",
      method: "PUT",
      input: insertAcademicSchema.partial(),
      responses: { 200: academicSchema },
    },
    delete: {
      path: "/api/academics/:id",
      method: "DELETE",
      responses: { 200: z.object({ success: z.boolean().optional(), message: z.string().optional() }) },
    },
  },
  attendance: {
    list: {
      path: "/api/attendance",
      method: "GET",
      responses: { 200: z.array(attendanceRecordSchema) },
    },
    create: {
      path: "/api/attendance",
      method: "POST",
      input: insertAttendanceSchema,
      responses: { 201: attendanceRecordSchema },
    },
  },
  results: {
    list: {
      path: "/api/results",
      method: "GET",
      responses: { 200: z.array(resultRecordSchema) },
    },
    create: {
      path: "/api/results",
      method: "POST",
      input: insertResultSchema,
      responses: { 201: resultRecordSchema },
    },
    update: {
      path: "/api/results/:id",
      method: "PUT",
      input: insertResultSchema.partial(),
      responses: { 200: resultRecordSchema },
    },
    delete: {
      path: "/api/results/:id",
      method: "DELETE",
      responses: { 200: z.object({ success: z.boolean().optional(), message: z.string().optional() }) },
    },
  },
  fees: {
    list: {
      path: "/api/fees",
      method: "GET",
      responses: { 200: z.array(feeSchema) },
    },
    detail: {
      path: "/api/fees/:id",
      method: "GET",
      responses: { 200: feeSchema },
    },
    create: {
      path: "/api/fees",
      method: "POST",
      input: createFeeInputSchema,
      responses: { 201: feeSchema },
    },
    update: {
      path: "/api/fees/:id",
      method: "PUT",
      input: updateFeeInputSchema,
      responses: { 200: feeSchema },
    },
    delete: {
      path: "/api/fees/:id",
      method: "DELETE",
      responses: { 200: z.object({ success: z.boolean().optional(), message: z.string().optional() }) },
    },
    payments: {
      list: {
        path: "/api/fees/payments",
        method: "GET",
        input: feePaymentListFiltersSchema,
        responses: { 200: z.array(feePaymentSchema) },
      },
      record: {
        path: "/api/fees/:id/payments",
        method: "POST",
        input: recordFeePaymentInputSchema,
        responses: { 201: feeSchema },
      },
      receipt: {
        path: "/api/fees/payments/:paymentId/receipt",
        method: "GET",
        responses: { 200: paymentReceiptSchema },
      },
    },
    balances: {
      summary: {
        path: "/api/fees/balances/summary",
        method: "GET",
        responses: { 200: feeBalanceSummarySchema },
      },
      overdue: {
        path: "/api/fees/balances/overdue",
        method: "GET",
        responses: { 200: z.array(overdueBalanceItemSchema) },
      },
      student: {
        path: "/api/fees/balances/students/:studentId",
        method: "GET",
        responses: { 200: studentBalanceSummarySchema },
      },
    },
    profiles: {
      list: {
        path: "/api/fees/profiles",
        method: "GET",
        responses: { 200: z.array(billingProfileSchema) },
      },
      upsert: {
        path: "/api/fees/profiles",
        method: "POST",
        input: billingProfileInputSchema,
        responses: { 200: billingProfileSchema },
      },
    },
    generateMonthly: {
      path: "/api/fees/generate-monthly",
      method: "POST",
      input: generateMonthlyFeesInputSchema,
      responses: {
        200: z.object({
          billingMonth: billingMonthSchema,
          generatedCount: z.number(),
          skippedDuplicates: z.number(),
          skippedMissingProfiles: z.number(),
          invoices: z.array(feeSchema),
          skippedStudents: z.array(
            z.object({
              studentId: z.number(),
              studentName: z.string(),
              reason: z.string(),
            }),
          ),
        }),
      },
    },
    report: {
      path: "/api/fees/report",
      method: "GET",
      input: z.object({
        month: billingMonthSchema.optional(),
        studentId: z.coerce.number().int().positive().optional(),
        status: feeStatusSchema.optional(),
      }),
      responses: { 200: financeReportSchema },
    },
    vouchers: {
      preview: {
        path: "/api/fees/vouchers/preview",
        method: "POST",
        input: financeVoucherPreviewInputSchema,
        responses: { 200: financeVoucherPreviewSchema },
      },
      start: {
        path: "/api/fees/vouchers/bulk-print",
        method: "POST",
        input: financeVoucherStartInputSchema,
        responses: { 201: financeVoucherOperationSchema },
      },
      recent: {
        path: "/api/fees/vouchers/operations",
        method: "GET",
        input: z.object({ limit: z.coerce.number().int().min(1).max(20).optional() }),
        responses: { 200: z.array(financeVoucherOperationSchema) },
      },
      detail: {
        path: "/api/fees/vouchers/operations/:operationId",
        method: "GET",
        responses: { 200: financeVoucherOperationSchema },
      },
      cancel: {
        path: "/api/fees/vouchers/operations/:operationId/cancel",
        method: "POST",
        input: z.object({}).optional(),
        responses: { 200: financeVoucherOperationSchema },
      },
      progress: {
        path: "/api/fees/vouchers/operations/:operationId/progress",
        method: "GET",
        responses: { 200: financeVoucherProgressSchema },
      },
      events: {
        path: "/api/fees/vouchers/operations/:operationId/events",
        method: "GET",
        responses: { 200: z.any() },
      },
      download: {
        path: "/api/fees/vouchers/operations/:operationId/download",
        method: "GET",
        responses: { 200: z.any() },
      },
    },
  },
  classes: {
    list: {
      path: "/api/v1/classes",
      method: "GET",
      input: z
        .object({
          academicYear: z.string().optional(),
          grade: z.string().optional(),
        })
        .optional(),
      responses: {
        200: z.object({
          data: z.array(classSchema),
          total: z.number(),
        }),
      },
    },
    teachers: {
      list: {
        path: "/api/v1/classes/:id/teachers",
        method: "GET",
        responses: {
          200: z.array(classTeacherSchema),
        },
      },
    },
  },
  uploads: {
    presign: {
      path: "/api/uploads/presign",
      method: "POST",
      input: uploadPresignInputSchema,
      responses: { 200: uploadPresignResponseSchema },
    },
    download: {
      path: "/api/uploads/presign",
      method: "GET",
      input: z.object({ key: z.string().min(1) }),
      responses: { 200: uploadDownloadResponseSchema },
    },
  },
  qrAttendance: {
    profiles: {
      list: {
        path: "/api/qr-attendance/profiles",
        method: "GET",
        responses: {
          200: apiEnvelope(
            z.object({
              roster: z.array(qrRosterItemSchema),
              summary: qrSummarySchema,
            }),
          ),
        },
      },
      issue: {
        path: "/api/qr-attendance/profiles/:userId/issue",
        method: "POST",
        input: z.object({}).optional(),
        responses: {
          200: apiEnvelope(
            z.object({
              profile: qrProfileSchema,
              token: z.string(),
            }),
          ),
        },
      },
      regenerate: {
        path: "/api/qr-attendance/profiles/:userId/regenerate",
        method: "POST",
        input: z.object({}).optional(),
        responses: {
          200: apiEnvelope(
            z.object({
              profile: qrProfileSchema,
              token: z.string(),
            }),
          ),
        },
      },
      updateStatus: {
        path: "/api/qr-attendance/profiles/:userId/status",
        method: "PATCH",
        input: z.object({ isActive: z.boolean() }),
        responses: {
          200: apiEnvelope(z.object({ profile: qrProfileSchema })),
        },
      },
    },
    history: {
      path: "/api/qr-attendance/history",
      method: "GET",
      input: z.object({
        userId: z.coerce.number().int().positive().optional(),
        role: z.enum(["student", "teacher"]).optional(),
        attendanceDate: z.string().optional(),
      }),
      responses: {
        200: apiEnvelope(z.object({ events: z.array(qrAttendanceEventSchema) })),
      },
    },
    myCard: {
      path: "/api/qr-attendance/me",
      method: "GET",
      responses: {
        200: apiEnvelope(
          z.object({
            profile: qrProfileSchema,
            token: z.string(),
            recentEvents: z.array(qrAttendanceEventSchema),
          }),
        ),
      },
    },
    portraitProxy: {
      path: "/api/qr-attendance/portrait-proxy",
      method: "GET",
      input: z.object({
        url: z.string().url(),
      }),
      responses: {
        200: z.any(),
      },
    },
    scan: {
      path: "/api/qr-attendance/scan",
      method: "POST",
      input: z.object({
        token: z.string().min(1),
        direction: qrAttendanceDirectionSchema.default("Check In"),
        status: qrAttendanceMarkStatusSchema.optional(),
        scanMethod: qrAttendanceMethodSchema.default("manual"),
        terminalLabel: z.string().max(80).optional().nullable(),
        notes: z.string().max(250).optional().nullable(),
      }),
      responses: {
        200: apiEnvelope(
          z.object({
            event: qrAttendanceEventSchema,
            duplicate: z.boolean(),
            attendanceRecord: attendanceRecordSchema.optional(),
          }),
        ),
      },
    },
  },
  dashboard: {
    adminStats: {
      path: "/api/dashboard/admin/stats",
      method: "GET",
      responses: {
        200: z.object({
          totalStudents: z.number(),
          totalTeachers: z.number(),
          feesCollected: z.number(),
          activeClasses: z.number(),
          outstandingFees: z.number(),
          pendingPayments: z.number(),
          overdueInvoices: z.number(),
          attendanceMarkedToday: z.number(),
          monthlyRevenue: z.array(z.object({ month: z.string(), revenue: z.number() })),
          recentActivity: z.array(
            z.object({
              id: z.string(),
              type: z.enum(["fee", "attendance"]),
              title: z.string(),
              description: z.string(),
              dateLabel: z.string(),
            }),
          ),
          recentVoucherOperations: z.array(financeVoucherOperationSchema),
        }),
      },
    },
    studentStats: {
      path: "/api/dashboard/student/stats",
      method: "GET",
      responses: {
        200: z.object({
          attendanceRate: z.number(),
          unpaidFees: z.number(),
          openInvoices: z.number(),
          overdueInvoices: z.number(),
        }),
      },
    },
    teacherStats: {
      path: "/api/dashboard/teacher/stats",
      method: "GET",
      responses: {
        200: z.object({
          totalStudents: z.number(),
          classesToday: z.number(),
          averageClassPerformance: z.number(),
        }),
      },
    },
  },
  settings: {
    publicGet: {
      path: "/api/settings/public",
      method: "GET",
      responses: { 200: publicSchoolSettingsSchema },
    },
    adminGet: {
      path: "/api/admin/settings",
      method: "GET",
      responses: { 200: adminSchoolSettingsResponseSchema },
    },
    update: {
      path: "/api/admin/settings",
      method: "PUT",
      input: updateSchoolSettingsInputSchema,
      responses: { 200: adminSchoolSettingsResponseSchema },
    },
    restore: {
      path: "/api/admin/settings/restore",
      method: "POST",
      input: restoreSchoolSettingsInputSchema,
      responses: { 200: adminSchoolSettingsResponseSchema },
    },
    import: {
      path: "/api/admin/settings/import",
      method: "POST",
      input: updateSchoolSettingsInputSchema,
      responses: { 200: adminSchoolSettingsResponseSchema },
    },
    export: {
      path: "/api/admin/settings/export",
      method: "GET",
      responses: { 200: exportSchoolSettingsResponseSchema },
    },
    timetableGet: {
      path: "/api/v1/timetables/settings",
      method: "GET",
      responses: { 
        200: z.any() 
      },
    },
    timetableUpdate: {
      path: "/api/v1/timetables/settings",
      method: "PUT",
      input: z.object({
        startTime: z.string(),
        endTime: z.string(),
        workingDays: z.array(z.number()),
        periodDuration: z.number(),
        breakAfterPeriod: z.array(z.number()),
        breakDuration: z.number(),
      }),
      responses: { 
        200: insertTimetableSettingsSchema.extend({ 
          id: z.number(),
          updatedAt: z.any() 
        }) 
      },
    },
  },
  student: {
    homework: {
      list: {
        path: "/api/student/teacher-homework",
        method: "GET",
        input: StudentHomeworkListQuerySchema.optional(),
        responses: { 200: homeworkEnvelope(z.array(studentHomeworkListItemSchema)) },
      },
    },
    attendance: {
      list: {
        path: "/api/student/attendance",
        method: "GET",
        responses: { 200: z.array(attendanceRecordSchema) },
      },
      summary: {
        path: "/api/student/attendance/summary",
        method: "GET",
        responses: { 200: attendanceSummarySchema },
      },
    },
    timetable: {
      list: {
        path: "/api/student/timetable",
        method: "GET",
        responses: {
          200: z.object({
            className: z.string(),
            items: z.array(timetableItemSchema),
            days: z.array(timetableDaySchema),
          }),
        },
      },
    },
    results: {
      list: {
        path: "/api/student/results",
        method: "GET",
        responses: {
          200: z.object({
            overview: z.object({
              currentGpa: z.number(),
              cumulativeGpa: z.number(),
              totalExams: z.number(),
              passRate: z.number(),
              strongestSubject: z.string().nullable(),
              weakestSubject: z.string().nullable(),
            }),
            exams: z.array(studentResultExamSchema),
            subjectPerformance: z.array(
              z.object({
                subject: z.string(),
                averageMarks: z.number(),
                averagePercentage: z.number(),
                latestGrade: z.string(),
              }),
            ),
            gradeDistribution: z.array(z.object({ grade: z.string(), count: z.number() })),
            trend: z.array(z.object({ label: z.string(), percentage: z.number(), gpa: z.number() })),
            recentResults: z.array(resultRecordSchema),
          }),
        },
      },
      detail: {
        path: "/api/student/results/:examId",
        method: "GET",
        responses: {
          200: z.object({
            exam: studentResultExamSchema,
            records: z.array(resultRecordSchema),
            generatedAt: z.string(),
          }),
        },
      },
    },
  },
  adminTimetables: {
    list: {
      path: "/api/v1/timetables",
      method: "GET",
      responses: {
        200: z.array(
          z.object({
            id: z.number(),
            classId: z.number(),
            status: z.enum(["draft", "published"]),
            publishedAt: z.string().nullable().optional(),
            fitnessScore: z.string().nullable().optional(),
            createdAt: z.string().nullable().optional(),
            updatedAt: z.string().nullable().optional(),
            class: classSchema.optional(),
          }),
        ),
      },
    },
    create: {
      path: "/api/v1/timetables",
      method: "POST",
      input: z.object({ classId: z.number().int().positive() }),
      responses: {
        201: z.object({
          id: z.number(),
          classId: z.number(),
          status: z.enum(["draft", "published"]),
          publishedAt: z.string().nullable().optional(),
          fitnessScore: z.string().nullable().optional(),
        }),
      },
    },
    getOne: {
      path: "/api/v1/timetables/:id",
      method: "GET",
      responses: {
        200: z.object({
          id: z.number(),
          classId: z.number(),
          status: z.enum(["draft", "published"]),
          publishedAt: z.string().nullable().optional(),
          fitnessScore: z.string().nullable().optional(),
          class: classSchema.optional(),
          periods: z.array(
            z.object({
              id: z.number(),
              timetableId: z.number(),
              dayOfWeek: z.number(),
              period: z.number(),
              subject: z.string().nullable().optional(),
              teacherId: z.number().nullable().optional(),
              room: z.string().nullable().optional(),
              isConflict: z.boolean(),
              teacherName: z.string().nullable().optional(),
            }),
          ),
        }),
      },
    },
    upsertPeriods: {
      path: "/api/v1/timetables/:id/periods",
      method: "PUT",
      input: z.object({
        periods: z.array(
          z.object({
            dayOfWeek: z.number().int().min(1).max(6),
            period: z.number().int().min(1).max(8),
            subject: z.string().nullable().optional(),
            teacherId: z.number().int().positive().nullable().optional(),
            room: z.string().nullable().optional(),
          }),
        ),
      }),
      responses: { 200: z.object({ success: z.boolean(), conflictCount: z.number() }) },
    },
    publish: {
      path: "/api/v1/timetables/:id/publish",
      method: "POST",
      input: z.object({}).optional(),
      responses: {
        200: z.object({
          id: z.number(),
          status: z.enum(["draft", "published"]),
          publishedAt: z.string().nullable().optional(),
          fitnessScore: z.string().nullable().optional(),
          conflictCount: z.number(),
        }),
      },
    },
  },
  teacher: {
    timetable: {
      mine: {
        path: "/api/v1/timetables/teacher/mine",
        method: "GET",
        responses: {
          200: z.array(
            z.object({
              id: z.number(),
              timetableId: z.number(),
              dayOfWeek: z.number(),
              period: z.number(),
              subject: z.string().nullable().optional(),
              teacherId: z.number().nullable().optional(),
              room: z.string().nullable().optional(),
              isConflict: z.boolean(),
              classId: z.number(),
              className: z.string(),
            }),
          ),
        },
      },
    },
    classes: {
      list: {
        path: "/api/teacher/classes",
        method: "GET",
        responses: { 200: z.array(teacherClassSchema) },
      },
    },
    attendance: {
      students: {
        path: "/api/teacher/attendance/students",
        method: "GET",
        responses: { 200: z.array(userSchema) },
      },
      history: {
        path: "/api/teacher/attendance/history",
        method: "GET",
        responses: { 200: z.array(attendanceRecordSchema) },
      },
      bulkUpsert: {
        path: "/api/teacher/attendance/bulk",
        method: "POST",
        input: z.object({
          className: z.string().min(1),
          date: z.string().min(1),
          session: attendanceSessionSchema.default("Full Day"),
          records: z
            .array(
              z.object({
                studentId: z.number().int().positive(),
                status: attendanceStatusSchema,
                remarks: z.string().max(250).optional().nullable(),
              }),
            )
            .min(1),
        }),
        responses: { 200: z.array(attendanceRecordSchema) },
      },
      update: {
        path: "/api/teacher/attendance/:id",
        method: "PUT",
        input: z.object({
          status: attendanceStatusSchema,
          session: attendanceSessionSchema.default("Full Day"),
          remarks: z.string().max(250).optional().nullable(),
        }),
        responses: { 200: attendanceRecordSchema },
      },
    },
    pulse: {
      today: {
        path: "/api/teacher/pulse/today",
        method: "GET",
        responses: { 200: teacherPulseTodayResponseSchema },
      },
      complete: {
        path: "/api/teacher/pulse/:id/complete",
        method: "PUT",
        input: teacherPulseMarkCompleteInputSchema,
        responses: { 200: z.object({ success: z.boolean() }) },
      },
    },
    homework: {
      classes: {
        path: "/api/teacher/homework/classes",
        method: "GET",
        responses: { 200: homeworkEnvelope(z.array(homeworkClassSchema)) },
      },
      list: {
        path: "/api/teacher/homework",
        method: "GET",
        input: HomeworkListQuerySchema.optional(),
        responses: { 200: homeworkEnvelope(z.array(homeworkListItemSchema)) },
      },
      create: {
        path: "/api/teacher/homework",
        method: "POST",
        input: CreateHomeworkSchema,
        responses: { 201: homeworkEnvelope(homeworkAssignmentSchema) },
      },
      detail: {
        path: "/api/teacher/homework/:id",
        method: "GET",
        responses: { 200: homeworkEnvelope(homeworkDetailSchema) },
      },
      update: {
        path: "/api/teacher/homework/:id",
        method: "PATCH",
        input: UpdateHomeworkSchema,
        responses: { 200: homeworkEnvelope(homeworkAssignmentSchema) },
      },
      cancel: {
        path: "/api/teacher/homework/:id",
        method: "DELETE",
        responses: {
          200: homeworkEnvelope(
            z.object({
              id: z.string(),
              status: homeworkStatusSchema,
            }),
          ),
        },
      },
      grade: {
        path: "/api/teacher/homework/:id/submissions/:submissionId",
        method: "PATCH",
        input: GradeSubmissionSchema,
        responses: { 200: homeworkEnvelope(homeworkSubmissionSchema) },
      },
    },
  },
  homeworkDiary: {
    admin: {
      create: {
        path: "/api/admin/homework-diary",
        method: "POST",
        input: z.object({
          classId: z.number().int().positive(),
          date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          entries: z.array(
            z.object({
              subject: z.string().min(1),
              topic: z.string().min(1),
              note: z.string().optional(),
            }),
          ),
        }),
        responses: {
          201: z.object({
            id: z.number(),
            classId: z.number(),
            date: z.string(),
            entries: z.any(),
            status: z.enum(["draft", "published"]),
            createdAt: z.string().optional(),
          }),
        },
      },
      getByClassDate: {
        path: "/api/admin/homework-diary/:classId/:date",
        method: "GET",
        responses: {
          200: z.object({
            id: z.number(),
            classId: z.number(),
            date: z.string(),
            entries: z.any(),
            status: z.enum(["draft", "published"]),
            createdAt: z.string().optional(),
          }).nullable(),
        },
      },
      update: {
        path: "/api/admin/homework-diary/:id",
        method: "PUT",
        input: z.object({
          entries: z.array(
            z.object({
              subject: z.string().min(1),
              topic: z.string().min(1),
              note: z.string().optional(),
            }),
          ).optional(),
          status: z.enum(["draft", "published"]).optional(),
        }),
        responses: {
          200: z.object({
            id: z.number(),
            classId: z.number(),
            date: z.string(),
            entries: z.any(),
            status: z.enum(["draft", "published"]),
            createdAt: z.string().optional(),
          }),
        },
      },
      delete: {
        path: "/api/admin/homework-diary/:id",
        method: "DELETE",
        responses: {
          200: z.object({ success: z.boolean() }),
        },
      },
    },
    student: {
      getByClassDate: {
        path: "/api/homework-diary/:classId/:date",
        method: "GET",
        responses: {
          200: z.object({
            id: z.number(),
            classId: z.number(),
            date: z.string(),
            entries: z.any(),
            status: z.enum(["draft", "published"]),
          }).nullable(),
        },
      },
      listByClass: {
        path: "/api/homework-diary/class/:classId",
        method: "GET",
        responses: {
          200: z.array(
            z.object({
              id: z.number(),
              classId: z.number(),
              date: z.string(),
              entries: z.any(),
              status: z.enum(["draft", "published"]),
            }),
          ),
        },
      },
    },
  },
  diaryTemplate: {
    admin: {
      create: {
        path: "/api/admin/diary-template",
        method: "POST",
        input: z.object({
          classId: z.number().int().positive(),
          title: z.string().min(1),
          questions: z.array(
            z.object({
              id: z.string(),
              subject: z.string().min(1),
              question: z.string().min(1),
              type: z.enum(["text", "richtext", "checkbox"]),
            }),
          ),
        }),
        responses: {
          201: z.object({
            id: z.number(),
            classId: z.number(),
            title: z.string(),
            questions: z.any(),
          }),
        },
      },
      list: {
        path: "/api/admin/diary-template/:classId",
        method: "GET",
        responses: {
          200: z.array(
            z.object({
              id: z.number(),
              classId: z.number(),
              title: z.string(),
              questions: z.any(),
              createdAt: z.string().optional(),
              updatedAt: z.string().optional(),
            }),
          ),
        },
      },
      update: {
        path: "/api/admin/diary-template/:id",
        method: "PUT",
        input: z.object({
          title: z.string().optional(),
          questions: z.array(
            z.object({
              id: z.string(),
              subject: z.string().min(1),
              question: z.string().min(1),
              type: z.enum(["text", "richtext", "checkbox"]),
            }),
          ).optional(),
        }),
        responses: {
          200: z.object({
            id: z.number(),
            classId: z.number(),
            title: z.string(),
            questions: z.any(),
          }),
        },
      },
    },
  },
  dailyDiary: {
    admin: {
      create: {
        path: "/api/admin/daily-diary",
        method: "POST",
        input: z.object({
          templateId: z.number().int().positive(),
          classId: z.number().int().positive(),
          date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          content: z.array(
            z.object({
              questionId: z.string(),
              answer: z.string(),
            }),
          ),
        }),
        responses: {
          201: z.object({
            id: z.number(),
            templateId: z.number(),
            classId: z.number(),
            date: z.string(),
            content: z.any(),
            status: z.enum(["draft", "published"]),
          }),
        },
      },
      getByDate: {
        path: "/api/admin/daily-diary/:classId/:date",
        method: "GET",
        responses: {
          200: z.object({
            id: z.number(),
            templateId: z.number(),
            classId: z.number(),
            date: z.string(),
            content: z.any(),
            status: z.enum(["draft", "published"]),
          }).nullable(),
        },
      },
      update: {
        path: "/api/admin/daily-diary/:id",
        method: "PUT",
        input: z.object({
          content: z.array(
            z.object({
              questionId: z.string(),
              answer: z.string(),
            }),
          ).optional(),
          status: z.enum(["draft", "published"]).optional(),
        }),
        responses: {
          200: z.object({
            id: z.number(),
            templateId: z.number(),
            classId: z.number(),
            date: z.string(),
            content: z.any(),
            status: z.enum(["draft", "published"]),
          }),
        },
      },
      delete: {
        path: "/api/admin/daily-diary/:id",
        method: "DELETE",
        responses: {
          200: z.object({ success: z.boolean() }),
        },
      },
    },
    student: {
      getByDate: {
        path: "/api/daily-diary/:classId/:date",
        method: "GET",
        responses: {
          200: z.object({
            id: z.number(),
            templateId: z.number(),
            classId: z.number(),
            date: z.string(),
            content: z.any(),
            status: z.enum(["draft", "published"]),
          }).nullable(),
        },
      },
      listByClass: {
        path: "/api/daily-diary/class/:classId",
        method: "GET",
        responses: {
          200: z.array(
            z.object({
              id: z.number(),
              templateId: z.number(),
              classId: z.number(),
              date: z.string(),
              content: z.any(),
              status: z.enum(["draft", "published"]),
            }),
          ),
        },
      },
    },
  },
} as const;

export type ApiRoutes = typeof api;

export const errorSchemas = {
  default: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
};

export function buildUrl(path: string, params: Record<string, string | number>) {
  let url = path;
  for (const [key, value] of Object.entries(params)) {
    url = url.replace(`:${key}`, String(value));
  }
  return url;
}
