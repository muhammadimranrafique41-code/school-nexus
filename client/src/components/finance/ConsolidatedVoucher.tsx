import { formatCurrency } from "@shared/finance";
import type { FamilyVoucherResponse } from "@/hooks/use-consolidated-vouchers";

type Props = {
  data: FamilyVoucherResponse;
  schoolName: string;
  schoolAddress?: string;
};

function VoucherHeader({
  schoolName,
  schoolAddress,
  copyLabel,
}: {
  schoolName: string;
  schoolAddress?: string;
  copyLabel: string;
}) {
  return (
    <div className="relative rounded-t bg-[#1e1b4b] py-3 text-center text-white">
      <p className="text-sm font-bold tracking-wide">{schoolName}</p>
      {schoolAddress ? (
        <p className="mt-0.5 text-[10px] opacity-75">{schoolAddress}</p>
      ) : null}
      <p className="mt-1 text-[10px] font-semibold uppercase tracking-widest opacity-90">
        Family Consolidated Fee Voucher
      </p>
      <span className="absolute right-3 top-2 text-[9px] italic opacity-60">
        {copyLabel}
      </span>
    </div>
  );
}

function FamilyInfo({ data }: { data: FamilyVoucherResponse }) {
  const primary = data.family.guardianDetails.primary;

  const cell = (label: string, value: string | number | null | undefined) => (
    <p className="leading-4">
      <span className="text-slate-500">{label}:</span>{" "}
      <span className="font-medium text-slate-800">{value || "-"}</span>
    </p>
  );

  return (
    <div className="grid grid-cols-2 gap-x-4 border border-t-0 border-slate-300 px-3 py-2 text-[10px]">
      <div className="space-y-0.5">
        {cell("Family", data.family.name)}
        {cell("Voucher No", data.voucherNumber)}
        {cell("Siblings", data.family.siblingCount)}
      </div>
      <div className="space-y-0.5">
        {cell("Primary Guardian", primary?.name)}
        {cell("Contact", primary?.phone)}
        {cell("Due Date", data.dueDate)}
      </div>
    </div>
  );
}

function SiblingBreakdown({ sibling }: { sibling: FamilyVoucherResponse["siblings"][number] }) {
  const rows = [...sibling.previousDues, ...sibling.currentFees];

  return (
    <div className="mt-2 overflow-hidden rounded border border-slate-200">
      <div className="flex items-center justify-between bg-slate-100 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-700">
        <span>
          {sibling.studentName} {sibling.className ? `- ${sibling.className}` : ""}
        </span>
        <span>{formatCurrency(sibling.total)}</span>
      </div>
      <table className="w-full border-collapse text-[9px]">
        <thead>
          <tr className="bg-slate-50 text-slate-600">
            <th className="border border-slate-200 px-1 py-0.5 text-left">Invoice</th>
            <th className="border border-slate-200 px-1 py-0.5 text-left">Type</th>
            <th className="border border-slate-200 px-1 py-0.5 text-left">Period</th>
            <th className="border border-slate-200 px-1 py-0.5 text-right">Balance</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${sibling.studentId}-${row.feeId}`} className="even:bg-slate-50/60">
              <td className="border border-slate-200 px-1 py-0.5 text-slate-500">
                {row.invoiceNumber ?? "-"}
              </td>
              <td className="border border-slate-200 px-1 py-0.5">{row.feeType}</td>
              <td className="border border-slate-200 px-1 py-0.5">{row.billingPeriod}</td>
              <td className="border border-slate-200 px-1 py-0.5 text-right font-medium">
                {formatCurrency(row.remainingBalance)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SummaryBlock({ data }: { data: FamilyVoucherResponse }) {
  const rows: Array<[string, number, string?]> = [
    ["Previous Dues", data.summary.previousDuesTotal],
    ["Current Month(s)", data.summary.currentMonthsTotal],
    ["Gross Total", data.summary.grossTotal, "font-bold"],
    ["Discount (-)", data.summary.discount, "text-emerald-700"],
    ["Net Payable", data.summary.netPayable, "font-bold text-[#1e1b4b]"],
    ["Late Fee (+)", data.summary.lateFee, "text-rose-600"],
    ["Payable Within Date", data.summary.payableWithinDate, "font-semibold"],
    ["Payable After Due Date", data.summary.payableAfterDueDate, "font-semibold text-rose-700"],
  ];

  return (
    <div className="mt-2 border border-slate-300">
      {rows.map(([label, value, className]) => (
        <div
          key={label}
          className={`flex justify-between border-t border-slate-100 px-2 py-1 text-[9px] first:border-t-0 ${className ?? ""}`}
        >
          <span className="text-slate-600">{label}</span>
          <span>{formatCurrency(value)}</span>
        </div>
      ))}
      <div className="border-t border-slate-200 bg-slate-50 py-1 text-center text-[9px] italic font-semibold">
        {data.summary.amountInWords}
      </div>
    </div>
  );
}

function VoucherCopy({
  data,
  schoolName,
  schoolAddress,
  copyLabel,
}: Props & { copyLabel: string }) {
  return (
    <div className="w-full rounded border border-slate-300 text-xs font-mono">
      <VoucherHeader
        schoolName={schoolName}
        schoolAddress={schoolAddress}
        copyLabel={copyLabel}
      />
      <FamilyInfo data={data} />
      <div className="px-3 py-2">
        {data.siblings.map((sibling) => (
          <SiblingBreakdown key={sibling.studentId} sibling={sibling} />
        ))}
        <SummaryBlock data={data} />
      </div>
      <div className="border-t border-slate-200 py-1 text-center text-[8px] text-slate-400">
        Computer Generated Voucher - Not Valid Without School Stamp
      </div>
    </div>
  );
}

export function ConsolidatedVoucher({ data, schoolName, schoolAddress }: Props) {
  return (
    <div className="voucher-print-root mx-auto max-w-2xl space-y-2">
      <VoucherCopy
        data={data}
        schoolName={schoolName}
        schoolAddress={schoolAddress}
        copyLabel="Office Copy"
      />
      <div className="select-none py-1 text-center text-xs tracking-widest text-slate-300 print:block">
        {"- - - - - - - - - - - - - - - - - - - -"}
      </div>
      <VoucherCopy
        data={data}
        schoolName={schoolName}
        schoolAddress={schoolAddress}
        copyLabel="Family Copy"
      />
    </div>
  );
}
