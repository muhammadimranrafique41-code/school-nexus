import { Eye } from "lucide-react";

interface ImpersonationBadgeProps {
  originalName?: string;
  targetName?: string;
  onEnd: () => void;
}

export function ImpersonationBadge({
  originalName,
  targetName,
  onEnd,
}: ImpersonationBadgeProps) {
  return (
    <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-sm text-amber-700">
      <Eye className="h-4 w-4 shrink-0" />
      <span className="font-medium">Impersonating</span>
      {targetName && <span>{targetName}</span>}
      {originalName && (
        <span className="text-amber-500">
          (as {originalName})
        </span>
      )}
      <button
        onClick={onEnd}
        className="ml-auto text-xs font-semibold underline hover:text-amber-800"
      >
        End Session
      </button>
    </div>
  );
}
