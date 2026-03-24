import archiver from "archiver";
import PDFDocument from "pdfkit";
import { Writable } from "stream";
import { storage } from "../storage.js";
import { buildDocumentNumber, buildDueDateForBillingMonth, formatBillingPeriod } from "../../shared/finance.js";
import type {
  FinanceVoucherOperationRecord,
  FinanceVoucherPreviewInvoice,
  FinanceVoucherProgressSnapshot,
  FinanceVoucherStartInput,
} from "../../shared/finance.js";
import type { PublicSchoolSettings } from "../../shared/settings.js";

const jobProgress = new Map<number, FinanceVoucherProgressSnapshot>();
const jobSubscribers = new Map<number, Set<(chunk: string) => void>>();
const jobCancelFlags = new Set<number>();
const zipStore = new Map<number, Buffer>();

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
