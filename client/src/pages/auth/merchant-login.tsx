import { useAuth } from "@/hooks/use-auth";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useMutation } from "@tanstack/react-query";

type LoginFormData = {
  username: string;
  password: string;
};

export default function MerchantLogin() {
  const navigate = useNavigate();
  const { loginMutation } = useAuth();

  const form = useForm<LoginFormData>({
    defaultValues: {
      username: "",
      password: "",
    },
  });

  const onSubmit = async (data: FormData) => {
    console.log('[MerchantLogin] Attempting login:', {
      username: data.username,
      loginType: "merchant",
      timestamp: new Date().toISOString()
    });

    try {
      const response = await loginMutation.mutateAsync({
        username: data.username,
        password: data.password,
        loginType: "merchant"
      });
      console.log('[MerchantLogin] Login successful:', response);
      // Store login response data
      localStorage.setItem('user', JSON.stringify(response));
      // Use navigate instead of window.location
      navigate('/merchant/dashboard');
    } catch (error) {
      console.error("[MerchantLogin] Login failed:", {
        error,
        data,
        timestamp: new Date().toISOString()
      });
      toast({
        title: "Login failed",
        description: error instanceof Error ? error.message : "An error occurred",
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
                  <FormLabel>Username</FormLabel>
                  <FormControl>
                    <Input {...field} type="text" />
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
                    <Input {...field} type="password" />
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