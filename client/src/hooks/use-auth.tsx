import React from "react";
import {
  useQuery,
  useMutation,
  UseMutationResult,
  QueryFunction,
} from "@tanstack/react-query";
import { getQueryFn, apiRequest, queryClient } from "../lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { useMobile } from "@/hooks/use-mobile";
import type { LoginData, LoginResponse } from "@/types";
import type { QueryKey } from "@tanstack/react-query";

interface AuthContextType {
  user: LoginResponse | null;
  isLoading: boolean;
  error: Error | null;
  loginMutation: UseMutationResult<LoginResponse, Error, LoginData>;
  logoutMutation: UseMutationResult<void, Error, void>;
  registerMutation: UseMutationResult<LoginResponse, Error, RegisterData>;
}

interface RegisterData {
  username: string;
  password: string;
  email: string;
  name: string;
  role: "admin" | "merchant" | "customer";
  phoneNumber?: string;
}

export const AuthContext = React.createContext<
  (AuthContextType & { verifyToken: () => string | null }) | null
>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { toast } = useToast();
  const [_, setLocation] = useLocation();
  const isMobile = useMobile();

  // User query with proper typing and error handling
  const {
    data: user,
    error: queryError,
    isLoading,
  } = useQuery<LoginResponse | null, Error>({
    queryKey: ["/api/user"] as const,
    staleTime: Infinity,
    gcTime: 1000 * 60 * 30, // 30 minutes
    queryFn: async ({ signal }) => {
      try {
        const response = await getQueryFn({
          on401: "returnNull",
        })({ queryKey: ["/api/user"], signal, meta: {} });
        return response as LoginResponse | null;
      } catch (error) {
        console.error("[Auth] User query error:", {
          error: error instanceof Error ? error.message : String(error),
          timestamp: new Date().toISOString(),
        });
        return null;
      }
    },
    refetchOnWindowFocus: false, // Prevent unnecessary refetches
  });

  // Enhanced login mutation with better error handling and types
  const loginMutation = useMutation<LoginResponse, Error, LoginData>({
    mutationFn: async (data: LoginData) => {
      console.log("[Auth] Attempting login:", {
        username: data.username.trim(),
        loginType: data.loginType,
        timestamp: new Date().toISOString(),
      });

      try {
        const response = await apiRequest("/api/login", {
          method: "POST",
          body: JSON.stringify({
            ...data,
            username: data.username.trim(),
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          console.error("[Auth] Login response error:", {
            status: response.status,
            statusText: response.statusText,
            errorData,
            timestamp: new Date().toISOString(),
          });
          throw new Error(
            errorData.error || errorData.message || "Login failed",
          );
        }

        const responseData = await response.json();
        console.log("[Auth] Login successful:", {
          userId: responseData.id,
          role: responseData.role,
          timestamp: new Date().toISOString(),
        });

        return responseData;
      } catch (error: any) {
        console.error("[Auth] Login request failed:", {
          error: error.message,
          timestamp: new Date().toISOString(),
        });
        throw error;
      }
    },
    onSuccess: (data) => {
      if (data.token) {
        localStorage.setItem("token", data.token);
      }
      queryClient.setQueryData(["/api/user"], data);
      toast({
        title: "Success",
        description: `Successfully logged in as ${data.role}`,
      });

      // Redirect customers to dashboard, others to role base path
      if (data.role === "customer") {
        setLocation(`/${data.role}/dashboard`);
      } else {
        setLocation(`/${data.role}`);
      }
    },
    onError: (error: Error) => {
      console.error("[Auth] Login failed:", error);
      localStorage.removeItem("token");
      toast({
        title: "Login Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Enhanced logout mutation with proper cleanup
  const logoutMutation = useMutation({
    mutationFn: async () => {
      try {
        await apiRequest("/api/logout", {
          method: "POST",
        });
      } finally {
        // Always clear local storage and cache, even if the API call fails
        localStorage.removeItem("token");
        queryClient.setQueryData(["/api/user"], null);
        queryClient.clear();
      }
    },
    onSuccess: () => {
      setLocation("/auth/merchant");
      toast({
        title: "Logged out",
        description: "Successfully logged out",
      });
    },
    onError: (error: Error) => {
      console.error("[Auth] Logout error:", error);
      toast({
        title: "Logout failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Enhanced register mutation with proper typing
  const registerMutation = useMutation<LoginResponse, Error, RegisterData>({
    mutationFn: async (data: RegisterData) => {
      const response = await apiRequest("/auth/register", {
        method: "POST",
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Registration failed");
      }
      return response.json();
    },
    onSuccess: (data: LoginResponse) => {
      if (data.token) {
        localStorage.setItem("token", data.token);
      }
      queryClient.setQueryData(["/api/user"], data);

      // Redirect to dashboard for customers, otherwise to the role base path
      console.log(data.role);
      if (data.role === "customer") {
        setLocation(`/${data.role}/dashboard`);
      } else {
        setLocation(`/${data.role}`);
      }

      toast({
        title: "Login successful",
        description: `Welcome ${data.name || "back"}!`,
      });
    },
    onError: (error: Error) => {
      console.error("[Auth] Registration error:", error);
      toast({
        title: "Registration failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const verifyToken = () => {
    const token = localStorage.getItem("token");
    if (!token) return null;

    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      if (payload.exp * 1000 < Date.now()) {
        console.log("[Auth] Token expired, cleaning up");
        localStorage.removeItem("token");
        queryClient.setQueryData(["/api/user"], null);
        return null;
      }
      if (!payload.role) {
        console.log("[Auth] Invalid token format, cleaning up");
        localStorage.removeItem("token");
        queryClient.setQueryData(["/api/user"], null);
        return null;
      }
      return token;
    } catch (error) {
      console.error("[Auth] Token validation error:", error);
      localStorage.removeItem("token");
      queryClient.setQueryData(["/api/user"], null);
      return null;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        error: queryError,
        loginMutation,
        logoutMutation,
        registerMutation,
        verifyToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = React.useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}