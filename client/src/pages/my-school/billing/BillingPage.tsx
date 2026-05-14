import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useBilling } from "@/hooks/my-school/useBilling";
import { BillingSummaryCards } from "./BillingSummaryCards";
import { InvoiceTable } from "./InvoiceTable";

export default function BillingPage() {
  const queryClient = useQueryClient();
  const [selectedTab, setSelectedTab] = useState<string | undefined>();
  const { data: records, isLoading } = useBilling(selectedTab);

  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: ["owner", "billing"] });
  }, [queryClient]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Billing
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            View your subscription billing history and manage invoice payments.
          </p>
        </div>
        {records && (
          <div className="hidden sm:flex items-center gap-2 text-xs text-slate-400">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Last updated {new Date().toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
        )}
      </div>

      <BillingSummaryCards records={records} isLoading={isLoading} />

      <InvoiceTable
        records={records}
        isLoading={isLoading}
        selectedTab={selectedTab}
        onTabChange={setSelectedTab}
      />
    </div>
  );
}
