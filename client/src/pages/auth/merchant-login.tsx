import { useAuth } from "@/hooks/use-auth";
import { useForm } from "react-hook-form";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { LoginResponse, LoginData } from "@/types";
import { useEffect } from "react";

const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

type LoginFormData = z.infer<typeof loginSchema>;

export default function MerchantLogin() {
  const [, setLocation] = useLocation();
  const { loginMutation } = useAuth();
  const { toast } = useToast();

  // Check for existing token and valid auth state before redirecting
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token || loginMutation.isPending) return;

    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      const isTokenExpired = payload.exp * 1000 <= Date.now();
      const isInvalidRole = payload.role !== 'merchant';
      
      if (isTokenExpired || isInvalidRole) {
        console.log('[MerchantLogin] Invalid or expired token found, clearing');
        localStorage.removeItem('token');
        return;
      }

      // Only redirect if we're on the login page
      if (window.location.pathname === '/auth/merchant') {
        console.log('[MerchantLogin] Valid token found, redirecting to dashboard');
        setLocation('/merchant/dashboard');
      }
    } catch (error) {
      console.error('[MerchantLogin] Token validation error:', error);
      localStorage.removeItem('token');
    }
  }, [setLocation, loginMutation.isPending]);

  const form = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: "",
      password: "",
    },
  });

  const onSubmit = async (data: LoginFormData) => {
    try {
      console.log("[MerchantLogin] Attempting login:", {
        username: data.username,
        loginType: "merchant",
        timestamp: new Date().toISOString()
      });

      const loginData: LoginData = {
        username: data.username,
        password: data.password,
        loginType: "merchant"
      };

      const response = await loginMutation.mutateAsync(loginData) as LoginResponse;
      console.log("[MerchantLogin] Received response:", {
        success: true,
        hasToken: !!response.token,
        role: response.role,
        timestamp: new Date().toISOString()
      });

      if (!response || !response.token) {
        throw new Error('Invalid response from server');
      }

      // Store auth token
      localStorage.setItem('token', response.token);

      // For merchant users, redirect to the dashboard
      if (response.role === 'merchant') {
        console.log('[MerchantLogin] Login successful, redirecting to dashboard');
        toast({
          title: "Success",
          description: "Successfully logged in"
        });
        setLocation('/merchant/dashboard');
      } else {
        console.error('[MerchantLogin] Invalid role:', response.role);
        toast({
          title: "Access Denied",
          description: "This login is for merchant accounts only.",
          variant: "destructive"
        });
      }
    } catch (error: any) {
      console.error("[MerchantLogin] Login failed:", {
        error: error,
        errorType: error.constructor.name,
        errorMessage: error.response?.data?.message || error.message,
        timestamp: new Date().toISOString()
      });

      let errorMessage = "Login failed. Please try again.";
      if (error.response?.data?.error) {
        errorMessage = error.response.data.error;
      } else if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error.message) {
        errorMessage = error.message;
      }

      toast({
        title: "Login Error",
        description: errorMessage,
        variant: "destructive"
      });
    }
  };

  return (
    <div className="container flex min-h-screen items-center justify-center">
      <div className="mx-auto w-full max-w-sm space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-bold">Merchant Login</h1>
          <p className="text-gray-500">Enter your credentials to continue</p>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="username"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Username/Email</FormLabel>
                  <FormControl>
                    <Input {...field} type="text" autoComplete="username" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Password</FormLabel>
                  <FormControl>
                    <Input {...field} type="password" autoComplete="current-password" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button 
              type="submit" 
              className="w-full" 
              disabled={loginMutation.isPending}
            >
              {loginMutation.isPending ? "Logging in..." : "Login"}
            </Button>
          </form>
        </Form>
      </div>
    </div>
  );
}