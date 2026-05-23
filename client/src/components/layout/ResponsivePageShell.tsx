import { type ReactNode } from "react";
import { UiStateProvider } from "@/hooks/useUiState";
import { SideNav } from "@/components/layout/SideNav";
import { Header } from "@/components/layout/Header";

interface ResponsivePageShellProps {
  children: ReactNode;
}

export function ResponsivePageShell({ children }: ResponsivePageShellProps) {
  return (
    <UiStateProvider>
      <div className="flex h-screen w-full overflow-hidden bg-slate-50">
        <SideNav />
        <div className="flex min-w-0 flex-1 flex-col">
          <Header />
          <main className="flex-1 overflow-y-auto px-3 py-4 md:px-5 md:py-5">
            {children}
          </main>
        </div>
      </div>
    </UiStateProvider>
  );
}
