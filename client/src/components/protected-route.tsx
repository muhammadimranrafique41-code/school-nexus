import { ReactNode } from "react";
import { useUser } from "@/hooks/use-auth";
import { Redirect, useLocation } from "wouter";
import { Loader2 } from "lucide-react";

interface ProtectedRouteProps {
  children: ReactNode;
  allowedRoles?: string[];
}

export function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { data: user, isLoading } = useUser();
  const [location] = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Redirect to="/login" />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    const fallback = user.role === "super_admin" ? "/super-admin/overview" : `/${user.role}`;
    return <Redirect to={fallback} />;
  }

  // Generic catch for base routes routing to specific dashboards
  if (location === "/") {
    const dashboardPath = user.role === "super_admin" ? "/super-admin/overview" : `/${user.role}`;
    return <Redirect to={dashboardPath} />;
  }

  return <>{children}</>;
}
