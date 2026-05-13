import { cn } from "@/lib/utils";

interface Props {
  isActive: boolean;
}

export function CampusStatusBadge({ isActive }: Props) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        isActive
          ? "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20"
          : "bg-red-50 text-red-700 ring-1 ring-inset ring-red-600/20"
      )}
    >
      {isActive ? "ACTIVE" : "INACTIVE"}
    </span>
  );
}
