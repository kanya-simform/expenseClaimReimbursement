import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/lib/auth-context";
import type { Role } from "@/lib/types";

export function ProtectedRoute({ allowedRoles }: { allowedRoles?: Role[] }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to={homeRouteForRole(user.role)} replace />;
  }

  return <Outlet />;
}

export function homeRouteForRole(role: Role) {
  switch (role) {
    case "CLAIMANT":
      return "/claims";
    case "APPROVER":
      return "/approvals";
    case "FINANCE":
      return "/finance";
  }
}
