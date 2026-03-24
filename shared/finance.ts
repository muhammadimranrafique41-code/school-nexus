import { z } from "zod";

export const feeStatuses = ["Paid", "Partially Paid", "Unpaid", "Overdue"] as const;
export const paymentMethods = ["Cash", "Bank Transfer", "Card", "Mobile Money", "Cheque", "Other"] as const;
export const paymentGateways = ["cash", "bank", "card", "mobile-money", "cheque", "online"] as const;
export const gatewayPaymentStatuses = ["pending", "completed", "failed"] as const;
export const invoiceSources = ["manual", "monthly"] as const;
export const financeVoucherOperationStatuses = ["queued", "running", "completed", "completed_with_errors", "cancelled", "failed"] as const;

export const feeStatusSchema = z.enum(feeStatuses);
export const paymentMethodSchema = z.enum(paymentMethods);
export const paymentGatewaySchema = z.enum(paymentGateways);
export const gatewayPaymentStatusSchema = z.enum(gatewayPaymentStatuses);
export const invoiceSourceSchema = z.enum(invoiceSources);
export const financeVoucherOperationStatusSchema = z.enum(financeVoucherOperationStatuses);
export const billingMonthSchema = z.string().regex(/^\d{4}-\d{2}$/, "Billing month must use YYYY-MM format");
export const feeLineItemSchema = z.object({
  label: z.string().trim().min(1, "Line item label is required").max(120),
  amount: z.coerce.number().int().nonnegative(),
});

export const createFeeInputSchema = z.object({
  studentId: z.coerce.number().int().positive(),
  amount: z.coerce.number().int().positive("Amount must be greater than 0"),
  billingMonth: billingMonthSchema,
  billingPeriod: z.string().trim().min(3).max(80).optional(),
  dueDate: z.string().min(1, "Due date is required"),
  description: z.string().trim().min(3, "Description is required").max(160),
  feeType: z.string().trim().min(2).max(60).default("Monthly Fee"),
  lineItems: z.array(feeLineItemSchema).min(1).optional(),
  notes: z.string().trim().max(300).optional().nullable(),
  discount: z.coerce.number().int().nonnegative("Discount must be non-negative").optional().nullable(),
  discountReason: z.string().trim().max(200).optional().nullable(),
  source: invoiceSourceSchema.optional(),
  generatedMonth: billingMonthSchema.optional(),
});

export const updateFeeInputSchema = createFeeInputSchema.partial().extend({
  studentId: z.coerce.number().int().positive().optional(),
});

export const recordFeePaymentInputSchema = z.object({
  amount: z.coerce.number().int().positive("Payment amount must be greater than 0"),
  paymentDate: z.string().min(1, "Payment date is required"),
  method: paymentMethodSchema,
  reference: z.string().trim().max(120).optional().nullable(),
  notes: z.string().trim().max(300).optional().nullable(),
  discount: z.coerce.number().int().nonnegative("Discount must be non-negative").optional().nullable(),
  discountReason: z.string().trim().max(200).optional().nullable(),
  idempotencyKey: z.string().trim().min(1).max(255).optional().nullable(),
});

export const feeAdjustmentTypeSchema = z.enum(["discount", "fine", "scholarship"]);

export const createFeeAdjustmentInputSchema = z.object({
  feeId: z.coerce.number().int().positive(),
  type: feeAdjustmentTypeSchema,
  amount: z.coerce.number().int().positive("Adjustment amount must be greater than 0"),
  reason: z.string().trim().min(3, "Reason is required").max(200),
  notes: z.string().trim().max(300).optional().nullable(),
});

export const billingProfileInputSchema = z.object({
  studentId: z.coerce.number().int().positive(),
  monthlyAmount: z.coerce.number().int().positive("Monthly fee must be greater than 0"),
  dueDay: z.coerce.number().int().min(1).max(28),
  isActive: z.boolean().default(true),
  notes: z.string().trim().max(300).optional().nullable(),
});

export const generateMonthlyFeesInputSchema = z.object({
  billingMonth: billingMonthSchema,
  dueDayOverride: z.coerce.number().int().min(1).max(28).optional(),
  classNameFilter: z.string().trim().min(1).max(80).optional(),
});

const financeVoucherSelectionBaseSchema = z.object({
  billingMonths: z.array(billingMonthSchema).min(1, "Select at least one billing month").max(12),
  classNames: z.array(z.string().trim().min(1).max(80)).max(24).default([]),
  studentIds: z.array(z.coerce.number().int().positive()).max(300).default([]),
  force: z.boolean().default(false),
});

const validateVoucherSelection = (value: { classNames: string[], studentIds: number[] }, ctx: z.RefinementCtx) => {
  if (value.classNames.length === 0 && value.studentIds.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["classNames"],
      message: "Select at least one class or one student",
    });
  }
};

export const financeVoucherSelectionInputSchema = financeVoucherSelectionBaseSchema.superRefine(validateVoucherSelection);

export const financeVoucherPreviewInputSchema = financeVoucherSelectionBaseSchema.extend({
  previewLimit: z.coerce.number().int().min(1).max(50).default(20),
}).superRefine(validateVoucherSelection);

export const financeVoucherStartInputSchema = financeVoucherSelectionInputSchema;

export type FeeStatus = z.infer<typeof feeStatusSchema>;
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;
export type PaymentGateway = z.infer<typeof paymentGatewaySchema>;
export type GatewayPaymentStatus = z.infer<typeof gatewayPaymentStatusSchema>;
export type InvoiceSource = z.infer<typeof invoiceSourceSchema>;
export type FinanceVoucherOperationStatus = z.infer<typeof financeVoucherOperationStatusSchema>;
export type FeeLineItem = z.infer<typeof feeLineItemSchema>;
export type CreateFeeInput = z.infer<typeof createFeeInputSchema>;
export type UpdateFeeInput = z.infer<typeof updateFeeInputSchema>;
export type RecordFeePaymentInput = z.infer<typeof recordFeePaymentInputSchema>;
export type FeeAdjustmentType = z.infer<typeof feeAdjustmentTypeSchema>;
export type CreateFeeAdjustmentInput = z.infer<typeof createFeeAdjustmentInputSchema>;
export type BillingProfileInput = z.infer<typeof billingProfileInputSchema>;
export type GenerateMonthlyFeesInput = z.infer<typeof generateMonthlyFeesInputSchema>;
export type FinanceVoucherSelectionInput = z.infer<typeof financeVoucherSelectionInputSchema>;
export type FinanceVoucherPreviewInput = z.infer<typeof financeVoucherPreviewInputSchema>;
export type FinanceVoucherStartInput = z.infer<typeof financeVoucherStartInputSchema>;

export type FinanceStudentSnapshot = {
  name?: string | null;
  className?: string | null;
};

export type FinancePaymentSnapshot = {
  id: number;
  feeId: number;
  studentId: number;
  amount: number;
  discount: number | null;
  discountReason: string | null;
  paymentDate: string;
  method: PaymentMethod;
  receiptNumber?: string | null;
};

export type FinanceInvoiceSnapshot = {
  id: number;
  studentId: number;
  amount: number;
  paidAmount: number;
  totalDiscount: number;
  remainingBalance: number;
  dueDate: string;
  status: FeeStatus;
  billingMonth: string;
  billingPeriod: string;
  invoiceNumber?: string | null;
  student?: FinanceStudentSnapshot;
  payments?: FinancePaymentSnapshot[];
};

export type FinanceReportSnapshot = {
  summary: {
    totalInvoices: number;
    totalBilled: number;
    totalPaid: number;
    totalOutstanding: number;
    paidInvoices: number;
    partiallyPaidInvoices: number;
    unpaidInvoices: number;
    overdueInvoices: number;
    paymentsCount: number;
    collectionRate: number;
    overdueBalance: number;
    studentsWithOutstanding: number;
    studentsWithOverdue: number;
  };
  monthlyRevenue: { month: string; billed: number; paid: number }[];
  statusBreakdown: { status: FeeStatus; count: number; amount: number }[];
  outstandingStudents: {
    studentId: number;
    studentName: string;
    className?: string | null;
    outstandingBalance: number;
    overdueBalance: number;
    invoiceCount: number;
    oldestDueDate?: string;
    maxDaysOverdue: number;
  }[];
  paymentMethodBreakdown: { method: PaymentMethod; count: number; amount: number }[];
  classBreakdown: {
    className: string;
    studentCount: number;
    invoiceCount: number;
    billed: number;
    paid: number;
    outstanding: number;
    overdueBalance: number;
    collectionRate: number;
  }[];
  invoices: FinanceInvoiceSnapshot[];
  payments: FinancePaymentSnapshot[];
};

export type FeeBalanceSummary = {
  totalBilled: number;
  totalPaid: number;
  totalOutstanding: number;
  totalOverdue: number;
  studentsWithOutstanding: number;
  studentsWithOverdue: number;
  openInvoices: number;
  overdueInvoices: number;
  dueSoonInvoices: number;
};

export type StudentBalanceSummary = {
  studentId: number;
  studentName: string;
  className?: string | null;
  totalBilled: number;
  totalPaid: number;
  outstandingBalance: number;
  overdueBalance: number;
  openInvoices: number;
  overdueInvoices: number;
  dueSoonInvoices: number;
  nextDueDate?: string;
  nextDueInvoiceId?: number;
  maxDaysOverdue: number;
  paymentReminders: {
    invoiceId: number;
    invoiceNumber?: string | null;
    billingPeriod: string;
    dueDate: string;
    remainingBalance: number;
    daysUntilDue: number;
    status: FeeStatus;
  }[];
};

export type OverdueBalanceEntry = {
  invoiceId: number;
  invoiceNumber?: string | null;
  studentId: number;
  studentName: string;
  className?: string | null;
  billingPeriod: string;
  dueDate: string;
  remainingBalance: number;
  daysOverdue: number;
  status: FeeStatus;
};

export type FinanceVoucherPreviewInvoice = {
  feeId: number;
  studentId: number;
  studentName: string;
  className?: string | null;
  invoiceNumber?: string | null;
  billingMonth: string;
  billingPeriod: string;
  amount: number;
  remainingBalance: number;
  dueDate: string;
  invoiceStatus: "existing" | "planned";
  hasExistingVoucher: boolean;
  existingVoucherDocumentNumber?: string | null;
  existingVoucherGeneratedAt?: string | null;
};

export type FinanceVoucherOperationError = {
  at: string;
  invoiceId?: number | null;
  studentId?: number | null;
  studentName?: string | null;
  billingMonth?: string | null;
  result: "generated" | "skipped" | "failed";
  error?: string | null;
};

export type FinanceVoucherPreview = {
  selection: FinanceVoucherSelectionInput;
  targetInvoiceCount: number;
  targetStudentCount: number;
  existingVoucherCount: number;
  skippedExistingCount: number;
  readyToGenerateCount: number;
  sampleInvoices: FinanceVoucherPreviewInvoice[];
};

export type FinanceVoucherOperationRecord = FinanceVoucherSelectionInput & {
  id: number;
  status: FinanceVoucherOperationStatus;
  totalInvoices: number;
  generatedCount: number;
  skippedCount: number;
  failedCount: number;
  archiveSizeBytes: number;
  requestedBy?: number | null;
  requestedByName?: string | null;
  errorMessage?: string | null;
  errorLog: FinanceVoucherOperationError[];
  startedAt?: string | null;
  completedAt?: string | null;
  cancelledAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type FinanceVoucherProgressSnapshot = FinanceVoucherOperationRecord & {
  currentInvoiceId?: number | null;
  currentInvoiceNumber?: string | null;
  currentStudentName?: string | null;
  phase: "queued" | "planning" | "rendering" | "archiving" | "completed" | "completed_with_errors" | "cancelled" | "failed";
  message: string;
};

const billingMonthSortValue = (value: string) => {
  const [year, month] = value.split("-").map(Number);
  return (year || 0) * 100 + (month || 0);
};

function dedupeStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function dedupeNumbers(values: number[]) {
  return Array.from(new Set(values.filter((value) => Number.isInteger(value) && value > 0)));
}

function sanitizeDocumentSegment(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

export function sortBillingMonths(values: string[]) {
  return [...values].sort((left, right) => billingMonthSortValue(left) - billingMonthSortValue(right));
}

export function normalizeFinanceVoucherSelection(input: FinanceVoucherSelectionInput): FinanceVoucherSelectionInput {
  return {
    billingMonths: sortBillingMonths(dedupeStrings(input.billingMonths)),
    classNames: dedupeStrings(input.classNames).sort((left, right) => left.localeCompare(right)),
    studentIds: dedupeNumbers(input.studentIds).sort((left, right) => left - right),
    force: Boolean(input.force),
  };
}

export function buildFinanceVoucherOperationLabel(selection: Pick<FinanceVoucherSelectionInput, "billingMonths" | "classNames" | "studentIds">) {
  const monthLabel = sortBillingMonths(selection.billingMonths).join(", ");
  if (selection.classNames.length > 0) return `${monthLabel} · ${selection.classNames.join(", ")}`;
  return `${monthLabel} · ${selection.studentIds.length} students`;
}

export function buildFinanceVoucherFileName(input: {
  billingMonth: string;
  invoiceNumber?: string | null;
  studentName: string;
  className?: string | null;
}) {
  const invoiceSegment = sanitizeDocumentSegment(input.invoiceNumber || "invoice");
  const studentSegment = sanitizeDocumentSegment(input.studentName || "student");
  const classSegment = sanitizeDocumentSegment(input.className || "class");
  return `${input.billingMonth}_${classSegment}_${studentSegment}_${invoiceSegment}_voucher.pdf`;
}

export function buildFinanceVoucherPreview(
  selection: FinanceVoucherSelectionInput,
  invoices: FinanceVoucherPreviewInvoice[],
): FinanceVoucherPreview {
  const existingVoucherCount = invoices.filter((invoice) => invoice.hasExistingVoucher).length;
  const targetStudentCount = new Set(invoices.map((invoice) => invoice.studentId)).size;
  return {
    selection: normalizeFinanceVoucherSelection(selection),
    targetInvoiceCount: invoices.length,
    targetStudentCount,
    existingVoucherCount,
    skippedExistingCount: selection.force ? 0 : existingVoucherCount,
    readyToGenerateCount: selection.force ? invoices.length : invoices.length - existingVoucherCount,
    sampleInvoices: invoices,
  };
}

export function formatBillingPeriod(billingMonth: string, locale = "en-US") {
  const [year, month] = billingMonth.split("-").map(Number);
  const date = new Date(year, Math.max((month || 1) - 1, 0), 1);
  return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(date);
}

export function buildDueDateForBillingMonth(billingMonth: string, dueDay: number) {
  const [year, month] = billingMonth.split("-").map(Number);
  const monthIndex = Math.max((month || 1) - 1, 0);
  const maxDay = new Date(year, monthIndex + 1, 0).getDate();
  const day = String(Math.min(Math.max(dueDay, 1), maxDay)).padStart(2, "0");
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${day}`;
}

export function normalizeFeeLineItems(amount: number, description: string, lineItems?: FeeLineItem[]) {
  const normalized = (lineItems?.length ? lineItems : [{ label: description, amount }]).map((item) => ({
    label: item.label.trim(),
    amount: Math.round(item.amount),
  }));

  const total = normalized.reduce((sum, item) => sum + item.amount, 0);
  if (total !== amount) {
    throw new Error("Invoice line items must add up to the invoice total amount");
  }
  return normalized;
}

export function calculateRemainingBalance(amount: number, paidAmount: number, totalDiscount = 0) {
  return Math.max(Math.round(amount) - Math.round(paidAmount) - Math.round(totalDiscount), 0);
}

export function isOverdue(dueDate: string, remainingBalance: number, asOf = new Date()) {
  if (remainingBalance <= 0) return false;
  return dueDate < toIsoDate(asOf);
}

export function getFeeStatus(params: { amount: number; paidAmount: number; dueDate: string; totalDiscount?: number; asOf?: Date }): FeeStatus {
  const remainingBalance = calculateRemainingBalance(params.amount, params.paidAmount, params.totalDiscount || 0);
  if (remainingBalance <= 0) return "Paid";
  if (isOverdue(params.dueDate, remainingBalance, params.asOf)) return "Overdue";
  if (params.paidAmount > 0 || (params.totalDiscount || 0) > 0) return "Partially Paid";
  return "Unpaid";
}

export function summarizeFeeLedger(amount: number, paidAmount: number, dueDate: string, totalDiscount = 0, asOf?: Date): {
  paidAmount: number;
  totalDiscount: number;
  remainingBalance: number;
  status: FeeStatus;
  isOverdue: boolean;
} {
  const remainingBalance = calculateRemainingBalance(amount, paidAmount, totalDiscount);
  const status = getFeeStatus({ amount, paidAmount, dueDate, totalDiscount, asOf });
  return {
    paidAmount: Math.max(Math.round(paidAmount), 0),
    totalDiscount: Math.max(Math.round(totalDiscount), 0),
    remainingBalance,
    status,
    isOverdue: status === "Overdue",
  };
}

export function buildDocumentNumber(prefix: string, id: number, date = new Date()) {
  const yearMonth = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}`;
  return `${prefix}-${yearMonth}-${String(id).padStart(5, "0")}`;
}

function roundPercentage(value: number) {
  return Math.round(value * 10) / 10;
}

function normalizeDateOnly(value: Date) {
  return Date.UTC(value.getFullYear(), value.getMonth(), value.getDate());
}

function parseIsoDateToUtc(dueDate: string) {
  const [year, month, day] = dueDate.split("-").map(Number);
  return Date.UTC(year || 0, Math.max((month || 1) - 1, 0), day || 1);
}

function getStudentName(invoice: FinanceInvoiceSnapshot) {
  return invoice.student?.name?.trim() || `Student #${invoice.studentId}`;
}

function getStudentClass(invoice: FinanceInvoiceSnapshot) {
  return invoice.student?.className?.trim() || null;
}

function normalizeInvoiceSnapshot<TInvoice extends FinanceInvoiceSnapshot>(invoice: TInvoice, asOf: Date) {
  const paidAmount = Math.max(Math.round(invoice.paidAmount), 0);
  const totalDiscount = Math.max(Math.round(invoice.totalDiscount || 0), 0);
  const remainingBalance = calculateRemainingBalance(invoice.amount, paidAmount, totalDiscount);
  const status = getFeeStatus({ amount: invoice.amount, paidAmount, dueDate: invoice.dueDate, totalDiscount, asOf });
  return {
    ...invoice,
    paidAmount,
    totalDiscount,
    remainingBalance,
    status,
    payments: [...(invoice.payments ?? [])],
  };
}

export function getDaysOverdue(dueDate: string, asOf = new Date()) {
  const dueUtc = parseIsoDateToUtc(dueDate);
  const asOfUtc = normalizeDateOnly(asOf);
  if (dueUtc >= asOfUtc) return 0;
  return Math.max(Math.round((asOfUtc - dueUtc) / 86400000), 0);
}

export function getDaysUntilDue(dueDate: string, asOf = new Date()) {
  const dueUtc = parseIsoDateToUtc(dueDate);
  const asOfUtc = normalizeDateOnly(asOf);
  return Math.round((dueUtc - asOfUtc) / 86400000);
}

export function buildFinanceReportSnapshot<TInvoice extends FinanceInvoiceSnapshot>(inputInvoices: TInvoice[], asOf = new Date()): FinanceReportSnapshot {
  const invoices = inputInvoices.map((invoice) => normalizeInvoiceSnapshot(invoice, asOf));
  const payments = invoices.flatMap((invoice) => invoice.payments ?? []);
  const summary = {
    totalInvoices: invoices.length,
    totalBilled: invoices.reduce((sum, invoice) => sum + invoice.amount, 0),
    totalPaid: invoices.reduce((sum, invoice) => sum + invoice.paidAmount, 0),
    totalOutstanding: invoices.reduce((sum, invoice) => sum + invoice.remainingBalance, 0),
    paidInvoices: invoices.filter((invoice) => invoice.status === "Paid").length,
    partiallyPaidInvoices: invoices.filter((invoice) => invoice.status === "Partially Paid").length,
    unpaidInvoices: invoices.filter((invoice) => invoice.status === "Unpaid").length,
    overdueInvoices: invoices.filter((invoice) => invoice.status === "Overdue").length,
    paymentsCount: payments.length,
    collectionRate: 0,
    overdueBalance: invoices.filter((invoice) => invoice.status === "Overdue").reduce((sum, invoice) => sum + invoice.remainingBalance, 0),
    studentsWithOutstanding: 0,
    studentsWithOverdue: 0,
  };
  summary.collectionRate = summary.totalBilled > 0 ? roundPercentage((summary.totalPaid / summary.totalBilled) * 100) : 0;

  const monthKeys = Array.from(
    new Set([
      ...invoices.map((invoice) => invoice.billingMonth),
      ...payments.map((payment) => payment.paymentDate.slice(0, 7)),
    ]),
  ).sort();
  const defaultMonths = monthKeys.length > 0
    ? monthKeys.slice(-6)
    : Array.from({ length: 6 }, (_, index) => {
      const date = new Date(asOf);
      date.setMonth(date.getMonth() - (5 - index), 1);
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    });
  const monthlyRevenueMap = new Map(defaultMonths.map((month) => [month, { month, billed: 0, paid: 0 }]));

  for (const invoice of invoices) {
    const bucket = monthlyRevenueMap.get(invoice.billingMonth);
    if (bucket) bucket.billed += invoice.amount;
  }

  for (const payment of payments) {
    const bucket = monthlyRevenueMap.get(payment.paymentDate.slice(0, 7));
    if (bucket) bucket.paid += payment.amount;
  }

  const statusBreakdown = feeStatuses.map((status) => ({
    status,
    count: invoices.filter((invoice) => invoice.status === status).length,
    amount: invoices.filter((invoice) => invoice.status === status).reduce((sum, invoice) => sum + invoice.amount, 0),
  }));

  const outstandingByStudent = new Map<number, {
    studentName: string;
    className?: string | null;
    outstandingBalance: number;
    overdueBalance: number;
    invoiceCount: number;
    oldestDueDate?: string;
    maxDaysOverdue: number;
  }>();
  for (const invoice of invoices.filter((entry) => entry.remainingBalance > 0)) {
    const current = outstandingByStudent.get(invoice.studentId) ?? {
      studentName: getStudentName(invoice),
      className: getStudentClass(invoice),
      outstandingBalance: 0,
      overdueBalance: 0,
      invoiceCount: 0,
      oldestDueDate: undefined,
      maxDaysOverdue: 0,
    };
    const daysOverdue = getDaysOverdue(invoice.dueDate, asOf);
    current.outstandingBalance += invoice.remainingBalance;
    current.overdueBalance += invoice.status === "Overdue" ? invoice.remainingBalance : 0;
    current.invoiceCount += 1;
    current.oldestDueDate = !current.oldestDueDate || invoice.dueDate < current.oldestDueDate ? invoice.dueDate : current.oldestDueDate;
    current.maxDaysOverdue = Math.max(current.maxDaysOverdue, daysOverdue);
    outstandingByStudent.set(invoice.studentId, current);
  }

  const paymentMethodBreakdown = paymentMethods.map((method) => ({
    method,
    count: payments.filter((payment) => payment.method === method).length,
    amount: payments.filter((payment) => payment.method === method).reduce((sum, payment) => sum + payment.amount, 0),
  }));

  const classBreakdownMap = new Map<string, {
    studentIds: Set<number>;
    invoiceCount: number;
    billed: number;
    paid: number;
    outstanding: number;
    overdueBalance: number;
  }>();
  for (const invoice of invoices) {
    const className = getStudentClass(invoice) || "Unassigned";
    const current = classBreakdownMap.get(className) ?? {
      studentIds: new Set<number>(),
      invoiceCount: 0,
      billed: 0,
      paid: 0,
      outstanding: 0,
      overdueBalance: 0,
    };
    current.studentIds.add(invoice.studentId);
    current.invoiceCount += 1;
    current.billed += invoice.amount;
    current.paid += invoice.paidAmount;
    current.outstanding += invoice.remainingBalance;
    current.overdueBalance += invoice.status === "Overdue" ? invoice.remainingBalance : 0;
    classBreakdownMap.set(className, current);
  }

  const classBreakdown = Array.from(classBreakdownMap.entries())
    .map(([className, value]) => ({
      className,
      studentCount: value.studentIds.size,
      invoiceCount: value.invoiceCount,
      billed: value.billed,
      paid: value.paid,
      outstanding: value.outstanding,
      overdueBalance: value.overdueBalance,
      collectionRate: value.billed > 0 ? roundPercentage((value.paid / value.billed) * 100) : 0,
    }))
    .sort((left, right) => right.outstanding - left.outstanding || left.className.localeCompare(right.className));

  const outstandingStudents = Array.from(outstandingByStudent.entries())
    .map(([studentId, value]) => ({ studentId, ...value }))
    .sort((left, right) => right.outstandingBalance - left.outstandingBalance || left.studentName.localeCompare(right.studentName));
  summary.studentsWithOutstanding = outstandingStudents.length;
  summary.studentsWithOverdue = outstandingStudents.filter((student) => student.overdueBalance > 0).length;

  return {
    summary,
    monthlyRevenue: Array.from(monthlyRevenueMap.values()),
    statusBreakdown,
    outstandingStudents,
    paymentMethodBreakdown,
    classBreakdown,
    invoices,
    payments: payments.sort((left, right) => `${right.paymentDate}-${right.id}`.localeCompare(`${left.paymentDate}-${left.id}`)),
  };
}

export function buildFeeBalanceSummary<TInvoice extends FinanceInvoiceSnapshot>(inputInvoices: TInvoice[], asOf = new Date()): FeeBalanceSummary {
  const invoices = inputInvoices.map((invoice) => normalizeInvoiceSnapshot(invoice, asOf));
  const openInvoices = invoices.filter((invoice) => invoice.remainingBalance > 0);
  const overdueInvoices = openInvoices.filter((invoice) => invoice.status === "Overdue");
  const dueSoonInvoices = openInvoices.filter((invoice) => {
    const daysUntilDue = getDaysUntilDue(invoice.dueDate, asOf);
    return daysUntilDue >= 0 && daysUntilDue <= 7;
  });

  return {
    totalBilled: invoices.reduce((sum, invoice) => sum + invoice.amount, 0),
    totalPaid: invoices.reduce((sum, invoice) => sum + invoice.paidAmount, 0),
    totalOutstanding: openInvoices.reduce((sum, invoice) => sum + invoice.remainingBalance, 0),
    totalOverdue: overdueInvoices.reduce((sum, invoice) => sum + invoice.remainingBalance, 0),
    studentsWithOutstanding: new Set(openInvoices.map((invoice) => invoice.studentId)).size,
    studentsWithOverdue: new Set(overdueInvoices.map((invoice) => invoice.studentId)).size,
    openInvoices: openInvoices.length,
    overdueInvoices: overdueInvoices.length,
    dueSoonInvoices: dueSoonInvoices.length,
  };
}

export function buildStudentBalanceSummary<TInvoice extends FinanceInvoiceSnapshot>(studentId: number, inputInvoices: TInvoice[], asOf = new Date()): StudentBalanceSummary {
  const invoices = inputInvoices
    .filter((invoice) => invoice.studentId === studentId)
    .map((invoice) => normalizeInvoiceSnapshot(invoice, asOf));
  const openInvoices = invoices.filter((invoice) => invoice.remainingBalance > 0).sort((left, right) => left.dueDate.localeCompare(right.dueDate));
  const overdueInvoices = openInvoices.filter((invoice) => invoice.status === "Overdue");
  const dueSoonInvoices = openInvoices.filter((invoice) => {
    const daysUntilDue = getDaysUntilDue(invoice.dueDate, asOf);
    return daysUntilDue >= 0 && daysUntilDue <= 7;
  });
  const firstInvoice = invoices[0];
  const paymentReminders = openInvoices
    .map((invoice) => ({
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      billingPeriod: invoice.billingPeriod,
      dueDate: invoice.dueDate,
      remainingBalance: invoice.remainingBalance,
      daysUntilDue: getDaysUntilDue(invoice.dueDate, asOf),
      status: invoice.status,
    }))
    .filter((invoice) => invoice.status === "Overdue" || (invoice.daysUntilDue >= 0 && invoice.daysUntilDue <= 7));

  return {
    studentId,
    studentName: firstInvoice ? getStudentName(firstInvoice) : `Student #${studentId}`,
    className: firstInvoice ? getStudentClass(firstInvoice) : null,
    totalBilled: invoices.reduce((sum, invoice) => sum + invoice.amount, 0),
    totalPaid: invoices.reduce((sum, invoice) => sum + invoice.paidAmount, 0),
    outstandingBalance: openInvoices.reduce((sum, invoice) => sum + invoice.remainingBalance, 0),
    overdueBalance: overdueInvoices.reduce((sum, invoice) => sum + invoice.remainingBalance, 0),
    openInvoices: openInvoices.length,
    overdueInvoices: overdueInvoices.length,
    dueSoonInvoices: dueSoonInvoices.length,
    nextDueDate: openInvoices[0]?.dueDate,
    nextDueInvoiceId: openInvoices[0]?.id,
    maxDaysOverdue: overdueInvoices.reduce((max, invoice) => Math.max(max, getDaysOverdue(invoice.dueDate, asOf)), 0),
    paymentReminders,
  };
}

export function buildOverdueBalanceEntries<TInvoice extends FinanceInvoiceSnapshot>(inputInvoices: TInvoice[], asOf = new Date()): OverdueBalanceEntry[] {
  return inputInvoices
    .map((invoice) => normalizeInvoiceSnapshot(invoice, asOf))
    .filter((invoice) => invoice.remainingBalance > 0 && invoice.status === "Overdue")
    .map((invoice) => ({
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      studentId: invoice.studentId,
      studentName: getStudentName(invoice),
      className: getStudentClass(invoice),
      billingPeriod: invoice.billingPeriod,
      dueDate: invoice.dueDate,
      amount: invoice.amount,
      paidAmount: invoice.paidAmount,
      totalDiscount: invoice.totalDiscount,
      remainingBalance: invoice.remainingBalance,
      daysOverdue: getDaysOverdue(invoice.dueDate, asOf),
      status: invoice.status,
    }))
    .sort((left, right) => right.daysOverdue - left.daysOverdue || right.remainingBalance - left.remainingBalance);
}

export function toIsoDate(value = new Date()) {
  return value.toISOString().slice(0, 10);
}
