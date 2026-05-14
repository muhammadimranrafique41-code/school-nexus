import { cn } from "@/lib/utils";

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  ACTIVE: { label: "ACTIVE", className: "bg-emerald-100 text-emerald-700" },
  SUSPENDED: { label: "SUSPENDED", className: "bg-red-100 text-red-700" },
  ON_TRIAL: { label: "ON TRIAL", className: "bg-amber-100 text-amber-700" },
  CANCELLED: { label: "CANCELLED", className: "bg-slate-100 text-slate-500" },
};

export function OwnerStatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG["ACTIVE"];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
        config.className
      )}
    >
      {config.label}
    </span>
  );
}
