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

  // Handle authentication error
  useEffect(() => {
    if (error && !hasRedirected.current) {
      hasRedirected.current = true;
      toast({
        title: "Authentication Error",
        description: "Please login again to continue.",
        variant: "destructive",
      });
      setLocation("/auth/merchant");
    }
  }, [error, toast, setLocation]);

  // Handle user and role checks
  useEffect(() => {
    // Skip if we're already on an auth page or if we've already redirected
    if (location.startsWith("/auth/") || hasRedirected.current) {
      return;
    }

    // Handle unauthenticated user
    if (!user) {
      hasRedirected.current = true;
      setLocation("/auth/merchant");
      return;
    }

    // Handle unauthorized role
    if (allowedRoles && !allowedRoles.includes(user.role)) {
      hasRedirected.current = true;
      toast({
        title: "Access Denied",
        description: `You don't have permission to access this area.`,
        variant: "destructive",
      });
      setLocation(`/${user.role}`);
    }
  }, [user, allowedRoles, toast, setLocation, location]);

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
