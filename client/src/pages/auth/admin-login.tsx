import { useAuth } from "@/hooks/use-auth";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import type { LoginResponse, LoginData } from "@/hooks/use-auth";

// Define form schema
const adminLoginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

type AdminLoginForm = z.infer<typeof adminLoginSchema>;

export default function AdminLogin() {
  const navigate = useNavigate();
  const { loginMutation } = useAuth();
  const { toast } = useToast();

  const form = useForm<AdminLoginForm>({
    resolver: zodResolver(adminLoginSchema),
    defaultValues: {
      username: "",
      password: "",
    },
  });

  async function onSubmit(data: AdminLoginForm) {
    try {
      console.log("[Auth] Attempting login:", {
        username: data.username,
        loginType: "admin",
        timestamp: new Date().toISOString()
      });

      const loginData: LoginData = {
        ...data,
        loginType: "admin",
        deviceInfo: {
          isMobile: /iPhone|iPad|iPod|Android/i.test(navigator.userAgent),
          platform: navigator.platform,
          userAgent: navigator.userAgent
        }
      };

      const response = await loginMutation.mutateAsync(loginData);

      if (response.role === 'admin') {
        // Store auth token
        localStorage.setItem('token', response.token);

        toast({
          title: "Success",
          description: "Successfully logged in as admin"
        });
        navigate('/admin/dashboard', { replace: true });
      } else {
        console.error('Unexpected role after login:', response.role);
        toast({
          title: "Error",
          description: "Invalid credentials or insufficient permissions",
          variant: "destructive"
        });
      }
    } catch (error: any) {
      console.error("[Auth] Login failed:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to login. Please check your credentials.",
        variant: "destructive"
      });
    }
  }

  return (
    <div className="container flex min-h-screen items-center justify-center">
      <div className="mx-auto w-full max-w-sm space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-bold">Admin Login</h1>
          <p className="text-gray-500">Enter your credentials to continue</p>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="username"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Username</FormLabel>
                  <FormControl>
                    <Input 
                      {...field} 
                      type="text" 
                      placeholder="admin@example.com"
                      autoComplete="username"
                      required 
                    />
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
                    <Input 
                      {...field} 
                      type="password" 
                      placeholder="••••••••"
                      autoComplete="current-password"
                      required 
                    />
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
              {loginMutation.isPending ? 'Logging in...' : 'Login'}
            </Button>
          </form>
        </Form>

        {loginMutation.isError && (
          <div className="text-sm text-red-500 text-center">
            {loginMutation.error?.message || "An error occurred during login"}
          </div>
        )}
      </div>
    </div>
  );
}