/**
 * @file BreakdownPanel.tsx
 * @description Per-sibling fee breakdown panel for consolidated vouchers.
 *
 * Accessibility improvements:
 * - Semantic `<table>` with `role="table"` and `aria-label`
 * - All `<th>` elements carry `scope="col"` or `scope="row"`
 * - `aria-live="polite"` on the dynamic totals region
 * - Descriptive `aria-label` on the container section
 */

import type { FamilyPreviewItem } from "@/hooks/use-consolidated-vouchers";
import { formatCurrency } from "@shared/finance";

export function BreakdownPanel({ family }: { family: FamilyPreviewItem }) {
  return (
    <section
      aria-label={`Fee breakdown for family ${family.siblings[0]?.studentName ?? ""}`}
      className="rounded-lg border border-slate-200 bg-slate-50 p-4"
    >
      {/* Dynamic totals region — screen readers announce updates */}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="grid gap-3 md:grid-cols-2 xl:grid-cols-3"
      >
        {family.siblings.map((sibling) => (
          <div
            key={sibling.studentId}
            className="rounded-lg border border-slate-200 bg-white p-3"
          >
            {/* Student identity */}
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  {sibling.studentName}
                </p>
                <p className="text-xs text-slate-500">
                  {sibling.className ?? "Unassigned"}
                </p>
              </div>
              <p
                className="text-sm font-bold text-slate-900"
                aria-label={`Total for ${sibling.studentName}: ${formatCurrency(sibling.total)}`}
              >
                {formatCurrency(sibling.total)}
              </p>
            </div>

            {/* Fee breakdown table */}
            <table
              role="table"
              aria-label={`Fee breakdown for ${sibling.studentName}`}
              className="mt-3 w-full text-xs"
            >
              <thead className="sr-only">
                <tr>
                  <th scope="col">Category</th>
                  <th scope="col">Amount</th>
                </tr>
              </thead>
              <tbody className="space-y-2">
                <tr className="flex items-center justify-between rounded-md bg-rose-50 px-2.5 py-2">
                  <th
                    scope="row"
                    className="font-medium text-rose-700 text-left"
                  >
                    Previous dues
                  </th>
                  <td className="font-semibold text-rose-700 tabular-nums">
                    {formatCurrency(sibling.previousDuesTotal)}
                  </td>
                </tr>
                <tr className="flex items-center justify-between rounded-md bg-blue-50 px-2.5 py-2">
                  <th
                    scope="row"
                    className="font-medium text-blue-700 text-left"
                  >
                    Selected months
                  </th>
                  <td className="font-semibold text-blue-700 tabular-nums">
                    {formatCurrency(sibling.selectedMonthsTotal)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </section>
  );
}
