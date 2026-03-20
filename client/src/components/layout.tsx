import { useEffect, type CSSProperties, type ReactNode } from "react";
import { AppSidebar } from "./app-sidebar";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { useUser, useLogout } from "@/hooks/use-auth";
import { usePublicSchoolSettings } from "@/hooks/use-settings";
import { Button } from "@/components/ui/button";
import { LogOut, Bell, ChevronRight } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useLocation } from "wouter";
import { applyDocumentBranding } from "@/lib/utils";

const toTitleCase = (value: string) =>
  value.split("-").filter(Boolean).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");

export function Layout({ children }: { children: ReactNode }) {
  const { data: user } = useUser();
  const { data: publicSettings } = usePublicSchoolSettings();
  const logout = useLogout();
  const [location] = useLocation();

  const pathSegments = location.split("/").filter(Boolean);
  const pageLabel = pathSegments.length <= 1 ? "Dashboard" : toTitleCase(pathSegments[pathSegments.length - 1]);
  const workspaceLabel = pathSegments[0] ? `${toTitleCase(pathSegments[0])} portal` : "School portal";
  const initials = user?.name?.split(" ").map((p) => p.charAt(0)).join("").slice(0, 2).toUpperCase() || "SN";

  useEffect(() => { applyDocumentBranding(publicSettings, pageLabel); }, [pageLabel, publicSettings]);

  const isMaintenanceMode = publicSettings?.systemPreferences.maintenanceMode;
  const maintenanceMsg = publicSettings?.systemPreferences.maintenanceMessage;
  const schoolShortName = publicSettings?.schoolInformation.shortName || publicSettings?.schoolInformation.schoolName || "School Nexus";
  const academicYear = publicSettings?.academicConfiguration.currentAcademicYear;
  const currentTerm = publicSettings?.academicConfiguration.currentTerm;

  const style = { "--sidebar-width": "17rem", "--sidebar-width-icon": "4.5rem" } as CSSProperties;

  return (
    <SidebarProvider style={style}>
      <div className="flex h-screen w-full overflow-hidden bg-slate-50 text-slate-900">
        <AppSidebar />

        <div className="relative flex min-w-0 flex-1 flex-col">

          {/* ── Header ──────────────────────────────────────────────── */}
          <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white shadow-[0_1px_8px_rgba(15,23,42,0.06)]">
            {isMaintenanceMode && maintenanceMsg && (
              <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-[12px] font-medium text-amber-800">
                {maintenanceMsg}
              </div>
            )}
            <div className="mx-auto flex h-14 max-w-[90rem] items-center justify-between gap-3 px-4 md:px-5 lg:px-6">

              {/* Left */}
              <div className="flex min-w-0 items-center gap-3">
                <SidebarTrigger className="h-8 w-8 shrink-0 rounded-lg border border-slate-200 bg-white text-slate-500 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900" />
                <div className="hidden h-5 w-px bg-slate-200 sm:block" />
                <div className="hidden min-w-0 sm:flex sm:items-center sm:gap-1.5">
                  <span className="text-[12px] font-medium text-slate-400">{schoolShortName}</span>
                  <ChevronRight className="h-3 w-3 shrink-0 text-slate-300" />
                  <span className="text-[12px] font-medium capitalize text-slate-400">{workspaceLabel}</span>
                  <ChevronRight className="h-3 w-3 shrink-0 text-slate-300" />
                  <span className="text-[13px] font-semibold text-slate-900">{pageLabel}</span>
                </div>
                <span className="text-[14px] font-bold text-slate-900 sm:hidden">{pageLabel}</span>
              </div>

              {/* Right */}
              <div className="flex items-center gap-2">
                {academicYear && (
                  <span className="hidden rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500 lg:inline-flex">
                    {academicYear}
                  </span>
                )}
                {currentTerm && (
                  <span className="hidden rounded-md border border-indigo-100 bg-indigo-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-indigo-600 xl:inline-flex">
                    {currentTerm}
                  </span>
                )}
                <Button variant="ghost" size="icon"
                  className="relative h-8 w-8 rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-900">
                  <Bell className="h-4 w-4" />
                  <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-indigo-500 ring-2 ring-white" />
                </Button>
                <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5">
                  <Avatar className="h-7 w-7 ring-2 ring-indigo-100">
                    <AvatarImage src={`https://api.dicebear.com/7.x/notionists/svg?seed=${user?.name ?? "School"}`} />
                    <AvatarFallback className="bg-gradient-to-br from-indigo-500 to-blue-500 text-[11px] font-bold text-white">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="hidden flex-col sm:flex">
                    <p className="text-[13px] font-semibold leading-tight text-slate-900">{user?.name ?? "User"}</p>
                    <p className="text-[10px] uppercase tracking-[0.18em] text-slate-400">{user?.role ?? "Account"}</p>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => logout.mutate()} title="Logout"
                    className="h-7 w-7 shrink-0 rounded-md text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600">
                    <LogOut className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          </header>

          {/* ── Main ──────────────────────────────────────────────────── */}
          <main className="relative flex-1 overflow-y-auto scroll-smooth">
            <div className="mx-auto max-w-[90rem] px-4 py-5 md:px-5 md:py-6 lg:px-7 lg:py-7">
              {children}
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
