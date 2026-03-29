import type { StudentPreviewItem } from "@/hooks/use-consolidated-vouchers";
import { formatCurrency } from "@shared/finance";

export function BreakdownPanel({ student }: { student: StudentPreviewItem }) {
  const { previousDues, currentMonths } = student.breakdown;

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-4 text-sm">
      {previousDues.length > 0 && (
        <div>
          <p className="font-semibold text-red-700 mb-2">PREVIOUS DUES</p>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-500 border-b">
                <th className="text-left pb-1">V.No</th>
                <th className="text-left pb-1">Fee Type</th>
                <th className="text-left pb-1">Month</th>
                <th className="text-right pb-1">Amount</th>
                <th className="text-right pb-1">Balance</th>
              </tr>
            </thead>
            <tbody>
              {previousDues.map((row) => (
                <tr key={row.feeId} className="border-b border-slate-100">
                  <td className="py-1 text-slate-500">{row.vNo ?? "—"}</td>
                  <td className="py-1">{row.feeType}</td>
                  <td className="py-1">{row.month}</td>
                  <td className="py-1 text-right">{formatCurrency(row.amount)}</td>
                  <td className="py-1 text-right font-medium text-red-600">{formatCurrency(row.balance)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-semibold bg-red-50">
                <td colSpan={4} className="pt-2 text-right text-red-700">Subtotal</td>
                <td className="pt-2 text-right text-red-700">{formatCurrency(student.previousDuesTotal)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {currentMonths.length > 0 && (
        <div>
          <p className="font-semibold text-blue-700 mb-2">SELECTED MONTHS</p>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-500 border-b">
                <th className="text-left pb-1">V.No</th>
                <th className="text-left pb-1">Fee Type</th>
                <th className="text-left pb-1">Month</th>
                <th className="text-right pb-1">Amount</th>
              </tr>
            </thead>
            <tbody>
              {currentMonths.map((row) => (
                <tr key={row.feeId} className="border-b border-slate-100">
                  <td className="py-1 text-slate-500">{row.vNo ?? "—"}</td>
                  <td className="py-1">{row.feeType}</td>
                  <td className="py-1">{row.month}</td>
                  <td className="py-1 text-right">{formatCurrency(row.amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-semibold bg-blue-50">
                <td colSpan={3} className="pt-2 text-right text-blue-700">Subtotal</td>
                <td className="pt-2 text-right text-blue-700">{formatCurrency(student.selectedMonthsTotal)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <div className="flex justify-end gap-6 pt-2 border-t text-xs font-semibold">
        <span className="text-slate-600">Grand Total</span>
        <span className="text-slate-900">{formatCurrency(student.grandTotal)}</span>
      </div>
    </div>
  );
}
