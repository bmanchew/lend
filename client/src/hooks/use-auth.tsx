import React from "react";
import {
  useQuery,
  useMutation,
  UseMutationResult,
} from "@tanstack/react-query";
import type { SelectUser } from "@db/schema";
import { getQueryFn, apiRequest, queryClient } from "../lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { useMobile } from "@/hooks/use-mobile";
import type { LoginData } from "@/types";

type AuthContextType = {
  user: SelectUser | null;
  isLoading: boolean;
  error: Error | null;
  loginMutation: UseMutationResult<SelectUser, Error, LoginData>;
  logoutMutation: UseMutationResult<void, Error, void>;
  registerMutation: UseMutationResult<SelectUser, Error, any>;
  sendOtpMutation: UseMutationResult<any, Error, {phoneNumber: string}>;
  verifyOtpMutation: UseMutationResult<any, Error, {phoneNumber: string; code: string}>;
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
  } = useQuery<SelectUser | null>({
    queryKey: ["/api/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const loginMutation = useMutation({
    mutationFn: async (credentials: LoginData) => {
      console.log("[Auth] Attempting login:", {
        username: credentials.username,
        loginType: credentials.loginType,
        timestamp: new Date().toISOString()
      });

      const res = await apiRequest("POST", "/api/auth/login", {
        ...credentials,
        deviceInfo: {
          isMobile,
          platform: navigator.platform,
          userAgent: navigator.userAgent
        }
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Login failed');
      }

      return await res.json();
    },
    onSuccess: (data) => {
      console.log('[Auth] Login successful:', {
        userId: data.id,
        role: data.role,
        timestamp: new Date().toISOString()
      });

      // Store auth token
      if (data.token) {
        localStorage.setItem('token', data.token);
      }

      // Update user data in query client
      queryClient.setQueryData(["/api/auth/me"], data);

      toast({
        title: "Success",
        description: "Successfully logged in"
      });

      // Redirect based on role
      if (data.role === 'merchant') {
        setLocation('/merchant/dashboard');
      } else {
        setLocation(`/${data.role}`);
      }
    },
    onError: (error: Error) => {
      console.error('[Auth] Login failed:', error);
      toast({
        title: "Login Error",
        description: error.message,
        variant: "destructive"
      });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/auth/logout");
      if (!res.ok) {
        throw new Error('Logout failed');
      }
      localStorage.removeItem('token');
      queryClient.setQueryData(["/api/auth/me"], null);
    },
    onSuccess: () => {
      setLocation("/auth");
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

  // Keep other mutations for backward compatibility
  const registerMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/auth/register", data);
      return await res.json();
    },
    onSuccess: (user: SelectUser) => {
      queryClient.setQueryData(["/api/auth/me"], user);
      setLocation(`/${user.role}`);
    },
    onError: (error: Error) => {
      toast({
        title: "Registration failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const sendOtpMutation = useMutation({
    mutationFn: async ({ phoneNumber }: { phoneNumber: string }) => {
      const res = await apiRequest("POST", "/api/auth/send-otp", { 
        phoneNumber,
        deviceInfo: {
          isMobile,
          platform: navigator.platform,
          userAgent: navigator.userAgent
        }
      });
      if (!res.ok) throw new Error("Failed to send OTP");
      return res.json();
    },
  });

  const verifyOtpMutation = useMutation({
    mutationFn: async ({ phoneNumber, code }: { phoneNumber: string; code: string }) => {
      const res = await apiRequest("POST", "/api/auth/verify-otp", { 
        phoneNumber, 
        code,
        deviceInfo: {
          isMobile,
          platform: navigator.platform,
          userAgent: navigator.userAgent
        }
      });
      if (!res.ok) throw new Error("Invalid OTP");
      const data = await res.json();
      if (data.token) {
        localStorage.setItem('token', data.token);
      }
      queryClient.setQueryData(["/api/auth/me"], data.user);
      setLocation(`/${data.user.role}`);
      return data;
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
        sendOtpMutation,
        verifyOtpMutation,
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