import {
  BookOpen, Users, LayoutDashboard, Calculator,
  GraduationCap, CalendarDays, WalletCards, Briefcase, LogOut, Settings2, ShieldCheck, QrCode, ScanLine
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
} from "@/components/ui/sidebar";
import { Link, useLocation } from "wouter";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
      { title: "Classes", url: "/admin/academics", icon: BookOpen },
      { title: "QR Attendance", url: "/admin/qr-attendance", icon: QrCode, badge: "New" },
    ],
  },
  {
    label: "Finance",
    items: [{ title: "Finance", url: "/admin/finance", icon: Calculator }],
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
      { title: "Attendance Marking", url: "/teacher/attendance", icon: CalendarDays, badge: "New", pulse: true },
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
      { title: "My Attendance", url: "/student/attendance", icon: CalendarDays, badge: "New", pulse: true },
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

  const sections =
    user?.role === 'admin'
      ? adminSections
      : user?.role === 'teacher'
        ? teacherSections
        : user?.role === 'student'
          ? studentSections
          : [];

  const roleLabel = user?.role ? `${user.role.charAt(0).toUpperCase()}${user.role.slice(1)} Portal` : "School Management";
  const schoolName = publicSettings?.schoolInformation.shortName || publicSettings?.schoolInformation.schoolName || "School Nexus";
  const isSetupComplete = publicSettings?.setup.isComplete ?? false;
  const completionPercentage = publicSettings?.setup.completionPercentage ?? 0;
  const initials = user?.name
    ?.split(" ")
    .map((part) => part.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase() || "SM";

  return (
    <Sidebar collapsible="icon" className="border-r-0 bg-transparent shadow-none">
      <div className="relative flex h-full flex-col overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white shadow-2xl shadow-slate-950/50">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(168,85,247,0.24),_transparent_32%),radial-gradient(circle_at_bottom,_rgba(236,72,153,0.18),_transparent_28%)]" />

        <SidebarHeader className="relative border-b border-white/10 px-4 py-6 md:px-5">
          <div className="flex items-center gap-3 group-data-[collapsible=icon]:justify-center">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 via-purple-500 to-fuchsia-500 text-white shadow-lg shadow-purple-500/40 ring-1 ring-white/10">
              {publicSettings?.branding.logoUrl ? (
                <img src={publicSettings.branding.logoUrl} alt={schoolName} className="h-8 w-8 rounded-xl object-cover" />
              ) : (
                <GraduationCap className="h-6 w-6" />
              )}
            </div>
            <div className="min-w-0 group-data-[collapsible=icon]:hidden">
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">{roleLabel}</p>
              <h2 className="bg-gradient-to-r from-violet-300 via-fuchsia-200 to-pink-300 bg-clip-text text-2xl font-display font-bold tracking-tight text-transparent">
                {schoolName}
              </h2>
              <p className="mt-1 truncate text-xs text-slate-400">{publicSettings?.schoolInformation.motto || "Connected school operations"}</p>
            </div>
          </div>
        </SidebarHeader>

        <SidebarContent className="relative flex-1 px-3 py-5">
          {sections.map((section, index) => (
            <SidebarGroup key={section.label} className="p-0">
              <SidebarGroupLabel
                className={cn(
                  "mb-3 h-auto px-3 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500",
                  index > 0 && "mt-7 border-t border-white/10 pt-5",
                )}
              >
                {section.label}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu className="space-y-1.5">
                  {section.items.map((item) => {
                    const isActive = location === item.url || item.matchUrls?.includes(location);

                    return (
                      <SidebarMenuItem key={item.title}>
                        <SidebarMenuButton
                          asChild
                          tooltip={item.title}
                          isActive={isActive}
                          className={cn(
                            "group relative h-12 rounded-2xl border px-3.5 text-sm font-medium transition-all duration-300 ease-out group-data-[collapsible=icon]:h-12 group-data-[collapsible=icon]:w-12 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0",
                            isActive
                              ? "border-transparent bg-gradient-to-r from-violet-600 via-fuchsia-600 to-pink-600 text-white shadow-xl shadow-fuchsia-900/40 ring-2 ring-fuchsia-300/20"
                              : "border-transparent text-slate-300 hover:translate-x-1 hover:border-white/10 hover:bg-white/5 hover:text-white hover:shadow-lg hover:shadow-purple-500/10 group-data-[collapsible=icon]:hover:translate-x-0",
                          )}
                        >
                          <Link href={item.url} className="flex w-full items-center gap-3 group-data-[collapsible=icon]:justify-center">
                            <item.icon className={cn(
                              "h-5 w-5 shrink-0 transition-colors duration-300",
                              isActive ? "text-white" : "text-slate-400 group-hover:text-fuchsia-300",
                            )} />
                            <span className="truncate group-data-[collapsible=icon]:hidden">{item.title}</span>
                            {(item.badge || item.pulse) ? (
                              <span className="ml-auto flex items-center gap-2 group-data-[collapsible=icon]:hidden">
                                {item.badge ? (
                                  <span
                                    className={cn(
                                      "rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                                      isActive
                                        ? "border-white/20 bg-white/15 text-white"
                                        : "border-fuchsia-400/20 bg-fuchsia-500/15 text-fuchsia-200",
                                    )}
                                  >
                                    {item.badge}
                                  </span>
                                ) : null}
                                {item.pulse ? (
                                  <span className="h-2.5 w-2.5 rounded-full bg-gradient-to-r from-pink-400 to-rose-400 ring-4 ring-fuchsia-500/10" />
                                ) : null}
                              </span>
                            ) : null}
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

        <SidebarFooter className="relative border-t border-white/10 bg-slate-950/50 p-4 backdrop-blur-xl">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-lg shadow-black/20 backdrop-blur-xl">
            <div className="flex items-center gap-3 group-data-[collapsible=icon]:justify-center">
              <Avatar className="h-11 w-11 border-0 ring-4 ring-fuchsia-500/20 shadow-lg shadow-fuchsia-500/20">
                <AvatarImage src={`https://api.dicebear.com/7.x/notionists/svg?seed=${user?.name ?? 'School'}`} />
                <AvatarFallback className="bg-gradient-to-br from-violet-600 to-pink-600 text-sm font-semibold text-white">
                  {initials}
                </AvatarFallback>
              </Avatar>

              <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
                <p className="truncate text-sm font-semibold text-white">{user?.name ?? "School User"}</p>
                <p className="mt-0.5 text-[11px] uppercase tracking-[0.22em] text-slate-400">{user?.role ?? "Account"}</p>
              </div>
            </div>

            {user?.role === "admin" ? (
              <div className="mt-4 rounded-2xl border border-white/10 bg-slate-900/60 p-3 group-data-[collapsible=icon]:hidden">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Setup status</p>
                    <p className="mt-1 text-sm font-semibold text-white">{isSetupComplete ? "Configuration complete" : "Configuration in progress"}</p>
                  </div>
                  <span className={cn(
                    "inline-flex items-center rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.2em]",
                    isSetupComplete
                      ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-200"
                      : "border-amber-400/20 bg-amber-500/10 text-amber-100",
                  )}>
                    {completionPercentage}%
                  </span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                  <div
                    className={cn(
                      "h-full rounded-full bg-gradient-to-r",
                      isSetupComplete ? "from-emerald-400 to-teal-400" : "from-amber-400 via-orange-400 to-pink-400",
                    )}
                    style={{ width: `${completionPercentage}%` }}
                  />
                </div>
              </div>
            ) : null}

            {user?.role === "admin" ? (
              <Button
                asChild
                variant="ghost"
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-200 transition-all duration-300 hover:bg-white/10 hover:text-white group-data-[collapsible=icon]:px-0"
                title="School Settings"
              >
                <Link href="/admin/settings">
                  <Settings2 className="h-4 w-4" />
                  <span className="group-data-[collapsible=icon]:hidden">School Settings</span>
                  {!isSetupComplete ? <ShieldCheck className="ml-auto h-4 w-4 text-amber-300 group-data-[collapsible=icon]:hidden" /> : null}
                </Link>
              </Button>
            ) : null}

            <Button
              variant="ghost"
              onClick={() => logout.mutate()}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-red-400/15 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-300 transition-all duration-300 hover:bg-red-500/20 hover:text-red-200 group-data-[collapsible=icon]:mt-3 group-data-[collapsible=icon]:px-0"
              title="Logout"
            >
              <LogOut className="h-4 w-4" />
              <span className="group-data-[collapsible=icon]:hidden">Logout</span>
            </Button>
          </div>
        </SidebarFooter>
      </div>
    </Sidebar>
  );
}
