import { 
  BookOpen, Users, LayoutDashboard, Calculator, 
  GraduationCap, CalendarDays, WalletCards, Briefcase
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
} from "@/components/ui/sidebar";
import { Link, useLocation } from "wouter";
import { useUser } from "@/hooks/use-auth";

const adminItems = [
  { title: "Dashboard", url: "/admin", icon: LayoutDashboard },
  { title: "Users", url: "/admin/users", icon: Users },
  { title: "Academics", url: "/admin/academics", icon: BookOpen },
  { title: "Finance", url: "/admin/finance", icon: Calculator },
];

const teacherItems = [
  { title: "Dashboard", url: "/teacher", icon: LayoutDashboard },
  { title: "Attendance", url: "/teacher/attendance", icon: CalendarDays },
  { title: "Results", url: "/teacher/results", icon: GraduationCap },
];

const studentItems = [
  { title: "Dashboard", url: "/student", icon: LayoutDashboard },
  { title: "My Attendance", url: "/student/attendance", icon: CalendarDays },
  { title: "My Grades", url: "/student/grades", icon: GraduationCap },
  { title: "My Fees", url: "/student/fees", icon: WalletCards },
];

export function AppSidebar() {
  const { data: user } = useUser();
  const [location] = useLocation();

  let items = [];
  if (user?.role === 'admin') items = adminItems;
  if (user?.role === 'teacher') items = teacherItems;
  if (user?.role === 'student') items = studentItems;

  return (
    <Sidebar className="border-r-0 shadow-lg shadow-black/5 bg-sidebar-background">
      <SidebarHeader className="h-16 flex items-center justify-center border-b border-white/5">
        <div className="flex items-center gap-3 w-full px-4">
          <div className="bg-primary/20 p-2 rounded-xl text-primary">
            <Briefcase className="h-6 w-6" />
          </div>
          <span className="font-display font-bold text-lg tracking-tight text-sidebar-foreground">
            EduManage
          </span>
        </div>
      </SidebarHeader>
      
      <SidebarContent className="pt-6 px-3">
        <SidebarGroup>
          <SidebarGroupLabel className="text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider mb-2">
            Navigation
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-1">
              {items.map((item) => {
                const isActive = location === item.url;
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton 
                      asChild 
                      isActive={isActive}
                      className={`
                        h-11 px-4 rounded-xl transition-all duration-200
                        ${isActive 
                          ? 'bg-primary text-primary-foreground font-semibold shadow-md shadow-primary/20' 
                          : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'}
                      `}
                    >
                      <Link href={item.url} className="flex items-center gap-3">
                        <item.icon className={`h-5 w-5 ${isActive ? 'text-primary-foreground' : 'text-sidebar-foreground/50'}`} />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
