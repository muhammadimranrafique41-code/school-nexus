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
    <div className="flex gap-0">
      {/* Secondary sidebar */}
      <aside className="hidden w-56 shrink-0 border-r border-slate-200 bg-white lg:flex lg:flex-col">
        {/* Back to Dashboard */}
        <div className="border-b border-slate-100 p-3">
          <Button
            asChild
            variant="ghost"
            className="w-full justify-start gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900"
          >
            <Link href="/admin">
              <ArrowLeft className="h-4 w-4" />
              Back to Dashboard
            </Link>
          </Button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 px-3 py-4">
          {NAV_ITEMS.map(({ to, label, Icon }) => {
            const isActive = location === to;
            return (
              <Link
                key={to}
                href={to}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-indigo-50 text-indigo-700 shadow-sm"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Content area */}
      <div className="min-w-0 flex-1 px-6 py-6 lg:px-8">{children}</div>
    </div>
  );
}
