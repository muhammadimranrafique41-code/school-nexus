import { z } from "zod";
import {
  insertAcademicSchema,
  insertAttendanceSchema,
  insertResultSchema,
  insertUserSchema,
  attendanceSessionSchema,
  attendanceStatusSchema,
  timetableDaySchema,
} from "./schema.js";
import {
  billingMonthSchema,
  billingProfileInputSchema,
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

const userSchema = z.object({
  id: z.number(),
  name: z.string(),
  email: z.string(),
  role: z.string(),
  subject: z.string().nullable().optional(),
  className: z.string().nullable().optional(),
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
      outstandingBalance: z.number(),
      overdueBalance: z.number(),
      invoiceCount: z.number(),
    }),
  ),
  invoices: z.array(feeSchema),
  payments: z.array(feePaymentSchema),
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
      input: insertUserSchema,
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
      input: insertUserSchema,
      responses: { 201: userSchema },
    },
    update: {
      path: "/api/users/:id",
      method: "PUT",
      input: insertUserSchema.partial(),
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
      record: {
        path: "/api/fees/:id/payments",
        method: "POST",
        input: recordFeePaymentInputSchema,
        responses: { 201: feeSchema },
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
  },
  student: {
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
  teacher: {
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