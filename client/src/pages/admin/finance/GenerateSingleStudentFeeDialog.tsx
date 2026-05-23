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
      <DialogContent className="sm:max-w-xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-slate-100 shrink-0">
          <DialogTitle className="text-base">Generate Single Student Fee</DialogTitle>
          <DialogDescription className="text-xs">Create a custom invoice for an individual student.</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

          {/* Student Selection */}
          <div className="space-y-1.5">
            <Label htmlFor="student-select" className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
              <User className="h-3.5 w-3.5" /> Student *
            </Label>
            <Select value={studentId} onValueChange={setStudentId}>
              <SelectTrigger id="student-select" className="h-9 text-sm">
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
            <Card className="border border-blue-100 bg-blue-50/50">
              <CardContent className="grid gap-2 p-3 sm:grid-cols-2 text-xs">
                <div>
                  <p className="text-slate-500">Full Name</p>
                  <p className="font-semibold text-slate-900">{selectedStudent.name}</p>
                </div>
                {selectedStudent.className && (
                  <div>
                    <p className="text-slate-500">Class</p>
                    <p className="font-semibold text-slate-900">{selectedStudent.className}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Billing Info */}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="billing-month" className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" /> Month *
              </Label>
              <Input type="month" id="billing-month" className="h-9 text-sm" value={billingMonth} onChange={(e) => setBillingMonth(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="due-day" className="text-xs font-semibold text-slate-700">Due Day *</Label>
              <Input type="number" id="due-day" min="1" max="28" className="h-9 text-sm" value={dueDay} onChange={(e) => setDueDay(e.target.value)} placeholder="5" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-500">Due Date</Label>
              {dueDate && (
                <div className="flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50/80 px-3 text-sm font-medium text-slate-900">
                  <Calendar className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                  {formatDate(dueDate, "MMM dd, yyyy")}
                </div>
              )}
            </div>
          </div>

          {/* Amount & Fee Type */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="amount" className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                <DollarSign className="h-3.5 w-3.5" /> Amount *
              </Label>
              <Input id="amount" type="number" min="0" step="0.01" placeholder="0.00" className="h-9 text-sm" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fee-type" className="text-xs font-semibold text-slate-700">Fee Type *</Label>
              <Input id="fee-type" placeholder="Monthly Fee" className="h-9 text-sm" value={feeType} onChange={(e) => setFeeType(e.target.value)} />
            </div>
          </div>

          {/* Discount */}
          <div className="grid gap-3 sm:grid-cols-2 rounded-xl border border-amber-200 bg-amber-50/50 p-3">
            <div className="space-y-1.5">
              <Label htmlFor="discount" className="text-xs font-semibold text-amber-800 flex items-center gap-1.5">
                <DollarSign className="h-3.5 w-3.5" /> Discount (optional)
              </Label>
              <Input id="discount" type="number" min="0" step="0.01" placeholder="0.00" className="h-9 text-sm" value={discount} onChange={(e) => setDiscount(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="discount-reason" className="text-xs font-semibold text-amber-800">Reason</Label>
              <Input id="discount-reason" placeholder="e.g., Merit award" className="h-9 text-sm" value={discountReason} onChange={(e) => setDiscountReason(e.target.value)} maxLength={200} disabled={!discount} />
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="description" className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5" /> Description *
            </Label>
            <Textarea id="description" placeholder="e.g., Monthly tuition fee" className="min-h-[60px] text-sm resize-none" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} />
            <p className="text-[11px] text-slate-400">{description.length}/200</p>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="notes" className="text-xs font-semibold text-slate-700">Notes</Label>
            <Textarea id="notes" placeholder="Additional information..." className="min-h-[60px] text-sm resize-none" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={300} />
            <p className="text-[11px] text-slate-400">{notes.length}/300</p>
          </div>

          {/* Preview */}
          {selectedStudent && amount && (
            <Card className="border border-blue-200 bg-blue-50/50">
              <CardContent className="p-3 space-y-1.5 text-xs">
                <div className="flex justify-between"><span className="text-slate-500">Bill to:</span><span className="font-semibold text-slate-900">{selectedStudent.name}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Description:</span><span className="font-semibold text-slate-900">{description || "—"}</span></div>
                <div className="border-t border-blue-200 pt-1.5 space-y-1">
                  <div className="flex justify-between"><span>Amount:</span><span className="font-semibold">{formatCurrency(Number(amount) || 0)}</span></div>
                  {discount && <div className="flex justify-between"><span>Discount:</span><span className="font-semibold text-amber-600">-{formatCurrency(Number(discount))}</span></div>}
                  <div className="flex justify-between border-t border-blue-200 pt-1"><span className="font-bold text-blue-700">Net:</span><span className="font-bold text-blue-700">{formatCurrency((Number(amount) || 0) - (Number(discount) || 0))}</span></div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Actions - sticky at bottom */}
        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3 shrink-0">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button size="sm" onClick={handleSubmit} disabled={createFee.isPending || !studentId || !amount || !description}>
            {createFee.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <FileText className="mr-1.5 h-3.5 w-3.5" />}
            Create Invoice
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
