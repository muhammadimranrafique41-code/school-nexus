import { z } from "zod";

export const feeStatuses = ["Paid", "Partially Paid", "Unpaid", "Overdue"] as const;
export const paymentMethods = ["Cash", "Bank Transfer", "Card", "Mobile Money", "Cheque", "Other"] as const;
export const invoiceSources = ["manual", "monthly"] as const;

export const feeStatusSchema = z.enum(feeStatuses);
export const paymentMethodSchema = z.enum(paymentMethods);
export const invoiceSourceSchema = z.enum(invoiceSources);
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
});

export type FeeStatus = z.infer<typeof feeStatusSchema>;
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;
export type InvoiceSource = z.infer<typeof invoiceSourceSchema>;
export type FeeLineItem = z.infer<typeof feeLineItemSchema>;
export type CreateFeeInput = z.infer<typeof createFeeInputSchema>;
export type UpdateFeeInput = z.infer<typeof updateFeeInputSchema>;
export type RecordFeePaymentInput = z.infer<typeof recordFeePaymentInputSchema>;
export type BillingProfileInput = z.infer<typeof billingProfileInputSchema>;
export type GenerateMonthlyFeesInput = z.infer<typeof generateMonthlyFeesInputSchema>;

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

export function calculateRemainingBalance(amount: number, paidAmount: number) {
  return Math.max(Math.round(amount) - Math.round(paidAmount), 0);
}

export function isOverdue(dueDate: string, remainingBalance: number, asOf = new Date()) {
  if (remainingBalance <= 0) return false;
  return dueDate < toIsoDate(asOf);
}

export function getFeeStatus(params: { amount: number; paidAmount: number; dueDate: string; asOf?: Date }): FeeStatus {
  const remainingBalance = calculateRemainingBalance(params.amount, params.paidAmount);
  if (remainingBalance <= 0) return "Paid";
  if (isOverdue(params.dueDate, remainingBalance, params.asOf)) return "Overdue";
  if (params.paidAmount > 0) return "Partially Paid";
  return "Unpaid";
}

export function summarizeFeeLedger(amount: number, paidAmount: number, dueDate: string, asOf?: Date): {
  paidAmount: number;
  remainingBalance: number;
  status: FeeStatus;
  isOverdue: boolean;
} {
  const remainingBalance = calculateRemainingBalance(amount, paidAmount);
  const status = getFeeStatus({ amount, paidAmount, dueDate, asOf });
  return {
    paidAmount: Math.max(Math.round(paidAmount), 0),
    remainingBalance,
    status,
    isOverdue: status === "Overdue",
  };
}

export function buildDocumentNumber(prefix: string, id: number, date = new Date()) {
  const yearMonth = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}`;
  return `${prefix}-${yearMonth}-${String(id).padStart(5, "0")}`;
}

export function toIsoDate(value = new Date()) {
  return value.toISOString().slice(0, 10);
}