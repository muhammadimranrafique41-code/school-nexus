import { FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildBulkMarksheetUrl } from "../hooks/useMarksheetPDF";

export function BulkMarksheetButton({ examSessionId, studentIds }: { examSessionId: number; studentIds: number[] }) {
  return (
    <Button variant="outline" disabled={!studentIds.length} asChild>
      <a href={buildBulkMarksheetUrl(examSessionId, studentIds)} target="_blank" rel="noreferrer">
        <FileDown className="mr-2 h-4 w-4" />Bulk PDF
      </a>
    </Button>
  );
}
