import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";
import { Navigate } from "react-router-dom";

type ProtectedRouteProps = {
  component: () => React.JSX.Element;
  allowedRoles?: string[];
};

export function ProtectedRoute({ component: Component, allowedRoles }: ProtectedRouteProps) {
  const { user, isLoading } = useAuth();
  console.log('[ProtectedRoute] Rendering with:', { user, allowedRoles });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-border" />
      </div>
    );
  }

  if (!user) {
    console.log('[ProtectedRoute] No user, redirecting to auth');
    return <Navigate to="/auth/customer-login" replace />;
  }

  // Role-based routing
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    console.log('[ProtectedRoute] Invalid role, redirecting to user role path');
    return <Navigate to={`/${user.role}`} replace />;
  }

  return <Component />;
}