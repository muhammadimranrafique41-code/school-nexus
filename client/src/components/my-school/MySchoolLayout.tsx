import type { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  Building2,
  CreditCard,
  ArrowLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const NAV_ITEMS = [
  { to: "/my-school/overview", label: "Overview", Icon: LayoutDashboard },
  { to: "/my-school/campuses", label: "Campuses", Icon: Building2 },
  { to: "/my-school/billing", label: "Billing", Icon: CreditCard },
] as const;

export function MySchoolLayout({ children }: { children: ReactNode }) {
  const [location] = useLocation();

  return (
    <div className="space-y-6">
      {/* Back to Dashboard breadcrumb */}
      <Button
        asChild
        variant="ghost"
        className="-ml-2 gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-900 h-8"
      >
        <Link href="/admin">
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </Link>
      </Button>

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
                  : "border-transparent text-slate-500 hover:text-slate-800",
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
