import { useState, useMemo } from "react";
import { useCreateFeeAdjustment, useFees } from "@/hooks/use-fees";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, Calendar, DollarSign, Loader2, Zap } from "lucide-react";
import { formatCurrency, getErrorMessage, formatDate } from "@/lib/utils";
import type { FeeRecord } from "@/hooks/use-fees";

interface ApplyLateFeeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedStudent?: { id: number; name: string; className?: string };
}

export function ApplyLateFeeDialog({ open, onOpenChange, selectedStudent }: ApplyLateFeeDialogProps) {
  const { toast } = useToast();
  const { data: fees = [] } = useFees();
  const createAdjustment = useCreateFeeAdjustment();

  const [selectedFeeId, setSelectedFeeId] = useState<string>("");
  const [lateFeePercentage, setLateFeePercentage] = useState<string>("5");
  const [calculatedLateFee, setCalculatedLateFee] = useState<number>(0);

  // Filter only overdue, unpaid invoices
  const overdueInvoices = useMemo(
    () =>
      fees
        .filter((fee) => !selectedStudent || fee.studentId === selectedStudent.id)
        .filter((fee) => fee.status === "Overdue" || fee.status === "Partially Paid")
        .filter((fee) => fee.remainingBalance > 0)
        .filter((fee) => !fee.adjustments?.some((adj) => adj.type === "fine"))
        .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()),
    [fees, selectedStudent],
  );

  const selectedFee = useMemo(
    () => overdueInvoices.find((f) => f.id === Number(selectedFeeId)),
    [overdueInvoices, selectedFeeId],
  );

  // Calculate late fee amount whenever invoice or percentage changes
  useMemo(() => {
    if (selectedFee && selectedFee.remainingBalance > 0) {
      const percentage = Number(lateFeePercentage) || 0;
      const fee = Math.round((selectedFee.remainingBalance * percentage) / 100);
      setCalculatedLateFee(fee);
    } else {
      setCalculatedLateFee(0);
    }
  }, [selectedFee, lateFeePercentage]);

  const handleApplyLateFee = async () => {
    try {
      if (!selectedFeeId || calculatedLateFee <= 0) {
        toast({
          title: "Validation error",
          description: "Please select an invoice and enter valid late fee percentage",
          variant: "destructive",
        });
        return;
      }

      const daysOverdue = Math.floor(
        (new Date().getTime() - new Date(selectedFee!.dueDate).getTime()) / (1000 * 60 * 60 * 24),
      );

      await createAdjustment.mutateAsync({
        feeId: Number(selectedFeeId),
        type: "fine",
        amount: calculatedLateFee,
        reason: `Late fee (${lateFeePercentage}% for ${daysOverdue} days overdue)`,
        notes: `Applied on ${new Date().toLocaleDateString()}`,
      });

      toast({
        title: "Late fee applied",
        description: `Late fee of ${formatCurrency(calculatedLateFee)} has been added to ${selectedFee!.invoiceNumber || `invoice ${selectedFee!.id}`}.`,
      });

      // Reset form
      setSelectedFeeId("");
      setLateFeePercentage("5");
      onOpenChange(false);
    } catch (error) {
      toast({ title: "Unable to apply late fee", description: getErrorMessage(error), variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Apply Late Fee</DialogTitle>
          <DialogDescription>Calculate and apply late fees to overdue invoices.</DialogDescription>
        </DialogHeader>

        <div className="space-y-6 pt-4">
          {/* Student Info */}
          {selectedStudent && (
            <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Student</p>
              <p className="mt-2 font-semibold text-slate-900">{selectedStudent.name}</p>
              {selectedStudent.className && <p className="text-xs text-slate-600">{selectedStudent.className}</p>}
            </div>
          )}

          {/* Overdue Invoice Selection */}
          <div className="space-y-2">
            <Label htmlFor="fee-select" className="text-sm font-medium">
              Select Overdue Invoice *
            </Label>
            <select
              id="fee-select"
              value={selectedFeeId}
              onChange={(e) => {
                setSelectedFeeId(e.target.value);
                setLateFeePercentage("5");
              }}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Choose an overdue invoice...</option>
              {overdueInvoices.length === 0 ? (
                <option disabled>No overdue invoices found</option>
              ) : (
                overdueInvoices.map((fee) => (
                  <option key={fee.id} value={String(fee.id)}>
                    {fee.invoiceNumber || `Invoice #${fee.id}`} • {fee.billingPeriod} • Outstanding:{" "}
                    {formatCurrency(fee.remainingBalance)}
                  </option>
                ))
              )}
            </select>
          </div>

          {/* Selected Invoice Details */}
          {selectedFee && (
            <Card className="bg-blue-50/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">{selectedFee.invoiceNumber || `Invoice #${selectedFee.id}`}</CardTitle>
                <CardDescription>{selectedFee.billingPeriod}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-3 text-sm">
                <div>
                  <p className="text-xs text-slate-600">Due Date</p>
                  <p className="mt-1 font-semibold text-slate-900">{formatDate(selectedFee.dueDate)}</p>
                  <p className="text-xs text-rose-600 font-medium">
                    {Math.floor((new Date().getTime() - new Date(selectedFee.dueDate).getTime()) / (1000 * 60 * 60 * 24))} days overdue
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-600">Outstanding</p>
                  <p className="mt-1 font-semibold text-slate-900">{formatCurrency(selectedFee.remainingBalance)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-600">Status</p>
                  <p className="mt-1 font-semibold text-rose-700">{selectedFee.status}</p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Late Fee Calculation */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="percentage" className="text-sm font-medium">
                Late Fee Percentage *
              </Label>
              <div className="relative">
                <AlertCircle className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  id="percentage"
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  placeholder="5"
                  value={lateFeePercentage}
                  onChange={(e) => setLateFeePercentage(e.target.value)}
                  className="pl-8"
                />
              </div>
              <p className="text-xs text-slate-500">Typically 5-10% of outstanding balance</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="amount" className="text-sm font-medium">
                Calculated Late Fee
              </Label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  id="amount"
                  type="text"
                  value={formatCurrency(calculatedLateFee)}
                  disabled
                  className="pl-8 bg-slate-50"
                />
              </div>
              <p className="text-xs text-slate-500">Automatically calculated</p>
            </div>
          </div>

          {/* Warning */}
          {selectedFee && calculatedLateFee > 0 && (
            <div className="rounded-2xl border border-amber-100 bg-amber-50/50 p-4">
              <div className="flex gap-3">
                <AlertCircle className="h-5 w-5 flex-shrink-0 text-amber-600" />
                <div className="text-sm text-amber-800">
                  <p className="font-medium">Late fee summary</p>
                  <p className="mt-1">
                    Adding <span className="font-semibold">{formatCurrency(calculatedLateFee)}</span> to{" "}
                    <span className="font-semibold">{formatCurrency(selectedFee.remainingBalance)}</span> outstanding balance
                    will create total of{" "}
                    <span className="font-semibold">{formatCurrency(selectedFee.remainingBalance + calculatedLateFee)}</span> owed.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleApplyLateFee} disabled={createAdjustment.isPending || !selectedFeeId || calculatedLateFee <= 0}>
              {createAdjustment.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Zap className="mr-2 h-4 w-4" />
              )}
              Apply Late Fee
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
