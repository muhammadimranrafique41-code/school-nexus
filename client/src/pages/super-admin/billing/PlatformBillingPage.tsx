import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useBilling, useOverrideBilling } from "@/hooks/super-admin/useBilling";
import { BillingTable } from "./BillingTable";
import { BillingOverrideDialog } from "./BillingOverrideDialog";
import type { BillingRecordRow } from "@/lib/api/superAdminApi";

const STATUS_TABS = ["all", "PAID", "PENDING", "OVERDUE", "CANCELLED"] as const;

export default function PlatformBillingPage() {
  const { toast } = useToast();
  const [statusTab, setStatusTab] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [selectedRecord, setSelectedRecord] = useState<BillingRecordRow | null>(null);
  const overrideBilling = useOverrideBilling();

  const params: Record<string, string> = { page: String(page), pageSize: "25" };
  if (statusTab !== "all") params.status = statusTab;

  const { data, isLoading } = useBilling(params);

  const handleOverride = async (newStatus: string, notes?: string) => {
    if (!selectedRecord) return;
    try {
      await overrideBilling.mutateAsync({ id: selectedRecord.id, data: { status: newStatus, notes } });
      toast({ title: `Billing record #${selectedRecord.id} set to ${newStatus}` });
      setSelectedRecord(null);
    } catch {
      toast({ title: "Failed to override billing status", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Platform Billing</h1>
        <p className="text-sm text-slate-500">View and manage billing records across all campuses.</p>
      </div>

      <div className="flex gap-1 border-b border-slate-200">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => { setStatusTab(tab); setPage(1); }}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              statusTab === tab
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            {tab === "all" ? "All" : tab.charAt(0) + tab.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white">
        <BillingTable
          records={data?.data ?? []}
          isLoading={isLoading}
          total={data?.total ?? 0}
          page={page}
          pageSize={25}
          onPageChange={setPage}
          onOverride={(record) => setSelectedRecord(record)}
        />
      </div>

      <BillingOverrideDialog
        record={selectedRecord}
        open={!!selectedRecord}
        onOpenChange={(o) => { if (!o) setSelectedRecord(null); }}
        onConfirm={handleOverride}
        isSaving={overrideBilling.isPending}
      />
    </div>
  );
}
