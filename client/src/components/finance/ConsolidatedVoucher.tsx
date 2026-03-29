import { formatCurrency } from "@shared/finance";
import type { ConsolidatedVoucherResponse } from "@/hooks/use-consolidated-vouchers";

// ─── Sub-component types ──────────────────────────────────────────────────────

type VoucherHeaderProps = {
  schoolName: string;
  schoolAddress?: string;
  copyLabel: string;
};

type StudentInfoBlockProps = {
  student: ConsolidatedVoucherResponse["student"];
  voucherNumber: string;
  dueDate: string;
};

type FeeSectionTableProps = {
  title: string;
  accentClass: string;
  headerClass: string;
  rows: Array<{
    sno: number;
    vNo?: string | null;
    feeType: string;
    month: string;
    amount: number;
  }>;
  subtotalLabel: string;
  subtotal: number;
};

type SummaryBlockProps = {
  summary: ConsolidatedVoucherResponse["summary"];
};

type AmountInWordsProps = {
  text: string;
};

// ─── VoucherHeader ────────────────────────────────────────────────────────────

function VoucherHeader({ schoolName, schoolAddress, copyLabel }: VoucherHeaderProps) {
  return (
    <div className="bg-[#1e1b4b] text-white text-center py-2.5 rounded-t relative">
      <p className="text-sm font-bold tracking-wide">{schoolName}</p>
      {schoolAddress && (
        <p className="text-[10px] opacity-75 mt-0.5">{schoolAddress}</p>
      )}
      <p className="text-[10px] font-semibold mt-1 tracking-widest uppercase opacity-90">
        Consolidated Fee Payment Voucher
      </p>
      <span className="absolute top-2 right-3 text-[9px] opacity-60 italic">
        {copyLabel}
      </span>
    </div>
  );
}

// ─── StudentInfoBlock ─────────────────────────────────────────────────────────

function StudentInfoBlock({ student, voucherNumber, dueDate }: StudentInfoBlockProps) {
  const field = (label: string, value: string | null | undefined) => (
    <p className="leading-4">
      <span className="text-slate-500">{label}:</span>{" "}
      <span className="font-medium text-slate-800">{value || "—"}</span>
    </p>
  );

  return (
    <div className="grid grid-cols-2 gap-x-4 border border-t-0 border-slate-300 px-2.5 py-2 text-[10px]">
      <div className="space-y-0.5">
        {field("Student ID", String(student.id))}
        {field("Student Name", student.name)}
        {field("Voucher No", voucherNumber)}
      </div>
      <div className="space-y-0.5">
        {field("Father / Guardian", student.fatherName)}
        {field("Class / Section", student.className)}
        {field("Due Date", dueDate)}
      </div>
    </div>
  );
}

// ─── FeeSectionTable ──────────────────────────────────────────────────────────

function FeeSectionTable({
  title,
  accentClass,
  headerClass,
  rows,
  subtotalLabel,
  subtotal,
}: FeeSectionTableProps) {
  if (rows.length === 0) return null;

  return (
    <>
      <div className={`text-white text-[9px] font-bold px-2 py-0.5 mt-1 ${accentClass}`}>
        ▌ {title}
      </div>
      <table className="w-full border-collapse text-[9px]">
        <thead>
          <tr className={headerClass}>
            <th className="border border-slate-200 px-1 py-0.5 text-left w-6">S.No</th>
            <th className="border border-slate-200 px-1 py-0.5 text-left w-16">V.No</th>
            <th className="border border-slate-200 px-1 py-0.5 text-left">Fee Type</th>
            <th className="border border-slate-200 px-1 py-0.5 text-left w-20">Month</th>
            <th className="border border-slate-200 px-1 py-0.5 text-right w-16">Amount</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.sno} className="even:bg-slate-50/60">
              <td className="border border-slate-200 px-1 py-0.5 text-slate-500">{row.sno}</td>
              <td className="border border-slate-200 px-1 py-0.5 text-slate-500">{row.vNo ?? "—"}</td>
              <td className="border border-slate-200 px-1 py-0.5">{row.feeType}</td>
              <td className="border border-slate-200 px-1 py-0.5">{row.month}</td>
              <td className="border border-slate-200 px-1 py-0.5 text-right font-medium">
                {formatCurrency(row.amount)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-slate-100 font-bold">
            <td colSpan={4} className="border border-slate-200 px-1 py-0.5 text-right text-slate-600">
              {subtotalLabel}
            </td>
            <td className="border border-slate-200 px-1 py-0.5 text-right">
              {formatCurrency(subtotal)}
            </td>
          </tr>
        </tfoot>
      </table>
    </>
  );
}

// ─── SummaryBlock ─────────────────────────────────────────────────────────────

function SummaryBlock({ summary }: SummaryBlockProps) {
  const rows: [string, number, string?][] = [
    ["Previous Dues", summary.previousDuesTotal],
    ["Current Month(s)", summary.currentMonthsTotal],
    ["Gross Total", summary.grossTotal, "font-bold"],
    ["Discount (−)", summary.discount, "text-emerald-700"],
    ["Net Payable", summary.netPayable, "font-bold text-[#1e1b4b]"],
    ["Late Fee (+)", summary.lateFee, "text-rose-600"],
    ["Payable Within Date", summary.payableWithinDate, "font-semibold"],
    ["Payable After Due Date", summary.payableAfterDueDate, "font-semibold text-rose-700"],
  ];

  return (
    <div className="border border-t-0 border-slate-300 mt-1">
      <div className="flex justify-between px-2 py-1 text-[9px] border-b border-slate-100">
        <span className="text-slate-500 italic">Date of Payment: _______________</span>
        <span className="text-slate-500 italic">Signature: _______________</span>
      </div>
      {rows.map(([label, value, extra]) => (
        <div
          key={label}
          className={`flex justify-between px-2 py-0.5 text-[9px] border-t border-slate-100 ${extra ?? ""}`}
        >
          <span className="text-slate-600">{label}</span>
          <span>{formatCurrency(value)}</span>
        </div>
      ))}
    </div>
  );
}

// ─── AmountInWords ────────────────────────────────────────────────────────────

function AmountInWords({ text }: AmountInWordsProps) {
  return (
    <div className="text-center py-1 text-[9px] italic font-semibold border-t border-slate-200 bg-slate-50/60">
      {text}
    </div>
  );
}

// ─── VoucherCopy (assembles one full copy) ────────────────────────────────────

type VoucherCopyProps = {
  data: ConsolidatedVoucherResponse;
  schoolName: string;
  schoolAddress?: string;
  copyLabel: string;
};

function VoucherCopy({ data, schoolName, schoolAddress, copyLabel }: VoucherCopyProps) {
  const { student, voucherNumber, dueDate, sections, summary } = data;

  const prevRows = sections.previousDues.map((r) => ({
    sno: r.sno,
    vNo: r.vNo,
    feeType: r.feeType,
    month: r.month,
    amount: r.balance,
  }));

  const currRows = sections.currentMonths.map((r) => ({
    sno: r.sno,
    vNo: r.vNo,
    feeType: r.feeType,
    month: r.month,
    amount: r.amount,
  }));

  return (
    <div className="border border-slate-300 rounded text-xs font-mono w-full">
      <VoucherHeader
        schoolName={schoolName}
        schoolAddress={schoolAddress}
        copyLabel={copyLabel}
      />
      <StudentInfoBlock
        student={student}
        voucherNumber={voucherNumber}
        dueDate={dueDate}
      />
      <FeeSectionTable
        title="PREVIOUS OUTSTANDING DUES"
        accentClass="bg-rose-700"
        headerClass="bg-red-50 text-red-700"
        rows={prevRows}
        subtotalLabel="Previous Dues Subtotal"
        subtotal={summary.previousDuesTotal}
      />
      <FeeSectionTable
        title="CURRENT / SELECTED MONTHS"
        accentClass="bg-[#1e1b4b]"
        headerClass="bg-blue-50 text-blue-700"
        rows={currRows}
        subtotalLabel="Current Months Subtotal"
        subtotal={summary.currentMonthsTotal}
      />
      <SummaryBlock summary={summary} />
      <AmountInWords text={summary.amountInWords} />
      <div className="text-center py-0.5 text-[8px] text-slate-400 border-t border-slate-200">
        ✦ Computer Generated Voucher — Not Valid Without School Stamp ✦
      </div>
    </div>
  );
}

// ─── ConsolidatedVoucher (public export — 2 copies + scissor line) ────────────

type Props = {
  data: ConsolidatedVoucherResponse;
  schoolName: string;
  schoolAddress?: string;
};

export function ConsolidatedVoucher({ data, schoolName, schoolAddress }: Props) {
  return (
    <div className="voucher-print-root space-y-2 max-w-2xl mx-auto">
      <VoucherCopy
        data={data}
        schoolName={schoolName}
        schoolAddress={schoolAddress}
        copyLabel="── Office Copy ──"
      />
      <div className="text-center text-slate-300 text-xs tracking-widest py-1 select-none print:block">
        {"- - - - - - ✂ - - - - - - - - - - ✂ - - - - - -"}
      </div>
      <VoucherCopy
        data={data}
        schoolName={schoolName}
        schoolAddress={schoolAddress}
        copyLabel="── Student Copy ──"
      />
    </div>
  );
}

// Re-export sub-components for potential standalone use
export { VoucherHeader, StudentInfoBlock, FeeSectionTable, SummaryBlock, AmountInWords };
