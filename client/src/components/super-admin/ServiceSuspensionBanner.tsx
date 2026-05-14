import { AlertTriangle } from "lucide-react";

export function ServiceSuspensionBanner() {
  return (
    <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span>
        Service suspended due to unpaid invoices. Please contact support to
        restore access.
      </span>
    </div>
  );
}
