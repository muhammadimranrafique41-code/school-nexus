import type { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  Building2,
  CreditCard,
  ClipboardList,
  Activity,
  Settings2,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { to: "/super-admin/overview", label: "Overview", Icon: LayoutDashboard },
  { to: "/super-admin/owners", label: "Owners", Icon: Building2 },
  { to: "/super-admin/billing", label: "Billing", Icon: CreditCard },
  { to: "/super-admin/audit-logs", label: "Audit Logs", Icon: ClipboardList },
  { to: "/super-admin/system-health", label: "Health", Icon: Activity },
  { to: "/super-admin/settings", label: "Settings", Icon: Settings2 },
] as const;

export function SuperAdminLayout({ children }: { children: ReactNode }) {
  const [location] = useLocation();

  return (
    <div className="space-y-6">
      {/* Horizontal sub-navigation */}
      <div className="flex gap-1 border-b border-slate-200">
        {NAV_ITEMS.map(({ to, label, Icon }) => {
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

      {/* Page content */}
      {children}
    </div>
  );
}
