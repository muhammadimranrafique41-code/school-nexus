import { Menu, Bell, Sun, Moon } from "lucide-react"
import { useUiState } from "@/hooks/useUiState"
import { useUser } from "@/hooks/use-auth"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"

export function Header() {
  const { sidebarOpen, toggleSidebar, theme, toggleTheme } = useUiState()
  const { data: user } = useUser()

  const initials = user?.name
    ?.split(" ")
    .map((n) => n.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase() ?? "SN"

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4 shadow-sm">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={toggleSidebar} className="h-8 w-8 rounded-lg">
          <Menu className="h-4 w-4" />
        </Button>
        <div className="h-5 w-px bg-slate-200" />
        <h1 className="text-sm font-semibold text-slate-800">School Nexus</h1>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={toggleTheme} className="h-8 w-8 rounded-lg">
          {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
        </Button>
        <Button variant="ghost" size="icon" className="relative h-8 w-8 rounded-lg">
          <Bell className="h-4 w-4" />
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-indigo-500 ring-2 ring-white" />
        </Button>
        <Avatar className="h-7 w-7">
          <AvatarFallback className="bg-indigo-100 text-xs font-bold text-indigo-700">
            {initials}
          </AvatarFallback>
        </Avatar>
      </div>
    </header>
  )
}
