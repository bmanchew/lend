import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useForm } from "react-hook-form";
import { useLocation } from "wouter";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import axios from "axios";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

// Define validation schema
const loginFormSchema = z.object({
  phoneNumber: z.string().min(10, "Phone number must be at least 10 digits"),
  code: z.string().optional(),
  loginType: z.literal("customer")
});

type LoginFormData = z.infer<typeof loginFormSchema>;

export default function CustomerLogin() {
  const { loginMutation } = useAuth();
  const [isOtpSent, setIsOtpSent] = useState(false);
  const { toast } = useToast();
  const [location] = useLocation();
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<LoginFormData>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: {
      phoneNumber: "",
      code: "",
      loginType: "customer"
    },
    mode: "onChange"
  });

  // Handle phone from URL params
  useEffect(() => {
    try {
      const params = new URLSearchParams(location.split('?')[1]);
      const phone = params.get('phone');
      if (phone) {
        console.log('[CustomerLogin] Phone from URL:', phone);
        form.setValue('phoneNumber', phone);
        handleSendOTP();
      }
    } catch (error) {
      console.error('[CustomerLogin] Error parsing URL params:', error);
    }
  }, [location]);

  const handleSendOTP = async () => {
    try {
      setIsLoading(true);
      const rawPhone = form.getValues("phoneNumber");
      if (!rawPhone) {
        toast({
          title: "Error",
          description: "Please enter a phone number",
          variant: "destructive"
        });
        return;
      }

      const phoneNumber = rawPhone.replace(/\D/g, '');
      console.log('[CustomerLogin] Sending OTP to:', phoneNumber);

      const response = await axios.post("/api/sendOTP", { phoneNumber });

      if (response.data?.message === 'OTP sent successfully') {
        setIsOtpSent(true);
        toast({
          title: "Code Sent",
          description: "Enter the code to sign in to your account"
        });
      } else {
        throw new Error('Failed to send verification code');
      }
    } catch (error: any) {
      console.error('[CustomerLogin] OTP send error:', error);
      toast({
        title: "Error",
        description: error.response?.data?.message || "Failed to send code",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyAndContinue = async (data: LoginFormData) => {
    try {
      if (!data.code) {
        toast({ 
          title: "Error", 
          description: "Please enter verification code", 
          variant: "destructive" 
        });
        return;
      }

      console.log('[CustomerLogin] Verifying OTP:', { 
        phoneNumber: data.phoneNumber,
        code: data.code
      });

      await loginMutation.mutateAsync({
        username: data.phoneNumber,
        password: data.code,
        loginType: 'customer'
      });

    } catch (error: any) {
      console.error("[CustomerLogin] Verification error:", error);
      toast({ 
        title: "Error", 
        description: error.response?.data?.message || "Invalid verification code", 
        variant: "destructive" 
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  return (
    <div className="container flex min-h-screen items-center justify-center">
      <div className="mx-auto w-full max-w-sm space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-bold">Verify Your Identity</h1>
          <p className="text-gray-500">Enter your phone number to continue</p>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleVerifyAndContinue)} className="space-y-4">
            <FormField
              control={form.control}
              name="phoneNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone Number</FormLabel>
                  <FormControl>
                    <Input {...field} type="tel" placeholder="+1 (555) 000-0000" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {isOtpSent ? (
              <FormField
                control={form.control}
                name="code"
                render={({ field }) => (
                  <FormItem className="space-y-4">
                    <FormLabel className="text-center block">Enter Verification Code</FormLabel>
                    <FormControl>
                      <div className="flex flex-col items-center gap-4">
                        <InputOTP
                          maxLength={6}
                          value={field.value}
                          onChange={(value) => {
                            field.onChange(value);
                            if (value.length === 6) {
                              form.handleSubmit(handleVerifyAndContinue)();
                            }
                          }}
                          className="gap-2"
                        >
                          <InputOTPGroup>
                            <InputOTPSlot className="w-12 h-12 text-lg" index={0} />
                            <InputOTPSlot className="w-12 h-12 text-lg" index={1} />
                            <InputOTPSlot className="w-12 h-12 text-lg" index={2} />
                            <InputOTPSlot className="w-12 h-12 text-lg" index={3} />
                            <InputOTPSlot className="w-12 h-12 text-lg" index={4} />
                            <InputOTPSlot className="w-12 h-12 text-lg" index={5} />
                          </InputOTPGroup>
                        </InputOTP>
                        <Button
                          type="button"
                          variant="link"
                          className="text-sm text-muted-foreground"
                          onClick={handleSendOTP}
                          disabled={isLoading}
                        >
                          Resend Code
                        </Button>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : (
              <Button
                type="button"
                onClick={handleSendOTP}
                className="w-full"
                disabled={isLoading}
              >
                Send Code
              </Button>
            )}
            {isOtpSent && (
              <Button type="submit" className="w-full" disabled={isLoading}>
                Verify & Continue
              </Button>
            )}
          </form>
        </Form>
      </div>
    </div>
  );
}