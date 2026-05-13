import { Link, useLocation } from "wouter";
import { LayoutDashboard, Building2, CreditCard } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { to: "/my-school/overview", label: "Overview", Icon: LayoutDashboard },
  { to: "/my-school/campuses", label: "Campuses", Icon: Building2 },
  { to: "/my-school/billing", label: "Billing", Icon: CreditCard },
] as const;

export function MySchoolSubNav() {
  const [location] = useLocation();

  return (
    <div className="mb-6 flex gap-1 border-b border-slate-200">
      {TABS.map(({ to, label, Icon }) => {
        const isActive = location === to;
        return (
          <Link
            key={to}
            href={to}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px",
              isActive
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-slate-500 hover:text-slate-800"
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        );
      })}
    </div>
  );
}
