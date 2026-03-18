import { useMemo, useState } from "react";
import { useCreateFeeAdjustment, useFees } from "@/hooks/use-fees";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, CheckCircle2, DollarSign, Loader2, Minus, Plus } from "lucide-react";
import { formatCurrency, getErrorMessage } from "@/lib/utils";
import type { FeeRecord } from "@/hooks/use-fees";

interface FeeAdjustmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedStudent?: { id: number; name: string; className?: string };
}

type AdjustmentType = "discount" | "fine" | "scholarship";

const ADJUSTMENT_TYPES: { value: AdjustmentType; label: string; icon: React.ReactNode; color: string; description: string }[] = [
  {
    value: "discount",
    label: "Discount",
    icon: <Minus className="h-4 w-4" />,
    color: "bg-emerald-50 border-emerald-200",
    description: "Reduce amount owed",
  },
  {
    value: "fine",
    label: "Fine / Late Fee",
    icon: <AlertCircle className="h-4 w-4" />,
    color: "bg-amber-50 border-amber-200",
    description: "Penalty or late fee",
  },
  {
    value: "scholarship",
    label: "Scholarship",
    icon: <CheckCircle2 className="h-4 w-4" />,
    color: "bg-blue-50 border-blue-200",
    description: "Financial aid or grant",
  },
];

export function FeeAdjustmentDialog({ open, onOpenChange, selectedStudent }: FeeAdjustmentDialogProps) {
  const { toast } = useToast();
  const { data: fees = [] } = useFees();
  const createAdjustment = useCreateFeeAdjustment();

  const [adjustmentType, setAdjustmentType] = useState<AdjustmentType>("discount");
  const [selectedFeeId, setSelectedFeeId] = useState<string>("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");

  const studentFees = useMemo(
    () =>
      fees
        .filter((fee) => !selectedStudent || fee.studentId === selectedStudent.id)
        .sort((a, b) => new Date(b.createdAt || "").getTime() - new Date(a.createdAt || "").getTime()),
    [fees, selectedStudent],
  );

  const selectedFee = useMemo(() => studentFees.find((f) => f.id === Number(selectedFeeId)), [studentFees, selectedFeeId]);

  const handleSubmit = async () => {
    try {
      if (!selectedFeeId || !amount || !reason) {
        toast({ title: "Validation error", description: "Please fill in all required fields", variant: "destructive" });
        return;
      }

      const adjustmentAmount = Math.round(Number(amount) * 100);
      if (adjustmentAmount <= 0) {
        toast({ title: "Validation error", description: "Amount must be greater than 0", variant: "destructive" });
        return;
      }

      await createAdjustment.mutateAsync({
        feeId: Number(selectedFeeId),
        type: adjustmentType,
        amount: adjustmentAmount / 100,
        reason: reason.trim(),
        notes: notes.trim() || null,
      });

      toast({
        title: "Adjustment created",
        description: `${adjustmentType} of ${formatCurrency(adjustmentAmount)} has been applied.`,
      });

      // Reset form
      setAdjustmentType("discount");
      setSelectedFeeId("");
      setAmount("");
      setReason("");
      setNotes("");
      onOpenChange(false);
    } catch (error) {
      toast({ title: "Unable to create adjustment", description: getErrorMessage(error), variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Apply Fee Adjustment</DialogTitle>
          <DialogDescription>Add a discount, fine, or scholarship to an existing invoice.</DialogDescription>
        </DialogHeader>

        <div className="space-y-6 pt-4">
          {/* Adjustment Type Selection */}
          <div className="space-y-3">
            <Label className="text-base font-semibold">Adjustment Type</Label>
            <div className="grid gap-3 sm:grid-cols-3">
              {ADJUSTMENT_TYPES.map((type) => (
                <button
                  key={type.value}
                  onClick={() => setAdjustmentType(type.value)}
                  className={`rounded-2xl border-2 p-4 text-left transition ${
                    adjustmentType === type.value
                      ? `${type.color} border-current bg-opacity-50`
                      : "border-slate-200 bg-slate-50/50 hover:border-slate-300"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className={adjustmentType === type.value ? "text-current" : "text-slate-400"}>{type.icon}</span>
                    <span className="font-semibold text-slate-900">{type.label}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-600">{type.description}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Student & Invoice Selection */}
          <div className="grid gap-4 sm:grid-cols-2">
            {selectedStudent ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Student</p>
                <p className="mt-2 font-semibold text-slate-900">{selectedStudent.name}</p>
                {selectedStudent.className && <p className="text-xs text-slate-600">{selectedStudent.className}</p>}
              </div>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="fee-select" className="text-sm font-medium">
                Select Invoice *
              </Label>
              <Select value={selectedFeeId} onValueChange={setSelectedFeeId}>
                <SelectTrigger id="fee-select">
                  <SelectValue placeholder="Choose an invoice..." />
                </SelectTrigger>
                <SelectContent>
                  {studentFees.length === 0 ? (
                    <div className="p-3 text-sm text-slate-500">No invoices found</div>
                  ) : (
                    studentFees.map((fee) => (
                      <SelectItem key={fee.id} value={String(fee.id)}>
                        {fee.invoiceNumber || `Invoice #${fee.id}`} • {fee.billingPeriod} • {formatCurrency(fee.remainingBalance)} outstanding
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Selected Fee Details */}
          {selectedFee && (
            <Card className="bg-slate-50/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">{selectedFee.invoiceNumber || `Invoice #${selectedFee.id}`}</CardTitle>
                <CardDescription>{selectedFee.billingPeriod}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-3 text-sm">
                <div>
                  <p className="text-xs text-slate-600">Total Amount</p>
                  <p className="mt-1 font-semibold text-slate-900">{formatCurrency(selectedFee.amount)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-600">Paid</p>
                  <p className="mt-1 font-semibold text-emerald-700">{formatCurrency(selectedFee.paidAmount)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-600">Outstanding</p>
                  <p className="mt-1 font-semibold text-slate-900">{formatCurrency(selectedFee.remainingBalance)}</p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Amount & Reason */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="amount" className="text-sm font-medium">
                Amount *
              </Label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  id="amount"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="reason" className="text-sm font-medium">
                Reason *
              </Label>
              <Input
                id="reason"
                placeholder="e.g., 'Merit achievement', 'Late payment penalty'"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={200}
              />
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes" className="text-sm font-medium">
              Notes (optional)
            </Label>
            <Textarea
              id="notes"
              placeholder="Additional context or approval notes..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={300}
              className="min-h-20 resize-none"
            />
            <p className="text-xs text-slate-500">{notes.length}/300 characters</p>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={createAdjustment.isPending || !selectedFeeId || !amount || !reason}>
              {createAdjustment.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              Apply Adjustment
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
