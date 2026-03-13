import archiver from "archiver";
import PDFDocument from "pdfkit";
import { Writable } from "stream";
import { storage } from "../storage.js";
import type { FinanceVoucherOperationRecord, FinanceVoucherProgressSnapshot, FinanceVoucherStartInput } from "../../shared/finance.js";
import type { PublicSchoolSettings } from "../../shared/settings.js";

// ─── In-memory state ─────────────────────────────────────────────────────────

const jobProgress = new Map<number, FinanceVoucherProgressSnapshot>();
const jobSubscribers = new Map<number, Set<(chunk: string) => void>>();
const jobCancelFlags = new Set<number>();

// ─── SSE helpers ─────────────────────────────────────────────────────────────

function publishProgress(jobId: number, snapshot: FinanceVoucherProgressSnapshot) {
  jobProgress.set(jobId, snapshot);
  const subs = jobSubscribers.get(jobId);
  if (!subs) return;
  const payload = `data: ${JSON.stringify(snapshot)}\n\n`;
  for (const fn of subs) {
    try { fn(payload); } catch { /* subscriber gone */ }
  }
}

export function subscribeJobSse(jobId: number, send: (chunk: string) => void): () => void {
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

// ─── Public API ──────────────────────────────────────────────────────────────

export async function previewVoucherJob(input: FinanceVoucherStartInput) {
  return storage.previewFinanceVoucherSelection({ ...input, previewLimit: 40 });
}

export async function startVoucherJob(
  input: FinanceVoucherStartInput,
  requestedBy?: number,
): Promise<FinanceVoucherOperationRecord> {
  const operation = await storage.createFinanceVoucherOperation(input, requestedBy);
  // Fire-and-forget — run in background
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

// ─── PDF generation ──────────────────────────────────────────────────────────

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
      doc.fontSize(7).font("Helvetica").text(params.schoolAddress, 30, 58, { width: W, align: "center" });
    }

    // Title strip
    doc.rect(30, 80, W, 20).fill(borderColor);
    doc.fillColor("white").fontSize(9).font("Helvetica-Bold")
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

    doc.rect(30, y - 5, W, 2).fill("#e2e8f0"); y += 5;
    row("Student Name", params.studentName);
    row("Father Name", params.fatherName || "—");
    row("Class / Section", params.className || "—");
    row("Invoice Number", params.invoiceNumber || params.documentNumber);
    row("Billing Period", params.billingPeriod);
    row("Due Date", params.dueDate);
    doc.rect(30, y, W, 2).fill("#e2e8f0"); y += 10;

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

// ─── Main generation loop ─────────────────────────────────────────────────────

async function runGenerationJob(
  jobId: number,
  input: FinanceVoucherStartInput,
  requestedBy?: number,
) {
  const timestamp = new Date().toISOString();

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
    const schoolAddress = schoolSettings?.schoolInformation?.address || undefined;

    // Get invoices from preview result
    const preview = await storage.previewFinanceVoucherSelection({ ...input, previewLimit: 1000 });
    const allInvoices = preview.sampleInvoices;
    const toGenerate = input.force
      ? allInvoices
      : allInvoices.filter((inv) => !inv.hasExistingVoucher);

    const totalVouchers = toGenerate.length;
    const skippedCount = allInvoices.length - toGenerate.length;

    if (totalVouchers === 0) {
      const done = await storage.updateFinanceVoucherOperation(jobId, {
        status: "completed",
        completedAt: new Date().toISOString(),
        generatedCount: 0,
        skippedCount,
        totalInvoices: allInvoices.length,
      });
      if (done) {
        publishProgress(jobId, { ...done, phase: "completed", message: "No new vouchers to generate — all were already created." });
      }
      return;
    }

    // Update totals
    await storage.updateFinanceVoucherOperation(jobId, {
      totalInvoices: allInvoices.length,
      skippedCount,
    });

    snapshot = { ...snapshot, phase: "rendering", message: `Rendering ${totalVouchers} vouchers…`, totalInvoices: allInvoices.length, skippedCount };
    publishProgress(jobId, snapshot);

    // Build ZIP in memory
    // We collect (name, buffer) pairs then zip
    type VoucherEntry = { fileName: string; buffer: Buffer };
    const entries: VoucherEntry[] = [];
    let generatedCount = 0;
    let failedCount = 0;
    const docNum = (seq: number) => `VCH-${new Date().getFullYear()}-${String(seq).padStart(6, "0")}`;

    for (let i = 0; i < toGenerate.length; i++) {
      if (jobCancelFlags.has(jobId)) {
        await storage.updateFinanceVoucherOperation(jobId, {
          status: "cancelled",
          cancelledAt: new Date().toISOString(),
          generatedCount,
          failedCount,
        });
        return;
      }

      const inv = toGenerate[i];
      // Get full invoice to get fatherName etc.
      let fatherName: string | null = null;
      try {
        const feeRecord = await storage.getFee(inv.feeId);
        fatherName = feeRecord?.student?.fatherName ?? null;
      } catch { /* ignore */ }

      const seqNo = i + 1;
      const documentNumber = docNum(seqNo);
      const fileName = `${inv.billingMonth}_${(inv.className || "class").replace(/\s+/g, "-").toLowerCase()}_${inv.studentName.replace(/\s+/g, "-").toLowerCase()}_${documentNumber}.pdf`;

      // Publish progress
      const progress: FinanceVoucherProgressSnapshot = {
        ...snapshot,
        generatedCount,
        currentInvoiceId: inv.feeId,
        currentInvoiceNumber: inv.invoiceNumber,
        currentStudentName: inv.studentName,
        message: `Generating: ${inv.studentName} — ${inv.billingPeriod}`,
      };
      publishProgress(jobId, progress);

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

        // Save voucher record
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
      } catch {
        failedCount++;
      }

      // Yield after every 5 to keep event loop responsive
      if (i % 5 === 4) {
        await new Promise((resolve) => setImmediate(resolve));
      }
    }

    // Assemble ZIP
    snapshot = { ...snapshot, phase: "archiving", generatedCount, failedCount, message: "Assembling ZIP archive…" };
    publishProgress(jobId, snapshot);

    let zipSizeBytes = 0;
    try {
      zipSizeBytes = await assembleZip(jobId, entries);
    } catch { /* non-fatal — download still possible from individual entries */ }

    // Mark complete
    const completed = await storage.updateFinanceVoucherOperation(jobId, {
      status: "completed",
      completedAt: new Date().toISOString(),
      generatedCount,
      skippedCount,
      failedCount,
      totalInvoices: allInvoices.length,
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
    try {
      const failed = await storage.updateFinanceVoucherOperation(jobId, {
        status: "failed",
        errorMessage: errMsg,
        completedAt: new Date().toISOString(),
      });
      if (failed) {
        publishProgress(jobId, { ...failed, phase: "failed", message: `Generation failed: ${errMsg}` });
      }
    } catch { /* ignore secondary failure */ }
  } finally {
    jobCancelFlags.delete(jobId);
  }
}

// ─── ZIP store ────────────────────────────────────────────────────────────────

// In-memory ZIP store keyed by jobId (up to 50 MB limit via archiver)
const zipStore = new Map<number, Buffer>();

async function assembleZip(jobId: number, entries: { fileName: string; buffer: Buffer }[]): Promise<number> {
  return new Promise((resolve, reject) => {
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

export function getJobZip(jobId: number): Buffer | undefined {
  return zipStore.get(jobId);
}

export function clearJobZip(jobId: number) {
  zipStore.delete(jobId);
  jobProgress.delete(jobId);
  jobSubscribers.delete(jobId);
}
