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
  sendOtpMutation: UseMutationResult<any, Error, {phoneNumber: string}>;
  verifyOtpMutation: UseMutationResult<LoginResponse, Error, {phoneNumber: string; code: string}>;
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
    queryKey: ["/api/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" })
  });

  const loginMutation = useMutation<LoginResponse, Error, LoginData>({
    mutationFn: async (data: LoginData) => {
      const response = await apiRequest("/api/auth/login", {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
      });
      return response.json();
    },
    onSuccess: (data) => {
      // Store auth token
      if (data.token) {
        localStorage.setItem('token', data.token);
      }

      // Update user data in query client
      queryClient.setQueryData(["/api/auth/me"], data);

      // Redirect based on role
      if (data.role === 'merchant') {
        setLocation('/merchant/dashboard');
      } else {
        setLocation(`/${data.role}`);
      }

      toast({
        title: "Success",
        description: "Successfully logged in"
      });
    },
    onError: (error: Error) => {
      console.error('[Auth] Login failed:', error);
      localStorage.removeItem('token'); // Clear invalid token
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
      const res = await apiRequest("POST", "/api/auth/register", data);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Registration failed');
      }
      return await res.json() as LoginResponse; // Type assertion
    },
    onSuccess: (user: LoginResponse) => {
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
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to send OTP");
      }
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
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Invalid OTP");
      }
      return res.json() as LoginResponse; // Type assertion
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