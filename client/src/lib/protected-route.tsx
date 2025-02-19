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

  useEffect(() => {
    // Show error toast if authentication fails
    if (error) {
      toast({
        title: "Authentication Error",
        description: "Please login again to continue.",
        variant: "destructive"
      });
      setLocation("/auth/merchant");
    }
  }, [error, toast, setLocation]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-border" />
      </div>
    );
  }

  if (!user) {
    setLocation("/auth/merchant");
    return null;
  }

  // Role-based routing with improved error handling
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    toast({
      title: "Access Denied",
      description: `You don't have permission to access this area.`,
      variant: "destructive"
    });
    setLocation(`/${user.role}`);
    return null;
  }

  // Error boundary wrapper
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