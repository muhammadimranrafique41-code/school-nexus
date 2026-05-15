import { useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import { CheckCircle2, Sparkles, Zap, Building2, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
}

const PLANS = [
  {
    id: "STARTER" as const,
    name: "Starter",
    price: 5000,
    icon: Sparkles,
    description: "For small schools just getting started",
    features: ["Up to 200 students", "Basic reports", "Email support"],
    color: "bg-slate-50 border-slate-200",
    activeColor: "ring-slate-800 border-slate-800 bg-slate-50",
    badge: null,
  },
  {
    id: "PROFESSIONAL" as const,
    name: "Professional",
    price: 15000,
    icon: Zap,
    description: "For growing schools with advanced needs",
    features: ["Unlimited students", "Advanced analytics", "Priority support", "API access", "Custom branding"],
    color: "bg-indigo-50 border-indigo-200",
    activeColor: "ring-indigo-600 border-indigo-600 bg-indigo-50",
    badge: "Popular",
  },
  {
    id: "ENTERPRISE" as const,
    name: "Enterprise",
    price: 30000,
    icon: Building2,
    description: "For large institutions and chains",
    features: ["Everything in Professional", "Multi-campus", "Dedicated account manager", "SLA guarantee", "Custom integrations"],
    color: "bg-amber-50 border-amber-200",
    activeColor: "ring-amber-600 border-amber-600 bg-amber-50",
    badge: null,
  },
];

export function SubscribeDialog({ open, onClose }: Props) {
  const [selectedPlan, setSelectedPlan] = useState<"STARTER" | "PROFESSIONAL" | "ENTERPRISE">("PROFESSIONAL");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubscribe = async () => {
    setSubmitting(true);
    setError("");
    try {
      const res = await apiRequest("POST", "/api/owner/billing/subscribe", { plan: selectedPlan });
      const body = await res.json();
      if (!body.success) throw new Error(body.error?.message ?? "Subscription failed");
      const { checkoutUrl, formParams } = body.data;
      const form = document.createElement("form");
      form.method = "POST";
      form.action = checkoutUrl;
      form.style.display = "none";
      for (const [key, value] of Object.entries(formParams)) {
        const input = document.createElement("input");
        input.name = key;
        input.value = value;
        form.appendChild(input);
      }
      document.body.appendChild(form);
      form.submit();
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!submitting) onClose(); }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Choose your plan</DialogTitle>
          <DialogDescription>
            Select a monthly subscription plan for your school. Pay securely via JazzCash.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-2">
          {PLANS.map((plan) => {
            const Icon = plan.icon;
            const isSelected = selectedPlan === plan.id;
            return (
              <button
                key={plan.id}
                type="button"
                onClick={() => setSelectedPlan(plan.id)}
                className={cn(
                  "relative flex flex-col items-center gap-2 rounded-2xl border-2 p-5 text-center transition-all cursor-pointer hover:shadow-md",
                  isSelected ? plan.activeColor : "border-slate-200 bg-white hover:border-slate-300"
                )}
              >
                {plan.badge && (
                  <span className="absolute -top-2.5 right-3 rounded-full bg-indigo-600 px-2.5 py-0.5 text-[10px] font-semibold text-white">
                    {plan.badge}
                  </span>
                )}
                <div className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-xl",
                  isSelected ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-500"
                )}>
                  <Icon className="h-5 w-5" />
                </div>
                <p className="text-sm font-bold text-slate-900">{plan.name}</p>
                <p className="text-xs text-slate-500 leading-relaxed">{plan.description}</p>
                <p className="text-2xl font-black text-slate-900">
                  Rs. {plan.price.toLocaleString()}
                  <span className="text-xs font-normal text-slate-400">/mo</span>
                </p>
                <ul className="w-full space-y-1 mt-1">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-1.5 text-xs text-slate-600">
                      <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-500" />
                      {f}
                    </li>
                  ))}
                </ul>
                {isSelected && (
                  <div className="absolute inset-0 rounded-2xl ring-2 ring-inset ring-indigo-600 pointer-events-none" />
                )}
              </button>
            );
          })}
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
        )}

        <div className="flex gap-3 justify-end pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubscribe}
            disabled={submitting}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-indigo-500 hover:shadow-md disabled:opacity-50"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                Subscribe to {PLANS.find((p) => p.id === selectedPlan)?.name}
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
              </>
            )}
          </button>
        </div>

        <p className="text-center text-[11px] text-slate-400">
          Payments are processed securely through JazzCash. You will be redirected to complete the payment.
        </p>
      </DialogContent>
    </Dialog>
  );
}