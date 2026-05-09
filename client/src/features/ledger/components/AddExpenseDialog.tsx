/**
 * @component AddExpenseDialog
 * @description Modal dialog for recording a new operational school expense.
 *
 * Features:
 *  - react-hook-form + zod validation (mirrors insertExpenseSchema)
 *  - Category dropdown from EXPENSE_CATEGORIES constant
 *  - TanStack Query useMutation with cache invalidation
 *  - Optimistic success toast + form reset on success
 */

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PlusCircle, Loader2 } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

// ─────────────────────────────────────────────────────────────────────────────
// Constants (kept in sync with shared/schema.ts EXPENSE_CATEGORIES)
// ─────────────────────────────────────────────────────────────────────────────

const EXPENSE_CATEGORIES = [
  "utilities",
  "maintenance",
  "supplies",
  "salaries",
  "rent",
  "transport",
  "food",
  "it_equipment",
  "marketing",
  "other",
] as const;

const CATEGORY_LABELS: Record<(typeof EXPENSE_CATEGORIES)[number], string> = {
  utilities:    "Utilities",
  maintenance:  "Maintenance",
  supplies:     "Supplies",
  salaries:     "Salaries",
  rent:         "Rent",
  transport:    "Transport",
  food:         "Food",
  it_equipment: "IT Equipment",
  marketing:    "Marketing",
  other:        "Other",
};

// ─────────────────────────────────────────────────────────────────────────────
// Form schema (client-side mirror of insertExpenseSchema)
// ─────────────────────────────────────────────────────────────────────────────

const formSchema = z.object({
  amount: z
    .string()
    .min(1, "Amount is required")
    .regex(/^\d+(\.\d{1,2})?$/, "Enter a valid amount (e.g. 1500 or 1500.50)"),
  category: z.enum(EXPENSE_CATEGORIES, { required_error: "Select a category" }),
  description: z.string().max(500, "Max 500 characters").optional(),
  expenseDate: z
    .string()
    .min(1, "Date is required")
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
});

type FormValues = z.infer<typeof formSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// API call
// ─────────────────────────────────────────────────────────────────────────────

async function createExpense(data: FormValues) {
  const res = await apiRequest("POST", "/api/expenses", data);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { message?: string }).message ?? "Failed to save expense");
  }
  return res.json();
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

interface AddExpenseDialogProps {
  /** Controlled open state — pass undefined to use internal state */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Called after a successful save */
  onSuccess?: () => void;
}

export function AddExpenseDialog({
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  onSuccess,
}: AddExpenseDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = isControlled
    ? (v: boolean) => controlledOnOpenChange?.(v)
    : setInternalOpen;

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const today = new Date().toISOString().slice(0, 10);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      amount:      "",
      category:    undefined,
      description: "",
      expenseDate: today,
    },
  });

  const mutation = useMutation({
    mutationFn: createExpense,
    onSuccess: () => {
      // Invalidate both the expenses list and ledger cash-flow caches
      queryClient.invalidateQueries({ queryKey: ["/api/expenses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ledger/cash-flow-summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ledger/period-summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ledger/category-breakdown"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ledger/entries"] });

      toast({
        title: "Expense recorded",
        description: "The expense has been saved and posted to the ledger.",
      });

      form.reset({ amount: "", category: undefined, description: "", expenseDate: today });
      setOpen(false);
      onSuccess?.();
    },
    onError: (err: Error) => {
      toast({
        title: "Failed to save expense",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (values: FormValues) => mutation.mutate(values);

  return (
    <>
      {/* Trigger button — only rendered when uncontrolled */}
      {!isControlled && (
        <Button
          size="sm"
          className="h-8 gap-1.5 bg-rose-600 text-xs font-medium text-white hover:bg-rose-700"
          onClick={() => setOpen(true)}
        >
          <PlusCircle className="h-3.5 w-3.5" />
          Add Expense
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold text-slate-900">
              Record Expense
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-1">
            {/* Amount */}
            <div className="space-y-1.5">
              <Label htmlFor="exp-amount" className="text-xs font-medium text-slate-700">
                Amount (PKR) <span className="text-rose-500">*</span>
              </Label>
              <Input
                id="exp-amount"
                placeholder="e.g. 5000"
                className="h-9 text-sm"
                {...form.register("amount")}
              />
              {form.formState.errors.amount && (
                <p className="text-xs text-rose-600">{form.formState.errors.amount.message}</p>
              )}
            </div>

            {/* Category */}
            <div className="space-y-1.5">
              <Label htmlFor="exp-category" className="text-xs font-medium text-slate-700">
                Category <span className="text-rose-500">*</span>
              </Label>
              <Select
                value={form.watch("category") ?? ""}
                onValueChange={(v) =>
                  form.setValue("category", v as (typeof EXPENSE_CATEGORIES)[number], {
                    shouldValidate: true,
                  })
                }
              >
                <SelectTrigger id="exp-category" className="h-9 text-sm">
                  <SelectValue placeholder="Select category…" />
                </SelectTrigger>
                <SelectContent>
                  {EXPENSE_CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat} className="text-sm">
                      {CATEGORY_LABELS[cat]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.category && (
                <p className="text-xs text-rose-600">{form.formState.errors.category.message}</p>
              )}
            </div>

            {/* Date */}
            <div className="space-y-1.5">
              <Label htmlFor="exp-date" className="text-xs font-medium text-slate-700">
                Expense Date <span className="text-rose-500">*</span>
              </Label>
              <Input
                id="exp-date"
                type="date"
                className="h-9 text-sm"
                {...form.register("expenseDate")}
              />
              {form.formState.errors.expenseDate && (
                <p className="text-xs text-rose-600">{form.formState.errors.expenseDate.message}</p>
              )}
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label htmlFor="exp-desc" className="text-xs font-medium text-slate-700">
                Description{" "}
                <span className="font-normal text-slate-400">(optional)</span>
              </Label>
              <Textarea
                id="exp-desc"
                placeholder="Brief note about this expense…"
                rows={3}
                className="resize-none text-sm"
                {...form.register("description")}
              />
              {form.formState.errors.description && (
                <p className="text-xs text-rose-600">
                  {form.formState.errors.description.message}
                </p>
              )}
            </div>

            <DialogFooter className="gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={() => setOpen(false)}
                disabled={mutation.isPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                className="h-8 gap-1.5 bg-rose-600 text-xs font-medium text-white hover:bg-rose-700"
                disabled={mutation.isPending}
              >
                {mutation.isPending ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Saving…
                  </>
                ) : (
                  <>
                    <PlusCircle className="h-3.5 w-3.5" />
                    Save Expense
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
