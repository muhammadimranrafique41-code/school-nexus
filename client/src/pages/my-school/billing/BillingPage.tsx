import { useState, useEffect } from "react";
import { DollarSign } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useBilling } from "@/hooks/my-school/useBilling";
import { BillingSummaryCards } from "./BillingSummaryCards";
import { InvoiceTable } from "./InvoiceTable";
import { SubscribeDialog } from "./SubscribeDialog";

export default function BillingPage() {
  const queryClient = useQueryClient();
  const [selectedTab, setSelectedTab] = useState<string | undefined>();
  const { data: records, isLoading } = useBilling(selectedTab);
  const [subscribeOpen, setSubscribeOpen] = useState(false);

  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: ["owner", "billing"] });
  }, [queryClient]);

  return (
    <div className="space-y-4 md:space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-900 text-white">
            <DollarSign className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-slate-950 md:text-2xl">Billing</h1>
            <p className="text-sm text-slate-500">View your subscription billing history and manage invoice payments.</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSubscribeOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-indigo-500 hover:shadow-md active:scale-[0.97]"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add Monthly
          </button>
          {records && (
            <div className="hidden sm:flex items-center gap-2 text-xs text-slate-400">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Last updated {new Date().toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
          )}
        </div>
      </div>

      <BillingSummaryCards records={records} isLoading={isLoading} />

      <InvoiceTable
        records={records}
        isLoading={isLoading}
        selectedTab={selectedTab}
        onTabChange={setSelectedTab}
      />

      <SubscribeDialog
        open={subscribeOpen}
        onClose={() => setSubscribeOpen(false)}
        onSuccess={() => {
          setSubscribeOpen(false);
          queryClient.invalidateQueries({ queryKey: ["owner", "billing"] });
        }}
      />
    </div>
  );
}
