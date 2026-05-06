/**
 * WhatsApp Voucher Service
 *
 * Delivers fee vouchers (challans) and payment reminders to parents via WhatsApp.
 * Supports both traditional (per-invoice) and consolidated vouchers.
 *
 * Flow:
 *  1. Admin generates vouchers via the existing VoucherService.
 *  2. Admin triggers WhatsApp delivery from the Finance UI.
 *  3. This service resolves the parent's phone number, sends a template or
 *     text message (optionally with a PDF link), and marks the voucher as sent.
 *
 * PDF delivery:
 *  - PDFs must be hosted at a publicly accessible URL (e.g. via S3 presigned URL).
 *  - Pass `pdfUrl` to attach the PDF as a WhatsApp document message.
 *  - If `pdfUrl` is omitted, a text-only message is sent instead.
 */

import { eq } from "drizzle-orm";
import { db } from "../db.js";
import {
  consolidatedVouchers,
  families,
  fees,
  financeVouchers,
  users,
} from "../../shared/schema.js";
import {
  isWhatsappConfigured,
  normalisePhone,
  sendDocumentMessage,
  sendTemplateMessage,
  sendTextMessage,
} from "./whatsappService.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type VoucherNotificationResult = {
  voucherId: number;
  voucherType: "standard" | "consolidated";
  studentId: number;
  studentName: string;
  recipientPhone: string;
  status: "sent" | "failed" | "skipped";
  errorMessage?: string;
  whatsappMessageId?: number;
};

export type BulkVoucherNotificationResult = {
  total: number;
  sent: number;
  failed: number;
  skipped: number;
  results: VoucherNotificationResult[];
};

export type SendVoucherInput = {
  /** finance_vouchers.id */
  voucherId: number;
  /** Publicly accessible PDF URL (optional — text-only if omitted) */
  pdfUrl?: string;
  /** Use WhatsApp template instead of plain text */
  useTemplate?: boolean;
};

export type SendConsolidatedVoucherInput = {
  /** consolidated_vouchers.id */
  consolidatedVoucherId: number;
  /** Publicly accessible PDF URL (optional) */
  pdfUrl?: string;
  useTemplate?: boolean;
};

export type SendBulkVouchersInput = {
  /** List of finance_vouchers.id values */
  voucherIds: number[];
  /** Map of voucherId → pdfUrl (optional) */
  pdfUrls?: Record<number, string>;
  useTemplate?: boolean;
};

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve the guardian WhatsApp phone number for a student.
 * Priority: user.whatsapp_phone → family guardian primary phone.
 */
async function resolveParentPhone(
  studentId: number
): Promise<{ phone: string; familyName: string; familyId: number } | null> {
  const [student] = await db
    .select()
    .from(users)
    .where(eq(users.id, studentId))
    .limit(1);

  if (!student) return null;

  // Check WhatsApp opt-in (column added by migration 0018)
  if (!student.whatsappOptIn) return null;

  // Prefer dedicated WhatsApp number on the user record
  if (student.whatsappPhone) {
    return { phone: student.whatsappPhone, familyName: student.name, familyId: student.familyId ?? 0 };
  }

  if (!student.familyId) return null;

  const [family] = await db
    .select()
    .from(families)
    .where(eq(families.id, student.familyId))
    .limit(1);

  if (!family) return null;

  const guardianPhone =
    (family.guardianDetails as { primary?: { phone?: string } } | null)
      ?.primary?.phone ?? null;

  if (!guardianPhone) return null;

  return {
    phone: guardianPhone,
    familyName: family.name,
    familyId: family.id,
  };
}

/**
 * Format PKR amount for display.
 */
function formatAmount(amount: number): string {
  return new Intl.NumberFormat("en-PK", {
    style: "currency",
    currency: "PKR",
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Format a date string for display.
 */
function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString("en-PK", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Standard voucher delivery
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Send a WhatsApp notification for a single standard fee voucher.
 */
export async function sendVoucherNotification(
  input: SendVoucherInput
): Promise<VoucherNotificationResult> {
  if (!isWhatsappConfigured()) {
    return {
      voucherId: input.voucherId,
      voucherType: "standard",
      studentId: 0,
      studentName: "",
      recipientPhone: "",
      status: "skipped",
      errorMessage: "WhatsApp is not configured (missing env vars).",
    };
  }

  // Load voucher + fee + student
  const [voucher] = await db
    .select()
    .from(financeVouchers)
    .where(eq(financeVouchers.id, input.voucherId))
    .limit(1);

  if (!voucher) {
    throw new Error(`Finance voucher ${input.voucherId} not found.`);
  }

  const [fee] = await db
    .select()
    .from(fees)
    .where(eq(fees.id, voucher.feeId))
    .limit(1);

  if (!fee) {
    throw new Error(`Fee ${voucher.feeId} not found for voucher ${input.voucherId}.`);
  }

  const [student] = await db
    .select()
    .from(users)
    .where(eq(users.id, fee.studentId))
    .limit(1);

  if (!student) {
    throw new Error(`Student ${fee.studentId} not found.`);
  }

  const parentContact = await resolveParentPhone(fee.studentId);

  if (!parentContact) {
    return {
      voucherId: input.voucherId,
      voucherType: "standard",
      studentId: fee.studentId,
      studentName: student.name,
      recipientPhone: "",
      status: "skipped",
      errorMessage: "No guardian phone number found or parent opted out.",
    };
  }

  const normalisedPhone = normalisePhone(parentContact.phone);
  if (!normalisedPhone || normalisedPhone.length < 8) {
    return {
      voucherId: input.voucherId,
      voucherType: "standard",
      studentId: fee.studentId,
      studentName: student.name,
      recipientPhone: parentContact.phone,
      status: "skipped",
      errorMessage: "Invalid phone number format.",
    };
  }

  try {
    let whatsappMessageId: number | undefined;

    if (input.pdfUrl) {
      // Send PDF document with caption
      const caption = buildVoucherCaption({
        studentName: student.name,
        billingPeriod: fee.billingPeriod,
        amount: fee.remainingBalance,
        dueDate: fee.dueDate,
        documentNumber: voucher.documentNumber,
      });

      const result = await sendDocumentMessage({
        to: normalisedPhone,
        documentUrl: input.pdfUrl,
        caption,
        filename: voucher.fileName,
        recipientId: fee.studentId,
        recipientType: "student",
        metadata: {
          voucher_id: voucher.id,
          fee_id: fee.id,
          family_id: parentContact.familyId,
          document_number: voucher.documentNumber,
        },
      });
      whatsappMessageId = result.messageId;
    } else if (input.useTemplate) {
      const result = await sendTemplateMessage({
        to: normalisedPhone,
        templateName: "fee_voucher_ready",
        variables: [
          parentContact.familyName,
          student.name,
          fee.billingPeriod,
          formatAmount(fee.remainingBalance),
          formatDate(fee.dueDate),
        ],
        recipientId: fee.studentId,
        recipientType: "student",
        metadata: {
          voucher_id: voucher.id,
          fee_id: fee.id,
          family_id: parentContact.familyId,
        },
      });
      whatsappMessageId = result.messageId;
    } else {
      // Plain-text fallback
      const body = buildVoucherTextMessage({
        familyName: parentContact.familyName,
        studentName: student.name,
        billingPeriod: fee.billingPeriod,
        amount: fee.remainingBalance,
        dueDate: fee.dueDate,
        documentNumber: voucher.documentNumber,
      });

      const result = await sendTextMessage({
        to: normalisedPhone,
        body,
        recipientId: fee.studentId,
        recipientType: "student",
        metadata: {
          voucher_id: voucher.id,
          fee_id: fee.id,
          family_id: parentContact.familyId,
        },
      });
      whatsappMessageId = result.messageId;
    }

    // Mark voucher as WhatsApp-sent
    await db
      .update(financeVouchers)
      .set({
        whatsappSent: true,
        whatsappSentAt: new Date(),
        whatsappMessageId: whatsappMessageId ?? null,
      })
      .where(eq(financeVouchers.id, input.voucherId));

    console.log(
      `[WhatsApp Voucher] Voucher ${input.voucherId} sent to ${normalisedPhone} (student: ${student.name})`
    );

    return {
      voucherId: input.voucherId,
      voucherType: "standard",
      studentId: fee.studentId,
      studentName: student.name,
      recipientPhone: normalisedPhone,
      status: "sent",
      whatsappMessageId,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(
      `[WhatsApp Voucher] Failed to send voucher ${input.voucherId}:`,
      msg
    );
    return {
      voucherId: input.voucherId,
      voucherType: "standard",
      studentId: fee.studentId,
      studentName: student.name,
      recipientPhone: normalisedPhone,
      status: "failed",
      errorMessage: msg,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Consolidated voucher delivery
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Send a WhatsApp notification for a consolidated fee voucher.
 */
export async function sendConsolidatedVoucherNotification(
  input: SendConsolidatedVoucherInput
): Promise<VoucherNotificationResult> {
  if (!isWhatsappConfigured()) {
    return {
      voucherId: input.consolidatedVoucherId,
      voucherType: "consolidated",
      studentId: 0,
      studentName: "",
      recipientPhone: "",
      status: "skipped",
      errorMessage: "WhatsApp is not configured (missing env vars).",
    };
  }

  const [voucher] = await db
    .select()
    .from(consolidatedVouchers)
    .where(eq(consolidatedVouchers.id, input.consolidatedVoucherId))
    .limit(1);

  if (!voucher) {
    throw new Error(
      `Consolidated voucher ${input.consolidatedVoucherId} not found.`
    );
  }

  const [student] = await db
    .select()
    .from(users)
    .where(eq(users.id, voucher.studentId))
    .limit(1);

  if (!student) {
    throw new Error(`Student ${voucher.studentId} not found.`);
  }

  const parentContact = await resolveParentPhone(voucher.studentId);

  if (!parentContact) {
    return {
      voucherId: input.consolidatedVoucherId,
      voucherType: "consolidated",
      studentId: voucher.studentId,
      studentName: student.name,
      recipientPhone: "",
      status: "skipped",
      errorMessage: "No guardian phone number found or parent opted out.",
    };
  }

  const normalisedPhone = normalisePhone(parentContact.phone);
  if (!normalisedPhone || normalisedPhone.length < 8) {
    return {
      voucherId: input.consolidatedVoucherId,
      voucherType: "consolidated",
      studentId: voucher.studentId,
      studentName: student.name,
      recipientPhone: parentContact.phone,
      status: "skipped",
      errorMessage: "Invalid phone number format.",
    };
  }

  const summary = voucher.summarySnapshot as {
    totalAmount?: number;
  } | null;
  const totalAmount = summary?.totalAmount ?? 0;

  try {
    let whatsappMessageId: number | undefined;

    if (input.pdfUrl) {
      const caption = buildConsolidatedVoucherCaption({
        studentName: student.name,
        filingMonth: voucher.filingMonth,
        totalAmount,
        documentNumber: voucher.voucherDocumentNumber,
      });

      const result = await sendDocumentMessage({
        to: normalisedPhone,
        documentUrl: input.pdfUrl,
        caption,
        filename: voucher.pdfFileName ?? `${voucher.voucherDocumentNumber}.pdf`,
        recipientId: voucher.studentId,
        recipientType: "student",
        metadata: {
          consolidated_voucher_id: voucher.id,
          family_id: parentContact.familyId,
          document_number: voucher.voucherDocumentNumber,
        },
      });
      whatsappMessageId = result.messageId;
    } else if (input.useTemplate) {
      const result = await sendTemplateMessage({
        to: normalisedPhone,
        templateName: "fee_voucher_ready",
        variables: [
          parentContact.familyName,
          student.name,
          `Consolidated (${voucher.filingMonth})`,
          formatAmount(totalAmount),
          "See voucher for due dates",
        ],
        recipientId: voucher.studentId,
        recipientType: "student",
        metadata: {
          consolidated_voucher_id: voucher.id,
          family_id: parentContact.familyId,
        },
      });
      whatsappMessageId = result.messageId;
    } else {
      const body = buildConsolidatedVoucherTextMessage({
        familyName: parentContact.familyName,
        studentName: student.name,
        filingMonth: voucher.filingMonth,
        totalAmount,
        documentNumber: voucher.voucherDocumentNumber,
      });

      const result = await sendTextMessage({
        to: normalisedPhone,
        body,
        recipientId: voucher.studentId,
        recipientType: "student",
        metadata: {
          consolidated_voucher_id: voucher.id,
          family_id: parentContact.familyId,
        },
      });
      whatsappMessageId = result.messageId;
    }

    // Mark consolidated voucher as WhatsApp-sent
    await db
      .update(consolidatedVouchers)
      .set({
        whatsappSent: true,
        whatsappSentAt: new Date(),
        whatsappMessageId: whatsappMessageId ?? null,
      })
      .where(eq(consolidatedVouchers.id, input.consolidatedVoucherId));

    console.log(
      `[WhatsApp Voucher] Consolidated voucher ${input.consolidatedVoucherId} sent to ${normalisedPhone} (student: ${student.name})`
    );

    return {
      voucherId: input.consolidatedVoucherId,
      voucherType: "consolidated",
      studentId: voucher.studentId,
      studentName: student.name,
      recipientPhone: normalisedPhone,
      status: "sent",
      whatsappMessageId,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(
      `[WhatsApp Voucher] Failed to send consolidated voucher ${input.consolidatedVoucherId}:`,
      msg
    );
    return {
      voucherId: input.consolidatedVoucherId,
      voucherType: "consolidated",
      studentId: voucher.studentId,
      studentName: student.name,
      recipientPhone: normalisedPhone,
      status: "failed",
      errorMessage: msg,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Bulk delivery
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Send WhatsApp notifications for multiple standard vouchers in one call.
 * Processes sequentially to avoid rate-limiting the Meta API.
 */
export async function sendBulkVoucherNotifications(
  input: SendBulkVouchersInput
): Promise<BulkVoucherNotificationResult> {
  const results: VoucherNotificationResult[] = [];

  for (const voucherId of input.voucherIds) {
    const result = await sendVoucherNotification({
      voucherId,
      pdfUrl: input.pdfUrls?.[voucherId],
      useTemplate: input.useTemplate,
    });
    results.push(result);

    // Small delay between sends to respect Meta rate limits (80 messages/sec)
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  return {
    total: results.length,
    sent: results.filter((r) => r.status === "sent").length,
    failed: results.filter((r) => r.status === "failed").length,
    skipped: results.filter((r) => r.status === "skipped").length,
    results,
  };
}

/**
 * Send a fee payment reminder for a specific fee record.
 */
export async function sendFeeReminder(params: {
  feeId: number;
  useTemplate?: boolean;
}): Promise<VoucherNotificationResult> {
  if (!isWhatsappConfigured()) {
    return {
      voucherId: params.feeId,
      voucherType: "standard",
      studentId: 0,
      studentName: "",
      recipientPhone: "",
      status: "skipped",
      errorMessage: "WhatsApp is not configured (missing env vars).",
    };
  }

  const [fee] = await db
    .select()
    .from(fees)
    .where(eq(fees.id, params.feeId))
    .limit(1);

  if (!fee) throw new Error(`Fee ${params.feeId} not found.`);

  const [student] = await db
    .select()
    .from(users)
    .where(eq(users.id, fee.studentId))
    .limit(1);

  if (!student) throw new Error(`Student ${fee.studentId} not found.`);

  const parentContact = await resolveParentPhone(fee.studentId);

  if (!parentContact) {
    return {
      voucherId: params.feeId,
      voucherType: "standard",
      studentId: fee.studentId,
      studentName: student.name,
      recipientPhone: "",
      status: "skipped",
      errorMessage: "No guardian phone number found or parent opted out.",
    };
  }

  const normalisedPhone = normalisePhone(parentContact.phone);
  if (!normalisedPhone || normalisedPhone.length < 8) {
    return {
      voucherId: params.feeId,
      voucherType: "standard",
      studentId: fee.studentId,
      studentName: student.name,
      recipientPhone: parentContact.phone,
      status: "skipped",
      errorMessage: "Invalid phone number format.",
    };
  }

  try {
    let whatsappMessageId: number | undefined;

    if (params.useTemplate) {
      const result = await sendTemplateMessage({
        to: normalisedPhone,
        templateName: "fee_reminder",
        variables: [
          parentContact.familyName,
          formatAmount(fee.remainingBalance),
          student.name,
          fee.billingPeriod,
          formatDate(fee.dueDate),
        ],
        recipientId: fee.studentId,
        recipientType: "student",
        metadata: {
          fee_id: fee.id,
          family_id: parentContact.familyId,
          reminder: true,
        },
      });
      whatsappMessageId = result.messageId;
    } else {
      const body = buildFeeReminderText({
        familyName: parentContact.familyName,
        studentName: student.name,
        billingPeriod: fee.billingPeriod,
        amount: fee.remainingBalance,
        dueDate: fee.dueDate,
      });

      const result = await sendTextMessage({
        to: normalisedPhone,
        body,
        recipientId: fee.studentId,
        recipientType: "student",
        metadata: {
          fee_id: fee.id,
          family_id: parentContact.familyId,
          reminder: true,
        },
      });
      whatsappMessageId = result.messageId;
    }

    console.log(
      `[WhatsApp Voucher] Fee reminder for fee ${params.feeId} sent to ${normalisedPhone}`
    );

    return {
      voucherId: params.feeId,
      voucherType: "standard",
      studentId: fee.studentId,
      studentName: student.name,
      recipientPhone: normalisedPhone,
      status: "sent",
      whatsappMessageId,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(
      `[WhatsApp Voucher] Failed to send fee reminder for fee ${params.feeId}:`,
      msg
    );
    return {
      voucherId: params.feeId,
      voucherType: "standard",
      studentId: fee.studentId,
      studentName: student.name,
      recipientPhone: normalisedPhone,
      status: "failed",
      errorMessage: msg,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Message body builders
// ─────────────────────────────────────────────────────────────────────────────

function buildVoucherCaption(params: {
  studentName: string;
  billingPeriod: string;
  amount: number;
  dueDate: string;
  documentNumber: string;
}): string {
  return (
    `📄 *Fee Voucher – ${params.billingPeriod}*\n` +
    `Student: ${params.studentName}\n` +
    `Amount: ${formatAmount(params.amount)}\n` +
    `Due: ${formatDate(params.dueDate)}\n` +
    `Ref: ${params.documentNumber}`
  );
}

function buildConsolidatedVoucherCaption(params: {
  studentName: string;
  filingMonth: string;
  totalAmount: number;
  documentNumber: string;
}): string {
  return (
    `📄 *Consolidated Fee Voucher – ${params.filingMonth}*\n` +
    `Student: ${params.studentName}\n` +
    `Total Amount: ${formatAmount(params.totalAmount)}\n` +
    `Ref: ${params.documentNumber}`
  );
}

function buildVoucherTextMessage(params: {
  familyName: string;
  studentName: string;
  billingPeriod: string;
  amount: number;
  dueDate: string;
  documentNumber: string;
}): string {
  return (
    `Dear ${params.familyName},\n\n` +
    `📄 *Fee Voucher Ready*\n\n` +
    `Student: ${params.studentName}\n` +
    `Period: ${params.billingPeriod}\n` +
    `Amount: ${formatAmount(params.amount)}\n` +
    `Due Date: ${formatDate(params.dueDate)}\n` +
    `Reference: ${params.documentNumber}\n\n` +
    `Please pay before the due date to avoid late fees.\n\n` +
    `— Schooliee School Management`
  );
}

function buildConsolidatedVoucherTextMessage(params: {
  familyName: string;
  studentName: string;
  filingMonth: string;
  totalAmount: number;
  documentNumber: string;
}): string {
  return (
    `Dear ${params.familyName},\n\n` +
    `📄 *Consolidated Fee Voucher*\n\n` +
    `Student: ${params.studentName}\n` +
    `Filing Month: ${params.filingMonth}\n` +
    `Total Amount: ${formatAmount(params.totalAmount)}\n` +
    `Reference: ${params.documentNumber}\n\n` +
    `This voucher includes all outstanding dues. Please pay at your earliest convenience.\n\n` +
    `— Schooliee School Management`
  );
}

function buildFeeReminderText(params: {
  familyName: string;
  studentName: string;
  billingPeriod: string;
  amount: number;
  dueDate: string;
}): string {
  return (
    `Dear ${params.familyName},\n\n` +
    `⚠️ *Fee Payment Reminder*\n\n` +
    `This is a reminder that the fee for *${params.studentName}* is due.\n\n` +
    `Period: ${params.billingPeriod}\n` +
    `Amount: ${formatAmount(params.amount)}\n` +
    `Due Date: ${formatDate(params.dueDate)}\n\n` +
    `Please pay at your earliest convenience to avoid late charges.\n\n` +
    `— Schooliee School Management`
  );
}
