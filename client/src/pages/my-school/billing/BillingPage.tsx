import { useState } from "react";
import { useBilling } from "@/hooks/my-school/useBilling";
import { BillingSummaryCards } from "./BillingSummaryCards";
import { InvoiceTable } from "./InvoiceTable";
import { MySchoolSubNav } from "../MySchoolSubNav";

export default function BillingPage() {
  const [selectedTab, setSelectedTab] = useState<string | undefined>();
  const { data: records, isLoading } = useBilling(selectedTab);

  return (
    <div className="space-y-6">
      <MySchoolSubNav />

      <div>
        <h1 className="text-xl font-bold tracking-tight text-slate-900">
          Billing
        </h1>
        <p className="text-sm text-slate-500">
          View your subscription billing history and manage invoices.
        </p>
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
