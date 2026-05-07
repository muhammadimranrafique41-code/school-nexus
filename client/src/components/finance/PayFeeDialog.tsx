/**
 * PayFeeDialog — admin modal to record a fee payment.
 *
 * Supports four payment methods:
 *   • Cash   — standard cash receipt
 *   • Card   — card terminal payment
 *   • Bank   — bank transfer / IBFT
 *   • Wallet — deduct from student's pre-loaded wallet balance
 *
 * When "Wallet" is selected, the component shows the available balance and
 * prevents submission if the wallet balance is insufficient.
 */

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Banknote,
  CreditCard,
  Building2,
  Wallet,
  Loader2,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { usePayFee } from "@/hooks/use-wallet";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, getErrorMessage } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

// ── Payment method config ─────────────────────────────────────────────────────

const PAYMENT_METHODS = [
  { value: "cash" as const, label: "Cash", icon: Banknote, color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-200" },
  { value: "card" as const, label: "Card", icon: CreditCard, color: "text-blue-600", bg: "bg-blue-50 border-blue-200" },
  { value: "bank" as const, label: "Bank Transfer", icon: Building2, color: "text-indigo-600", bg: "bg-indigo-50 border-indigo-200" },
  { value: "wallet" as const, label: "Wallet", icon: Wallet, color: "text-violet-600", bg: "bg-violet-50 border-violet-200" },
] as const;

// ── Validation schema ─────────────────────────────────────────────────────────

const payFeeSchema = z.object({
  amount: z
    .string()
    .min(1, "Amount is required")
    .refine((v) => !isNaN(Number(v)) && Number(v) > 0, "Amount must be a positive number"),
  paymentMethod: z.enum(["cash", "card", "bank", "wallet"]),
  receiptNumber: z.string().max(50).optional(),
  notes: z.string().max(500).optional(),
});

type PayFeeFormValues = z.infer<typeof payFeeSchema>;

// ── Props ─────────────────────────────────────────────────────────────────────

interface PayFeeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fee: {
    id: number;
    invoiceNumber?: string | null;
    billingPeriod?: string;
    remainingBalance: number | string;
    studentId: number;
    studentName?: string;
  };
  /** Current wallet balance for the student (used for wallet method validation) */
  walletBalance?: number;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function PayFeeDialog({
  open,
  onOpenChange,
  fee,
  walletBalance = 0,
}: PayFeeDialogProps) {
  const { toast } = useToast();
  const payFee = usePayFee();

  const remaining = Number(fee.remainingBalance);

  const form = useForm<PayFeeFormValues>({
    resolver: zodResolver(payFeeSchema),
    defaultValues: {
      amount: String(remaining),
      paymentMethod: "cash",
      receiptNumber: "",
      notes: "",
    },
  });

  const selectedMethod = form.watch("paymentMethod");
  const amountValue = Number(form.watch("amount") || 0);

  // Wallet-specific validation
  const isWalletMethod = selectedMethod === "wallet";
  const walletInsufficient = isWalletMethod && amountValue > walletBalance;
  const walletAfter = isWalletMethod ? walletBalance - amountValue : null;

  const onSubmit = async (values: PayFeeFormValues) => {
    if (walletInsufficient) return;

    try {
      await payFee.mutateAsync({
        feeId: fee.id,
        amount: Number(values.amount),
        paymentMethod: values.paymentMethod,
        receiptNumber: values.receiptNumber || undefined,
        notes: values.notes || undefined,
      });

      toast({
        title: "Payment recorded",
        description: `${formatCurrency(Number(values.amount))} recorded via ${
          PAYMENT_METHODS.find((m) => m.value === values.paymentMethod)?.label ?? values.paymentMethod
        } for ${fee.invoiceNumber ?? `Invoice #${fee.id}`}.`,
      });

      form.reset();
      onOpenChange(false);
    } catch (err) {
      toast({
        title: "Payment failed",
        description: getErrorMessage(err),
        variant: "destructive",
      });
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) form.reset({ amount: String(remaining), paymentMethod: "cash" });
    onOpenChange(open);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            Record Payment
          </DialogTitle>
          <DialogDescription>
            Record a payment for {fee.invoiceNumber ?? `Invoice #${fee.id}`}
            {fee.billingPeriod ? ` · ${fee.billingPeriod}` : ""}.
          </DialogDescription>
        </DialogHeader>

        {/* Invoice summary */}
        <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 space-y-1">
          {fee.studentName && (
            <p className="text-xs font-semibold text-slate-700">{fee.studentName}</p>
          )}
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500">
              {fee.invoiceNumber ?? `Invoice #${fee.id}`}
              {fee.billingPeriod ? ` · ${fee.billingPeriod}` : ""}
            </span>
            <span className="text-sm font-bold text-slate-900">
              {formatCurrency(remaining)} remaining
            </span>
          </div>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Payment method selector */}
            <FormField
              control={form.control}
              name="paymentMethod"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Payment Method *</FormLabel>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {PAYMENT_METHODS.map((method) => {
                      const Icon = method.icon;
                      const isSelected = field.value === method.value;
                      return (
                        <button
                          key={method.value}
                          type="button"
                          onClick={() => field.onChange(method.value)}
                          className={cn(
                            "flex flex-col items-center gap-1.5 rounded-xl border-2 px-3 py-3 text-xs font-semibold transition-all",
                            isSelected
                              ? `${method.bg} ${method.color} border-current shadow-sm`
                              : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:bg-slate-50"
                          )}
                        >
                          <Icon className={`h-4 w-4 ${isSelected ? method.color : "text-slate-400"}`} />
                          {method.label}
                        </button>
                      );
                    })}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Wallet balance info */}
            {isWalletMethod && (
              <div
                className={cn(
                  "rounded-xl border px-4 py-3 text-sm",
                  walletInsufficient
                    ? "border-red-200 bg-red-50"
                    : "border-violet-100 bg-violet-50/60"
                )}
              >
                <div className="flex items-center gap-2">
                  {walletInsufficient ? (
                    <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
                  ) : (
                    <Wallet className="h-4 w-4 text-violet-500 shrink-0" />
                  )}
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className={walletInsufficient ? "text-red-700" : "text-violet-700"}>
                        Wallet balance
                      </span>
                      <span className={`font-bold ${walletInsufficient ? "text-red-700" : "text-violet-700"}`}>
                        {formatCurrency(walletBalance)}
                      </span>
                    </div>
                    {walletAfter !== null && !walletInsufficient && amountValue > 0 && (
                      <div className="flex items-center justify-between mt-0.5 text-xs text-violet-600">
                        <span>After payment</span>
                        <span className="font-semibold">{formatCurrency(walletAfter)}</span>
                      </div>
                    )}
                    {walletInsufficient && (
                      <p className="mt-0.5 text-xs text-red-600">
                        Insufficient balance. Short by {formatCurrency(amountValue - walletBalance)}.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Amount */}
            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center justify-between">
                    <FormLabel>Amount *</FormLabel>
                    <button
                      type="button"
                      onClick={() => form.setValue("amount", String(remaining))}
                      className="text-[10px] font-semibold text-violet-600 hover:underline"
                    >
                      Pay full balance ({formatCurrency(remaining)})
                    </button>
                  </div>
                  <FormControl>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400">
                        PKR
                      </span>
                      <Input
                        {...field}
                        type="number"
                        min="1"
                        max={remaining}
                        step="1"
                        placeholder="0"
                        className="pl-12"
                      />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Receipt number */}
            <FormField
              control={form.control}
              name="receiptNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Receipt Number (optional)</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="e.g. RCP-2024-001" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Notes */}
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes (optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder="Any additional notes…"
                      rows={2}
                      className="resize-none"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={payFee.isPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={payFee.isPending || amountValue <= 0 || walletInsufficient}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                {payFee.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                )}
                Record {amountValue > 0 ? formatCurrency(amountValue) : "Payment"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
