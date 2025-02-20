import { useAuth } from "@/hooks/use-auth.tsx";
import { useForm } from "react-hook-form";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import type { LoginData } from "@/types";

const adminLoginSchema = z.object({
  username: z.string()
    .min(1, "Username is required")
    .transform(val => val.trim()),
  password: z.string().min(1, "Password is required"),
});

type AdminLoginForm = z.infer<typeof adminLoginSchema>;

export default function AdminLogin() {
  const [, setLocation] = useLocation();
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
      const loginData: LoginData = {
        username: data.username.trim(),
        password: data.password,
        loginType: "admin"
      };

      console.log('[AdminLogin] Attempting login:', {
        username: loginData.username,
        loginType: loginData.loginType,
        formData: loginData,
        timestamp: new Date().toISOString()
      });

      const response = await loginMutation.mutateAsync(loginData);

      if (!response || !response.token) {
        console.error('[AdminLogin] Invalid response:', {
          response,
          timestamp: new Date().toISOString()
        });
        throw new Error('Invalid response from server');
      }

      console.log('[AdminLogin] Login response:', {
        success: true,
        hasToken: !!response.token,
        role: response.role,
        timestamp: new Date().toISOString()
      });

      if (response.role === 'admin') {
        console.log('[AdminLogin] Login successful, redirecting to dashboard');
        toast({
          title: "Success",
          description: "Successfully logged in as admin"
        });
        setLocation('/admin/dashboard');
      } else {
        console.error('[AdminLogin] Invalid role:', {
          expectedRole: 'admin',
          receivedRole: response.role,
          timestamp: new Date().toISOString()
        });
        toast({
          title: "Access Denied",
          description: "This login is for admin accounts only.",
          variant: "destructive"
        });
      }
    } catch (error: any) {
      console.error("[AdminLogin] Login failed:", {
        error: error.message,
        errorObject: error,
        errorResponse: error.response?.data,
        timestamp: new Date().toISOString()
      });

      let errorMessage = "Failed to login. Please check your credentials.";
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
                      onChange={(e) => field.onChange(e.target.value.trim())}
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
      </div>
    </div>
  );
}