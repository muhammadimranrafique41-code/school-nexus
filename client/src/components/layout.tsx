import { useEffect, type CSSProperties, type ReactNode } from "react";
import { AppSidebar } from "./app-sidebar";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { useUser, useLogout } from "@/hooks/use-auth";
import { usePublicSchoolSettings } from "@/hooks/use-settings";
import { Button } from "@/components/ui/button";
import { LogOut, Bell, Search, Sparkles } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { useLocation } from "wouter";
import { applyDocumentBranding } from "@/lib/utils";

const toTitleCase = (value: string) =>
  value
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

export function Layout({ children }: { children: ReactNode }) {
  const { data: user } = useUser();
  const { data: publicSettings } = usePublicSchoolSettings();
  const logout = useLogout();
  const [location] = useLocation();

  const pathSegments = location.split("/").filter(Boolean);
  const workspaceLabel = pathSegments[0] ? `${toTitleCase(pathSegments[0])} workspace` : "School workspace";
  const pageLabel =
    pathSegments.length <= 1
      ? "Dashboard"
      : toTitleCase(pathSegments[pathSegments.length - 1]);
  const initials =
    user?.name
      ?.split(" ")
      .map((part) => part.charAt(0))
      .join("")
      .slice(0, 2)
      .toUpperCase() || "SN";

  const style = {
    "--sidebar-width": "18rem",
    "--sidebar-width-icon": "5rem",
  } as CSSProperties;

  useEffect(() => {
    applyDocumentBranding(publicSettings, pageLabel);
  }, [pageLabel, publicSettings]);

  return (
    <SidebarProvider style={style}>
      <div className="flex h-screen w-full overflow-hidden bg-gradient-to-br from-slate-100 via-slate-50 to-slate-100 text-slate-900">
        <AppSidebar />
        <div className="relative flex min-w-0 flex-1 flex-col">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(168,85,247,0.14),_transparent_30%),radial-gradient(circle_at_bottom_left,_rgba(236,72,153,0.10),_transparent_26%)]" />

          <header className="sticky top-0 z-20 border-b border-white/60 bg-white/70 backdrop-blur-xl shadow-[0_18px_40px_-28px_rgba(15,23,42,0.4)]">
            {publicSettings?.systemPreferences.maintenanceMode ? (
              <div className="border-b border-amber-200/70 bg-gradient-to-r from-amber-50 via-orange-50 to-rose-50 px-4 py-2 text-xs font-medium text-amber-800 md:px-6 lg:px-8">
                {publicSettings.systemPreferences.maintenanceMessage}
              </div>
            ) : null}
            <div className="mx-auto flex h-20 max-w-[90rem] items-center justify-between gap-4 px-4 md:px-6 lg:px-8">
              <div className="flex min-w-0 items-center gap-3 md:gap-4">
                <SidebarTrigger className="h-11 w-11 rounded-2xl border border-white/70 bg-white/85 text-slate-500 shadow-sm shadow-slate-200/70 hover:bg-white hover:text-slate-900" />

                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">
                    {publicSettings?.schoolInformation.shortName || workspaceLabel}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="truncate font-display text-lg font-bold text-slate-900 md:text-xl">
                      {pageLabel}
                    </h1>
                    <span className="hidden rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-violet-700 sm:inline-flex">
                      <Sparkles className="mr-1 h-3 w-3" /> Live
                    </span>
                    <span className="hidden rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 lg:inline-flex">
                      {publicSettings?.academicConfiguration.currentAcademicYear || "Academic year"}
                    </span>
                    <span className="hidden rounded-full border border-fuchsia-200 bg-fuchsia-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-fuchsia-700 xl:inline-flex">
                      {publicSettings?.academicConfiguration.currentTerm || "Current term"}
                    </span>
                  </div>
                  <p className="mt-1 hidden truncate text-sm text-slate-500 md:block">
                    {publicSettings?.branding.headerSubtitle || "Connected school operations for modern teams"}
                  </p>
                </div>
              </div>

              <div className="flex flex-1 items-center justify-end gap-3">
                <div className="relative hidden w-full max-w-md md:block">
                  <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    type="search"
                    placeholder="Search students, classes, reports..."
                    className="h-11 border-white/70 bg-white/85 pl-11 pr-4 shadow-sm shadow-slate-200/70 backdrop-blur-sm"
                  />
                </div>

                <Button variant="ghost" size="icon" className="relative h-11 w-11 border border-white/70 bg-white/85 text-slate-500 shadow-sm shadow-slate-200/70 hover:bg-white hover:text-slate-900">
                  <Bell className="h-5 w-5" />
                  <span className="absolute right-2.5 top-2.5 inline-flex h-2.5 w-2.5 rounded-full bg-gradient-to-r from-violet-500 to-pink-500 ring-4 ring-pink-200/50"></span>
                </Button>

                <div className="flex items-center gap-3 rounded-[1.25rem] border border-white/70 bg-white/85 px-3 py-2 shadow-sm shadow-slate-200/70 backdrop-blur-sm">
                  <Avatar className="h-10 w-10 border border-white/70 ring-2 ring-fuchsia-500/10">
                    <AvatarImage src={`https://api.dicebear.com/7.x/notionists/svg?seed=${user?.name}`} />
                    <AvatarFallback className="bg-gradient-to-br from-violet-600 via-fuchsia-600 to-pink-600 text-white">
                      {initials}
                    </AvatarFallback>
                  </Avatar>

                  <div className="hidden text-right sm:block">
                    <p className="text-sm font-semibold leading-none text-slate-900">{user?.name}</p>
                    <p className="mt-1 text-xs font-medium capitalize text-slate-500">{user?.role}</p>
                  </div>

                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => logout.mutate()}
                    title="Logout"
                    className="h-10 w-10 text-slate-500 hover:bg-rose-50 hover:text-rose-600"
                  >
                    <LogOut className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </header>

          <main className="relative flex-1 overflow-y-auto scroll-smooth">
            <div className="mx-auto max-w-[90rem] px-4 py-6 md:px-6 md:py-8 lg:px-8 lg:py-10">
              <div className="space-y-8 pb-6">
                {children}
              </div>
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
