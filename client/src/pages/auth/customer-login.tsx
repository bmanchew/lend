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

// Form validation schema
const loginFormSchema = z.object({
  phoneNumber: z.string().min(10, "Phone number must be at least 10 digits"),
  code: z.string().optional(),
  loginType: z.literal("customer")
});

type LoginFormData = z.infer<typeof loginFormSchema>;

export default function CustomerLogin() {
  const { loginMutation } = useAuth();
  const [isOtpSent, setIsOtpSent] = useState(false);
  const [user, setUser] = useState<any>(null);
  const { toast } = useToast();
  const [location, setLocation] = useLocation();

  const form = useForm<LoginFormData>({
    defaultValues: {
      phoneNumber: "",
      code: "",
      loginType: "customer"
    },
    mode: "onChange"
  });

  // Phone formatting is handled server-side
  const sanitizePhone = (phone: string): string => {
    return phone.trim();
  };

  const handleSendOTP = async () => {
    try {
      const rawPhone = form.getValues("phoneNumber");
      if (!rawPhone) {
        toast({
          title: "Error",
          description: "Please enter a phone number",
          variant: "destructive"
        });
        return;
      }

      const phoneNumber = sanitizePhone(rawPhone);

      console.log('[CustomerLogin] Attempting to send OTP:', {
        formattedPhone: phoneNumber,
        timestamp: new Date().toISOString()
      });

      const response = await axios.post("/api/auth/send-otp", { phoneNumber });
      console.log('[CustomerLogin] OTP Response:', response.data);

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
      console.error('[CustomerLogin] OTP send error:', {
        error: error.message,
        timestamp: new Date().toISOString()
      });
      setIsOtpSent(false);
      toast({
        title: "Error",
        description: error.response?.data?.message || "Failed to send code",
        variant: "destructive"
      });
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(location.split('?')[1]);
    const phone = params.get('phone');
    if (phone) {
      form.setValue('phoneNumber', phone);
      handleSendOTP();
    }
  }, [location]);

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

      const phoneNumber = data.phoneNumber;
      console.log('[CustomerLogin] Verifying OTP:', { 
        phoneNumber: phoneNumber,
        code: data.code
      });

      // Format phone number consistently 
      const formatPhoneNumber = (phone: string): string => {
        const cleaned = phone.replace(/\D/g, '');
        const normalized = cleaned.replace(/^1/, '');
        if (normalized.length !== 10) {
          throw new Error('Phone number must be 10 digits');
        }
        return `+1${normalized}`;
      };

      // Validate OTP format
      const otp = data.code.trim();
      if (!otp || !/^\d{6}$/.test(otp)) {
        toast({ 
          title: "Error", 
          description: "Please enter a valid 6-digit code", 
          variant: "destructive" 
        });
        return;
      }

      const formattedPhone = formatPhoneNumber(phoneNumber);

      console.log('[CustomerLogin] Attempting login with:', {
        phone: phoneNumber,
        formattedPhone,
        timestamp: new Date().toISOString()
      });

      const response = await axios.post("/api/login", {
        username: formattedPhone,
        password: otp,
        loginType: 'customer'
      });

      const userData = response.data;

      if (!userData?.id) {
        console.error('[CustomerLogin] Invalid user data received:', userData);
        throw new Error('Invalid login response - missing user ID');
      }

      // Strict user validation
      const userId = userData.id.toString();
      if (!userId || userId === 'undefined' || userId === 'null') {
        console.error('[CustomerLogin] Invalid user ID:', userId);
        throw new Error('Invalid user ID received');
      }

      // Strict role validation
      if (userData.role !== 'customer') {
        console.error('[CustomerLogin] Invalid role:', {
          userId,
          role: userData.role
        });
        throw new Error('Invalid account type');
      }

      try {
        // Ensure user ID is valid and properly formatted
        const normalizedUserId = userId.toString().trim();
        if (!normalizedUserId || isNaN(Number(normalizedUserId))) {
          throw new Error('Invalid user ID format');
        }

        // Set storage with validation
        localStorage.setItem('temp_user_id', normalizedUserId);
        sessionStorage.setItem('current_user_id', normalizedUserId);
        setUser(userData);

        // Verify storage was set correctly
        const storedTempId = localStorage.getItem('temp_user_id');
        const storedCurrentId = sessionStorage.getItem('current_user_id');

        if (storedTempId !== userId || storedCurrentId !== userId) {
          throw new Error('Storage validation failed');
        }

        // Use timeout to ensure storage is committed
        setTimeout(() => {
          window.location.href = `/apply/${userId}?verification=true&from=login`;
        }, 100);

      } catch (error) {
        console.error('[CustomerLogin] Storage error:', error);
        toast({
          title: "Error",
          description: "Failed to save session data",
          variant: "destructive"
        });
      }
    } catch (error: any) {
      console.error("[CustomerLogin] Error:", error);
      toast({ 
        title: "Error", 
        description: error.message || "Invalid verification code", 
        variant: "destructive" 
      });
    }
  };

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
              >
                Send Code
              </Button>
            )}
            {isOtpSent && (
              <Button type="submit" className="w-full">
                Verify & Continue
              </Button>
            )}
          </form>
        </Form>
      </div>
    </div>
  );
}