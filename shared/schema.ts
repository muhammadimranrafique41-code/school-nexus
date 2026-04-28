import { relations, sql } from "drizzle-orm";
import {
  pgTable,
  text,
  serial,
  integer,
  jsonb,
  boolean,
  uniqueIndex,
  timestamp,
  date,
  index,
  numeric,
  uuid,
  varchar,
  pgEnum,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import type {
  FeeLineItem,
  FeeStatus,
  FinanceVoucherOperationStatus,
  PaymentMethod,
  // ── NEW consolidated voucher types (defined in finance.ts) ──
  ConsolidatedFeeRow,
  ConsolidatedSummary,
} from "./finance.js";
import type {
  SchoolSettingsAuditAction,
  SchoolSettingsData,
} from "./settings.js";

// ─────────────────────────────────────────────────────────────────────────────
// ENUMS & CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

export const attendanceStatuses = [
  "Present",
  "Absent",
  "Late",
  "Excused",
] as const;
export const attendanceSessions = [
  "Full Day",
  "Morning",
  "Afternoon",
] as const;
export const timetableDays = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;
export const qrAttendanceDirections = ["Check In", "Check Out"] as const;
export const qrAttendanceMethods = ["camera", "manual"] as const;
export const qrAttendanceMarkStatuses = ["Present", "Late"] as const;
export const dailyTeachingPulseStatuses = [
  "scheduled",
  "completed",
  "missed",
  "cancelled",
] as const;

export const attendanceStatusSchema = z.enum(attendanceStatuses);
export const attendanceSessionSchema = z.enum(attendanceSessions);
export const timetableDaySchema = z.enum(timetableDays);
export const qrAttendanceDirectionSchema = z.enum(qrAttendanceDirections);
export const qrAttendanceMethodSchema = z.enum(qrAttendanceMethods);
export const qrAttendanceMarkStatusSchema = z.enum(qrAttendanceMarkStatuses);
export const dailyTeachingPulseStatusSchema = z.enum(
  dailyTeachingPulseStatuses
);

export type FamilyGuardianContact = {
  name?: string | null;
  relation?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
};

export type FamilyGuardianDetails = {
  primary?: FamilyGuardianContact | null;
  secondary?: FamilyGuardianContact | null;
  notes?: string | null;
};

// ─────────────────────────────────────────────────────────────────────────────
// CORE TABLES (unchanged)
// ─────────────────────────────────────────────────────────────────────────────

export const families = pgTable("families", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  guardianDetails: jsonb("guardian_details")
    .$type<FamilyGuardianDetails>()
    .notNull()
    .default(sql`'{}'::jsonb`),
  walletBalance: numeric("wallet_balance", { precision: 12, scale: 2 })
    .notNull()
    .default("0"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
});

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  role: text("role").notNull(), // 'admin' | 'teacher' | 'student'
  subject: text("subject"),
  designation: text("designation"),
  department: text("department"),
  employeeId: text("employee_id"),
  teacherPhotoUrl: text("teacher_photo_url"),
  className: text("class_name"),
  fatherName: text("father_name"),
  studentPhotoUrl: text("student_photo_url"),
  rollNumber: text("roll_number"),
  dateOfBirth: text("date_of_birth"),
  gender: text("gender"),
  admissionDate: text("admission_date"),
  studentStatus: text("student_status").default("active"),
  phone: text("phone"),
  address: text("address"),
  familyId: integer("family_id").references(() => families.id, {
    onDelete: "set null",
  }),
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
  date: text("date").notNull(),
  status: text("status").notNull(),
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
    lastUsedBy: integer("last_used_by").references(() => users.id, {
      onDelete: "set null",
    }),
    generatedBy: integer("generated_by").references(() => users.id, {
      onDelete: "set null",
    }),
  },
  (table) => ({
    publicIdIdx: uniqueIndex("qr_profiles_public_id_idx").on(table.publicId),
    tokenHashIdx: uniqueIndex("qr_profiles_token_hash_idx").on(table.tokenHash),
  })
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
    direction: text("direction")
      .$type<(typeof qrAttendanceDirections)[number]>()
      .notNull(),
    status: text("status").$type<
      (typeof qrAttendanceMarkStatuses)[number] | null
    >(),
    scanMethod: text("scan_method")
      .$type<(typeof qrAttendanceMethods)[number]>()
      .notNull(),
    terminalLabel: text("terminal_label"),
    notes: text("notes"),
  },
  (table) => ({
    userDayDirectionIdx: uniqueIndex(
      "qr_attendance_events_user_day_direction_idx"
    ).on(table.userId, table.attendanceDate, table.direction),
  })
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
  academicId: integer("academic_id").references(() => academics.id, {
    onDelete: "set null",
  }),
  className: text("class_name").notNull(),
  dayOfWeek: text("day_of_week").notNull(),
  periodLabel: text("period_label").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  room: text("room"),
  classType: text("class_type"),
  teacherId: integer("teacher_id").references(() => users.id, {
    onDelete: "set null",
  }),
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
    status: text("status")
      .$type<TimetableStatus>()
      .notNull()
      .default("draft"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    fitnessScore: numeric("fitness_score", { precision: 5, scale: 2 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    uniqueClassIdx: uniqueIndex("timetables_class_id_idx").on(table.classId),
  })
);

export const timetablesPeriods = pgTable(
  "timetables_periods",
  {
    id: serial("id").primaryKey(),
    timetableId: integer("timetable_id")
      .notNull()
      .references(() => timetables.id, { onDelete: "cascade" }),
    dayOfWeek: integer("day_of_week").notNull(),
    period: integer("period").notNull(),
    subject: text("subject"),
    teacherId: integer("teacher_id").references(() => users.id, {
      onDelete: "set null",
    }),
    room: text("room"),
    isConflict: boolean("is_conflict").notNull().default(false),
  },
  (table) => ({
    uniquePeriodIdx: uniqueIndex(
      "timetables_periods_timetable_day_period_idx"
    ).on(table.timetableId, table.dayOfWeek, table.period),
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// FINANCE TABLES (unchanged)
// ─────────────────────────────────────────────────────────────────────────────

export const fees = pgTable(
  "fees",
  {
    id: serial("id").primaryKey(),
    studentId: integer("student_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    amount: integer("amount").notNull(),
    paidAmount: integer("paid_amount").notNull().default(0),
    totalDiscount: integer("total_discount").notNull().default(0),
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
    lineItems: jsonb("line_items")
      .$type<FeeLineItem[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    notes: text("notes"),
    deletedAt: text("deleted_at"),
    deletedBy: integer("deleted_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => ({
    invoiceNumberIdx: uniqueIndex("fees_invoice_number_idx").on(
      table.invoiceNumber
    ),
    monthlyGenerationIdx: uniqueIndex(
      "fees_student_generated_month_idx"
    ).on(table.studentId, table.generatedMonth),
  })
);

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
    familyId: integer("family_id").references(() => families.id, {
      onDelete: "set null",
    }),
    familyFeeId: integer("family_fee_id"),
    amount: integer("amount").notNull(),
    discount: integer("discount").default(0).notNull(),
    discountReason: text("discount_reason"),
    paymentDate: text("payment_date").notNull(),
    method: text("method").$type<PaymentMethod>().notNull(),
    receiptNumber: text("receipt_number"),
    reference: text("reference"),
    notes: text("notes"),
    idempotencyKey: text("idempotency_key"),
    transactionId: text("transaction_id"),
    gateway: text("gateway")
      .$type<
        "cash" | "bank" | "card" | "mobile-money" | "cheque" | "online"
      >()
      .default("cash"),
    gatewayStatus: text("gateway_status")
      .$type<"pending" | "completed" | "failed">()
      .default("completed"),
    deletedAt: text("deleted_at"),
    deletedBy: integer("deleted_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: text("created_at").notNull(),
    createdBy: integer("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
  },
  (table) => ({
    receiptNumberIdx: uniqueIndex("fee_payments_receipt_number_idx").on(
      table.receiptNumber
    ),
    idempotencyKeyIdx: uniqueIndex("fee_payments_idempotency_key_idx").on(
      table.idempotencyKey
    ),
    transactionIdIdx: uniqueIndex("fee_payments_transaction_id_idx").on(
      table.transactionId
    ),
  })
);

export const feeAdjustments = pgTable(
  "fee_adjustments",
  {
    id: serial("id").primaryKey(),
    feeId: integer("fee_id")
      .notNull()
      .references(() => fees.id, { onDelete: "cascade" }),
    studentId: integer("student_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type")
      .$type<"discount" | "fine" | "scholarship">()
      .notNull(),
    amount: integer("amount").notNull(),
    reason: text("reason").notNull(),
    notes: text("notes"),
    deletedAt: text("deleted_at"),
    deletedBy: integer("deleted_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: text("created_at").notNull(),
    createdBy: integer("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
  },
  (table) => ({
    feeIdIdx: index("fee_adjustments_fee_id_idx").on(table.feeId),
    studentIdIdx: index("fee_adjustments_student_id_idx").on(table.studentId),
  })
);

export const financeLedgerEntries = pgTable(
  "finance_ledger_entries",
  {
    id: serial("id").primaryKey(),
    studentId: integer("student_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    feeId: integer("fee_id").references(() => fees.id, {
      onDelete: "set null",
    }),
    type: text("type")
      .$type<
        "invoice" | "payment" | "discount" | "fine" | "refund" | "scholarship"
      >()
      .notNull(),
    debit: integer("debit").notNull().default(0),
    credit: integer("credit").notNull().default(0),
    balanceAfter: integer("balance_after").notNull().default(0),
    referenceId: text("reference_id"),
    description: text("description"),
    createdAt: text("created_at").notNull(),
    createdBy: integer("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
  },
  (table) => ({
    studentIdIdx: index("finance_ledger_entries_student_id_idx").on(
      table.studentId
    ),
    feeIdIdx: index("finance_ledger_entries_fee_id_idx").on(table.feeId),
    typeIdx: index("finance_ledger_entries_type_idx").on(table.type),
  })
);

export const financeAuditLogs = pgTable(
  "finance_audit_logs",
  {
    id: serial("id").primaryKey(),
    studentId: integer("student_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    feeId: integer("fee_id").references(() => fees.id, {
      onDelete: "set null",
    }),
    action: text("action")
      .$type<"create" | "update" | "delete" | "payment" | "adjustment">()
      .notNull(),
    entityType: text("entity_type")
      .$type<"fee" | "payment" | "adjustment">()
      .notNull(),
    entityId: integer("entity_id"),
    changesBefore: jsonb("changes_before"),
    changesAfter: jsonb("changes_after"),
    reason: text("reason"),
    metadata: jsonb("metadata"),
    createdAt: text("created_at").notNull(),
    createdBy: integer("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
  },
  (table) => ({
    studentIdIdx: index("finance_audit_logs_student_id_idx").on(
      table.studentId
    ),
    feeIdIdx: index("finance_audit_logs_fee_id_idx").on(table.feeId),
    actionIdx: index("finance_audit_logs_action_idx").on(table.action),
    createdAtIdx: index("finance_audit_logs_created_at_idx").on(
      table.createdAt
    ),
  })
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

export const feeStructures = pgTable(
  "fee_structures",
  {
    id: serial("id").primaryKey(),
    className: text("class_name").notNull(),
    term: text("term").notNull(),
    baseRate: integer("base_rate").notNull().default(0),
    transportRate: integer("transport_rate").notNull().default(0),
    miscRate: integer("misc_rate").notNull().default(0),
    chargeItems: jsonb("charge_items")
      .$type<FeeLineItem[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => ({
    classTermIdx: uniqueIndex("fee_structures_class_term_idx").on(
      table.className,
      table.term
    ),
  })
);

export const familyFees = pgTable(
  "family_fees",
  {
    id: serial("id").primaryKey(),
    familyId: integer("family_id")
      .notNull()
      .references(() => families.id, { onDelete: "cascade" }),
    invoiceNumber: text("invoice_number").notNull(),
    billingMonth: text("billing_month").notNull(),
    billingPeriod: text("billing_period").notNull(),
    dueDate: text("due_date").notNull(),
    totalAmount: integer("total_amount").notNull(),
    paidAmount: integer("paid_amount").notNull().default(0),
    remainingBalance: integer("remaining_balance").notNull().default(0),
    status: text("status").$type<FeeStatus>().notNull().default("Unpaid"),
    studentCount: integer("student_count").notNull().default(0),
    summary: jsonb("summary")
      .$type<ConsolidatedSummary>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => ({
    invoiceNumberIdx: uniqueIndex("family_fees_invoice_number_idx").on(
      table.invoiceNumber
    ),
  })
);

export const familyFeeItems = pgTable(
  "family_fee_items",
  {
    id: serial("id").primaryKey(),
    familyFeeId: integer("family_fee_id")
      .notNull()
      .references(() => familyFees.id, { onDelete: "cascade" }),
    feeId: integer("fee_id")
      .notNull()
      .references(() => fees.id, { onDelete: "cascade" }),
    studentId: integer("student_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: text("created_at").notNull(),
  },
  (table) => ({
    familyFeeLinkIdx: uniqueIndex("family_fee_items_family_fee_fee_idx").on(
      table.familyFeeId,
      table.feeId
    ),
  })
);

export const familyTransactions = pgTable("family_transactions", {
  id: serial("id").primaryKey(),
  familyId: integer("family_id")
    .notNull()
    .references(() => families.id, { onDelete: "cascade" }),
  familyFeeId: integer("family_fee_id").references(() => familyFees.id, {
    onDelete: "set null",
  }),
  amount: integer("amount").notNull(),
  type: text("type")
    .$type<
      | "family_wallet_credit"
      | "family_wallet_debit"
      | "family_fee_payment"
      | "family_adjustment"
    >()
    .notNull(),
  method: text("method").$type<PaymentMethod>(),
  reference: text("reference"),
  notes: text("notes"),
  allocation: jsonb("allocation")
    .$type<
      Array<{
        feeId: number;
        studentId: number;
        appliedAmount: number;
      }>
    >()
    .notNull()
    .default(sql`'[]'::jsonb`),
  createdAt: text("created_at").notNull(),
  createdBy: integer("created_by").references(() => users.id, {
    onDelete: "set null",
  }),
});

// ─────────────────────────────────────────────────────────────────────────────
// VOUCHER OPERATIONS (extended with consolidated mode columns)
// ─────────────────────────────────────────────────────────────────────────────

export const financeVoucherOperations = pgTable(
  "finance_voucher_operations",
  {
    id: serial("id").primaryKey(),
    requestedBy: integer("requested_by").references(() => users.id, {
      onDelete: "set null",
    }),
    status: text("status")
      .$type<FinanceVoucherOperationStatus>()
      .notNull()
      .default("pending"),
    billingMonths: jsonb("billing_months")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    classNames: jsonb("class_names")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    studentIds: jsonb("student_ids")
      .$type<number[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    force: boolean("force").notNull().default(false),
    totalInvoices: integer("total_invoices").notNull().default(0),
    generatedCount: integer("generated_count").notNull().default(0),
    skippedCount: integer("skipped_count").notNull().default(0),
    failedCount: integer("failed_count").notNull().default(0),
    archiveSizeBytes: integer("archive_size_bytes").notNull().default(0),
    errorMessage: text("error_message"),
    errorLog: jsonb("error_log")
      .$type<Record<string, unknown>[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    startedAt: text("started_at"),
    completedAt: text("completed_at"),
    cancelledAt: text("cancelled_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),

    // ── NEW: consolidated voucher mode flags ──────────────────────────────
    /** When true, each student gets one merged PDF covering all dues */
    consolidatedMode: boolean("consolidated_mode").notNull().default(false),
    /** When true, previous unpaid dues are included in consolidated voucher */
    includeOverdue: boolean("include_overdue").notNull().default(true),
  }
);

export const financeVouchers = pgTable(
  "finance_vouchers",
  {
    id: serial("id").primaryKey(),
    feeId: integer("fee_id")
      .notNull()
      .references(() => fees.id, { onDelete: "cascade" }),
    operationId: integer("operation_id").references(
      () => financeVoucherOperations.id,
      { onDelete: "set null" }
    ),
    documentNumber: text("document_number").notNull(),
    fileName: text("file_name").notNull(),
    billingMonth: text("billing_month").notNull(),
    generationVersion: integer("generation_version").notNull().default(1),
    generatedAt: text("generated_at").notNull(),
    generatedBy: integer("generated_by").references(() => users.id, {
      onDelete: "set null",
    }),
  },
  (table) => ({
    feeIdx: uniqueIndex("finance_vouchers_fee_idx").on(table.feeId),
    documentNumberIdx: uniqueIndex(
      "finance_vouchers_document_number_idx"
    ).on(table.documentNumber),
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// CONSOLIDATED VOUCHERS (complete definition — replaces partial stub)
// ─────────────────────────────────────────────────────────────────────────────

export const consolidatedVouchers = pgTable(
  "consolidated_vouchers",
  {
    id: serial("id").primaryKey(),

    // ── Core references ───────────────────────────────────────────────────
    operationId: integer("operation_id").references(
      () => financeVoucherOperations.id,
      { onDelete: "set null" }
    ),
    studentId: integer("student_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    generatedBy: integer("generated_by").references(() => users.id, {
      onDelete: "set null",
    }),

    // ── Voucher identity ──────────────────────────────────────────────────
    /** Unique human-readable reference e.g. "CV-283-2026-12" */
    voucherDocumentNumber: text("voucher_document_number").notNull(),
    /** Anchor billing month "YYYY-MM" */
    filingMonth: text("filing_month").notNull(),
    /** All billing months covered by this voucher ["YYYY-MM", ...] */
    billingMonths: jsonb("billing_months")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),

    // ── Lifecycle status ──────────────────────────────────────────────────
    status: text("status")
      .$type<"draft" | "generated" | "downloaded" | "cancelled">()
      .notNull()
      .default("draft"),

    // ── PDF file reference ────────────────────────────────────────────────
    /** Filename stored on disk e.g. "CV-283-2026-12.pdf" */
    pdfFileName: text("pdf_filename"),

    // ── Point-in-time snapshots (frozen at generation) ────────────────────
    /** Unpaid fees from months before filingMonth */
    previousDuesSnapshot: jsonb("previous_dues_snapshot")
      .$type<ConsolidatedFeeRow[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    /** Fees for the selected billing months */
    currentFeesSnapshot: jsonb("current_fees_snapshot")
      .$type<ConsolidatedFeeRow[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    /** Computed totals at generation time */
    summarySnapshot: jsonb("summary_snapshot")
      .$type<ConsolidatedSummary>()
      .notNull()
      .default(sql`'{}'::jsonb`),

    // ── Timestamps ────────────────────────────────────────────────────────
    generatedAt: text("generated_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => ({
    /**
     * One consolidated voucher per student per filing month per operation.
     * Allows regeneration under a new operationId without conflicts.
     */
    uniqueStudentFilingMonthOpIdx: uniqueIndex(
      "consolidated_vouchers_student_filing_month_op_idx"
    ).on(table.studentId, table.filingMonth, table.operationId),

    voucherDocumentNumberIdx: uniqueIndex(
      "consolidated_vouchers_voucher_document_number_idx"
    ).on(table.voucherDocumentNumber),

    studentIdIdx: index("consolidated_vouchers_student_id_idx").on(
      table.studentId
    ),
    operationIdIdx: index("consolidated_vouchers_operation_id_idx").on(
      table.operationId
    ),
    statusIdx: index("consolidated_vouchers_status_idx").on(table.status),
    filingMonthIdx: index("consolidated_vouchers_filing_month_idx").on(
      table.filingMonth
    ),
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// CONSOLIDATED VOUCHER FEE LINKS
// Purpose: Tracks exactly which fees.id rows are covered by each
//          consolidated voucher — enables reconciliation and prevents
//          the same fee appearing in two voucher batches.
// ─────────────────────────────────────────────────────────────────────────────

export const consolidatedVoucherFeeLinks = pgTable(
  "consolidated_voucher_fee_links",
  {
    id: serial("id").primaryKey(),
    consolidatedVoucherId: integer("consolidated_voucher_id")
      .notNull()
      .references(() => consolidatedVouchers.id, { onDelete: "cascade" }),
    feeId: integer("fee_id")
      .notNull()
      .references(() => fees.id, { onDelete: "cascade" }),
    /** Which section of the voucher this row belongs to */
    section: text("section")
      .$type<"previous_dues" | "current_fees">()
      .notNull(),
    /** Snapshot of fees.amount at time of voucher generation */
    feeSnapshotAmount: integer("fee_snapshot_amount").notNull(),
    /** Snapshot of fees.remaining_balance at time of generation */
    feeSnapshotBalance: integer("fee_snapshot_balance").notNull(),
    /** Snapshot of fees.status at time of generation */
    feeSnapshotStatus: text("fee_snapshot_status")
      .$type<FeeStatus>()
      .notNull(),
  },
  (table) => ({
    // Prevent the same fee appearing twice in the same voucher
    uniqueVoucherFeeIdx: uniqueIndex(
      "consolidated_voucher_fee_links_voucher_fee_idx"
    ).on(table.consolidatedVoucherId, table.feeId),

    consolidatedVoucherIdIdx: index(
      "consolidated_voucher_fee_links_voucher_id_idx"
    ).on(table.consolidatedVoucherId),

    feeIdIdx: index("consolidated_voucher_fee_links_fee_id_idx").on(
      table.feeId
    ),
    sectionIdx: index("consolidated_voucher_fee_links_section_idx").on(
      table.section
    ),
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// CONSOLIDATED VOUCHER AUDIT LOG
// Purpose: Immutable append-only audit trail for compliance and dispute
//          resolution — records every status change, download, and reprint.
// ─────────────────────────────────────────────────────────────────────────────

export const consolidatedVoucherAuditLog = pgTable(
  "consolidated_voucher_audit_log",
  {
    id: serial("id").primaryKey(),
    consolidatedVoucherId: integer("consolidated_voucher_id")
      .notNull()
      .references(() => consolidatedVouchers.id, { onDelete: "cascade" }),
    studentId: integer("student_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    action: text("action")
      .$type<
        | "generated"
        | "regenerated"
        | "downloaded"
        | "printed"
        | "cancelled"
        | "status_changed"
      >()
      .notNull(),
    previousStatus: text("previous_status"),
    newStatus: text("new_status"),
    /** Freeform JSON for context — IP address, batch ID, reason, etc. */
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    performedBy: integer("performed_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: text("created_at").notNull(),
  },
  (table) => ({
    consolidatedVoucherIdIdx: index(
      "cv_audit_log_consolidated_voucher_id_idx"
    ).on(table.consolidatedVoucherId),
    studentIdIdx: index("cv_audit_log_student_id_idx").on(table.studentId),
    actionIdx: index("cv_audit_log_action_idx").on(table.action),
    createdAtIdx: index("cv_audit_log_created_at_idx").on(table.createdAt),
    performedByIdx: index("cv_audit_log_performed_by_idx").on(
      table.performedBy
    ),
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// SCHOOL SETTINGS (unchanged)
// ─────────────────────────────────────────────────────────────────────────────

export const schoolSettings = pgTable("school_settings", {
  id: serial("id").primaryKey(),
  version: integer("version").notNull().default(1),
  data: jsonb("data").$type<SchoolSettingsData>().notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  updatedBy: integer("updated_by").references(() => users.id, {
    onDelete: "set null",
  }),
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
  createdBy: integer("created_by").references(() => users.id, {
    onDelete: "set null",
  }),
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
  createdBy: integer("created_by").references(() => users.id, {
    onDelete: "set null",
  }),
});

// ─────────────────────────────────────────────────────────────────────────────
// CLASSES (unchanged)
// ─────────────────────────────────────────────────────────────────────────────

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
    homeroomTeacherId: integer("homeroom_teacher_id").references(
      () => users.id,
      { onDelete: "set null" }
    ),
    status: text("status").notNull().default("active"),
  },
  (table) => ({
    uniqueClassIdx: uniqueIndex("classes_grade_section_stream_year_idx").on(
      table.grade,
      table.section,
      table.stream,
      table.academicYear
    ),
  })
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
    uniqueClassTeacherSubjectsIdx: uniqueIndex(
      "class_teachers_class_teacher_subjects_idx"
    ).on(table.classId, table.teacherId, table.subjects),
  })
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
    idxTeacherDate: index("idx_pulse_teacher_date").on(
      table.teacherId,
      table.date
    ),
    idxDate: index("idx_pulse_date").on(table.date),
  })
);

export const timetableSettings = pgTable("timetable_settings", {
  id: serial("id").primaryKey(),
  schoolId: integer("school_id").notNull().default(1).unique(),
  startTime: text("start_time").notNull().default("08:00"),
  endTime: text("end_time").notNull().default("15:00"),
  workingDays: integer("working_days")
    .array()
    .notNull()
    .default([1, 2, 3, 4, 5, 6]),
  periodDuration: integer("period_duration").notNull().default(45),
  breakAfterPeriod: integer("break_after_period").array().notNull().default([4]),
  breakDuration: integer("break_duration").notNull().default(15),
  totalPeriods: integer("total_periods").notNull().default(8),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const timetableSettingsVersion = pgTable("timetable_settings_version", {
  id: serial("id").primaryKey(),
  settingsId: integer("settings_id")
    .notNull()
    .references(() => timetableSettings.id, { onDelete: "cascade" }),
  changedAt: timestamp("changed_at", { withTimezone: true }).defaultNow(),
  changedBy: integer("changed_by").references(() => users.id, {
    onDelete: "set null",
  }),
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
      .$type<{ subject: string; topic: string; note?: string }[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    status: text("status")
      .$type<HomeworkDiaryStatus>()
      .notNull()
      .default("draft"),
    createdBy: integer("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    uniqueClassDateIdx: uniqueIndex("homework_diary_class_id_date_idx").on(
      table.classId,
      table.date
    ),
  })
);

export const diaryTemplates = pgTable(
  "diary_templates",
  {
    id: serial("id").primaryKey(),
    classId: integer("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    questions: jsonb("questions")
      .$type<
        {
          id: string;
          subject: string;
          question: string;
          type: "text" | "richtext" | "checkbox";
        }[]
      >()
      .notNull()
      .default(sql`'[]'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  }
);

export const dailyDiary = pgTable(
  "daily_diary",
  {
    id: serial("id").primaryKey(),
    templateId: integer("template_id")
      .notNull()
      .references(() => diaryTemplates.id, { onDelete: "cascade" }),
    classId: integer("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    content: jsonb("content")
      .$type<{ questionId: string; answer: string }[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    status: text("status")
      .$type<HomeworkDiaryStatus>()
      .notNull()
      .default("draft"),
    createdBy: integer("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    uniqueTemplateDateIdx: uniqueIndex(
      "daily_diary_template_id_date_idx"
    ).on(table.templateId, table.date),
    classDateIdx: index("daily_diary_class_id_date_idx").on(
      table.classId,
      table.date
    ),
  })
);

export const homeworkPriorityEnum = pgEnum("priority_enum", [
  "low",
  "medium",
  "high",
  "urgent",
]);
export const homeworkStatusEnum = pgEnum("homework_status_enum", [
  "active",
  "completed",
  "cancelled",
]);

export const homeworkAssignments = pgTable("homework_assignments", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  classId: integer("class_id")
    .notNull()
    .references(() => classes.id, { onDelete: "cascade" }),
  teacherId: integer("teacher_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  subject: varchar("subject", { length: 50 }).notNull(),
  title: varchar("title", { length: 100 }).notNull(),
  description: text("description"),
  dueDate: date("due_date").notNull(),
  priority: homeworkPriorityEnum("priority").notNull().default("medium"),
  files: jsonb("files")
    .$type<string[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  status: homeworkStatusEnum("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const studentSubmissions = pgTable(
  "student_submissions",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    homeworkId: uuid("homework_id")
      .notNull()
      .references(() => homeworkAssignments.id, { onDelete: "cascade" }),
    studentId: integer("student_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    submissionFile: varchar("submission_file", { length: 255 }),
    submittedAt: timestamp("submitted_at", {
      withTimezone: true,
    }).defaultNow(),
    marks: numeric("marks", { precision: 5, scale: 2 }),
    feedback: text("feedback"),
  },
  (table) => ({
    uniqueHomeworkStudentIdx: uniqueIndex(
      "student_submissions_homework_student_idx"
    ).on(table.homeworkId, table.studentId),
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// DRIZZLE RELATIONS
// ─────────────────────────────────────────────────────────────────────────────

export const homeworkAssignmentsRelations = relations(
  homeworkAssignments,
  ({ one, many }) => ({
    class: one(classes, {
      fields: [homeworkAssignments.classId],
      references: [classes.id],
    }),
    teacher: one(users, {
      fields: [homeworkAssignments.teacherId],
      references: [users.id],
    }),
    submissions: many(studentSubmissions),
  })
);

export const studentSubmissionsRelations = relations(
  studentSubmissions,
  ({ one }) => ({
    homework: one(homeworkAssignments, {
      fields: [studentSubmissions.homeworkId],
      references: [homeworkAssignments.id],
    }),
    student: one(users, {
      fields: [studentSubmissions.studentId],
      references: [users.id],
    }),
  })
);

// ── NEW: consolidated voucher relations ──────────────────────────────────────

export const consolidatedVouchersRelations = relations(
  consolidatedVouchers,
  ({ one, many }) => ({
    operation: one(financeVoucherOperations, {
      fields: [consolidatedVouchers.operationId],
      references: [financeVoucherOperations.id],
    }),
    student: one(users, {
      fields: [consolidatedVouchers.studentId],
      references: [users.id],
    }),
    generatedByUser: one(users, {
      fields: [consolidatedVouchers.generatedBy],
      references: [users.id],
    }),
    feeLinks: many(consolidatedVoucherFeeLinks),
    auditLogs: many(consolidatedVoucherAuditLog),
  })
);

export const consolidatedVoucherFeeLinksRelations = relations(
  consolidatedVoucherFeeLinks,
  ({ one }) => ({
    consolidatedVoucher: one(consolidatedVouchers, {
      fields: [consolidatedVoucherFeeLinks.consolidatedVoucherId],
      references: [consolidatedVouchers.id],
    }),
    fee: one(fees, {
      fields: [consolidatedVoucherFeeLinks.feeId],
      references: [fees.id],
    }),
  })
);

export const consolidatedVoucherAuditLogRelations = relations(
  consolidatedVoucherAuditLog,
  ({ one }) => ({
    consolidatedVoucher: one(consolidatedVouchers, {
      fields: [consolidatedVoucherAuditLog.consolidatedVoucherId],
      references: [consolidatedVouchers.id],
    }),
    student: one(users, {
      fields: [consolidatedVoucherAuditLog.studentId],
      references: [users.id],
    }),
    performedByUser: one(users, {
      fields: [consolidatedVoucherAuditLog.performedBy],
      references: [users.id],
    }),
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// ZOD VALIDATION SCHEMAS — user fields
// ─────────────────────────────────────────────────────────────────────────────

const optionalUserTextFieldSchema = z.preprocess(
  (value) =>
    typeof value === "string" ? value.trim() || null : value,
  z.string().max(120).nullable().optional()
);

const optionalPhotoUrlSchema = (label: string) =>
  z.preprocess(
    (value) =>
      typeof value === "string" ? value.trim() || null : value,
    z
      .string()
      .url(`${label} must be a valid URL`)
      .max(500)
      .nullable()
      .optional()
  );

const optionalTeacherPhotoUrlSchema =
  optionalPhotoUrlSchema("Teacher photo URL");

const optionalStudentPhotoUrlSchema = z.preprocess(
  (value) =>
    typeof value === "string" ? value.trim() || null : value,
  z
    .string()
    .url("Student photo URL must be a valid URL")
    .max(500)
    .nullable()
    .optional()
);

// ─────────────────────────────────────────────────────────────────────────────
// INSERT SCHEMAS (existing)
// ─────────────────────────────────────────────────────────────────────────────

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
    rollNumber: optionalUserTextFieldSchema,
    dateOfBirth: optionalUserTextFieldSchema,
    gender: z.enum(["male", "female", "other"]).nullable().optional(),
    admissionDate: optionalUserTextFieldSchema,
    studentStatus: z
      .enum(["active", "inactive", "graduated", "suspended"])
      .nullable()
      .optional()
      .default("active"),
    phone: optionalUserTextFieldSchema,
    address: optionalUserTextFieldSchema,
    familyId: z.coerce.number().int().positive().nullable().optional(),
  });

export const insertFamilySchema = createInsertSchema(families).omit({ id: true });
export const insertStudentSchema = createInsertSchema(students);
export const insertTeacherSchema = createInsertSchema(teachers);
export const insertAcademicSchema = createInsertSchema(academics).omit({
  id: true,
});
export const insertAttendanceSchema = createInsertSchema(attendance).omit({
  id: true,
});
export const insertQrProfileSchema = createInsertSchema(qrProfiles);
export const insertQrAttendanceEventSchema = createInsertSchema(
  qrAttendanceEvents
).omit({ id: true });
export const insertResultSchema = createInsertSchema(results).omit({
  id: true,
});
export const insertTimetableSchema = createInsertSchema(timetable).omit({
  id: true,
});
export const insertTimetablesSchema = createInsertSchema(timetables).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertTimetablesPeriodSchema = createInsertSchema(
  timetablesPeriods
).omit({ id: true });
export const insertFeeSchema = createInsertSchema(fees).omit({ id: true });
export const insertFeePaymentSchema = createInsertSchema(feePayments).omit({
  id: true,
});
export const insertFeeAdjustmentSchema = createInsertSchema(
  feeAdjustments
).omit({ id: true });
export const insertFinanceLedgerEntrySchema = createInsertSchema(
  financeLedgerEntries
).omit({ id: true });
export const insertFinanceAuditLogSchema = createInsertSchema(
  financeAuditLogs
).omit({ id: true });
export const insertStudentBillingProfileSchema = createInsertSchema(
  studentBillingProfiles
);
export const insertFeeStructureSchema = createInsertSchema(feeStructures).omit({
  id: true,
});
export const insertFamilyFeeSchema = createInsertSchema(familyFees).omit({
  id: true,
});
export const insertFamilyFeeItemSchema = createInsertSchema(familyFeeItems).omit({
  id: true,
});
export const insertFamilyTransactionSchema = createInsertSchema(
  familyTransactions
).omit({
  id: true,
});
export const insertFinanceVoucherOperationSchema = createInsertSchema(
  financeVoucherOperations
).omit({ id: true });
export const insertFinanceVoucherSchema = createInsertSchema(
  financeVouchers
).omit({ id: true });
export const insertClassSchema = createInsertSchema(classes).omit({
  id: true,
});
export const insertClassTeacherSchema = createInsertSchema(classTeachers).omit(
  { id: true }
);
export const insertDailyTeachingPulseSchema = createInsertSchema(
  dailyTeachingPulse
).omit({ id: true, createdAt: true, markedAt: true });
export const insertTimetableSettingsSchema = createInsertSchema(
  timetableSettings
).omit({ id: true });
export const insertTimetableSettingsVersionSchema = createInsertSchema(
  timetableSettingsVersion
).omit({ id: true });
export const insertHomeworkDiarySchema = createInsertSchema(homeworkDiary).omit(
  { id: true, createdAt: true }
);
export const insertDiaryTemplateSchema = createInsertSchema(
  diaryTemplates
).omit({ id: true, createdAt: true, updatedAt: true });
export const insertDailyDiarySchema = createInsertSchema(dailyDiary).omit({
  id: true,
  publishedAt: true,
  createdAt: true,
  updatedAt: true,
});
export const insertHomeworkAssignmentSchema = createInsertSchema(
  homeworkAssignments
).omit({ id: true, createdAt: true });
export const insertStudentSubmissionSchema = createInsertSchema(
  studentSubmissions
).omit({ id: true, submittedAt: true });

// ── NEW: consolidated voucher insert schemas ─────────────────────────────────

export const insertConsolidatedVoucherSchema = createInsertSchema(
  consolidatedVouchers
).omit({ id: true });

export const insertConsolidatedVoucherFeeLinkSchema = createInsertSchema(
  consolidatedVoucherFeeLinks
).omit({ id: true });

export const insertConsolidatedVoucherAuditLogSchema = createInsertSchema(
  consolidatedVoucherAuditLog
).omit({ id: true });

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTED DRIZZLE TYPES (existing)
// ─────────────────────────────────────────────────────────────────────────────

export type Family = typeof families.$inferSelect;
export type InsertFamily = z.infer<typeof insertFamilySchema>;
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
export type InsertQrAttendanceEvent = z.infer<
  typeof insertQrAttendanceEventSchema
>;
export type Result = typeof results.$inferSelect;
export type InsertResult = z.infer<typeof insertResultSchema>;
export type Timetable = typeof timetable.$inferSelect;
export type InsertTimetable = z.infer<typeof insertTimetableSchema>;
export type TimetableRecord = typeof timetables.$inferSelect;
export type InsertTimetableRecord = z.infer<typeof insertTimetablesSchema>;
export type TimetablePeriod = typeof timetablesPeriods.$inferSelect;
export type InsertTimetablePeriod = z.infer<
  typeof insertTimetablesPeriodSchema
>;
export type Fee = typeof fees.$inferSelect;
export type InsertFee = z.infer<typeof insertFeeSchema>;
export type FeePayment = typeof feePayments.$inferSelect;
export type InsertFeePayment = z.infer<typeof insertFeePaymentSchema>;
export type FeeAdjustment = typeof feeAdjustments.$inferSelect;
export type InsertFeeAdjustment = z.infer<typeof insertFeeAdjustmentSchema>;
export type FinanceLedgerEntry = typeof financeLedgerEntries.$inferSelect;
export type InsertFinanceLedgerEntry = z.infer<
  typeof insertFinanceLedgerEntrySchema
>;
export type FinanceAuditLog = typeof financeAuditLogs.$inferSelect;
export type InsertFinanceAuditLog = z.infer<
  typeof insertFinanceAuditLogSchema
>;
export type StudentBillingProfile =
  typeof studentBillingProfiles.$inferSelect;
export type InsertStudentBillingProfile = z.infer<
  typeof insertStudentBillingProfileSchema
>;
export type FeeStructure = typeof feeStructures.$inferSelect;
export type InsertFeeStructure = z.infer<typeof insertFeeStructureSchema>;
export type FamilyFee = typeof familyFees.$inferSelect;
export type InsertFamilyFee = z.infer<typeof insertFamilyFeeSchema>;
export type FamilyFeeItem = typeof familyFeeItems.$inferSelect;
export type InsertFamilyFeeItem = z.infer<typeof insertFamilyFeeItemSchema>;
export type FamilyTransaction = typeof familyTransactions.$inferSelect;
export type InsertFamilyTransaction = z.infer<
  typeof insertFamilyTransactionSchema
>;
export type FinanceVoucherOperation =
  typeof financeVoucherOperations.$inferSelect;
export type InsertFinanceVoucherOperation = z.infer<
  typeof insertFinanceVoucherOperationSchema
>;
export type FinanceVoucher = typeof financeVouchers.$inferSelect;
export type InsertFinanceVoucher = z.infer<typeof insertFinanceVoucherSchema>;
export type SchoolSettings = typeof schoolSettings.$inferSelect;
export type SchoolSettingsVersion = typeof schoolSettingsVersions.$inferSelect;
export type SchoolSettingsAuditLog =
  typeof schoolSettingsAuditLogs.$inferSelect;
export type Class = typeof classes.$inferSelect;
export type InsertClass = z.infer<typeof insertClassSchema>;
export type ClassTeacher = typeof classTeachers.$inferSelect;
export type InsertClassTeacher = z.infer<typeof insertClassTeacherSchema>;
export type DailyTeachingPulse = typeof dailyTeachingPulse.$inferSelect;
export type InsertDailyTeachingPulse = z.infer<
  typeof insertDailyTeachingPulseSchema
>;
export type TimetableSettings = typeof timetableSettings.$inferSelect;
export type InsertTimetableSettings = z.infer<
  typeof insertTimetableSettingsSchema
>;
export type TimetableSettingsVersion =
  typeof timetableSettingsVersion.$inferSelect;
export type InsertTimetableSettingsVersion = z.infer<
  typeof insertTimetableSettingsVersionSchema
>;
export type HomeworkDiary = typeof homeworkDiary.$inferSelect;
export type InsertHomeworkDiary = z.infer<typeof insertHomeworkDiarySchema>;
export type DiaryTemplate = typeof diaryTemplates.$inferSelect;
export type InsertDiaryTemplate = z.infer<typeof insertDiaryTemplateSchema>;
export type DailyDiary = typeof dailyDiary.$inferSelect;
export type InsertDailyDiary = z.infer<typeof insertDailyDiarySchema>;
export type HomeworkAssignment = typeof homeworkAssignments.$inferSelect;
export type InsertHomeworkAssignment = z.infer<
  typeof insertHomeworkAssignmentSchema
>;
export type StudentSubmission = typeof studentSubmissions.$inferSelect;
export type InsertStudentSubmission = z.infer<
  typeof insertStudentSubmissionSchema
>;

// ── NEW: consolidated voucher Drizzle types ──────────────────────────────────

/** Raw DB record for a consolidated voucher */
export type ConsolidatedVoucherRecord =
  typeof consolidatedVouchers.$inferSelect;

export type InsertConsolidatedVoucher = z.infer<
  typeof insertConsolidatedVoucherSchema
>;

/** Raw DB record for fee link rows */
export type ConsolidatedVoucherFeeLink =
  typeof consolidatedVoucherFeeLinks.$inferSelect;

export type InsertConsolidatedVoucherFeeLink = z.infer<
  typeof insertConsolidatedVoucherFeeLinkSchema
>;

/** Raw DB record for audit log rows */
export type ConsolidatedVoucherAuditLogRecord =
  typeof consolidatedVoucherAuditLog.$inferSelect;

export type InsertConsolidatedVoucherAuditLog = z.infer<
  typeof insertConsolidatedVoucherAuditLogSchema
>;

// ─────────────────────────────────────────────────────────────────────────────
// COMPOSITE / JOIN TYPES (existing + new)
// ─────────────────────────────────────────────────────────────────────────────

export type AttendanceWithStudent = Attendance & {
  student?: User;
  teacher?: User;
};
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
export type FeeAdjustmentWithMeta = FeeAdjustment & { createdByUser?: User };
export type FeeWithStudent = Fee & {
  student?: User;
  payments?: FeePaymentWithMeta[];
  adjustments?: FeeAdjustmentWithMeta[];
};
export type StudentBillingProfileWithStudent = StudentBillingProfile & {
  student?: User;
};
export type FinanceVoucherOperationWithMeta = FinanceVoucherOperation & {
  requestedByUser?: User;
};
export type FinanceVoucherWithMeta = FinanceVoucher & {
  generatedByUser?: User;
};
export type AcademicWithTeacher = Academic & { teacher?: User };
export type TimetableWithDetails = Timetable & {
  academic?: Academic;
  teacher?: User;
};

/** Full consolidated voucher with joined student, user, and fee link rows */
export type ConsolidatedVoucherWithMeta = ConsolidatedVoucherRecord & {
  student?: User;
  generatedByUser?: User;
  feeLinks?: ConsolidatedVoucherFeeLink[];
  auditLogs?: ConsolidatedVoucherAuditLogRecord[];
};
