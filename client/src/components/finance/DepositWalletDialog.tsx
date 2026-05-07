/**
 * DepositWalletDialog — admin modal to top-up a student's wallet.
 *
 * Uses React Hook Form + Zod for validation.
 * On success, the wallet balance is updated via the useDepositToWallet mutation
 * which automatically invalidates all related queries.
 */

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, PlusCircle, Wallet } from "lucide-react";
import { useDepositToWallet } from "@/hooks/use-wallet";
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

// ── Validation schema ─────────────────────────────────────────────────────────

const depositSchema = z.object({
  amount: z
    .string()
    .min(1, "Amount is required")
    .refine((v) => !isNaN(Number(v)) && Number(v) > 0, "Amount must be a positive number"),
  description: z.string().max(255).optional(),
});

type DepositFormValues = z.infer<typeof depositSchema>;

// ── Props ─────────────────────────────────────────────────────────────────────

interface DepositWalletDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  student: { id: number; name: string; className?: string | null };
  currentBalance?: number;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function DepositWalletDialog({
  open,
  onOpenChange,
  student,
  currentBalance = 0,
}: DepositWalletDialogProps) {
  const { toast } = useToast();
  const deposit = useDepositToWallet();

  const form = useForm<DepositFormValues>({
    resolver: zodResolver(depositSchema),
    defaultValues: { amount: "", description: "" },
  });

  const amountValue = Number(form.watch("amount") || 0);
  const newBalance = currentBalance + amountValue;

  const onSubmit = async (values: DepositFormValues) => {
    try {
      const result = await deposit.mutateAsync({
        studentId: student.id,
        amount: Number(values.amount),
        description: values.description || undefined,
      });

      toast({
        title: "Wallet topped up",
        description: `${formatCurrency(Number(values.amount))} added to ${student.name}'s wallet. New balance: ${formatCurrency(result.newBalance)}.`,
      });

      form.reset();
      onOpenChange(false);
    } catch (err) {
      toast({
        title: "Deposit failed",
        description: getErrorMessage(err),
        variant: "destructive",
      });
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) form.reset();
    onOpenChange(open);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-violet-600" />
            Top-up Wallet
          </DialogTitle>
          <DialogDescription>
            Add funds to the student's wallet. The balance will be available immediately.
          </DialogDescription>
        </DialogHeader>

        {/* Student info banner */}
        <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Student
          </p>
          <p className="mt-1 font-semibold text-slate-900">{student.name}</p>
          {student.className && (
            <p className="text-xs text-slate-500">{student.className}</p>
          )}
          <div className="mt-2 flex items-center gap-2">
            <span className="text-xs text-slate-500">Current balance:</span>
            <span className="text-sm font-bold text-violet-700">
              {formatCurrency(currentBalance)}
            </span>
          </div>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Amount */}
            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Deposit Amount *</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400">
                        PKR
                      </span>
                      <Input
                        {...field}
                        type="number"
                        min="1"
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

            {/* Description */}
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Note (optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder="e.g. Monthly fee advance, cash received from parent…"
                      rows={2}
                      className="resize-none"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Balance preview */}
            {amountValue > 0 && (
              <div className="rounded-xl border border-violet-100 bg-violet-50/60 px-4 py-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-600">Current balance</span>
                  <span className="font-semibold text-slate-700">
                    {formatCurrency(currentBalance)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm mt-1">
                  <span className="text-slate-600">Deposit amount</span>
                  <span className="font-semibold text-emerald-600">
                    + {formatCurrency(amountValue)}
                  </span>
                </div>
                <div className="mt-2 border-t border-violet-100 pt-2 flex items-center justify-between">
                  <span className="text-sm font-bold text-slate-800">New balance</span>
                  <span className="text-base font-bold text-violet-700">
                    {formatCurrency(newBalance)}
                  </span>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={deposit.isPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={deposit.isPending || amountValue <= 0}
                className="bg-violet-600 hover:bg-violet-700"
              >
                {deposit.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <PlusCircle className="mr-2 h-4 w-4" />
                )}
                Add {amountValue > 0 ? formatCurrency(amountValue) : "Funds"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
