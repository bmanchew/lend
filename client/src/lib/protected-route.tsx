
import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";
import { useLocation } from "wouter";
import { useEffect } from "react";
import { useToast } from "@/hooks/use-toast";

type ProtectedRouteProps = {
  component: () => React.JSX.Element;
  allowedRoles?: string[];
};

export function ProtectedRoute({ component: Component, allowedRoles }: ProtectedRouteProps) {
  const { user, isLoading, error } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  // Handle authentication error
  useEffect(() => {
    if (error) {
      toast({
        title: "Authentication Error",
        description: "Please login again to continue.",
        variant: "destructive"
      });
      setLocation("/auth/merchant");
    }
  }, [error, toast, setLocation]);

  // Handle user and role checks
  useEffect(() => {
    const [location] = useLocation();
    if (!user && !location.startsWith("/auth/")) {
      setLocation("/auth/merchant");
      return;
    }

    if (allowedRoles && !allowedRoles.includes(user?.role)) {
      toast({
        title: "Access Denied",
        description: `You don't have permission to access this area.`,
        variant: "destructive"
      });
      setLocation(`/${user?.role}`);
    }
  }, [user, allowedRoles, toast, setLocation]);

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
    console.error('Protected route render error:', err);
    toast({
      title: "Error",
      description: "Something went wrong. Please try again.",
      variant: "destructive"
    });
    setLocation(`/${user.role}`);
    return null;
  }
}
