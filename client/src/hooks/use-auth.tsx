import React from "react";
import {
  useQuery,
  useMutation,
  UseMutationResult,
} from "@tanstack/react-query";
import type { SelectUser, InsertUser } from "@db/schema";
import { getQueryFn, apiRequest, queryClient } from "../lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";

type AuthContextType = {
  user: SelectUser | null;
  isLoading: boolean;
  error: Error | null;
  loginMutation: UseMutationResult<SelectUser, Error, LoginData>;
  logoutMutation: UseMutationResult<void, Error, void>;
  registerMutation: UseMutationResult<SelectUser, Error, InsertUser>;
  sendOtpMutation: UseMutationResult<any, Error, {phoneNumber: string}>; // Added OTP mutation
  verifyOtpMutation: UseMutationResult<any, Error, {phoneNumber: string; code: string}>; // Added OTP mutation
};

type LoginData = Pick<InsertUser, "username" | "password">;

export const AuthContext = React.createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { toast } = useToast();
  const [, setLocation] = useLocation();

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
      const res = await apiRequest("POST", "/api/login", credentials);
      return await res.json();
    },
    onSuccess: (user: SelectUser) => {
      queryClient.setQueryData(["/api/user"], user);
      setLocation(`/${user.role}`);
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
    mutationFn: async (newUser: InsertUser) => {
      const res = await apiRequest("POST", "/api/register", newUser);
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
    mutationFn: async (phoneNumber: string) => {
      const res = await apiRequest("POST", "/api/auth/send-otp", { phoneNumber });
      if (!res.ok) throw new Error("Failed to send OTP");
      return res.json();
    },
  });

  const verifyOtpMutation = useMutation({
    mutationFn: async ({ phoneNumber, code }: { phoneNumber: string; code: string }) => {
      const res = await apiRequest("POST", "/api/auth/verify-otp", { phoneNumber, code });
      if (!res.ok) throw new Error("Invalid OTP");
      const data = await res.json();
      // Assuming the API returns user data upon successful verification
      queryClient.setQueryData(["/api/user"], data.user);
      setLocation(`/${data.user.role}`); //Update location based on user role
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