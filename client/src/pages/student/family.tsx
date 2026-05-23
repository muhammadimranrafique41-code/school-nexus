import { useState } from "react";
import { Layout } from "@/components/layout";
import { FamilyCard } from "@/components/family/FamilyCard";
import { useFamilyDashboard, usePayFamily } from "@/hooks/use-families";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

export default function StudentFamilyPage() {
  const { data, isLoading, error } = useFamilyDashboard();
  const payFamily = usePayFamily();
  const { toast } = useToast();
  const [amount, setAmount] = useState("");

  async function handlePay() {
    if (!data) return;
    try {
      await payFamily.mutateAsync({
        familyId: data.id,
        amount: Number(amount),
        paymentDate: new Date().toISOString().slice(0, 10),
        method: "Mobile Money",
        notes: "Family dashboard payment",
      });
      setAmount("");
      toast({ title: "Payment recorded", description: "The family balance has been updated." });
    } catch (err) {
      toast({ title: "Payment failed", description: (err as Error).message, variant: "destructive" });
    }
  }

  return (
    <Layout>
      <div className="space-y-6 p-4 md:p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-blue-500 text-white shadow-md shadow-indigo-200">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg>
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">Family Dashboard</h1>
            <p className="text-[12px] text-slate-400">One place for sibling balances, consolidated dues, and a single pay-all action.</p>
          </div>
        </div>

        {isLoading ? <div className="text-sm text-slate-500">Loading family profile...</div> : null}
        {error ? <div className="text-sm text-red-600">{(error as Error).message}</div> : null}
        {data ? <FamilyCard family={data} /> : null}

        {data ? (
          <div className="rounded-xl border border-slate-200/80 bg-white shadow-sm p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-end">
              <div className="flex-1">
                <p className="text-sm font-medium text-slate-700">Pay All</p>
                <p className="mt-1 text-xs text-slate-500">
                  This applies the payment to the oldest dues across all siblings.
                </p>
                <Input
                  className="mt-3 max-w-xs"
                  type="number"
                  min="1"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  placeholder="Enter amount"
                />
              </div>
              <Button onClick={handlePay} disabled={payFamily.isPending || !amount}>
                Pay via JazzCash
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </Layout>
  );
}
