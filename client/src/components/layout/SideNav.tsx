import { LayoutDashboard, CalendarCheck, Wallet, BookOpen, GraduationCap } from "lucide-react"
import { Link, useLocation } from "wouter"
import { cn } from "@/lib/utils"
import { useUiState } from "@/hooks/useUiState"

interface NavItem {
  label: string
  icon: typeof LayoutDashboard
  href: string
}

const navItems: NavItem[] = [
  { label: "Dashboard", icon: LayoutDashboard, href: "/dashboard" },
  { label: "Attendance", icon: CalendarCheck, href: "/attendance" },
  { label: "Finance", icon: Wallet, href: "/finance" },
  { label: "Homework", icon: BookOpen, href: "/homework" },
]

export function SideNav() {
  const [location] = useLocation()
  const { sidebarOpen } = useUiState()

  return (
    <aside
      className={cn(
        "flex flex-col border-r border-slate-200 bg-white transition-all duration-300",
        sidebarOpen ? "w-56" : "w-16",
      )}
    >
      <div className="flex h-14 items-center gap-2 border-b border-slate-100 px-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white">
          <GraduationCap className="h-4 w-4" />
        </div>
        {sidebarOpen && (
          <span className="text-sm font-bold text-slate-900">School Nexus</span>
        )}
      </div>

      <nav className="flex-1 space-y-1 px-2 py-4">
        {navItems.map((item) => {
          const isActive = location === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-indigo-50 text-indigo-700"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {sidebarOpen && <span>{item.label}</span>}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
