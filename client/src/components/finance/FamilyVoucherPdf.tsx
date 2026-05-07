/**
 * FamilyVoucherPdf.tsx
 *
 * Monochrome, printer-friendly family fee voucher.
 * Renders two copies on a single A4 page:
 *   • Top half  → STUDENT COPY
 *   • Bottom half → SCHOOL COPY
 *
 * Design principles:
 *   - Strictly black & white — no background fills, no gradients
 *   - All structural separation via solid borders (1px black)
 *   - High-contrast text only (black on white)
 *   - @media print: hides screen chrome, forces exact layout
 *   - PKR currency formatted as "PKR X,XXX" (no decimals for whole amounts)
 */

import type { FamilyVoucherResponse } from "@/hooks/use-consolidated-vouchers";

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Format a number as "PKR X,XXX" — no trailing .00 for whole numbers */
function pkr(amount: number): string {
  const rounded = Math.round(amount * 100) / 100;
  if (Number.isInteger(rounded)) {
    return `PKR ${rounded.toLocaleString("en-PK")}`;
  }
  return `PKR ${rounded.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-PK", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

// ─── shared inline-style tokens ──────────────────────────────────────────────

const BORDER = "1px solid #000";
const FONT_FAMILY = "'Courier New', Courier, monospace";

const styles = {
  page: {
    fontFamily: FONT_FAMILY,
    fontSize: "10px",
    color: "#000",
    background: "#fff",
    width: "210mm",
    height: "143mm",       // strict half-A4 minus cut-line allowance
    overflow: "hidden",    // never spill into the other copy
    boxSizing: "border-box" as const,
    padding: "5mm 10mm",
  },
  // ── header ──
  headerRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    borderBottom: BORDER,
    paddingBottom: "4px",
    marginBottom: "4px",
  },
  schoolName: {
    fontSize: "13px",
    fontWeight: 700,
    letterSpacing: "0.5px",
    textTransform: "uppercase" as const,
  },
  schoolAddress: {
    fontSize: "8px",
    marginTop: "1px",
  },
  copyLabel: {
    border: BORDER,
    padding: "2px 8px",
    fontSize: "8px",
    fontWeight: 700,
    letterSpacing: "1.5px",
    textTransform: "uppercase" as const,
    whiteSpace: "nowrap" as const,
  },
  // ── title bar ──
  titleBar: {
    border: BORDER,
    textAlign: "center" as const,
    fontWeight: 700,
    fontSize: "11px",
    letterSpacing: "2px",
    padding: "3px 0",
    marginBottom: "4px",
  },
  // ── info grid ──
  infoGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1fr",
    border: BORDER,
    marginBottom: "4px",
  },
  infoCell: {
    padding: "3px 6px",
    borderRight: BORDER,
  },
  infoCellLast: {
    padding: "3px 6px",
  },
  infoLabel: {
    fontSize: "7px",
    fontWeight: 700,
    letterSpacing: "0.8px",
    textTransform: "uppercase" as const,
  },
  infoValue: {
    fontSize: "9px",
    fontWeight: 700,
    marginTop: "1px",
  },
  // ── guardian strip ──
  guardianStrip: {
    border: BORDER,
    borderTop: "none",
    padding: "2px 6px",
    fontSize: "8px",
    marginBottom: "4px",
  },
  // ── table ──
  table: {
    width: "100%",
    borderCollapse: "collapse" as const,
    marginBottom: "4px",
    fontSize: "8px",
  },
  th: {
    border: BORDER,
    padding: "2px 4px",
    fontWeight: 700,
    textAlign: "left" as const,
    fontSize: "7.5px",
    letterSpacing: "0.3px",
  },
  thRight: {
    border: BORDER,
    padding: "2px 4px",
    fontWeight: 700,
    textAlign: "right" as const,
    fontSize: "7.5px",
    letterSpacing: "0.3px",
  },
  tdStudent: {
    border: BORDER,
    padding: "2px 4px",
    fontWeight: 700,
    fontSize: "8px",
    background: "#f0f0f0",
  },
  td: {
    border: BORDER,
    padding: "2px 4px",
  },
  tdRight: {
    border: BORDER,
    padding: "2px 4px",
    textAlign: "right" as const,
  },
  tdSubtotal: {
    border: BORDER,
    padding: "2px 4px",
    fontWeight: 700,
    textAlign: "right" as const,
    fontSize: "8px",
  },
  // ── summary ──
  summaryGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    border: BORDER,
    marginBottom: "2px",
  },
  summaryLeft: {
    padding: "4px 6px",
    borderRight: BORDER,
    fontSize: "8px",
  },
  summaryRight: {
    padding: "4px 6px",
    display: "flex",
    flexDirection: "column" as const,
    justifyContent: "center",
    alignItems: "flex-end",
  },
  summaryRow: {
    display: "flex",
    justifyContent: "space-between",
    marginBottom: "2px",
  },
  netPayableLabel: {
    fontSize: "7px",
    fontWeight: 700,
    letterSpacing: "1px",
    textTransform: "uppercase" as const,
    marginBottom: "2px",
  },
  netPayableAmount: {
    fontSize: "18px",
    fontWeight: 700,
    letterSpacing: "-0.5px",
  },
  // ── words strip ──
  wordsStrip: {
    border: BORDER,
    borderTop: "none",
    padding: "2px 6px",
    fontSize: "7.5px",
    marginBottom: "2px",
  },
  // ── footer ──
  footer: {
    borderTop: BORDER,
    paddingTop: "2px",
    fontSize: "7px",
    textAlign: "center" as const,
    letterSpacing: "0.3px",
  },
  // ── cut line ──
  cutLine: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    height: "8mm",          // fixed height — accounts for the 297mm - 2×143mm = 11mm total; 8mm for cut-line row
    padding: "0 10mm",
    margin: "0",
    boxSizing: "border-box" as const,
  },
  cutDash: {
    flex: 1,
    borderTop: "1px dashed #000",
  },
  cutText: {
    fontSize: "8px",
    whiteSpace: "nowrap" as const,
    fontFamily: FONT_FAMILY,
  },
} as const;

// ─── single copy ─────────────────────────────────────────────────────────────

type CopyProps = {
  data: FamilyVoucherResponse;
  copyLabel: "STUDENT COPY" | "SCHOOL COPY";
  schoolName: string;
  schoolAddress?: string;
};

function VoucherCopy({ data, copyLabel, schoolName, schoolAddress }: CopyProps) {
  const { family, siblings, voucherNumber, generatedAt, dueDate, summary } = data;

  const guardianDetails = family.guardianDetails as Record<string, any> | undefined;
  const guardianName =
    guardianDetails?.primary?.name ?? guardianDetails?.secondary?.name ?? null;
  const guardianPhone =
    guardianDetails?.primary?.phone ?? guardianDetails?.secondary?.phone ?? null;

  return (
    <div style={styles.page}>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div style={styles.headerRow}>
        <div>
          <div style={styles.schoolName}>{schoolName}</div>
          {schoolAddress && <div style={styles.schoolAddress}>{schoolAddress}</div>}
        </div>
        <div style={styles.copyLabel}>{copyLabel}</div>
      </div>

      {/* ── Title bar ──────────────────────────────────────────────────── */}
      <div style={styles.titleBar}>FAMILY FEE PAYMENT VOUCHER</div>

      {/* ── Info grid ──────────────────────────────────────────────────── */}
      <div style={styles.infoGrid}>
        <div style={styles.infoCell}>
          <div style={styles.infoLabel}>Family</div>
          <div style={styles.infoValue}>{family.name}</div>
        </div>
        <div style={styles.infoCell}>
          <div style={styles.infoLabel}>Voucher No.</div>
          <div style={styles.infoValue}>{voucherNumber}</div>
        </div>
        <div style={styles.infoCellLast}>
          <div style={styles.infoLabel}>Due Date</div>
          <div style={styles.infoValue}>{fmtDate(dueDate)}</div>
        </div>
      </div>

      {/* ── Guardian strip ─────────────────────────────────────────────── */}
      {(guardianName || guardianPhone) && (
        <div style={styles.guardianStrip}>
          {[
            guardianName ? `Guardian: ${guardianName}` : null,
            guardianPhone ? `Phone: ${guardianPhone}` : null,
          ]
            .filter(Boolean)
            .join("   |   ")}
        </div>
      )}

      {/* ── Fee breakdown table ────────────────────────────────────────── */}
      <table style={styles.table}>
        <thead>
          <tr>
            <th style={{ ...styles.th, width: "28%" }}>Student / Class</th>
            <th style={{ ...styles.th, width: "22%" }}>Fee Type</th>
            <th style={{ ...styles.th, width: "20%" }}>Period</th>
            <th style={{ ...styles.thRight, width: "15%" }}>Amount</th>
            <th style={{ ...styles.thRight, width: "15%" }}>Balance</th>
          </tr>
        </thead>
        <tbody>
          {siblings.map((sibling) => {
            const allFees = [
              ...sibling.previousDues.map((f) => ({ ...f, kind: "prev" as const })),
              ...sibling.currentFees.map((f) => ({ ...f, kind: "curr" as const })),
            ];
            if (allFees.length === 0) return null;

            return (
              <>
                {/* Student name row */}
                <tr key={`hdr-${sibling.studentId}`}>
                  <td colSpan={5} style={styles.tdStudent}>
                    {sibling.studentName} — {sibling.className ?? "—"}
                  </td>
                </tr>

                {/* Fee rows */}
                {allFees.map((fee, idx) => (
                  <tr key={`fee-${sibling.studentId}-${idx}`}>
                    <td style={styles.td} />
                    <td style={styles.td}>
                      {fee.feeType}
                      {fee.kind === "prev" ? " *" : ""}
                    </td>
                    <td style={styles.td}>{fee.billingPeriod}</td>
                    <td style={styles.tdRight}>{pkr(fee.remainingBalance)}</td>
                    <td style={styles.tdRight}>{pkr(fee.remainingBalance)}</td>
                  </tr>
                ))}

                {/* Sibling subtotal */}
                <tr key={`sub-${sibling.studentId}`}>
                  <td colSpan={4} style={{ ...styles.td, fontWeight: 700, textAlign: "right" }}>
                    Subtotal — {sibling.studentName}
                  </td>
                  <td style={styles.tdSubtotal}>{pkr(sibling.total)}</td>
                </tr>
              </>
            );
          })}
        </tbody>
      </table>

      {/* Overdue note */}
      {siblings.some((s) => s.previousDues.length > 0) && (
        <div style={{ fontSize: "7px", marginBottom: "3px" }}>
          * Previous dues / overdue amounts
        </div>
      )}

      {/* ── Summary ────────────────────────────────────────────────────── */}
      <div style={styles.summaryGrid}>
        {/* Left: breakdown */}
        <div style={styles.summaryLeft}>
          {[
            { label: "Previous Dues", value: summary.previousDuesTotal },
            { label: "Current Month(s)", value: summary.currentMonthsTotal },
            { label: "Gross Total", value: summary.grossTotal },
            { label: "Discount", value: summary.discount },
          ].map((row) => (
            <div key={row.label} style={styles.summaryRow}>
              <span>{row.label}</span>
              <span style={{ fontWeight: 600 }}>{pkr(row.value)}</span>
            </div>
          ))}
          {summary.lateFee > 0 && (
            <div style={{ fontSize: "7px", marginTop: "2px" }}>
              After due date: {pkr(summary.payableAfterDueDate)} (incl. {pkr(summary.lateFee)} late fee)
            </div>
          )}
        </div>

        {/* Right: net payable */}
        <div style={styles.summaryRight}>
          <div style={styles.netPayableLabel}>NET PAYABLE</div>
          <div style={styles.netPayableAmount}>{pkr(summary.netPayable)}</div>
        </div>
      </div>

      {/* Amount in words */}
      <div style={styles.wordsStrip}>
        <strong>In Words:</strong> {summary.amountInWords}
      </div>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <div style={styles.footer}>
        Generated: {fmtDate(generatedAt)}&nbsp;&nbsp;|&nbsp;&nbsp;
        {voucherNumber}&nbsp;&nbsp;|&nbsp;&nbsp;
        Computer-generated document — no signature required.
      </div>
    </div>
  );
}

// ─── main export ─────────────────────────────────────────────────────────────

export interface FamilyVoucherPdfProps {
  data: FamilyVoucherResponse;
  schoolName: string;
  schoolAddress?: string;
}

/**
 * Renders a full A4 page with Student Copy (top) and School Copy (bottom),
 * separated by a dashed cut-line.
 *
 * Monochrome design — safe for black-and-white printers.
 * Wrap in a `ref` and call `window.print()` or use a print-window helper.
 */
export function FamilyVoucherPdf({ data, schoolName, schoolAddress }: FamilyVoucherPdfProps) {
  return (
    <>
      {/* Print-only global styles */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .family-voucher-print-root,
          .family-voucher-print-root * { visibility: visible !important; }
          .family-voucher-print-root {
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            width: 210mm !important;
            height: 297mm !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: hidden !important;
          }
          @page {
            size: A4 portrait;
            margin: 0;
          }
        }
      `}</style>

      {/*
        Root container: exactly A4 portrait (210mm × 297mm).
        Layout: [copy 143mm] + [cut-line 8mm] + [copy 143mm] = 294mm
        The remaining 3mm is absorbed by the root's overflow:hidden.
      */}
      <div
        className="family-voucher-print-root"
        style={{
          width: "210mm",
          height: "297mm",
          overflow: "hidden",
          background: "#fff",
          boxSizing: "border-box",
          fontFamily: FONT_FAMILY,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Student Copy — top half */}
        <VoucherCopy
          data={data}
          copyLabel="STUDENT COPY"
          schoolName={schoolName}
          schoolAddress={schoolAddress}
        />

        {/* Cut line — fixed 8mm row */}
        <div style={styles.cutLine}>
          <div style={styles.cutDash} />
          <span style={styles.cutText}>✂ &nbsp; Cut here</span>
          <div style={styles.cutDash} />
        </div>

        {/* School Copy — bottom half */}
        <VoucherCopy
          data={data}
          copyLabel="SCHOOL COPY"
          schoolName={schoolName}
          schoolAddress={schoolAddress}
        />
      </div>
    </>
  );
}
