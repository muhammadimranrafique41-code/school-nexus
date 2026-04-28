import { formatCurrency } from "@shared/finance";

type FamilyCardProps = {
  family: {
    id: number;
    name: string;
    totalOutstanding: number;
    siblingCount: number;
    walletBalance: number;
    siblings: Array<{
      id: number;
      name: string;
      className?: string | null;
      outstandingBalance: number;
      openInvoices: number;
    }>;
  };
};

export function FamilyCard({ family }: FamilyCardProps) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-lg font-semibold text-slate-900">{family.name}</p>
          <p className="mt-1 text-sm text-slate-500">
            {family.siblingCount} sibling{family.siblingCount === 1 ? "" : "s"}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-wide text-slate-400">Outstanding</p>
          <p className="text-lg font-bold text-slate-900">
            {formatCurrency(family.totalOutstanding)}
          </p>
          <p className="text-xs text-slate-500">
            Wallet {formatCurrency(family.walletBalance)}
          </p>
        </div>
      </div>
      <div className="mt-4 grid gap-2">
        {family.siblings.map((sibling) => (
          <div
            key={sibling.id}
            className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-2"
          >
            <div>
              <p className="text-sm font-medium text-slate-900">{sibling.name}</p>
              <p className="text-xs text-slate-500">
                {sibling.className ?? "Unassigned"} · {sibling.openInvoices} open invoice
                {sibling.openInvoices === 1 ? "" : "s"}
              </p>
            </div>
            <p className="text-sm font-semibold text-slate-900">
              {formatCurrency(sibling.outstandingBalance)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
