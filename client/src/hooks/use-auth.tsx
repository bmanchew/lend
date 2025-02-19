import React from "react";
import {
  useQuery,
  useMutation,
  UseMutationResult,
} from "@tanstack/react-query";
import { getQueryFn, apiRequest, queryClient } from "../lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { useMobile } from "@/hooks/use-mobile";
import type { LoginData } from "@/types";

export interface LoginResponse {
  id: number;
  username: string;
  email: string;
  role: string;
  name?: string;
  token: string;
}

type AuthContextType = {
  user: LoginResponse | null;
  isLoading: boolean;
  error: Error | null;
  loginMutation: UseMutationResult<LoginResponse, Error, LoginData>;
  logoutMutation: UseMutationResult<void, Error, void>;
  registerMutation: UseMutationResult<LoginResponse, Error, any>;
};

export const AuthContext = React.createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { toast } = useToast();
  const [_, setLocation] = useLocation();
  const isMobile = useMobile();

  const {
    data: user,
    error,
    isLoading,
  } = useQuery<LoginResponse | null>({
    queryKey: ["/api/user"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const loginMutation = useMutation<LoginResponse, Error, LoginData>({
    mutationFn: async (data: LoginData) => {
      console.log('[Auth] Attempting login:', {
        username: data.username,
        loginType: data.loginType,
        timestamp: new Date().toISOString()
      });

      try {
        const response = await apiRequest("/api/auth/login", {
          method: 'POST',
          body: JSON.stringify(data)
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          console.error('[Auth] Login response error:', {
            status: response.status,
            statusText: response.statusText,
            errorData,
            timestamp: new Date().toISOString()
          });
          throw new Error(errorData.message || errorData.error || 'Login failed');
        }

        const responseData = await response.json();
        console.log('[Auth] Login successful:', {
          userId: responseData.id,
          role: responseData.role,
          timestamp: new Date().toISOString()
        });

        return responseData;
      } catch (error: any) {
        console.error('[Auth] Login request failed:', {
          error: error.message,
          timestamp: new Date().toISOString()
        });
        throw error;
      }
    },
    onSuccess: (data) => {
      if (data.token) {
        localStorage.setItem('token', data.token);
      }
      queryClient.setQueryData(["/api/user"], data);

      // Redirect based on role
      if (data.role === 'admin') {
        setLocation('/admin/dashboard');
      } else if (data.role === 'merchant') {
        setLocation('/merchant/dashboard');
      } else {
        setLocation(`/${data.role}`);
      }

      toast({
        title: "Success",
        description: `Successfully logged in as ${data.role}`
      });
    },
    onError: (error: Error) => {
      console.error('[Auth] Login failed:', error);
      localStorage.removeItem('token');
      toast({
        title: "Login Error",
        description: error.message,
        variant: "destructive"
      });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("/api/logout", {
        method: 'POST'
      });

      if (!response.ok) {
        throw new Error('Logout failed');
      }
      localStorage.removeItem('token');
      queryClient.setQueryData(["/api/user"], null);
    },
    onSuccess: () => {
      setLocation("/auth/merchant");
      toast({
        title: "Logged out",
        description: "Successfully logged out"
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Logout failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("/api/register", {
        method: 'POST',
        body: JSON.stringify(data)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Registration failed');
      }
      return response.json();
    },
    onSuccess: (data: LoginResponse) => {
      queryClient.setQueryData(["/api/user"], data);
      setLocation(`/${data.role}`);
    },
    onError: (error: Error) => {
      toast({
        title: "Registration failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return (
    <AuthContext.Provider
      value={{
        user: user ?? null,
        isLoading,
        error,
        loginMutation,
        logoutMutation,
        registerMutation,
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