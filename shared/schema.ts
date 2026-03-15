import { sql } from "drizzle-orm";
import { pgTable, text, serial, integer, jsonb, boolean, uniqueIndex, timestamp, date, index, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import type { FeeLineItem, FeeStatus, FinanceVoucherOperationStatus, PaymentMethod } from "./finance.js";
import type { SchoolSettingsAuditAction, SchoolSettingsData } from "./settings.js";

export const attendanceStatuses = ["Present", "Absent", "Late", "Excused"] as const;
export const attendanceSessions = ["Full Day", "Morning", "Afternoon"] as const;
export const timetableDays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
export const qrAttendanceDirections = ["Check In", "Check Out"] as const;
export const qrAttendanceMethods = ["camera", "manual"] as const;
export const qrAttendanceMarkStatuses = ["Present", "Late"] as const;

export const dailyTeachingPulseStatuses = ["scheduled", "completed", "missed", "cancelled"] as const;

export const attendanceStatusSchema = z.enum(attendanceStatuses);
export const attendanceSessionSchema = z.enum(attendanceSessions);
export const timetableDaySchema = z.enum(timetableDays);
export const qrAttendanceDirectionSchema = z.enum(qrAttendanceDirections);
export const qrAttendanceMethodSchema = z.enum(qrAttendanceMethods);
export const qrAttendanceMarkStatusSchema = z.enum(qrAttendanceMarkStatuses);
export const dailyTeachingPulseStatusSchema = z.enum(dailyTeachingPulseStatuses);

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  role: text("role").notNull(), // 'admin', 'teacher', 'student'
  subject: text("subject"), // For teachers
  designation: text("designation"), // For teachers
  department: text("department"), // For teachers
  employeeId: text("employee_id"), // For teachers
  teacherPhotoUrl: text("teacher_photo_url"), // For teachers
  className: text("class_name"), // For students
  fatherName: text("father_name"), // For students
  studentPhotoUrl: text("student_photo_url"), // For students
});

export const sessions = pgTable("session", {
  sid: text("sid").primaryKey(),
  sess: jsonb("sess").notNull(),
  expire: timestamp("expire", { withTimezone: true }).notNull(),
});

export const students = pgTable("students", {
  userId: integer("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  className: text("class_name").notNull(),
});

export const teachers = pgTable("teachers", {
  userId: integer("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  subject: text("subject").notNull(),
});

export const academics = pgTable("academics", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  code: text("code").notNull().unique(),
  description: text("description"),
  className: text("class_name"),
  teacherUserId: integer("teacher_user_id").references(() => teachers.userId, {
    onDelete: "set null",
  }),
});

export const attendance = pgTable("attendance", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  teacherId: integer("teacher_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  date: text("date").notNull(), // YYYY-MM-DD
  status: text("status").notNull(), // 'Present', 'Absent', 'Late', 'Excused'
  session: text("session").notNull().default("Full Day"),
  remarks: text("remarks"),
});

export const qrProfiles = pgTable(
  "qr_profiles",
  {
    userId: integer("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    publicId: text("public_id").notNull(),
    tokenCiphertext: text("token_ciphertext").notNull(),
    tokenHash: text("token_hash").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    issuedAt: text("issued_at").notNull(),
    regeneratedAt: text("regenerated_at").notNull(),
    lastUsedAt: text("last_used_at"),
    lastUsedBy: integer("last_used_by").references(() => users.id, { onDelete: "set null" }),
    generatedBy: integer("generated_by").references(() => users.id, { onDelete: "set null" }),
  },
  (table) => ({
    publicIdIdx: uniqueIndex("qr_profiles_public_id_idx").on(table.publicId),
    tokenHashIdx: uniqueIndex("qr_profiles_token_hash_idx").on(table.tokenHash),
  }),
);

export const qrAttendanceEvents = pgTable(
  "qr_attendance_events",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    scannedBy: integer("scanned_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    attendanceDate: text("attendance_date").notNull(),
    scannedAt: text("scanned_at").notNull(),
    roleSnapshot: text("role_snapshot").notNull(),
    direction: text("direction").$type<(typeof qrAttendanceDirections)[number]>().notNull(),
    status: text("status").$type<((typeof qrAttendanceMarkStatuses)[number]) | null>(),
    scanMethod: text("scan_method").$type<(typeof qrAttendanceMethods)[number]>().notNull(),
    terminalLabel: text("terminal_label"),
    notes: text("notes"),
  },
  (table) => ({
    userDayDirectionIdx: uniqueIndex("qr_attendance_events_user_day_direction_idx").on(
      table.userId,
      table.attendanceDate,
      table.direction,
    ),
  }),
);

export const results = pgTable("results", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  subject: text("subject").notNull(),
  marks: integer("marks").notNull(),
  grade: text("grade").notNull(),
  totalMarks: integer("total_marks"),
  examTitle: text("exam_title"),
  examType: text("exam_type"),
  term: text("term"),
  examDate: text("exam_date"),
  remarks: text("remarks"),
});

export const timetable = pgTable("timetable", {
  id: serial("id").primaryKey(),
  academicId: integer("academic_id").references(() => academics.id, { onDelete: "set null" }),
  className: text("class_name").notNull(),
  dayOfWeek: text("day_of_week").notNull(),
  periodLabel: text("period_label").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  room: text("room"),
  classType: text("class_type"),
  teacherId: integer("teacher_id").references(() => users.id, { onDelete: "set null" }),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const timetableStatusEnum = ["draft", "published"] as const;
export type TimetableStatus = (typeof timetableStatusEnum)[number];

export const timetables = pgTable(
  "timetables",
  {
    id: serial("id").primaryKey(),
    classId: integer("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    status: text("status").$type<TimetableStatus>().notNull().default("draft"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    fitnessScore: numeric("fitness_score", { precision: 5, scale: 2 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    uniqueClassIdx: uniqueIndex("timetables_class_id_idx").on(table.classId),
  }),
);

export const timetablesPeriods = pgTable(
  "timetables_periods",
  {
    id: serial("id").primaryKey(),
    timetableId: integer("timetable_id")
      .notNull()
      .references(() => timetables.id, { onDelete: "cascade" }),
    dayOfWeek: integer("day_of_week").notNull(), // 1=Mon … 6=Sat
    period: integer("period").notNull(),         // 1–8
    subject: text("subject"),
    teacherId: integer("teacher_id").references(() => users.id, { onDelete: "set null" }),
    room: text("room"),
    isConflict: boolean("is_conflict").notNull().default(false),
  },
  (table) => ({
    uniquePeriodIdx: uniqueIndex("timetables_periods_timetable_day_period_idx").on(
      table.timetableId,
      table.dayOfWeek,
      table.period,
    ),
  }),
);

export const fees = pgTable("fees", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  amount: integer("amount").notNull(),
  paidAmount: integer("paid_amount").notNull().default(0),
  remainingBalance: integer("remaining_balance").notNull().default(0),
  dueDate: text("due_date").notNull(),
  status: text("status").$type<FeeStatus>().notNull().default("Unpaid"),
  invoiceNumber: text("invoice_number"),
  billingMonth: text("billing_month").notNull(),
  billingPeriod: text("billing_period").notNull(),
  description: text("description").notNull(),
  feeType: text("fee_type").notNull().default("Monthly Fee"),
  source: text("source").notNull().default("manual"),
  generatedMonth: text("generated_month"),
  lineItems: jsonb("line_items").$type<FeeLineItem[]>().notNull().default(sql`'[]'::jsonb`),
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => ({
  invoiceNumberIdx: uniqueIndex("fees_invoice_number_idx").on(table.invoiceNumber),
  monthlyGenerationIdx: uniqueIndex("fees_student_generated_month_idx").on(table.studentId, table.generatedMonth),
}));

export const feePayments = pgTable(
  "fee_payments",
  {
    id: serial("id").primaryKey(),
    feeId: integer("fee_id")
      .notNull()
      .references(() => fees.id, { onDelete: "cascade" }),
    studentId: integer("student_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    amount: integer("amount").notNull(),
    paymentDate: text("payment_date").notNull(),
    method: text("method").$type<PaymentMethod>().notNull(),
    receiptNumber: text("receipt_number"),
    reference: text("reference"),
    notes: text("notes"),
    createdAt: text("created_at").notNull(),
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
  },
  (table) => ({
    receiptNumberIdx: uniqueIndex("fee_payments_receipt_number_idx").on(table.receiptNumber),
  }),
);

export const studentBillingProfiles = pgTable("student_billing_profiles", {
  studentId: integer("student_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  monthlyAmount: integer("monthly_amount").notNull(),
  dueDay: integer("due_day").notNull().default(5),
  isActive: boolean("is_active").notNull().default(true),
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const financeVoucherOperations = pgTable("finance_voucher_operations", {
  id: serial("id").primaryKey(),
  requestedBy: integer("requested_by").references(() => users.id, { onDelete: "set null" }),
  status: text("status").$type<FinanceVoucherOperationStatus>().notNull().default("queued"),
  billingMonths: jsonb("billing_months").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  classNames: jsonb("class_names").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  studentIds: jsonb("student_ids").$type<number[]>().notNull().default(sql`'[]'::jsonb`),
  force: boolean("force").notNull().default(false),
  totalInvoices: integer("total_invoices").notNull().default(0),
  generatedCount: integer("generated_count").notNull().default(0),
  skippedCount: integer("skipped_count").notNull().default(0),
  failedCount: integer("failed_count").notNull().default(0),
  archiveSizeBytes: integer("archive_size_bytes").notNull().default(0),
  errorMessage: text("error_message"),
  startedAt: text("started_at"),
  completedAt: text("completed_at"),
  cancelledAt: text("cancelled_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const financeVouchers = pgTable("finance_vouchers", {
  id: serial("id").primaryKey(),
  feeId: integer("fee_id")
    .notNull()
    .references(() => fees.id, { onDelete: "cascade" }),
  operationId: integer("operation_id").references(() => financeVoucherOperations.id, { onDelete: "set null" }),
  documentNumber: text("document_number").notNull(),
  fileName: text("file_name").notNull(),
  billingMonth: text("billing_month").notNull(),
  generationVersion: integer("generation_version").notNull().default(1),
  generatedAt: text("generated_at").notNull(),
  generatedBy: integer("generated_by").references(() => users.id, { onDelete: "set null" }),
}, (table) => ({
  feeIdx: uniqueIndex("finance_vouchers_fee_idx").on(table.feeId),
  documentNumberIdx: uniqueIndex("finance_vouchers_document_number_idx").on(table.documentNumber),
}));

export const schoolSettings = pgTable("school_settings", {
  id: serial("id").primaryKey(),
  version: integer("version").notNull().default(1),
  data: jsonb("data").$type<SchoolSettingsData>().notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  updatedBy: integer("updated_by").references(() => users.id, { onDelete: "set null" }),
});

export const schoolSettingsVersions = pgTable("school_settings_versions", {
  id: serial("id").primaryKey(),
  settingsId: integer("settings_id")
    .notNull()
    .references(() => schoolSettings.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  data: jsonb("data").$type<SchoolSettingsData>().notNull(),
  changeSummary: text("change_summary"),
  createdAt: text("created_at").notNull(),
  createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
});

export const schoolSettingsAuditLogs = pgTable("school_settings_audit_logs", {
  id: serial("id").primaryKey(),
  settingsId: integer("settings_id")
    .notNull()
    .references(() => schoolSettings.id, { onDelete: "cascade" }),
  action: text("action").$type<SchoolSettingsAuditAction>().notNull(),
  category: text("category"),
  fieldPath: text("field_path"),
  previousValue: text("previous_value"),
  nextValue: text("next_value"),
  changeSummary: text("change_summary"),
  createdAt: text("created_at").notNull(),
  createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
});

export const classes = pgTable(
  "classes",
  {
    id: serial("id").primaryKey(),
    grade: text("grade").notNull(),
    section: text("section").notNull(),
    stream: text("stream"),
    academicYear: text("academic_year").notNull(),
    capacity: integer("capacity").notNull().default(40),
    currentCount: integer("current_count").notNull().default(0),
    homeroomTeacherId: integer("homeroom_teacher_id").references(() => users.id, {
      onDelete: "set null",
    }),
    status: text("status").notNull().default("active"),
  },
  (table) => ({
    uniqueClassIdx: uniqueIndex("classes_grade_section_stream_year_idx").on(
      table.grade,
      table.section,
      table.stream,
      table.academicYear,
    ),
  }),
);

export const classTeachers = pgTable(
  "class_teachers",
  {
    id: serial("id").primaryKey(),
    classId: integer("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    teacherId: integer("teacher_id")
      .notNull()
      .references(() => users.id),
    subjects: text("subjects").array().notNull(),
    periodsPerWeek: integer("periods_per_week").notNull().default(4),
    priority: integer("priority").notNull().default(3),
    isActive: boolean("is_active").notNull().default(true),
  },
  (table) => ({
    uniqueClassTeacherSubjectsIdx: uniqueIndex("class_teachers_class_teacher_subjects_idx").on(
      table.classId,
      table.teacherId,
      table.subjects,
    ),
  }),
);

export const dailyTeachingPulse = pgTable(
  "daily_teaching_pulse",
  {
    id: serial("id").primaryKey(),
    teacherId: integer("teacher_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    classId: integer("class_id")
      .notNull()
      .references(() => classes.id),
    subject: text("subject").notNull(),
    period: integer("period").notNull(),
    startTime: text("start_time").notNull(),
    endTime: text("end_time").notNull(),
    room: text("room"),
    date: date("date").notNull(),
    status: text("status")
      .$type<(typeof dailyTeachingPulseStatuses)[number]>()
      .notNull()
      .default("scheduled"),
    markedAt: timestamp("marked_at", { withTimezone: true }),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    idxTeacherDate: index("idx_pulse_teacher_date").on(table.teacherId, table.date),
    idxDate: index("idx_pulse_date").on(table.date),
  }),
);

export const timetableSettings = pgTable("timetable_settings", {
  id: serial("id").primaryKey(),
  schoolId: integer("school_id").notNull().default(1).unique(),
  startTime: text("start_time").notNull().default("08:00"),
  endTime: text("end_time").notNull().default("15:00"),
  workingDays: integer("working_days").array().notNull().default([1, 2, 3, 4, 5, 6]),
  periodDuration: integer("period_duration").notNull().default(45),
  breakAfterPeriod: integer("break_after_period").array().notNull().default([4]),
  breakDuration: integer("break_duration").notNull().default(15),
  totalPeriods: integer("total_periods").notNull().default(8),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const timetableSettingsVersion = pgTable("timetable_settings_version", {
  id: serial("id").primaryKey(),
  settingsId: integer("settings_id").notNull().references(() => timetableSettings.id, { onDelete: "cascade" }),
  changedAt: timestamp("changed_at", { withTimezone: true }).defaultNow(),
  changedBy: integer("changed_by").references(() => users.id, { onDelete: "set null" }),
  snapshot: jsonb("snapshot").notNull(),
});

export const homeworkDiaryStatusEnum = ["draft", "published"] as const;
export type HomeworkDiaryStatus = (typeof homeworkDiaryStatusEnum)[number];

export const homeworkDiary = pgTable(
  "homework_diary",
  {
    id: serial("id").primaryKey(),
    classId: integer("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    entries: jsonb("entries")
      .$type<
        {
          subject: string;
          topic: string;
          note?: string;
        }[]
      >()
      .notNull()
      .default(sql`'[]'::jsonb`),
    status: text("status").$type<HomeworkDiaryStatus>().notNull().default("draft"),
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    uniqueClassDateIdx: uniqueIndex("homework_diary_class_id_date_idx").on(table.classId, table.date),
  }),
);

const optionalUserTextFieldSchema = z.preprocess(
  (value) => typeof value === "string" ? value.trim() || null : value,
  z.string().max(120).nullable().optional(),
);

const optionalPhotoUrlSchema = (label: string) => z.preprocess(
  (value) => typeof value === "string" ? value.trim() || null : value,
  z.string().url(`${label} must be a valid URL`).max(500).nullable().optional(),
);

const optionalTeacherPhotoUrlSchema = optionalPhotoUrlSchema("Teacher photo URL");
const optionalStudentPhotoUrlSchema = z.preprocess(
  (value) => typeof value === "string" ? value.trim() || null : value,
  z.string().url("Student photo URL must be a valid URL").max(500).nullable().optional(),
);

export const insertUserSchema = createInsertSchema(users)
  .omit({ id: true })
  .extend({
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
export const insertStudentSchema = createInsertSchema(students);
export const insertTeacherSchema = createInsertSchema(teachers);
export const insertAcademicSchema = createInsertSchema(academics).omit({ id: true });
export const insertAttendanceSchema = createInsertSchema(attendance).omit({ id: true });
export const insertQrProfileSchema = createInsertSchema(qrProfiles);
export const insertQrAttendanceEventSchema = createInsertSchema(qrAttendanceEvents).omit({ id: true });
export const insertResultSchema = createInsertSchema(results).omit({ id: true });
export const insertTimetableSchema = createInsertSchema(timetable).omit({ id: true });
export const insertTimetablesSchema = createInsertSchema(timetables).omit({ id: true, createdAt: true, updatedAt: true });
export const insertTimetablesPeriodSchema = createInsertSchema(timetablesPeriods).omit({ id: true });
export const insertFeeSchema = createInsertSchema(fees).omit({ id: true });
export const insertFeePaymentSchema = createInsertSchema(feePayments).omit({ id: true });
export const insertStudentBillingProfileSchema = createInsertSchema(studentBillingProfiles);
export const insertFinanceVoucherOperationSchema = createInsertSchema(financeVoucherOperations).omit({ id: true });
export const insertFinanceVoucherSchema = createInsertSchema(financeVouchers).omit({ id: true });
export const insertClassSchema = createInsertSchema(classes).omit({ id: true });
export const insertClassTeacherSchema = createInsertSchema(classTeachers).omit({ id: true });
export const insertDailyTeachingPulseSchema = createInsertSchema(dailyTeachingPulse).omit({
  id: true,
  createdAt: true,
  markedAt: true,
});
export const insertTimetableSettingsSchema = createInsertSchema(timetableSettings).omit({ id: true });
export const insertTimetableSettingsVersionSchema = createInsertSchema(timetableSettingsVersion).omit({ id: true });
export const insertHomeworkDiarySchema = createInsertSchema(homeworkDiary).omit({ id: true, createdAt: true });

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Student = typeof students.$inferSelect;
export type InsertStudent = z.infer<typeof insertStudentSchema>;
export type Teacher = typeof teachers.$inferSelect;
export type InsertTeacher = z.infer<typeof insertTeacherSchema>;
export type Academic = typeof academics.$inferSelect;
export type InsertAcademic = z.infer<typeof insertAcademicSchema>;
export type Attendance = typeof attendance.$inferSelect;
export type InsertAttendance = z.infer<typeof insertAttendanceSchema>;
export type QrProfile = typeof qrProfiles.$inferSelect;
export type InsertQrProfile = z.infer<typeof insertQrProfileSchema>;
export type QrAttendanceEvent = typeof qrAttendanceEvents.$inferSelect;
export type InsertQrAttendanceEvent = z.infer<typeof insertQrAttendanceEventSchema>;
export type Result = typeof results.$inferSelect;
export type InsertResult = z.infer<typeof insertResultSchema>;
export type Timetable = typeof timetable.$inferSelect;
export type InsertTimetable = z.infer<typeof insertTimetableSchema>;
export type TimetableRecord = typeof timetables.$inferSelect;
export type InsertTimetableRecord = z.infer<typeof insertTimetablesSchema>;
export type TimetablePeriod = typeof timetablesPeriods.$inferSelect;
export type InsertTimetablePeriod = z.infer<typeof insertTimetablesPeriodSchema>;
export type Fee = typeof fees.$inferSelect;
export type InsertFee = z.infer<typeof insertFeeSchema>;
export type FeePayment = typeof feePayments.$inferSelect;
export type InsertFeePayment = z.infer<typeof insertFeePaymentSchema>;
export type StudentBillingProfile = typeof studentBillingProfiles.$inferSelect;
export type InsertStudentBillingProfile = z.infer<typeof insertStudentBillingProfileSchema>;
export type FinanceVoucherOperation = typeof financeVoucherOperations.$inferSelect;
export type InsertFinanceVoucherOperation = z.infer<typeof insertFinanceVoucherOperationSchema>;
export type FinanceVoucher = typeof financeVouchers.$inferSelect;
export type InsertFinanceVoucher = z.infer<typeof insertFinanceVoucherSchema>;
export type SchoolSettings = typeof schoolSettings.$inferSelect;
export type SchoolSettingsVersion = typeof schoolSettingsVersions.$inferSelect;
export type SchoolSettingsAuditLog = typeof schoolSettingsAuditLogs.$inferSelect;
export type Class = typeof classes.$inferSelect;
export type InsertClass = z.infer<typeof insertClassSchema>;
export type ClassTeacher = typeof classTeachers.$inferSelect;
export type InsertClassTeacher = z.infer<typeof insertClassTeacherSchema>;
export type DailyTeachingPulse = typeof dailyTeachingPulse.$inferSelect;
export type InsertDailyTeachingPulse = z.infer<typeof insertDailyTeachingPulseSchema>;
export type TimetableSettings = typeof timetableSettings.$inferSelect;
export type InsertTimetableSettings = z.infer<typeof insertTimetableSettingsSchema>;
export type TimetableSettingsVersion = typeof timetableSettingsVersion.$inferSelect;
export type InsertTimetableSettingsVersion = z.infer<typeof insertTimetableSettingsVersionSchema>;
export type HomeworkDiary = typeof homeworkDiary.$inferSelect;
export type InsertHomeworkDiary = z.infer<typeof insertHomeworkDiarySchema>;

export type AttendanceWithStudent = Attendance & { student?: User; teacher?: User };
export type QrProfileWithUser = QrProfile & {
  user?: User;
  generatedByUser?: User;
  lastUsedByUser?: User;
};
export type QrAttendanceEventWithUser = QrAttendanceEvent & {
  user?: User;
  scannedByUser?: User;
};
export type ResultWithStudent = Result & { student?: User };
export type FeePaymentWithMeta = FeePayment & { createdByUser?: User };
export type FeeWithStudent = Fee & { student?: User; payments?: FeePaymentWithMeta[] };
export type StudentBillingProfileWithStudent = StudentBillingProfile & { student?: User };
export type FinanceVoucherOperationWithMeta = FinanceVoucherOperation & { requestedByUser?: User };
export type FinanceVoucherWithMeta = FinanceVoucher & { generatedByUser?: User };
export type AcademicWithTeacher = Academic & { teacher?: User };
export type TimetableWithDetails = Timetable & {
  academic?: Academic;
  teacher?: User;
};
