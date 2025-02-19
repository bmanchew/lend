import { useAuth } from "@/hooks/use-auth.tsx";
import { Loader2 } from "lucide-react";
import { Navigate } from "react-router-dom";

type ProtectedRouteProps = {
  component: () => React.JSX.Element;
  allowedRoles?: string[];
};

export function ProtectedRoute({ component: Component, allowedRoles }: ProtectedRouteProps) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-border" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth/merchant" replace />;
  }

  // Role-based routing
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to={`/${user.role}`} replace />;
  }

  return <Component />;
}