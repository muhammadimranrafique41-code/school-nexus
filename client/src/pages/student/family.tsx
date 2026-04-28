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
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Family Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">
            One place for sibling balances, consolidated dues, and a single pay-all action.
          </p>
        </div>

        {isLoading ? <div className="text-sm text-slate-500">Loading family profile...</div> : null}
        {error ? <div className="text-sm text-red-600">{(error as Error).message}</div> : null}
        {data ? <FamilyCard family={data} /> : null}

        {data ? (
          <div className="rounded-lg border border-slate-200 bg-white p-4">
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
