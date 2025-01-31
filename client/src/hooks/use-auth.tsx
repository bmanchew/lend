import { useSession, signIn, signOut } from "next-auth/react";
import { useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";

interface User {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  kycStatus?: "pending" | "verified" | "failed";
}

export function useAuth() {
  const { data: session, status } = useSession();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const user = session?.user as User | null;
  const isLoading = status === "loading";

  const login = async () => {
    try {
      const result = await signIn("didit", { callbackUrl: "/customer" });
      if (result?.error) {
        toast({
          title: "Authentication failed",
          description: result.error,
          variant: "destructive",
        });
      }
    } catch (error: any) {
      toast({
        title: "Authentication failed",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const logout = async () => {
    try {
      await signOut({ callbackUrl: "/auth" });
    } catch (error: any) {
      toast({
        title: "Logout failed",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  // Redirect based on auth status
  useEffect(() => {
    if (status === "unauthenticated") {
      setLocation("/auth");
    }
  }, [status, setLocation]);

  return {
    user,
    isLoading,
    login,
    logout,
  };
}