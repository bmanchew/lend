import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";
import { Redirect, Route } from "wouter";

type ProtectedRouteProps = {
  path?: string;
  component: () => React.JSX.Element;
  allowedRoles?: string[];
};

export function ProtectedRoute({ path, component: Component, allowedRoles }: ProtectedRouteProps) {
  const { user, isLoading } = useAuth();
  console.log('[ProtectedRoute] Rendering with:', { path, user, allowedRoles });

  if (isLoading) {
    return (
      <Route path={path}>
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="h-8 w-8 animate-spin text-border" />
        </div>
      </Route>
    );
  }

  if (!user) {
    console.log('[ProtectedRoute] No user, redirecting to auth');
    return (
      <Route path={path}>
        <Redirect to="/auth" />
      </Route>
    );
  }

  // Role-based routing
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    console.log('[ProtectedRoute] Invalid role, redirecting to user role path');
    return (
      <Route path={path}>
        <Redirect to={`/${user.role}`} />
      </Route>
    );
  }

  return <Route path={path} component={Component} />;
}