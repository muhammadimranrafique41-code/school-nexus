import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function MarksheetPreviewModal({ open, onOpenChange, url }: { open: boolean; onOpenChange: (open: boolean) => void; url: string }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[90vh] max-w-5xl">
        <DialogHeader><DialogTitle>Marksheet Preview</DialogTitle></DialogHeader>
        <iframe title="Marksheet preview" src={url} className="h-full min-h-0 w-full rounded-md border" />
      </DialogContent>
    </Dialog>
  );
}
