import { useMemo, useState } from "react";
import { useCreateFee } from "@/hooks/use-fees";
import { useStudents } from "@/hooks/use-users";
import { useToast } from "@/hooks/use-toast";
import { buildDueDateForBillingMonth, formatBillingPeriod } from "@shared/finance";
import { getCurrentBillingMonth } from "@/lib/finance";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Calendar, DollarSign, FileText, Loader2, User } from "lucide-react";
import { formatCurrency, formatDate, getErrorMessage } from "@/lib/utils";

interface GenerateSingleStudentFeeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function GenerateSingleStudentFeeDialog({ open, onOpenChange }: GenerateSingleStudentFeeDialogProps) {
  const { toast } = useToast();
  const { data: students = [] } = useStudents();
  const createFee = useCreateFee();

  const [studentId, setStudentId] = useState("");
  const [billingMonth, setBillingMonth] = useState(getCurrentBillingMonth());
  const [dueDay, setDueDay] = useState("5");
  const [amount, setAmount] = useState("");
  const [discount, setDiscount] = useState("");
  const [discountReason, setDiscountReason] = useState("");
  const [description, setDescription] = useState("Monthly tuition fee");
  const [feeType, setFeeType] = useState("Monthly Fee");
  const [notes, setNotes] = useState("");

  const studentsList = useMemo(() => [...students].sort((a, b) => a.name.localeCompare(b.name)), [students]);

  const selectedStudent = useMemo(() => studentsList.find((s) => s.id === Number(studentId)), [studentsList, studentId]);

  const dueDate = useMemo(() => {
    if (!billingMonth || !dueDay) return "";
    return buildDueDateForBillingMonth(billingMonth, Number(dueDay));
  }, [billingMonth, dueDay]);

  const billingPeriod = useMemo(() => (billingMonth ? formatBillingPeriod(billingMonth) : ""), [billingMonth]);

  const handleSubmit = async () => {
    try {
      if (!studentId || !amount || !description) {
        toast({ title: "Validation error", description: "Please fill in all required fields", variant: "destructive" });
        return;
      }

      const feeAmount = Math.round(Number(amount) * 100) / 100;
      if (feeAmount <= 0) {
        toast({ title: "Validation error", description: "Amount must be greater than 0", variant: "destructive" });
        return;
      }

      const discountAmount = discount ? Math.round(Number(discount) * 100) / 100 : 0;
      
      const payload = {
        studentId: Number(studentId),
        amount: feeAmount,
        billingMonth,
        billingPeriod,
        dueDate,
        description: description.trim(),
        feeType: feeType.trim() || "Monthly Fee",
        notes: notes.trim() || null,
        discount: discountAmount > 0 ? discountAmount : 0,
        discountReason: (discountAmount > 0 && discountReason.trim()) ? discountReason.trim() : null,
        lineItems: [{ label: description.trim(), amount: feeAmount }],
        source: "manual" as const,
      };

      await createFee.mutateAsync(payload);

      toast({
        title: "Invoice created",
        description: `${description} for ${selectedStudent?.name} (${formatCurrency(feeAmount)}) has been saved.`,
      });

      // Reset form
      setStudentId("");
      setBillingMonth(getCurrentBillingMonth());
      setDueDay("5");
      setAmount("");
      setDiscount("");
      setDiscountReason("");
      setDescription("Monthly tuition fee");
      setFeeType("Monthly Fee");
      setNotes("");
      onOpenChange(false);
    } catch (error) {
      toast({ title: "Unable to create invoice", description: getErrorMessage(error), variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Generate Single Student Fee</DialogTitle>
          <DialogDescription>Create a custom invoice for an individual student with specific amount and due date.</DialogDescription>
        </DialogHeader>

        <div className="space-y-6 pt-4">
          {/* Student Selection */}
          <div className="space-y-2">
            <Label htmlFor="student-select" className="text-sm font-medium flex items-center gap-2">
              <User className="h-4 w-4" />
              Select Student *
            </Label>
            <Select value={studentId} onValueChange={setStudentId}>
              <SelectTrigger id="student-select">
                <SelectValue placeholder="Choose a student..." />
              </SelectTrigger>
              <SelectContent>
                {studentsList.map((student) => (
                  <SelectItem key={student.id} value={String(student.id)}>
                    {student.name} {student.className ? `(${student.className})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Student Details Card */}
          {selectedStudent && (
            <Card className="border-2 border-blue-100 bg-blue-50/50">
              <CardContent className="grid gap-3 pt-4 sm:grid-cols-2 text-sm">
                <div>
                  <p className="text-xs text-slate-600">Full Name</p>
                  <p className="mt-1 font-semibold text-slate-900">{selectedStudent.name}</p>
                </div>
                {selectedStudent.className && (
                  <div>
                    <p className="text-xs text-slate-600">Class</p>
                    <p className="mt-1 font-semibold text-slate-900">{selectedStudent.className}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Billing Info */}
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="billing-month" className="text-sm font-medium flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Billing Month *
              </Label>
              <Input type="month" id="billing-month" value={billingMonth} onChange={(e) => setBillingMonth(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="due-day" className="text-sm font-medium">
                Due Day *
              </Label>
              <Input
                type="number"
                id="due-day"
                min="1"
                max="28"
                value={dueDay}
                onChange={(e) => setDueDay(e.target.value)}
                placeholder="5"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium text-slate-600">Calculated Due Date</Label>
              {dueDate && (
                <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50/80 px-3 py-2">
                  <Calendar className="h-4 w-4 text-slate-400" />
                  <span className="text-sm font-medium text-slate-900">{formatDate(dueDate, "MMM dd, yyyy")}</span>
                </div>
              )}
            </div>
          </div>

          {/* Amount & Fee Details */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="amount" className="text-sm font-medium flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                Amount *
              </Label>
              <Input
                id="amount"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              {amount && <p className="text-xs text-slate-600">Total: {formatCurrency(Number(amount))}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="fee-type" className="text-sm font-medium">
                Fee Type *
              </Label>
              <Input
                id="fee-type"
                placeholder="Monthly Fee"
                value={feeType}
                onChange={(e) => setFeeType(e.target.value)}
              />
            </div>
          </div>

          {/* Discount Fields (Optional) */}
          <div className="grid gap-4 sm:grid-cols-2 rounded-2xl border-2 border-amber-100 bg-amber-50/50 p-4">
            <div className="space-y-2">
              <Label htmlFor="discount" className="text-sm font-medium flex items-center gap-2">
                🎁 Discount (Optional)
              </Label>
              <Input
                id="discount"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
              />
              {discount && <p className="text-xs text-amber-700">Discount: {formatCurrency(Number(discount))}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="discount-reason" className="text-sm font-medium">
                Discount Reason
              </Label>
              <Input
                id="discount-reason"
                placeholder="e.g., Merit award, scholarship"
                value={discountReason}
                onChange={(e) => setDiscountReason(e.target.value)}
                maxLength={200}
                disabled={!discount}
              />
            </div>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description" className="text-sm font-medium flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Description / Item Label *
            </Label>
            <Textarea
              id="description"
              placeholder="e.g., Monthly tuition fee, School uniforms, Exam fees"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={200}
              className="min-h-16 resize-none"
            />
            <p className="text-xs text-slate-500">{description.length}/200 characters</p>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes" className="text-sm font-medium">
              Notes (optional)
            </Label>
            <Textarea
              id="notes"
              placeholder="Additional information or special instructions..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={300}
              className="min-h-16 resize-none"
            />
            <p className="text-xs text-slate-500">{notes.length}/300 characters</p>
          </div>

          {/* Preview Card */}
          {selectedStudent && amount && (
            <Card className="border-blue-200 bg-blue-50/50">
              <CardContent className="space-y-3 pt-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">Bill to:</span>
                  <span className="font-semibold text-slate-900">{selectedStudent.name}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">Description:</span>
                  <span className="font-semibold text-slate-900">{description || "—"}</span>
                </div>
                <div className="border-t border-blue-200 pt-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-900">Invoice Amount:</span>
                    <span className="text-lg font-bold text-slate-900">{formatCurrency(Number(amount) || 0)}</span>
                  </div>
                  {discount && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-900">Discount:</span>
                      <span className="text-lg font-bold text-amber-600">-{formatCurrency(Number(discount))}</span>
                    </div>
                  )}
                  {(Number(amount) || 0) + (Number(discount) || 0) > 0 && (
                    <div className="flex items-center justify-between border-t border-blue-200 pt-2">
                      <span className="text-sm font-bold text-blue-700">Net Amount:</span>
                      <span className="text-xl font-bold text-blue-700">{formatCurrency((Number(amount) || 0) - (Number(discount) || 0))}</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={createFee.isPending || !studentId || !amount || !description}>
              {createFee.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
              Create Invoice
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
