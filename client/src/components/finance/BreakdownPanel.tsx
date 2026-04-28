import type { FamilyPreviewItem } from "@/hooks/use-consolidated-vouchers";
import { formatCurrency } from "@shared/finance";

export function BreakdownPanel({ family }: { family: FamilyPreviewItem }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {family.siblings.map((sibling) => (
          <div
            key={sibling.studentId}
            className="rounded-lg border border-slate-200 bg-white p-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  {sibling.studentName}
                </p>
                <p className="text-xs text-slate-500">
                  {sibling.className ?? "Unassigned"}
                </p>
              </div>
              <p className="text-sm font-bold text-slate-900">
                {formatCurrency(sibling.total)}
              </p>
            </div>
            <div className="mt-3 space-y-2 text-xs">
              <div className="flex items-center justify-between rounded-md bg-rose-50 px-2.5 py-2">
                <span className="font-medium text-rose-700">Previous dues</span>
                <span className="font-semibold text-rose-700">
                  {formatCurrency(sibling.previousDuesTotal)}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-md bg-blue-50 px-2.5 py-2">
                <span className="font-medium text-blue-700">Selected months</span>
                <span className="font-semibold text-blue-700">
                  {formatCurrency(sibling.selectedMonthsTotal)}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
