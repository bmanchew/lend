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

type AuthContextType = {
  user: SelectUser | null;
  isLoading: boolean;
  error: Error | null;
  loginMutation: UseMutationResult<SelectUser, Error, LoginData>;
  logoutMutation: UseMutationResult<void, Error, void>;
  registerMutation: UseMutationResult<SelectUser, Error, RegisterData>;
  sendOtpMutation: UseMutationResult<any, Error, {phoneNumber: string}>;
  verifyOtpMutation: UseMutationResult<any, Error, {phoneNumber: string; code: string}>;
};

type LoginData = {
  phoneNumber: string;
  code: string;
  loginType: string;
};

type RegisterData = {
  username: string;
  password: string;
  email: string;
  name: string;
  role: string;
  phoneNumber?: string;
};

export const AuthContext = React.createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const isMobile = useMobile();

  const {
    data: user,
    error,
    isLoading,
  } = useQuery<SelectUser | null>({
    queryKey: ["/api/user"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const loginMutation = useMutation({
    mutationFn: async (credentials: LoginData) => {
      // Log device info when the specific number is used
      if (credentials.phoneNumber === "9496339750") {
        console.log('[Auth] Login attempt for monitored number:', {
          phoneNumber: credentials.phoneNumber,
          loginType: credentials.loginType,
          deviceInfo: {
            isMobile,
            userAgent: navigator.userAgent,
            platform: navigator.platform,
            vendor: navigator.vendor,
            screenSize: {
              width: window.innerWidth,
              height: window.innerHeight,
            },
            touch: {
              maxTouchPoints: navigator.maxTouchPoints,
              hasTouch: 'ontouchstart' in window,
            },
            orientation: window.screen?.orientation?.type || 'unknown'
          }
        });
      }

      const res = await apiRequest("POST", "/api/login", {
        ...credentials,
        deviceInfo: {
          isMobile,
          platform: navigator.platform,
          userAgent: navigator.userAgent
        }
      });
      return await res.json();
    },
    onSuccess: (user: SelectUser) => {
      queryClient.setQueryData(["/api/user"], user);
      setLocation(user.role === 'merchant' ? '/merchant/dashboard' : `/${user.role}`);
    },
    onError: (error: Error) => {
      toast({
        title: "Login failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (newUser: RegisterData) => {
      const res = await apiRequest("POST", "/api/register", {
        ...newUser,
        deviceInfo: {
          isMobile,
          platform: navigator.platform,
          userAgent: navigator.userAgent
        }
      });
      return await res.json();
    },
    onSuccess: (user: SelectUser) => {
      queryClient.setQueryData(["/api/user"], user);
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

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/logout");
    },
    onSuccess: () => {
      queryClient.setQueryData(["/api/user"], null);
      setLocation("/auth");
    },
    onError: (error: Error) => {
      toast({
        title: "Logout failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const sendOtpMutation = useMutation({
    mutationFn: async ({ phoneNumber }: { phoneNumber: string }) => {
      // Log device info when sending OTP to the specific number
      if (phoneNumber === "9496339750") {
        console.log('[Auth] Sending OTP to monitored number:', {
          phoneNumber,
          deviceInfo: {
            isMobile,
            userAgent: navigator.userAgent,
            platform: navigator.platform,
            vendor: navigator.vendor,
            screenSize: {
              width: window.innerWidth,
              height: window.innerHeight,
            },
            touch: {
              maxTouchPoints: navigator.maxTouchPoints,
              hasTouch: 'ontouchstart' in window,
            },
            orientation: window.screen?.orientation?.type || 'unknown'
          }
        });
      }

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
      queryClient.setQueryData(["/api/user"], data.user);
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