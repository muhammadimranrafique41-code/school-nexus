import { createContext, useContext, useState, useCallback, type ReactNode } from "react"

interface UiStateContextType {
  sidebarOpen: boolean
  toggleSidebar: () => void
  setSidebarOpen: (open: boolean) => void
  theme: "light" | "dark"
  toggleTheme: () => void
}

const UiStateContext = createContext<UiStateContextType | undefined>(undefined)

export function UiStateProvider({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [theme, setTheme] = useState<"light" | "dark">("light")

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => !prev)
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === "light" ? "dark" : "light"))
  }, [])

  return (
    <UiStateContext.Provider value={{ sidebarOpen, toggleSidebar, setSidebarOpen, theme, toggleTheme }}>
      {children}
    </UiStateContext.Provider>
  )
}

export function useUiState(): UiStateContextType {
  const context = useContext(UiStateContext)
  if (!context) {
    throw new Error("useUiState must be used within a UiStateProvider")
  }
  return context
}
