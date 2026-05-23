import type { LucideIcon } from "lucide-react";

interface Props {
  label: string;
  value: string | number;
  Icon: LucideIcon;
  colorClass: string;
}

const accentMap: Record<string, string> = {
  "bg-blue-50 text-blue-700": "bg-blue-500",
  "bg-teal-50 text-teal-700": "bg-teal-500",
  "bg-purple-50 text-purple-700": "bg-purple-500",
  "bg-amber-50 text-amber-700": "bg-amber-500",
  "bg-emerald-50 text-emerald-700": "bg-emerald-500",
  "bg-orange-50 text-orange-700": "bg-orange-500",
  "bg-red-50 text-red-700": "bg-red-500",
};

export function StatCard({ label, value, Icon, colorClass }: Props) {
  const accentColor = accentMap[colorClass] ?? "bg-slate-500";
  return (
    <div className="rounded-xl border border-slate-200/80 bg-white shadow-sm overflow-hidden">
      <div className={`h-1.5 ${accentColor}`} />
      <div className="p-3 md:p-4">
        <Icon className={`mb-2 h-5 w-5 md:h-6 md:w-6 ${colorClass.split(" ")[1] ?? "text-slate-700"}`} />
        <p className="text-xs md:text-sm font-medium text-slate-500">{label}</p>
        <p className="text-lg md:text-xl font-bold text-slate-900">{value}</p>
      </div>
    </div>
  );
}
