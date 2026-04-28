import archiver from "archiver";
import PDFDocument from "pdfkit";
import { Writable } from "stream";
import { storage } from "../storage.ts";
import { buildDocumentNumber, buildDueDateForBillingMonth, formatBillingPeriod, isOverdue as checkIsOverdue } from "../../shared/finance.js";
import type {
  ConsolidatedFeeRow,
  ConsolidatedSummary,
  FinanceVoucherOperationError,
  FinanceVoucherOperationRecord,
  FinanceVoucherPreviewInvoice,
  FinanceVoucherProgressSnapshot,
  FinanceVoucherStartInput,
} from "../../shared/finance.js";
import type {
  ConsolidatedVoucherAuditLogRecord,
  ConsolidatedVoucherFeeLink,
  ConsolidatedVoucherWithMeta,
  FeeWithStudent,
  InsertConsolidatedVoucher,
  InsertConsolidatedVoucherFeeLink,
  StudentBillingProfileWithStudent,
} from "../../shared/schema.js";
import type { PublicSchoolSettings } from "../../shared/settings.js";

const jobProgress = new Map<number, FinanceVoucherProgressSnapshot>();
const jobSubscribers = new Map<number, Set<(chunk: string) => void>>();
const jobCancelFlags = new Set<number>();
const zipStore = new Map<number, Buffer>();
const processedStudentIds = new Set<number>();

const VOUCHER_JOB_TIMEOUT_MINUTES = 30;
const VOUCHER_JOB_HEALTHCHECK_MS = 10 * 60 * 1000;

let voucherJobHealthCheckHandle: NodeJS.Timeout | undefined;

function publishProgress(jobId: number, snapshot: FinanceVoucherProgressSnapshot) {
  jobProgress.set(jobId, snapshot);
  const subs = jobSubscribers.get(jobId);
  if (!subs) return;
  const payload = `data: ${JSON.stringify(snapshot)}\n\n`;
  for (const fn of subs) {
    try {
      fn(payload);
    } catch {
      // Subscriber disconnected.
    }
  }
}

function toTerminalPhase(status: FinanceVoucherOperationRecord["status"]): FinanceVoucherProgressSnapshot["phase"] {
  if (status === "completed_with_errors") return "completed_with_errors";
  if (status === "completed") return "completed";
  if (status === "failed") return "failed";
  if (status === "cancelled") return "cancelled";
  return "queued";
}

function sanitizeDocumentSegment(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

export function subscribeJobSse(
  jobId: number,
  send: (chunk: string) => void,
): () => void {
  if (!jobSubscribers.has(jobId)) jobSubscribers.set(jobId, new Set());
  jobSubscribers.get(jobId)!.add(send);
  const current = jobProgress.get(jobId);
  if (current) {
    try {
      send(`data: ${JSON.stringify(current)}\n\n`);
    } catch {
      // Ignore dead subscriber.
    }
  }
  return () => {
    jobSubscribers.get(jobId)?.delete(send);
  };
}

export async function recoverStaleVoucherJobs(reason = "Job timed out or server restarted") {
  try {
    const recovered = await storage.failStaleFinanceVoucherOperations(VOUCHER_JOB_TIMEOUT_MINUTES, reason);
    for (const operation of recovered) {
      publishProgress(operation.id, {
        ...operation,
        phase: "failed",
        message: reason,
        currentInvoiceId: null,
        currentInvoiceNumber: null,
        currentStudentName: null,
      });
    }
    return recovered;
  } catch (error) {
    console.error("Unable to recover stale voucher jobs:", error);
    return [];
  }
}

export function scheduleVoucherJobHealthCheck() {
  if (voucherJobHealthCheckHandle) return;
  voucherJobHealthCheckHandle = setInterval(() => {
    void recoverStaleVoucherJobs("Job timed out during health check").catch((error) => {
      console.error("Voucher job health check failed:", error);
    });
  }, VOUCHER_JOB_HEALTHCHECK_MS);
}

export async function previewVoucherJob(input: FinanceVoucherStartInput) {
  return storage.previewFinanceVoucherSelection({ ...input, previewLimit: 40 });
}

export async function startVoucherJob(
  input: FinanceVoucherStartInput,
  requestedBy?: number,
): Promise<FinanceVoucherOperationRecord> {
  await recoverStaleVoucherJobs();
  const operation = await storage.createFinanceVoucherOperation(input, requestedBy);
  void runGenerationJob(operation.id, input, requestedBy);
  return operation;
}

export function getJobProgress(jobId: number): FinanceVoucherProgressSnapshot | undefined {
  return jobProgress.get(jobId);
}

export async function getFreshJobProgress(jobId: number, preferDatabase = false): Promise<FinanceVoucherProgressSnapshot | undefined> {
  const live = preferDatabase ? undefined : jobProgress.get(jobId);
  if (live) return live;

  const operation = await storage.getFinanceVoucherOperation(jobId);
  if (!operation) return undefined;

  const phase = operation.status === "completed_with_errors"
    ? "completed_with_errors"
    : operation.status === "completed"
      ? "completed"
      : operation.status === "failed"
        ? "failed"
        : operation.status === "cancelled"
          ? "cancelled"
          : operation.status === "running"
            ? "rendering"
            : "queued";

  const message = operation.errorMessage
    || (operation.status === "running"
      ? "Voucher generation is running."
      : operation.status === "queued"
        ? "Voucher generation is queued."
        : `Voucher generation ${operation.status.replace(/_/g, " ")}.`);

  return {
    ...operation,
    phase,
    message,
    currentInvoiceId: null,
    currentInvoiceNumber: null,
    currentStudentName: null,
  };
}

export async function cancelVoucherJob(jobId: number): Promise<FinanceVoucherOperationRecord | undefined> {
  jobCancelFlags.add(jobId);
  const updated = await storage.updateFinanceVoucherOperation(jobId, {
    status: "cancelled",
    cancelledAt: new Date().toISOString(),
  });
  if (updated) {
    publishProgress(jobId, {
      ...updated,
      phase: "cancelled",
      message: "Job was cancelled by administrator",
      currentInvoiceId: null,
      currentInvoiceNumber: null,
      currentStudentName: null,
    });
  }
  return updated;
}

function generateVoucherPdf(params: {
  studentName: string;
  className: string | null | undefined;
  fatherName: string | null | undefined;
  billingPeriod: string;
  billingMonth: string;
  invoiceNumber: string | null | undefined;
  amount: number;
  dueDate: string;
  documentNumber: string;
  schoolName: string;
  schoolAddress: string | null | undefined;
}): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: "A5", margin: 30 });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const width = doc.page.width - 60;
    const schoolColor = "#5b21b6";
    const borderColor = "#a78bfa";

    doc.rect(30, 30, width, 50).fill(schoolColor);
    doc.fillColor("white")
      .fontSize(14)
      .font("Helvetica-Bold")
      .text(params.schoolName, 30, 42, { width, align: "center" });
    if (params.schoolAddress) {
      doc.fontSize(7)
        .font("Helvetica")
        .text(params.schoolAddress, 30, 58, { width, align: "center" });
    }

    doc.rect(30, 80, width, 20).fill(borderColor);
    doc.fillColor("white")
      .fontSize(9)
      .font("Helvetica-Bold")
      .text("FEE PAYMENT VOUCHER", 30, 85, { width, align: "center" });

    let y = 110;
    const col1 = 30;
    const col2 = 200;
    const labelColor = "#64748b";
    const valueColor = "#0f172a";

    const row = (label: string, value: string) => {
      doc.fillColor(labelColor).fontSize(7).font("Helvetica-Bold").text(label.toUpperCase(), col1, y);
      doc.fillColor(valueColor).fontSize(8).font("Helvetica").text(value || "-", col2, y);
      y += 14;
    };

    doc.rect(30, y - 5, width, 2).fill("#e2e8f0");
    y += 5;
    row("Student Name", params.studentName);
    row("Father Name", params.fatherName || "-");
    row("Class / Section", params.className || "-");
    row("Invoice Number", params.invoiceNumber || params.documentNumber);
    row("Billing Period", params.billingPeriod);
    row("Due Date", params.dueDate);
    doc.rect(30, y, width, 2).fill("#e2e8f0");
    y += 5;

    doc.rect(30, y, width, 45).fill("#f5f3ff");
    doc.fillColor("#5b21b6").fontSize(10).font("Helvetica-Bold")
      .text("AMOUNT PAYABLE", 40, y + 6);
    doc.fontSize(20).font("Helvetica-Bold")
      .text(`PKR ${params.amount.toLocaleString("en-PK")}`, 40, y + 18, { width: width - 20, align: "right" });
    y += 60;

    doc.rect(30, y, width, 1).fill("#e2e8f0");
    y += 8;
    doc.fillColor(labelColor).fontSize(6.5).font("Helvetica")
      .text(
        `Document: ${params.documentNumber}  |  Generated: ${new Date().toLocaleDateString("en-PK")}  |  This is a computer-generated document.`,
        30,
        y,
        { width, align: "center" },
      );

    doc.end();
  });
}

function generateConsolidatedVoucherPdf(params: {
  studentName: string;
  className: string | null | undefined;
  fatherName: string | null | undefined;
  filingMonth: string;
  billingMonths: string[];
  previousDues: Array<{
    feeId: number;
    billingMonth: string;
    billingPeriod: string;
    amount: number;
    dueDate: string;
    status: string;
    remainingBalance: number;
  }>;
  currentFees: Array<{
    feeId: number;
    billingMonth: string;
    billingPeriod: string;
    amount: number;
    dueDate: string;
    status: string;
    remainingBalance: number;
  }>;
  documentNumber: string;
  schoolName: string;
  schoolAddress: string | null | undefined;
  summary: {
    totalPreviousDues: number;
    totalCurrentFees: number;
    totalAmount: number;
  };
}): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 40 });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const width = doc.page.width - 80;
    const schoolColor = "#5b21b6";
    const sectionColor = "#f1f5f9";
    const borderColor = "#a78bfa";

    // Header
    doc.rect(40, 40, width, 60).fill(schoolColor);
    doc.fillColor("white")
      .fontSize(18)
      .font("Helvetica-Bold")
      .text(params.schoolName, 40, 52, { width, align: "center" });
    if (params.schoolAddress) {
      doc.fontSize(9)
        .font("Helvetica")
        .text(params.schoolAddress, 40, 72, { width, align: "center" });
    }

    doc.rect(40, 100, width, 25).fill(borderColor);
    doc.fillColor("white")
      .fontSize(12)
      .font("Helvetica-Bold")
      .text("CONSOLIDATED FEE VOUCHER", 40, 108, { width, align: "center" });

    let y = 135;

    // Student Info
    doc.fillColor("#64748b").fontSize(8).font("Helvetica-Bold").text("STUDENT INFORMATION", 40, y);
    y += 12;
    doc.rect(40, y, width, 40).fill(sectionColor);
    doc.fillColor("#0f172a").fontSize(10).font("Helvetica")
      .text(`Name: ${params.studentName}`, 50, y + 8);
    doc.fillColor("#0f172a").fontSize(10).font("Helvetica")
      .text(`Class: ${params.className || "-"}`, 50, y + 20);
    doc.fillColor("#0f172a").fontSize(10).font("Helvetica")
      .text(`Father/Guardian: ${params.fatherName || "-"}`, 50, y + 32);
    y += 50;

    // Voucher Info
    doc.fillColor("#64748b").fontSize(8).font("Helvetica-Bold").text(`VOUCHER DETAILS (Filing Month: ${params.filingMonth})`, 40, y);
    y += 12;
    doc.rect(40, y, width, 25).fill(sectionColor);
    doc.fillColor("#0f172a").fontSize(9).font("Helvetica")
      .text(`Document Number: ${params.documentNumber}`, 50, y + 8);
    doc.fillColor("#0f172a").fontSize(9).font("Helvetica")
      .text(`Generated: ${new Date().toLocaleDateString("en-PK")}`, 50, y + 18);
    y += 35;

    // Previous Dues Section
    if (params.previousDues.length > 0) {
      doc.fillColor("#64748b").fontSize(9).font("Helvetica-Bold").text("PREVIOUS DUES (Overdue/Unpaid)", 40, y);
      y += 10;
      doc.rect(40, y, width, 25 + params.previousDues.length * 12).fill("#fef2f2");
      let sectionY = y + 8;

      // Table headers
      doc.fillColor("#dc2626").fontSize(7).font("Helvetica-Bold").text("Month", 50, sectionY);
      doc.fillColor("#dc2626").fontSize(7).font("Helvetica-Bold").text("Period", 110, sectionY);
      doc.fillColor("#dc2626").fontSize(7).font("Helvetica-Bold").text("Amount", 250, sectionY);
      doc.fillColor("#dc2626").fontSize(7).font("Helvetica-Bold").text("Due Date", 320, sectionY);
      doc.fillColor("#dc2626").fontSize(7).font("Helvetica-Bold").text("Status", 400, sectionY);
      sectionY += 10;
      doc.rect(40, sectionY - 2, width, 1).fill("#fecaca");

      for (const due of params.previousDues) {
        doc.fillColor("#0f172a").fontSize(7).font("Helvetica").text(due.billingMonth, 50, sectionY);
        doc.fillColor("#0f172a").fontSize(7).font("Helvetica").text(due.billingPeriod, 110, sectionY);
        doc.fillColor("#0f172a").fontSize(7).font("Helvetica").text(`PKR ${due.amount.toLocaleString("en-PK")}`, 250, sectionY);
        doc.fillColor("#0f172a").fontSize(7).font("Helvetica").text(due.dueDate, 320, sectionY);
        doc.fillColor("#dc2626").fontSize(7).font("Helvetica").text(due.status, 400, sectionY);
        sectionY += 10;
      }

      // Subtotal
      doc.fillColor("#b91c1c").fontSize(9).font("Helvetica-Bold")
        .text(`Subtotal: PKR ${params.summary.totalPreviousDues.toLocaleString("en-PK")}`, width - 200, sectionY + 5);
      y += 35 + params.previousDues.length * 12;
    }

    // Current Fees Section
    if (params.currentFees.length > 0) {
      doc.fillColor("#64748b").fontSize(9).font("Helvetica-Bold").text(`CURRENT FEES (${params.billingMonths.join(", ")})`, 40, y);
      y += 10;
      doc.rect(40, y, width, 25 + params.currentFees.length * 12).fill("#f0fdf4");
      let sectionY = y + 8;

      // Table headers
      doc.fillColor("#16a34a").fontSize(7).font("Helvetica-Bold").text("Month", 50, sectionY);
      doc.fillColor("#16a34a").fontSize(7).font("Helvetica-Bold").text("Period", 110, sectionY);
      doc.fillColor("#16a34a").fontSize(7).font("Helvetica-Bold").text("Amount", 250, sectionY);
      doc.fillColor("#16a34a").fontSize(7).font("Helvetica-Bold").text("Due Date", 320, sectionY);
      doc.fillColor("#16a34a").fontSize(7).font("Helvetica-Bold").text("Status", 400, sectionY);
      sectionY += 10;
      doc.rect(40, sectionY - 2, width, 1).fill("#bbf7d0");

      for (const fee of params.currentFees) {
        const isOverdue = fee.status === "Overdue";
        const statusColor = isOverdue ? "#dc2626" : "#16a34a";
        doc.fillColor("#0f172a").fontSize(7).font("Helvetica").text(fee.billingMonth, 50, sectionY);
        doc.fillColor("#0f172a").fontSize(7).font("Helvetica").text(fee.billingPeriod, 110, sectionY);
        doc.fillColor("#0f172a").fontSize(7).font("Helvetica").text(`PKR ${fee.amount.toLocaleString("en-PK")}`, 250, sectionY);
        doc.fillColor("#0f172a").fontSize(7).font("Helvetica").text(fee.dueDate, 320, sectionY);
        doc.fillColor(statusColor).fontSize(7).font("Helvetica").text(fee.status, 400, sectionY);
        sectionY += 10;
      }

      // Subtotal
      doc.fillColor("#15803d").fontSize(9).font("Helvetica-Bold")
        .text(`Subtotal: PKR ${params.summary.totalCurrentFees.toLocaleString("en-PK")}`, width - 200, sectionY + 5);
      y += 35 + params.currentFees.length * 12;
    }

    // Grand Total
    doc.rect(40, y - 10, width, 50).fill("#f5f3ff");
    doc.fillColor("#5b21b6").fontSize(14).font("Helvetica-Bold")
      .text("GRAND TOTAL", 50, y);
    doc.fontSize(24).font("Helvetica-Bold")
      .text(`PKR ${params.summary.totalAmount.toLocaleString("en-PK")}`, width - 200, y + 20);

    // Footer
    const footerY = doc.page.height - 80;
    doc.rect(40, footerY, width, 35).fill("#e2e8f0");
    doc.fillColor("#64748b").fontSize(7).font("Helvetica")
      .text(
        `Document: ${params.documentNumber}  |  Generated: ${new Date().toLocaleDateString("en-PK")}  |  This is a computer-generated consolidated voucher.`,
        40,
        footerY + 12,
        { width, align: "center" },
      );

    doc.end();
  });
}

async function assembleZip(jobId: number, entries: { fileName: string; buffer: Buffer }[]): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const archive = archiver("zip", { zlib: { level: 6 } });
    const chunks: Buffer[] = [];

    const sink = new Writable({
      write(chunk, _enc, cb) {
        chunks.push(chunk as Buffer);
        cb();
      },
    });

    sink.on("finish", () => {
      const combined = Buffer.concat(chunks);
      zipStore.set(jobId, combined);
      resolve(combined.length);
    });

    archive.on("error", reject);
    archive.pipe(sink);

    for (const { fileName, buffer } of entries) {
      archive.append(buffer, { name: fileName });
    }

    archive.finalize();
  });
}

// ============================================================================
// CONSOLIDATED VOUCHER GENERATION
// ============================================================================

async function generateConsolidatedVouchers({
  jobId,
  invoicesToGenerate,
  input,
  requestedBy,
  schoolName,
  schoolAddress,
  profileByStudentId,
  snapshot,
  errorLog,
  entries,
}: {
  jobId: number;
  invoicesToGenerate: FinanceVoucherPreviewInvoice[];
  input: FinanceVoucherStartInput;
  requestedBy?: number;
  schoolName: string;
  schoolAddress: string | undefined;
  profileByStudentId: Map<number, StudentBillingProfileWithStudent>;
  snapshot: FinanceVoucherProgressSnapshot;
  errorLog: FinanceVoucherOperationError[];
  entries: { fileName: string; buffer: Buffer }[];
}) {
  const isConsolidated = input.consolidatedMode === true;
  const includeOverdue = input.includeOverdue !== false;

  if (!isConsolidated) return { cancelled: false, generatedCount: 0, failedCount: 0 };

  // Group invoices by student
  const invoicesByStudent = new Map<number, FinanceVoucherPreviewInvoice[]>();
  for (const invoice of invoicesToGenerate) {
    const studentInvoices = invoicesByStudent.get(invoice.studentId) ?? [];
    studentInvoices.push(invoice);
    invoicesByStudent.set(invoice.studentId, studentInvoices);
  }

  const filingMonth = input.billingMonths[0]; // anchor month
  let generatedCount = 0;
  let failedCount = 0;

  for (const [studentId, studentInvoices] of Array.from(invoicesByStudent.entries())) {
    if (jobCancelFlags.has(jobId)) {
      return { cancelled: true, generatedCount, failedCount };
    }

    const firstInvoice = studentInvoices[0];
    const studentName = firstInvoice.studentName;
    const className = firstInvoice.className;
    const profile = profileByStudentId.get(studentId);

    // Fetch all student fees to find previous dues
    let allStudentFees: FeeWithStudent[] = [];
    try {
      allStudentFees = await storage.getFeesByStudent(studentId);
    } catch (error) {
      // Handle error but continue with other students
      failedCount += 1;
      errorLog.push({
        at: new Date().toISOString(),
        invoiceId: null,
        studentId,
        studentName,
        billingMonth: null,
        result: "failed",
        error: `Failed to fetch student fees: ${error instanceof Error ? error.message : String(error)}`,
      });
      continue;
    }

    // Filter fees for this batch (selected billing months)
    const selectedMonthSet = new Set(input.billingMonths);
    const currentFeesInBatch: FeeWithStudent[] = [];
    const previousDues: FeeWithStudent[] = [];

    for (const fee of allStudentFees) {
      // Only consider fees with remaining balance > 0
      if (fee.remainingBalance <= 0) continue;

      if (fee.billingMonth === filingMonth) {
        // Special handling for filing month: dedupe by feeId
        if (!currentFeesInBatch.find((f) => f.id === fee.id)) {
          currentFeesInBatch.push(fee);
        }
      } else if (selectedMonthSet.has(fee.billingMonth)) {
        // Other months in the selection
        if (!currentFeesInBatch.find((f) => f.id === fee.id)) {
          currentFeesInBatch.push(fee);
        }
      } else if (fee.billingMonth < filingMonth) {
        // Previous month - check includeOverdue flag
        if (includeOverdue) {
          // Only include if it's actually overdue or unpaid
          const isFeeOverdue = checkIsOverdue(fee.dueDate, fee.remainingBalance);
          if (isFeeOverdue || fee.status === "Unpaid") {
            if (!previousDues.find((f) => f.id === fee.id)) {
              previousDues.push(fee);
            }
          }
        }
      }
    }

    // Ensure all explicitly selected invoices from invoicesToGenerate are included
    for (const invoice of studentInvoices) {
      if (invoice.feeId > 0) {
        const fee = await storage.getFee(invoice.feeId);
        if (fee && fee.remainingBalance > 0) {
          const isAlreadyInCurrent = currentFeesInBatch.find((f) => f.id === fee.id);
          const isAlreadyInPrevious = previousDues.find((f) => f.id === fee.id);
          if (!isAlreadyInCurrent && !isAlreadyInPrevious) {
            currentFeesInBatch.push(fee);
          }
        }
      }
    }

    // Sort by month
    currentFeesInBatch.sort((a, b) => a.billingMonth.localeCompare(b.billingMonth));
    previousDues.sort((a, b) => a.billingMonth.localeCompare(b.billingMonth));

    if (currentFeesInBatch.length === 0 && previousDues.length === 0) {
      // Nothing to generate for this student
      continue;
    }

    // Generate consolidated document number
    const baseId = generatedCount + failedCount + processedStudentIds.size + 1;
    const documentNumber = buildDocumentNumber("CV", baseId);

    // Build snapshots
    const previousDuesSnapshot: ConsolidatedFeeRow[] = previousDues.map((fee) => ({
      feeId: fee.id,
      studentId: fee.studentId,
      studentName: fee.student?.name ?? studentName,
      className: fee.student?.className ?? className,
      billingMonth: fee.billingMonth,
      billingPeriod: fee.billingPeriod,
      amount: fee.amount,
      remainingBalance: fee.remainingBalance,
      dueDate: fee.dueDate,
      status: fee.status,
      payments: fee.payments ?? [],
    }));

    const currentFeesSnapshot: ConsolidatedFeeRow[] = currentFeesInBatch.map((fee) => ({
      feeId: fee.id,
      studentId: fee.studentId,
      studentName: fee.student?.name ?? studentName,
      className: fee.student?.className ?? className,
      billingMonth: fee.billingMonth,
      billingPeriod: fee.billingPeriod,
      amount: fee.amount,
      remainingBalance: fee.remainingBalance,
      dueDate: fee.dueDate,
      status: fee.status,
      payments: fee.payments ?? [],
    }));

    const summarySnapshot: ConsolidatedSummary = {
      totalPreviousDues: previousDues.reduce((sum, f) => sum + f.remainingBalance, 0),
      totalCurrentFees: currentFeesInBatch.reduce((sum, f) => sum + f.remainingBalance, 0),
      totalAmount: previousDues.reduce((sum, f) => sum + f.remainingBalance, 0) + currentFeesInBatch.reduce((sum, f) => sum + f.remainingBalance, 0),
      previousDueCount: previousDues.length,
      currentFeeCount: currentFeesInBatch.length,
      studentCount: 1,
      previousDueStudents: previousDues.length > 0 ? 1 : 0,
      currentFeeStudents: currentFeesInBatch.length > 0 ? 1 : 0,
      monthRange: {
        earliest: previousDues.length > 0 ? previousDues[0].billingMonth : currentFeesInBatch[0]?.billingMonth || filingMonth,
        latest: currentFeesInBatch[currentFeesInBatch.length - 1]?.billingMonth || filingMonth,
      },
    };

    const now = new Date().toISOString();

    try {
      // Create consolidated voucher record
      const consolidatedVoucher = await storage.createConsolidatedVoucher({
        operationId: jobId,
        studentId,
        generatedBy: requestedBy ?? null,
        voucherDocumentNumber: documentNumber,
        filingMonth,
        billingMonths: input.billingMonths,
        status: "generated",
        previousDuesSnapshot,
        currentFeesSnapshot,
        summarySnapshot,
        generatedAt: now,
        updatedAt: now,
      });

      // Create fee links
      const feeLinks: InsertConsolidatedVoucherFeeLink[] = [
        ...previousDues.map((fee) => ({
          consolidatedVoucherId: consolidatedVoucher.id,
          feeId: fee.id,
          section: "previous_dues" as const,
          feeSnapshotAmount: fee.amount,
          feeSnapshotBalance: fee.remainingBalance,
          feeSnapshotStatus: fee.status,
        })),
        ...currentFeesInBatch.map((fee) => ({
          consolidatedVoucherId: consolidatedVoucher.id,
          feeId: fee.id,
          section: "current_fees" as const,
          feeSnapshotAmount: fee.amount,
          feeSnapshotBalance: fee.remainingBalance,
          feeSnapshotStatus: fee.status,
        })),
      ];

      if (feeLinks.length > 0) {
        await storage.createConsolidatedVoucherFeeLinks(feeLinks);
      }

      // Create audit log for generation
      await storage.createConsolidatedVoucherAuditLog({
        consolidatedVoucherId: consolidatedVoucher.id,
        studentId,
        action: "generated",
        performedBy: requestedBy ?? null,
        createdAt: now,
      });

      // Generate PDF
      const pdfBuffer = await generateConsolidatedVoucherPdf({
        studentName,
        className,
        fatherName: profile?.student?.fatherName ?? null,
        filingMonth,
        billingMonths: input.billingMonths,
        previousDues: previousDuesSnapshot,
        currentFees: currentFeesSnapshot,
        documentNumber,
        schoolName,
        schoolAddress,
        summary: {
          totalPreviousDues: summarySnapshot.totalPreviousDues,
          totalCurrentFees: summarySnapshot.totalCurrentFees,
          totalAmount: summarySnapshot.totalAmount,
        },
      });

      const safeClass = sanitizeDocumentSegment(className || "class");
      const safeStudent = sanitizeDocumentSegment(studentName || "student");
      const fileName = `consolidated_${filingMonth}_${safeClass}_${safeStudent}_${documentNumber}.pdf`;

      entries.push({ fileName, buffer: pdfBuffer });

      // Record success
      generatedCount += 1;
      processedStudentIds.add(studentId);
      errorLog.push({
        at: now,
        invoiceId: null,
        studentId,
        studentName,
        billingMonth: filingMonth,
        result: "generated",
        error: null,
      });

    } catch (error) {
      failedCount += 1;
      const message = error instanceof Error ? error.message : String(error);
      errorLog.push({
        at: new Date().toISOString(),
        invoiceId: null,
        studentId,
        studentName,
        billingMonth: filingMonth,
        result: "failed",
        error: message,
      });
      console.error("Failed to generate consolidated voucher", {
        operationId: jobId,
        studentId,
        studentName,
        error: message,
      });
    }
  }

  return { cancelled: false, generatedCount, failedCount };
}

async function runGenerationJob(
  jobId: number,
  input: FinanceVoucherStartInput,
  requestedBy?: number,
) {
  let snapshot: FinanceVoucherProgressSnapshot | undefined;
  let finalStatus: FinanceVoucherOperationRecord["status"] = "failed";
  let finalMessage = "Voucher generation failed.";
  let finalErrorMessage: string | null = null;
  let generatedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;
  let totalInvoices = 0;
  let archiveSizeBytes = 0;
  let hasNonInvoiceError = false;
  let currentInvoiceId: number | null = null;
  let currentInvoiceNumber: string | null = null;
  let currentStudentName: string | null = null;
  let errorLog: FinanceVoucherOperationRecord["errorLog"] = [];
  let cancelledAt: string | null = null;

  try {
    const operation = await storage.updateFinanceVoucherOperation(jobId, {
      status: "running",
      startedAt: new Date().toISOString(),
      completedAt: null,
      cancelledAt: null,
      errorMessage: null,
      errorLog: [],
    });
    if (!operation) return;

    snapshot = {
      ...operation,
      phase: "planning",
      message: "Resolving invoice list...",
    };
    publishProgress(jobId, snapshot);

    let schoolSettings: PublicSchoolSettings | undefined;
    try {
      schoolSettings = await storage.getPublicSchoolSettings();
    } catch {
      schoolSettings = undefined;
    }
    const schoolName = schoolSettings?.schoolInformation?.schoolName || "School Management System";
    const schoolAddress = schoolSettings?.schoolInformation?.address || undefined;

    const [preview, billingProfiles] = await Promise.all([
      storage.previewFinanceVoucherSelection({ ...input, previewLimit: 100000 }),
      storage.getBillingProfiles(),
    ]);

    totalInvoices = preview.targetInvoiceCount;
    skippedCount = preview.skippedExistingCount;
    const invoicesToGenerate = preview.sampleInvoices.filter((invoice) => input.force || !invoice.hasExistingVoucher);
    const profileByStudentId = new Map(
      billingProfiles
        .filter((profile) => profile.isActive)
        .map((profile) => [profile.studentId, profile]),
    );
    const feeIdCache = new Map(
      preview.sampleInvoices
        .filter((invoice) => invoice.feeId > 0)
        .map((invoice) => [`${invoice.studentId}:${invoice.billingMonth}`, invoice.feeId] as const),
    );

    errorLog = preview.sampleInvoices
      .filter((invoice) => invoice.hasExistingVoucher && !input.force)
      .map((invoice) => ({
        at: new Date().toISOString(),
        invoiceId: invoice.feeId > 0 ? invoice.feeId : null,
        studentId: invoice.studentId,
        studentName: invoice.studentName,
        billingMonth: invoice.billingMonth,
        result: "skipped" as const,
        error: "Voucher already exists",
      }));

    const isConsolidated = input.consolidatedMode === true;
    const includeOverdue = input.includeOverdue !== false; // default true

    const ensureVoucherFee = async (invoice: FinanceVoucherPreviewInvoice) => {
      const cacheKey = `${invoice.studentId}:${invoice.billingMonth}`;
      const cachedFeeId = feeIdCache.get(cacheKey);
      if (cachedFeeId) {
        const cached = await storage.getFee(cachedFeeId);
        if (cached) return cached;
      }

      if (invoice.feeId > 0) {
        const existing = await storage.getFee(invoice.feeId);
        if (existing) {
          feeIdCache.set(cacheKey, existing.id);
          return existing;
        }
      }

      const studentFees = await storage.getFeesByStudent(invoice.studentId);
      const existingForMonth = studentFees.find((fee) =>
        fee.billingMonth === invoice.billingMonth || fee.generatedMonth === invoice.billingMonth,
      );
      if (existingForMonth) {
        feeIdCache.set(cacheKey, existingForMonth.id);
        return existingForMonth;
      }

      const profile = profileByStudentId.get(invoice.studentId);
      if (!profile) {
        throw new Error(`No active billing profile found for ${invoice.studentName} (${invoice.billingMonth})`);
      }

      const created = await storage.createFee({
        studentId: invoice.studentId,
        amount: profile.monthlyAmount,
        billingMonth: invoice.billingMonth,
        billingPeriod: formatBillingPeriod(invoice.billingMonth),
        dueDate: buildDueDateForBillingMonth(invoice.billingMonth, profile.dueDay),
        description: `Monthly fee for ${formatBillingPeriod(invoice.billingMonth)}`,
        feeType: "Monthly Fee",
        source: "monthly",
        generatedMonth: invoice.billingMonth,
        lineItems: [{ label: `Monthly tuition for ${formatBillingPeriod(invoice.billingMonth)}`, amount: profile.monthlyAmount }],
        notes: profile.notes ?? null,
      });

      feeIdCache.set(cacheKey, created.id);
      return created;
    };

    if (invoicesToGenerate.length === 0) {
      finalStatus = "completed";
      finalMessage = "No new vouchers to generate. All matching vouchers already exist.";
    } else {
      snapshot = {
        ...snapshot,
        phase: "rendering",
        totalInvoices,
        skippedCount,
        message: `Rendering ${invoicesToGenerate.length} voucher(s)...`,
      };
      publishProgress(jobId, snapshot);

      const entries: { fileName: string; buffer: Buffer }[] = [];

      if (isConsolidated) {
        // CONSOLIDATED MODE: One PDF per student covering all dues
        const result = await generateConsolidatedVouchers({
          jobId,
          invoicesToGenerate,
          input,
          requestedBy,
          schoolName,
          schoolAddress,
          profileByStudentId,
          snapshot,
          errorLog,
          entries,
        });

        if (result.cancelled) {
          finalStatus = "cancelled";
          finalMessage = "Job was cancelled by administrator.";
          cancelledAt = new Date().toISOString();
        }

        // Update counters
        generatedCount += result.generatedCount;
        failedCount += result.failedCount;
        // errorLog is already updated by reference
      } else {
        // TRADITIONAL MODE: One PDF per invoice
        for (let index = 0; index < invoicesToGenerate.length; index += 1) {
          if (jobCancelFlags.has(jobId)) {
            finalStatus = "cancelled";
            finalMessage = "Job was cancelled by administrator.";
            cancelledAt = new Date().toISOString();
            break;
          }

          const invoice = invoicesToGenerate[index];
          currentInvoiceId = invoice.feeId > 0 ? invoice.feeId : null;
          currentInvoiceNumber = invoice.invoiceNumber ?? null;
          currentStudentName = invoice.studentName;

          publishProgress(jobId, {
            ...snapshot,
            generatedCount,
            skippedCount,
            failedCount,
            errorLog,
            currentInvoiceId,
            currentInvoiceNumber,
            currentStudentName,
            message: `Generating: ${invoice.studentName} - ${invoice.billingPeriod}`,
          });

          try {
            const feeRecord = await ensureVoucherFee(invoice);
            const documentNumber = buildDocumentNumber("VCH", feeRecord.id);
            const safeClass = sanitizeDocumentSegment(invoice.className || feeRecord.student?.className || "class");
            const safeStudent = sanitizeDocumentSegment(invoice.studentName || feeRecord.student?.name || "student");
            const fileName = `${invoice.billingMonth}_${safeClass}_${safeStudent}_${documentNumber}.pdf`;
            const pdfBuffer = await generateVoucherPdf({
              studentName: feeRecord.student?.name ?? invoice.studentName,
              className: feeRecord.student?.className ?? invoice.className,
              fatherName: feeRecord.student?.fatherName ?? null,
              billingPeriod: feeRecord.billingPeriod,
              billingMonth: feeRecord.billingMonth,
              invoiceNumber: feeRecord.invoiceNumber,
              amount: feeRecord.amount,
              dueDate: feeRecord.dueDate,
              documentNumber,
              schoolName,
              schoolAddress,
            });

            entries.push({ fileName, buffer: pdfBuffer });
            await storage.saveFinanceVoucher({
              feeId: feeRecord.id,
              operationId: jobId,
              documentNumber,
              fileName,
              billingMonth: feeRecord.billingMonth,
              generatedAt: new Date().toISOString(),
              generatedBy: requestedBy ?? null,
              generationVersion: 1,
            });

            generatedCount += 1;
            currentInvoiceId = feeRecord.id;
            currentInvoiceNumber = feeRecord.invoiceNumber ?? null;
            errorLog.push({
              at: new Date().toISOString(),
              invoiceId: feeRecord.id,
              studentId: feeRecord.studentId,
              studentName: feeRecord.student?.name ?? invoice.studentName,
              billingMonth: feeRecord.billingMonth,
              result: "generated",
              error: null,
            });
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            failedCount += 1;
            errorLog.push({
              at: new Date().toISOString(),
              invoiceId: invoice.feeId > 0 ? invoice.feeId : null,
              studentId: invoice.studentId,
              studentName: invoice.studentName,
              billingMonth: invoice.billingMonth,
              result: "failed",
              error: message,
            });
            finalErrorMessage = message;
            console.error("Failed to generate voucher", {
              operationId: jobId,
              invoiceId: invoice.feeId,
              studentId: invoice.studentId,
              billingMonth: invoice.billingMonth,
              result: "failed",
              error: message,
            });
          }

          await storage.updateFinanceVoucherOperation(jobId, {
            generatedCount,
            skippedCount,
            failedCount,
            errorLog,
            errorMessage: finalErrorMessage,
          });

          if (index % 5 === 4) {
            await new Promise((resolve) => setImmediate(resolve));
          }
        }
      }

      if (finalStatus !== "cancelled") {
        if (generatedCount > 0) {
          publishProgress(jobId, {
            ...snapshot,
            phase: "archiving",
            generatedCount,
            skippedCount,
            failedCount,
            errorLog,
            currentInvoiceId,
            currentInvoiceNumber,
            currentStudentName,
            message: "Assembling ZIP archive...",
          });

          try {
            archiveSizeBytes = await assembleZip(jobId, entries);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            hasNonInvoiceError = true;
            finalErrorMessage = `ZIP archive failed: ${message}`;
            errorLog.push({
              at: new Date().toISOString(),
              invoiceId: null,
              studentId: null,
              studentName: null,
              billingMonth: null,
              result: "failed",
              error: finalErrorMessage,
            });
            console.error("Failed to assemble ZIP archive:", message);
          }
        }

        const accountedCount = generatedCount + skippedCount + failedCount;
        if (accountedCount !== totalInvoices) {
          finalStatus = "completed_with_errors";
          finalErrorMessage = `Reconciliation mismatch: expected ${totalInvoices} invoice(s), accounted for ${accountedCount}.`;
          finalMessage = `Completed with reconciliation issues. ${generatedCount} generated, ${skippedCount} skipped, ${failedCount} failed.`;
          errorLog.push({
            at: new Date().toISOString(),
            invoiceId: null,
            studentId: null,
            studentName: null,
            billingMonth: null,
            result: "failed",
            error: finalErrorMessage,
          });
          console.warn("Voucher generation reconciliation warning", {
            operationId: jobId,
            totalInvoices,
            generatedCount,
            skippedCount,
            failedCount,
          });
        } else if (failedCount > 0) {
          finalStatus = "completed_with_errors";
          finalErrorMessage = finalErrorMessage || `${failedCount} voucher(s) failed during generation.`;
          finalMessage = `Completed with errors. ${generatedCount} generated, ${skippedCount} skipped, ${failedCount} failed.`;
        } else if (hasNonInvoiceError) {
          finalStatus = "completed_with_errors";
          finalErrorMessage = finalErrorMessage || "Voucher generation completed with non-invoice errors.";
          finalMessage = `Completed with warnings. ${generatedCount} generated, ${skippedCount} skipped.`;
        } else {
          finalStatus = "completed";
          finalMessage = `Done! ${generatedCount} voucher(s) generated, ${skippedCount} skipped.`;
        }
      }
    }
  } catch (error) {
    finalStatus = "failed";
    finalErrorMessage = error instanceof Error ? error.message : String(error);
    finalMessage = `Generation failed: ${finalErrorMessage}`;
    errorLog.push({
      at: new Date().toISOString(),
      invoiceId: currentInvoiceId,
      studentId: null,
      studentName: currentStudentName,
      billingMonth: null,
      result: "failed",
      error: finalErrorMessage,
    });
    console.error("Voucher generation job failed:", finalErrorMessage);
  } finally {
    jobCancelFlags.delete(jobId);

    try {
      const completedAt = finalStatus === "cancelled" ? null : new Date().toISOString();
      const terminal = await storage.finalizeFinanceVoucherOperation(jobId, {
        status: finalStatus,
        totalInvoices,
        generatedCount,
        skippedCount,
        failedCount,
        archiveSizeBytes,
        errorMessage: finalErrorMessage,
        errorLog,
        completedAt,
        cancelledAt: finalStatus === "cancelled" ? (cancelledAt ?? new Date().toISOString()) : null,
      });
      if (terminal) {
        publishProgress(jobId, {
          ...terminal,
          phase: toTerminalPhase(terminal.status),
          message: finalMessage,
          currentInvoiceId: null,
          currentInvoiceNumber: null,
          currentStudentName: null,
        });
      }
    } catch (error) {
      console.error("Failed to finalize voucher operation status:", error);
    }
  }
}

export function getJobZip(jobId: number): Buffer | undefined {
  return zipStore.get(jobId);
}

export function clearJobZip(jobId: number) {
  zipStore.delete(jobId);
  jobProgress.delete(jobId);
  jobSubscribers.delete(jobId);
}
