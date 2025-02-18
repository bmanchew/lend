import { useAuth } from "@/hooks/use-auth";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { LoginResponse } from "@/types";

const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

type LoginFormData = z.infer<typeof loginSchema>;

export default function MerchantLogin() {
  const navigate = useNavigate();
  const { loginMutation } = useAuth();
  const { toast } = useToast();

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

      const response = await loginMutation.mutateAsync({
        username: data.username,
        password: data.password,
        loginType: "merchant"
      }) as LoginResponse;

      if (!response || !response.token) {
        console.error("[MerchantLogin] Invalid response:", response);
        throw new Error('Invalid response from server');
      }

      // Store auth token
      localStorage.setItem('token', response.token);

      if (response.role === 'merchant') {
        toast({
          title: "Success",
          description: "Successfully logged in",
        });
        navigate('/merchant/dashboard');
      } else {
        toast({
          title: "Access Denied",
          description: "This login is for merchant accounts only.",
          variant: "destructive"
        });
      }
    } catch (error: any) {
      console.error("[MerchantLogin] Login failed:", {
        error: error,
        data: { username: data.username, password: "[REDACTED]" },
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