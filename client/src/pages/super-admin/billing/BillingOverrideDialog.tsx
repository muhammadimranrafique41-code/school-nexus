import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { BillingRecordRow } from "@/lib/api/superAdminApi";

interface BillingOverrideDialogProps {
  record: BillingRecordRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (status: string, notes?: string) => void;
  isSaving: boolean;
}

export function BillingOverrideDialog({ record, open, onOpenChange, onConfirm, isSaving }: BillingOverrideDialogProps) {
  const [status, setStatus] = useState("PAID");
  const [notes, setNotes] = useState("");

  if (!record) return null;

  const handleConfirm = () => {
    onConfirm(status, notes || undefined);
    setNotes("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Override Billing Status</DialogTitle>
          <DialogDescription>
            Update status for record #{record.id} — {record.ownerName} / {record.campusName}.
            Current status: <strong>{record.status}</strong>
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">New Status</label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PAID">Paid</SelectItem>
                <SelectItem value="CANCELLED">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Notes (required for override)</label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Reason for override..."
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={isSaving || !notes.trim()}>
            {isSaving ? "Saving..." : "Confirm Override"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
