import type { RowError } from "@/hooks/useBulkImport";

interface ValidationErrorListProps {
  errors: RowError[];
}

export function ValidationErrorList({ errors }: ValidationErrorListProps) {
  if (!errors.length) return null;

  return (
    <div className="mt-4 rounded-md border border-red-800 bg-red-950/30 p-4">
      <p className="mb-2 font-semibold text-red-400">
        {errors.length} row(s) have errors and will be skipped:
      </p>
      <div className="max-h-48 space-y-1 overflow-y-auto">
        {errors.map((err, i) => (
          <p key={i} className="text-sm text-red-300">
            Row {err.row} ·{" "}
            <span className="font-mono">{err.field}</span>:{" "}
            <span className="text-red-400">&ldquo;{err.value}&rdquo;</span> —{" "}
            {err.reason}
          </p>
        ))}
      </div>
    </div>
  );
}
