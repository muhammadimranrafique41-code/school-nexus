import {
  BookOpen, Users, LayoutDashboard, Calculator,
  GraduationCap, CalendarDays, WalletCards, Briefcase, LogOut, Settings2, QrCode, ScanLine, Printer, LayoutGrid, Notebook, ChevronRight
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  useSidebar,
} from "@/components/ui/sidebar";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { useLogout, useUser } from "@/hooks/use-auth";
import { usePublicSchoolSettings } from "@/hooks/use-settings";
import { cn } from "@/lib/utils";

type SidebarItem = {
  title: string;
  url: string;
  icon: typeof LayoutDashboard;
  matchUrls?: string[];
  badge?: string;
  pulse?: boolean;
};

type SidebarSection = {
  label: string;
  items: SidebarItem[];
};

const adminSections: SidebarSection[] = [
  {
    label: "Overview",
    items: [
      { title: "Dashboard", url: "/admin", icon: LayoutDashboard },
      { title: "Users", url: "/admin/users", icon: Users },
    ],
  },
  {
    label: "Management",
    items: [
      { title: "Teachers", url: "/admin/teachers", icon: Briefcase },
      { title: "Students", url: "/admin/students", icon: GraduationCap },
      { title: "Classes", url: "/admin/classes", icon: BookOpen },
      { title: "Schedule Builder", url: "/admin/timetable", icon: LayoutGrid },
      { title: "Homework Diary", url: "/admin/homework-diary", icon: Notebook, badge: "New" },
      { title: "QR Attendance", url: "/admin/qr-attendance", icon: QrCode, badge: "New" },
    ],
  },
  {
    label: "Finance",
    items: [
      { title: "Finance", url: "/admin/finance", icon: Calculator },
      { title: "Bulk Print Vouchers", url: "/admin/finance/bulk-print", icon: Printer, badge: "New" },
    ],
  },
];

const teacherSections: SidebarSection[] = [
  {
    label: "Overview",
    items: [{ title: "Dashboard", url: "/teacher", icon: LayoutDashboard }],
  },
  {
    label: "Teaching",
    items: [
      { title: "Attendance Marking", url: "/teacher/attendance", icon: CalendarDays, badge: "Live", pulse: true },
      { title: "Homework Diary", url: "/teacher/homework-dairy", icon: Notebook, badge: "New" },
      { title: "My Timetable", url: "/teacher/timetable", icon: LayoutGrid },
      { title: "My QR Card", url: "/teacher/qr-card", icon: QrCode, badge: "QR" },
      { title: "QR Attendance", url: "/teacher/qr-attendance", icon: ScanLine, badge: "QR" },
      { title: "Results", url: "/teacher/results", icon: GraduationCap },
    ],
  },
];

const studentSections: SidebarSection[] = [
  {
    label: "Overview",
    items: [{ title: "Dashboard", url: "/student", icon: LayoutDashboard }],
  },
  {
    label: "Academics",
    items: [
      { title: "Homework Diary", url: "/student/homework", icon: Notebook, badge: "New" },
      { title: "My Attendance", url: "/student/attendance", icon: CalendarDays, badge: "Live", pulse: true },
      { title: "My QR Card", url: "/student/qr-card", icon: QrCode, badge: "QR" },
      { title: "My Timetable", url: "/student/timetable", icon: BookOpen, badge: "New" },
      { title: "My Results", url: "/student/results", icon: GraduationCap, matchUrls: ["/student/grades", "/student/results"], badge: "New" },
    ],
  },
  {
    label: "Billing",
    items: [{ title: "My Fees", url: "/student/fees", icon: WalletCards }],
  },
];

export function AppSidebar() {
  const { data: user } = useUser();
  const { data: publicSettings } = usePublicSchoolSettings();
  const logout = useLogout();
  const [location] = useLocation();

  const { open, setOpen, isMobile, setOpenMobile } = useSidebar();

  /**
   * On mobile: close the drawer after navigating so the page is fully visible.
   * On desktop: the layout's useSidebar effect handles the expand prevention.
   */
  const handleNavClick = () => {
    if (isMobile) setOpenMobile(false);
  };

  const role = user?.role?.trim().toLowerCase();
  const isAdmin = role === "admin" || role?.includes("admin");
  const isTeacher = role === "teacher" || role?.includes("teacher");
  const isStudent = role === "student" || role?.includes("student");

  const sections = isAdmin ? adminSections : isTeacher ? teacherSections : isStudent ? studentSections : [];

  const roleLabel = role
    ? `${role.charAt(0).toUpperCase()}${role.slice(1)} Portal`
    : "School Management";
  const schoolName =
    publicSettings?.schoolInformation.shortName ||
    publicSettings?.schoolInformation.schoolName ||
    "School Nexus";
  const isSetupComplete = publicSettings?.setup.isComplete ?? false;
  const completionPercentage = publicSettings?.setup.completionPercentage ?? 0;
  return (
    <Sidebar collapsible="icon" className="border-r-0 bg-transparent shadow-none">
      {/* ── Light mode sidebar shell ───────────────────────────────────── */}
      <div className="relative flex h-full flex-col overflow-hidden bg-white text-slate-800 border-r border-slate-200/80 shadow-[2px_0_24px_rgba(0,0,0,0.06)]">

        {/* Subtle top-accent strip */}
        <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-indigo-500 via-blue-500 to-cyan-400" />

        {/* ── Header ──────────────────────────────────────────────────── */}
        <SidebarHeader className="relative border-b border-slate-100 px-4 py-4 md:px-5">
          <div className="flex items-center gap-3 group-data-[collapsible=icon]:justify-center">

            {/* Logo badge */}
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-blue-500 text-white shadow-md shadow-indigo-200 ring-1 ring-indigo-100">
              {publicSettings?.branding.logoUrl ? (
                <img
                  src={publicSettings.branding.logoUrl}
                  alt={schoolName}
                  className="h-7 w-7 rounded-lg object-cover"
                />
              ) : (
                <GraduationCap className="h-5 w-5" />
              )}
            </div>

            <div className="min-w-0 group-data-[collapsible=icon]:hidden">
              <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-indigo-500">
                {roleLabel}
              </p>
              <h2 className="text-base font-bold tracking-tight text-slate-900 leading-tight">
                {schoolName}
              </h2>
              <p className="mt-0.5 truncate text-[11px] text-slate-400">
                {publicSettings?.schoolInformation.motto || "Connected school operations"}
              </p>
            </div>
          </div>
        </SidebarHeader>

        {/* ── Nav ─────────────────────────────────────────────────────── */}
        <SidebarContent className="relative flex-1 px-3 py-3 overflow-y-auto scrollbar-none">
          {sections.map((section, index) => (
            <SidebarGroup key={section.label} className="p-0">
              {index > 0 && (
                <div className="my-2 mx-2 h-px bg-slate-100 group-data-[collapsible=icon]:mx-1" />
              )}

              <SidebarGroupContent>
                <SidebarMenu className="space-y-0.5">
                  {section.items.map((item) => {
                    const isActive =
                      location === item.url || item.matchUrls?.includes(location);

                    return (
                      <SidebarMenuItem key={item.title}>
                        <SidebarMenuButton
                          asChild
                          tooltip={item.title}
                          isActive={isActive}
                          className={cn(
                            "group relative h-9 rounded-lg px-2.5 text-[13px] font-medium transition-all duration-200 ease-out",
                            "group-data-[collapsible=icon]:h-9 group-data-[collapsible=icon]:w-9 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0",
                            isActive
                              ? "bg-indigo-50 text-indigo-700 shadow-sm shadow-indigo-100 border border-indigo-100"
                              : "text-slate-600 hover:bg-slate-50 hover:text-slate-900 border border-transparent hover:border-slate-100",
                          )}
                        >
                          <Link
                            href={item.url}
                            onClick={handleNavClick}
                            className="flex w-full items-center gap-2.5 group-data-[collapsible=icon]:justify-center"
                          >
                            {/* Active indicator bar */}
                            {isActive && (
                              <span className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-0.5 rounded-full bg-indigo-500" />
                            )}

                            <item.icon
                              className={cn(
                                "h-4 w-4 shrink-0 transition-colors duration-200",
                                isActive
                                  ? "text-indigo-600"
                                  : "text-slate-400 group-hover:text-slate-600",
                              )}
                            />

                            <span className="truncate group-data-[collapsible=icon]:hidden">
                              {item.title}
                            </span>

                            {/* Badges */}
                            {(item.badge || item.pulse) && (
                              <span className="ml-auto flex items-center gap-1.5 group-data-[collapsible=icon]:hidden">
                                {item.badge && (
                                  <span
                                    className={cn(
                                      "rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide",
                                      item.badge === "Live"
                                        ? "bg-emerald-100 text-emerald-700"
                                        : item.badge === "QR"
                                          ? "bg-amber-100 text-amber-700"
                                          : isActive
                                            ? "bg-indigo-100 text-indigo-700"
                                            : "bg-slate-100 text-slate-500",
                                    )}
                                  >
                                    {item.badge}
                                  </span>
                                )}
                                {item.pulse && (
                                  <span className="relative flex h-1.5 w-1.5">
                                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                  </span>
                                )}
                              </span>
                            )}

                            {/* Chevron for active */}
                            {isActive && !item.badge && !item.pulse && (
                              <ChevronRight className="ml-auto h-3 w-3 text-indigo-400 group-data-[collapsible=icon]:hidden" />
                            )}
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </SidebarContent>

        {/* ── Footer ──────────────────────────────────────────────────── */}
        <SidebarFooter className="relative border-t border-slate-100 bg-slate-50/70 p-3 backdrop-blur-sm">

          {/* User card */}
          {/* School Settings — admin only */}
          {user?.role === "admin" && (
            <Button
              asChild
              variant="ghost"
              className="flex w-full items-center justify-start gap-2.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-[13px] font-semibold text-slate-700 shadow-sm transition-all duration-200 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
              title="School Settings"
            >
              <Link href="/admin/settings" className="flex w-full items-center gap-2.5 group-data-[collapsible=icon]:justify-center">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-50 group-data-[collapsible=icon]:h-8 group-data-[collapsible=icon]:w-8">
                  <Settings2 className="h-3.5 w-3.5 text-indigo-600" />
                </div>
                <span className="group-data-[collapsible=icon]:hidden">School Settings</span>
                {!isSetupComplete && (
                  <span className="ml-auto inline-flex items-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-700 group-data-[collapsible=icon]:hidden">
                    {completionPercentage}%
                  </span>
                )}
              </Link>
            </Button>
          )}

          {/* Logout */}
          <Button
            variant="ghost"
            onClick={() => logout.mutate()}
            className="flex w-full items-center justify-start gap-2.5 rounded-xl border border-red-100 bg-red-50 px-3.5 py-2.5 text-[13px] font-semibold text-red-500 shadow-sm transition-all duration-200 hover:bg-red-100 hover:text-red-600 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
            title="Logout"
          >
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-red-100 group-data-[collapsible=icon]:h-8 group-data-[collapsible=icon]:w-8">
              <LogOut className="h-3.5 w-3.5 text-red-500" />
            </div>
            <span className="group-data-[collapsible=icon]:hidden">Logout</span>
          </Button>
        </SidebarFooter>
      </div>
    </Sidebar>
  );
}
