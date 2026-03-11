import { sql } from "drizzle-orm";
import { pgTable, text, serial, integer, jsonb, boolean, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import type { FeeLineItem, FeeStatus, PaymentMethod } from "./finance.js";
import type { SchoolSettingsAuditAction, SchoolSettingsData } from "./settings.js";

export const attendanceStatuses = ["Present", "Absent", "Late", "Excused"] as const;
export const attendanceSessions = ["Full Day", "Morning", "Afternoon"] as const;
export const timetableDays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
export const qrAttendanceDirections = ["Check In", "Check Out"] as const;
export const qrAttendanceMethods = ["camera", "manual"] as const;
export const qrAttendanceMarkStatuses = ["Present", "Late"] as const;

export const attendanceStatusSchema = z.enum(attendanceStatuses);
export const attendanceSessionSchema = z.enum(attendanceSessions);
export const timetableDaySchema = z.enum(timetableDays);
export const qrAttendanceDirectionSchema = z.enum(qrAttendanceDirections);
export const qrAttendanceMethodSchema = z.enum(qrAttendanceMethods);
export const qrAttendanceMarkStatusSchema = z.enum(qrAttendanceMarkStatuses);

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  role: text("role").notNull(), // 'admin', 'teacher', 'student'
  subject: text("subject"), // For teachers
  className: text("class_name"), // For students
  fatherName: text("father_name"), // For students
  studentPhotoUrl: text("student_photo_url"), // For students
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

const optionalUserTextFieldSchema = z.preprocess(
  (value) => typeof value === "string" ? value.trim() || null : value,
  z.string().max(120).nullable().optional(),
);

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
export const insertFeeSchema = createInsertSchema(fees).omit({ id: true });
export const insertFeePaymentSchema = createInsertSchema(feePayments).omit({ id: true });
export const insertStudentBillingProfileSchema = createInsertSchema(studentBillingProfiles);

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
export type Fee = typeof fees.$inferSelect;
export type InsertFee = z.infer<typeof insertFeeSchema>;
export type FeePayment = typeof feePayments.$inferSelect;
export type InsertFeePayment = z.infer<typeof insertFeePaymentSchema>;
export type StudentBillingProfile = typeof studentBillingProfiles.$inferSelect;
export type InsertStudentBillingProfile = z.infer<typeof insertStudentBillingProfileSchema>;
export type SchoolSettings = typeof schoolSettings.$inferSelect;
export type SchoolSettingsVersion = typeof schoolSettingsVersions.$inferSelect;
export type SchoolSettingsAuditLog = typeof schoolSettingsAuditLogs.$inferSelect;

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
export type AcademicWithTeacher = Academic & { teacher?: User };
export type TimetableWithDetails = Timetable & {
  academic?: Academic;
  teacher?: User;
};
