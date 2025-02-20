
import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";
import { useLocation } from "wouter";
import { useEffect, useRef } from "react";
import { useToast } from "@/hooks/use-toast";

type ProtectedRouteProps = {
  component: () => React.JSX.Element;
  allowedRoles?: string[];
};

export function ProtectedRoute({
  component: Component,
  allowedRoles,
}: ProtectedRouteProps) {
  const { user, isLoading, error } = useAuth();
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const hasRedirected = useRef(false);

  // Handle authentication and authorization in a single effect
  useEffect(() => {
    if (isLoading || location.startsWith("/auth/") || hasRedirected.current) {
      return;
    }

    if (error) {
      hasRedirected.current = true;
      toast({
        title: "Authentication Error",
        description: "Please login again to continue.",
        variant: "destructive",
      });
      setLocation("/auth/merchant");
      return;
    }

    if (!user && !hasRedirected.current) {
      hasRedirected.current = true;
      setLocation("/auth/merchant");
      return;
    }

    if (user && allowedRoles && !allowedRoles.includes(user.role) && !hasRedirected.current) {
      hasRedirected.current = true;
      toast({
        title: "Access Denied",
        description: `You don't have permission to access this area.`,
        variant: "destructive",
      });
      setLocation(`/${user.role}`);
    }
  }, [user, error, isLoading, allowedRoles, location, toast, setLocation]);

  // Reset redirect flag when location changes
  useEffect(() => {
    hasRedirected.current = false;
  }, [location]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-border" />
      </div>
    );
  }

  if (!user || (allowedRoles && !allowedRoles.includes(user.role))) {
    return null;
  }

  try {
    return <Component />;
  } catch (err) {
    console.error("Protected route render error:", err);
    if (!hasRedirected.current) {
      hasRedirected.current = true;
      toast({
        title: "Error",
        description: "Something went wrong. Please try again.",
        variant: "destructive",
      });
      setLocation(`/${user.role}`);
    }
    return null;
  }
}
