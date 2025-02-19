import { useAuth } from "@/hooks/use-auth";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

// Define form schema
const adminLoginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
  loginType: z.literal("admin")
});

type AdminLoginForm = z.infer<typeof adminLoginSchema>;

export default function AdminLogin() {
  const { loginMutation } = useAuth();
  const { toast } = useToast();

  const form = useForm<AdminLoginForm>({
    resolver: zodResolver(adminLoginSchema),
    defaultValues: {
      username: "",
      password: "",
      loginType: "admin"
    },
  });

  async function onSubmit(data: AdminLoginForm) {
    try {
      const response = await loginMutation.mutateAsync({
        ...data,
        deviceInfo: {
          isMobile: /iPhone|iPad|iPod|Android/i.test(navigator.userAgent),
          platform: window.navigator.platform,
          userAgent: window.navigator.userAgent
        }
      });

      if (response?.role === 'admin') {
        // Successfully logged in as admin
        toast({
          title: "Success",
          description: "Successfully logged in as admin"
        });
        window.location.href = '/admin/dashboard';
      } else {
        console.error('Unexpected role after login:', response?.role);
        toast({
          title: "Error",
          description: "Invalid credentials or insufficient permissions",
          variant: "destructive"
        });
      }
    } catch (error: any) {
      console.error('Login error:', error);
      toast({
        title: "Error",
        description: error.response?.data?.message || "Failed to login. Please check your credentials.",
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