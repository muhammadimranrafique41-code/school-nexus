import archiver from "archiver";
import PDFDocument from "pdfkit";
import { Writable } from "stream";
import { storage } from "../storage.js";
import type {
  FinanceVoucherOperationRecord,
  FinanceVoucherProgressSnapshot,
  FinanceVoucherStartInput,
} from "../../shared/finance.js";
import type { PublicSchoolSettings } from "../../shared/settings.js";

/**
 * ---------------------------------------------------------------------------
 * Voucher Service – In‑Memory State
 * ---------------------------------------------------------------------------
 */
const jobProgress = new Map<number, FinanceVoucherProgressSnapshot>();
const jobSubscribers = new Map<number, Set<(chunk: string) => void>>();
const jobCancelFlags = new Set<number>();

/** --------------------------------------------------------------
 *  SSE Helpers – Publish progress to subscribers
 * -------------------------------------------------------------- */
function publishProgress(jobId: number, snapshot: FinanceVoucherProgressSnapshot) {
  jobProgress.set(jobId, snapshot);
  const subs = jobSubscribers.get(jobId);
  if (!subs) return;
  const payload = `data: ${JSON.stringify(snapshot)}\n\n`;
  for (const fn of subs) {
    try { fn(payload); } catch { /* subscriber gone */ }
  }
}

export function subscribeJobSse(
  jobId: number,
  send: (chunk: string) => void,
): () => void {
  if (!jobSubscribers.has(jobId)) jobSubscribers.set(jobId, new Set());
  jobSubscribers.get(jobId)!.add(send);
  // Send current snapshot immediately if available
  const current = jobProgress.get(jobId);
  if (current) {
    try { send(`data: ${JSON.stringify(current)}\n\n`); } catch { /* ok */ }
  }
  return () => {
    jobSubscribers.get(jobId)?.delete(send);
  };
}

/** --------------------------------------------------------------
 *  Public API – Voucher Job Lifecycle
 * -------------------------------------------------------------- */
export async function previewVoucherJob(input: FinanceVoucherStartInput) {
  return storage.previewFinanceVoucherSelection({ ...input, previewLimit: 40 });
}

export async function startVoucherJob(
  input: FinanceVoucherStartInput,
  requestedBy?: number,
): Promise<FinanceVoucherOperationRecord> {
  const operation = await storage.createFinanceVoucherOperation(input, requestedBy);
  // Fire‑and‑forget — run in background
  void runGenerationJob(operation.id, input, requestedBy);
  return operation;
}

export function getJobProgress(jobId: number): FinanceVoucherProgressSnapshot | undefined {
  return jobProgress.get(jobId);
}

export async function cancelVoucherJob(jobId: number): Promise<FinanceVoucherOperationRecord | undefined> {
  jobCancelFlags.add(jobId);
  const updated = await storage.updateFinanceVoucherOperation(jobId, {
    status: "cancelled",
    cancelledAt: new Date().toISOString(),
  });
  if (updated) {
    const snapshot: FinanceVoucherProgressSnapshot = {
      ...updated,
      phase: "cancelled",
      message: "Job was cancelled by administrator",
    };
    publishProgress(jobId, snapshot);
  }
  return updated;
}

/** --------------------------------------------------------------
 *  PDF Generation – Build voucher PDF documents
 * -------------------------------------------------------------- */
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

    const W = doc.page.width - 60;
    const schoolColor = "#5b21b6";
    const borderColor = "#a78bfa";

    // Header bar
    doc.rect(30, 30, W, 50).fill(schoolColor);
    doc.fillColor("white")
      .fontSize(14)
      .font("Helvetica-Bold")
      .text(params.schoolName, 30, 42, { width: W, align: "center" });
    if (params.schoolAddress) {
      doc.fontSize(7)
        .font("Helvetica")
        .text(params.schoolAddress, 30, 58, { width: W, align: "center" });
    }

    // Title strip
    doc.rect(30, 80, W, 20).fill(borderColor);
    doc.fillColor("white")
      .fontSize(9)
      .font("Helvetica-Bold")
      .text("FEE PAYMENT VOUCHER", 30, 85, { width: W, align: "center" });

    // Student info section
    let y = 110;
    const col1 = 30;
    const col2 = 200;
    const labelColor = "#64748b";
    const valueColor = "#0f172a";

    const row = (label: string, value: string) => {
      doc.fillColor(labelColor).fontSize(7).font("Helvetica-Bold").text(label.toUpperCase(), col1, y);
      doc.fillColor(valueColor).fontSize(8).font("Helvetica").text(value || "—", col2, y);
      y += 14;
    };

    doc.rect(30, y - 5, W, 2).fill("#e2e8f0");
    y += 5;
    row("Student Name", params.studentName);
    row("Father Name", params.fatherName || "—");
    row("Class / Section", params.className || "—");
    row("Invoice Number", params.invoiceNumber || params.documentNumber);
    row("Billing Period", params.billingPeriod);
    row("Due Date", params.dueDate);
    doc.rect(30, y, W, 2).fill("#e2e8f0"); y += 5;

    // Amount box
    doc.rect(30, y, W, 45).fill("#f5f3ff");
    doc.fillColor("#5b21b6").fontSize(10).font("Helvetica-Bold")
      .text("AMOUNT PAYABLE", 40, y + 6);
    doc.fontSize(20).font("Helvetica-Bold")
      .text(`PKR ${params.amount.toLocaleString("en-PK")}`, 40, y + 18, { width: W - 20, align: "right" });
    y += 60;

    // Footer
    doc.rect(30, y, W, 1).fill("#e2e8f0");
    y += 8;
    doc.fillColor(labelColor).fontSize(6.5).font("Helvetica")
      .text(`Document: ${params.documentNumber}  |  Generated: ${new Date().toLocaleDateString("en-PK")}  |  This is a computer-generated document.`, 30, y, { width: W, align: "center" });

    doc.end();
  });
}

/** --------------------------------------------------------------
 *  Main Generation Loop – Core of the voucher job
 * -------------------------------------------------------------- */
async function runGenerationJob(
  jobId: number,
  input: FinanceVoucherStartInput,
  requestedBy?: number,
) {
  const timestamp = new Date().toISOString();

  /** Phase – Planning --------------------------------------------------- */
  try {
    // Mark as running
    const operation = await storage.updateFinanceVoucherOperation(jobId, {
      status: "running",
      startedAt: timestamp,
    });
    if (!operation) { return; }

    // Initial SSE: planning phase
    let snapshot: FinanceVoucherProgressSnapshot = {
      ...operation,
      phase: "planning",
      message: "Resolving invoice list…",
    };
    publishProgress(jobId, snapshot);

    // Get school settings for PDF header
    let schoolSettings: PublicSchoolSettings | undefined;
    try {
      schoolSettings = await storage.getPublicSchoolSettings();
    } catch { /* use defaults */ }
    const schoolName = schoolSettings?.schoolInformation?.schoolName || "School Management System";
    const schoolAddress = schoolSettings?.schoolInformation?. address || undefined;

    /** Preview – Find matching invoices ------------------------------------- */
    const preview = await storage.previewFinanceVoucherSelection({ ...input, previewLimit: 1000 });
    const allInvoices = preview.sampleInvoices;

    // --------------------------------------------------------------
    // PHASE 1 – RESOLVE STUDENT IDs from either explicit IDs or class names
    // --------------------------------------------------------------
    const resolveStudentIds = async (): Promise<number[]> => {
      // 1️⃣ If explicit studentIds provided, use them
      if (input.studentIds && input.studentIds.length > 0) {
        return Array.from(new Set(input.studentIds));
      }

      // 2️⃣ If classNames provided, resolve to student IDs
      if (input.classNames && input.classNames.length > 0) {
        try {
          // Query the database to get all student IDs with matching class names
          // Assuming `storage` has access to db and the students table/view
          const classNameArray = input.classNames.map(c => c.trim()).filter(Boolean);
          if (classNameArray.length === 0) return [];

          // Use Drizzle query to fetch student IDs from the students view/table
          // This may need adjustment based on actual schema
          const result = await storage.db
            .select({ id: "id" })
            .from("students") // or "students-view" – adjust to your schema
            .whereIn("className", classNameArray);

          const ids = result.map(r => r.id);
          return Array.from(new Set(ids));
        } catch (error) {
          console.error("Failed to resolve class names to student IDs:", error);
          publishProgress(jobId, {
            ...snapshot,
            phase: "failed" as const,
            message: `Error resolving class names: ${error instanceof Error ? error.message : String(error)}`,
          });
          throw error;
        }
      }

      // Nothing specified
      return [];
    };

    let resolvedStudentIds: number[] = [];
    try {
      resolvedStudentIds = await resolveStudentIds();
    } catch {
      // Error already published; abort the job
      return;
    }

    // --------------------------------------------------------------
    // PHASE 2 – Filter invoices that match the resolved student IDs
    // --------------------------------------------------------------
    const invoicesToGenerate = allInvoices.filter((inv: any) => {
      // Ensure invoice belongs to the resolved student set
      const matchesStudent = resolvedStudentIds.includes(inv.studentId);

      // Check voucher existence unless force flag is set
      const hasExistingVoucher = inv.hasExistingVoucher;
      const passesFilter = input.force ? true : !hasExistingVoucher;

      return matchesStudent && passesFilter;
    });

    const totalVouchers = invoicesToGenerate.length;
    const skippedCount = allInvoices.length - totalVouchers;

    // --------------------------------------------------------------
    // Phase – Completed (nothing to generate)
    // --------------------------------------------------------------
    if (totalVouchers === 0) {
      const done = await storage.updateFinanceVoucherOperation(jobId, {
        status: "completed",
        completedAt: new Date().toISOString(),
        generatedCount: 0,
        skippedCount,
        totalInvoices: allInvoices.length,
      });
      if (done) {
        publishProgress(jobId, {
          ...done,
          phase: "completed",
          message: "No new vouchers to generate — all were already created or no matching invoices found.",
        });
      }
      return;
    }

    // --------------------------------------------------------------
    // Phase – Rendering – inform progress and loop through invoices
    // --------------------------------------------------------------
    snapshot = {
      ...snapshot,
      phase: "rendering",
      message: `Rendering ${totalVouchers} vouchers…`,
      totalInvoices: totalVouchers,
      skippedCount,
    };
    publishProgress(jobId, snapshot);

    // --------------------------------------------------------------
    // Build ZIP in memory – collect entries then zip them
    // --------------------------------------------------------------
    type VoucherEntry = { fileName: string; buffer: Buffer };
    const entries: VoucherEntry[] = [];
    let generatedCount = 0;
    let failedCount = 0;
    const docNum = (seq: number) => `VCH-${new Date().getFullYear()}-${String(seq).padStart(6, "0")}`;

    for (let i = 0; i < invoicesToGenerate.length; i++) {
      // Stop if admin cancelled the job
      if (jobCancelFlags.has(jobId)) {
        await storage.updateFinanceVoucherOperation(jobId, {
          status: "cancelled",
          cancelledAt: new Date().toISOString(),
          generatedCount,
          failedCount,
        });
        return;
      }

      const inv = invoicesToGenerate[i];

      // Pull full invoice data (student info etc.) – used for PDF fields
      let fatherName: string | null = null;
      try {
        const feeRecord = await storage.getFee(inv.feeId);
        fatherName = feeRecord?.student?.fatherName ?? null;
      } catch {
        // ignore missing fee record – continue processing other invoices
      }

      const seqNo = i + 1;
      const documentNumber = docNum(seqNo);
      // Build a deterministic file name; the sanitise routine prevents illegal chars
      const safeClass = sanitizeDocumentSegment(inv.className || "class");
      const safeStudent = sanitizeDocumentSegment(inv.studentName || "student");
      const fileName = `${inv.billingMonth}_${safeClass}_${safeStudent}_${documentNumber}.pdf`;

      // Publish incremental progress
      const progress: FinanceVoucherProgressSnapshot = {
        ...snapshot,
        generatedCount,
        currentInvoiceId: inv.feeId,
        currentInvoiceNumber: inv.invoiceNumber,
        currentStudentName: inv.studentName,
        message: `Generating: ${inv.studentName} — ${inv.billingPeriod}`,
      };
      publishProgress(jobId, progress);

      // Generate PDF for this voucher
      try {
        const pdfBuffer = await generateVoucherPdf({
          studentName: inv.studentName,
          className: inv.className,
          fatherName,
          billingPeriod: inv.billingPeriod,
          billingMonth: inv.billingMonth,
          invoiceNumber: inv.invoiceNumber,
          amount: inv.amount,
          dueDate: inv.dueDate,
          documentNumber,
          schoolName,
          schoolAddress,
        });

        entries.push({ fileName, buffer: pdfBuffer as unknown as Buffer });

        // Persist voucher record linking it to the operation
        await storage.saveFinanceVoucher({
          feeId: inv.feeId,
          operationId: jobId,
          documentNumber,
          fileName,
          billingMonth: inv.billingMonth,
          generatedAt: new Date().toISOString(),
          generatedBy: requestedBy ?? null,
          generationVersion: 1,
        });

        generatedCount++;
      } catch (error) {
        console.error(`Failed to generate voucher for student ${inv.studentName} (fee ${inv.feeId}):`, error);
        failedCount++;
      }

      // Yield after every 5 iterations to keep the Node event loop responsive
      if (i % 5 === 4) {
        await new Promise((resolve) => setImmediate(resolve));
      }
    }

    // --------------------------------------------------------------
    // Phase – Archiving – create the final ZIP file
    // --------------------------------------------------------------
    snapshot = {
      ...snapshot,
      phase: "archiving",
      generatedCount,
      failedCount,
      message: "Assembling ZIP archive…",
    };
    publishProgress(jobId, snapshot);

    let zipSizeBytes = 0;
    try {
      zipSizeBytes = await assembleZip(jobId, entries);
    } catch (error) {
      console.error("Failed to assemble ZIP archive:", error);
      // Non‑fatal – maintain ability to download individual PDFs
    }

    // --------------------------------------------------------------
    // Phase – Completed – finalize operation record & publish final msg
    // --------------------------------------------------------------
    const completed = await storage.updateFinanceVoucherOperation(jobId, {
      status: "completed",
      completedAt: new Date().toISOString(),
      generatedCount,
      skippedCount,
      totalInvoices: totalVouchers,
      archiveSizeBytes: zipSizeBytes,
    });

    if (completed) {
      publishProgress(jobId, {
        ...completed,
        phase: "completed",
        message: `Done! ${generatedCount} voucher(s) generated, ${skippedCount} skipped.`,
        currentInvoiceId: null,
        currentInvoiceNumber: null,
        currentStudentName: null,
      });
    }
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error("Voucher generation job failed:", errMsg);
    try {
      const failed = await storage.updateFinanceVoucherOperation(jobId, {
        status: "failed",
        errorMessage: errMsg,
        completedAt: new Date().toISOString(),
      });
      if (failed) {
        publishProgress(jobId, {
          ...failed,
          phase: "failed",
          message: `Generation failed: ${errMsg}`,
        });
      }
    } catch (e) {
      console.error("Failed to update operation status:", e);
    }
  } finally {
    jobCancelFlags.delete(jobId);
  }
}

/** --------------------------------------------------------------
 *  ZIP Assembly – Store the combined buffer in memory
 * -------------------------------------------------------------- */
async function assembleZip(jobId: number, entries: { fileName: string; buffer: Buffer }[]): Promise<number> {
  return new Promise<Buffer>((resolve, reject) => {
    const arc = archiver("zip", { zlib: { level: 6 } });
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

    arc.on("error", reject);
    arc.pipe(sink);

    for (const { fileName, buffer } of entries) {
      arc.append(buffer, { name: fileName });
    }

    arc.finalize();
  });
}

/** --------------------------------------------------------------
 *  ZIP Store – In‑memory buffer repository
 * -------------------------------------------------------------- */
const zipStore = new Map<number, Buffer>();

export function getJobZip(jobId: number): Buffer | undefined {
  return zipStore.get(jobId);
}

export function clearJobZip(jobId: number) {
  zipStore.delete(jobId);
  jobProgress.delete(jobId);
  jobSubscribers.delete(jobId);
}

/**
 * Helper: sanitize document segments for filenames
 */
function sanitizeDocumentSegment(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}