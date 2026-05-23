import { X, LayoutDashboard, CalendarCheck, Wallet, BookOpen, GraduationCap, ListTodo, Building2 } from "lucide-react"
import { Link, useLocation } from "wouter"
import { cn } from "@/lib/utils"
import { useUser } from "@/hooks/use-auth"
import { useUiState } from "@/hooks/useUiState"
import { useEffect, useRef } from "react"

interface NavItem {
  label: string
  icon: typeof LayoutDashboard
  href: string
  roles?: string[]
  matchPrefix?: boolean
}

const navItems: NavItem[] = [
  { label: "Dashboard", icon: LayoutDashboard, href: "/dashboard" },
  { label: "My School", icon: Building2, href: "/my-school/overview", roles: ["admin"], matchPrefix: true },
  { label: "Todos", icon: ListTodo, href: "/admin/todos" },
  { label: "Attendance", icon: CalendarCheck, href: "/attendance" },
  { label: "Finance", icon: Wallet, href: "/finance" },
  { label: "Homework", icon: BookOpen, href: "/homework" },
]

export function SideNav() {
  const [location] = useLocation()
  const { data: user } = useUser()
  const { sidebarOpen, setSidebarOpen } = useUiState()
  const inited = useRef(false)

  useEffect(() => {
    if (!inited.current) {
      inited.current = true
      setSidebarOpen(window.innerWidth >= 768)
    }
  }, [setSidebarOpen])

  const closeOnMobile = () => {
    if (window.innerWidth < 768) setSidebarOpen(false)
  }

  const visibleItems = navItems.filter((item) => {
    if (!item.roles) return true
    if (!user) return false
    return item.roles.includes(user.role)
  })

  return (
    <>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={cn(
          "flex flex-col border-r border-slate-200 bg-white transition-all duration-300 will-change-transform",
          "fixed inset-y-0 left-0 z-50 w-56 md:relative md:z-auto md:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
          !sidebarOpen && "md:hidden",
        )}
      >
        {/* Logo */}
        <div className="flex h-14 items-center justify-between gap-3 border-b border-slate-100 px-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white">
              <GraduationCap className="h-4 w-4" />
            </div>
            <span className="truncate text-sm font-bold text-slate-900">SchoolNexus</span>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 md:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {visibleItems.map((item) => {
            const isActive = item.matchPrefix
              ? location.startsWith("/my-school")
              : location === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                title={item.label}
                aria-label={item.label}
                onClick={closeOnMobile}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-indigo-50 text-indigo-700"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
                )}
              >
                <item.icon className="h-5 w-5 shrink-0" />
                <span>{item.label}</span>
              </Link>
            )
          })}
        </nav>
      </aside>
    </>
  )
}
