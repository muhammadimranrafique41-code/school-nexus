import { CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import type { ImportResponse } from "@/hooks/useBulkImport";

interface ImportResultSummaryProps {
  result: ImportResponse;
}

export function ImportResultSummary({ result }: ImportResultSummaryProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        {result.success ? (
          <CheckCircle2 className="h-5 w-5 text-emerald-500" />
        ) : (
          <XCircle className="h-5 w-5 text-red-500" />
        )}
        <p className={`text-sm font-semibold ${result.success ? "text-emerald-700" : "text-red-700"}`}>
          {result.message}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 px-3 py-2.5 text-center">
          <p className="text-lg font-bold text-emerald-700">{result.imported}</p>
          <p className="text-[10px] font-medium uppercase tracking-wider text-emerald-600">
            Imported
          </p>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50/50 px-3 py-2.5 text-center">
          <p className="text-lg font-bold text-amber-700">{result.skipped}</p>
          <p className="text-[10px] font-medium uppercase tracking-wider text-amber-600">
            Skipped
          </p>
        </div>
        <div className="rounded-lg border border-red-200 bg-red-50/50 px-3 py-2.5 text-center">
          <p className="text-lg font-bold text-red-700">{result.errors.length}</p>
          <p className="text-[10px] font-medium uppercase tracking-wider text-red-600">
            Errors
          </p>
        </div>
      </div>

      {result.errors.length > 0 && (
        <div className="rounded-md border border-red-200 bg-red-50/30 p-3">
          <div className="mb-1 flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
            <p className="text-xs font-semibold text-red-700">Row-level errors</p>
          </div>
          <div className="max-h-32 space-y-0.5 overflow-y-auto">
            {result.errors.map((err, i) => (
              <p key={i} className="text-[11px] text-red-600">
                Row {err.row}: <span className="font-mono">{err.field}</span> —{" "}
                {err.reason}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
