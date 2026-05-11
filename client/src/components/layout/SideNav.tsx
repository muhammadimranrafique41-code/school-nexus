import { LayoutDashboard, CalendarCheck, Wallet, BookOpen, GraduationCap } from "lucide-react"
import { Link, useLocation } from "wouter"
import { cn } from "@/lib/utils"

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

  return (
    <aside
      className={cn(
        "flex w-16 flex-col border-r border-slate-200 bg-white transition-all duration-300",
      )}
    >
      {/* Logo - icon only, centered */}
      <div className="flex h-14 items-center justify-center border-b border-slate-100">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white">
          <GraduationCap className="h-4 w-4" />
        </div>
      </div>

      {/* Navigation - icon only, centered */}
      <nav className="flex-1 space-y-2 px-2 py-4">
        {navItems.map((item) => {
          const isActive = location === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              aria-label={item.label}
              className={cn(
                "flex items-center justify-center rounded-lg p-2 transition-colors",
                isActive
                  ? "bg-indigo-50 text-indigo-700"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
              )}
            >
              <item.icon className="h-5 w-5 shrink-0" />
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}