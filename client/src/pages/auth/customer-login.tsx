
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

export default function CustomerLogin() {
  const { loginMutation } = useAuth();
  const [isOtpSent, setIsOtpSent] = useState(false);
  const { toast } = useToast();
  
  const [location] = useLocation();
  const form = useForm({
    defaultValues: {
      phoneNumber: "",
      code: "",
      loginType: "customer"
    },
  });

  useEffect(() => {
    const params = new URLSearchParams(location.split('?')[1]);
    const phone = params.get('phone');
    if (phone) {
      form.setValue('phoneNumber', phone);
      handleSendOTP();
    }
  }, [location]);

  const handleSendOTP = async () => {
    const phoneNumber = form.getValues("phoneNumber");
    if (!phoneNumber) {
      toast({
        title: "Error",
        description: "Please enter your phone number",
        variant: "destructive"
      });
      return;
    }

    try {
      await axios.post("/api/auth/send-otp", { phoneNumber });
      setIsOtpSent(true);
      toast({
        title: "Code Sent",
        description: "Please check your phone for the verification code"
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to send verification code",
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
          <form onSubmit={form.handleSubmit((data) => loginMutation.mutate(data))} className="space-y-4">
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
                  <FormItem>
                    <FormLabel>Verification Code</FormLabel>
                    <FormControl>
                      <InputOTP maxLength={6} value={field.value} onChange={field.onChange}>
                        <InputOTPGroup>
                          <InputOTPSlot index={0} />
                          <InputOTPSlot index={1} />
                          <InputOTPSlot index={2} />
                          <InputOTPSlot index={3} />
                          <InputOTPSlot index={4} />
                          <InputOTPSlot index={5} />
                        </InputOTPGroup>
                      </InputOTP>
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
              <Button type="submit" className="w-full" disabled={loginMutation.isPending}>
                Verify & Continue
              </Button>
            )}
          </form>
        </Form>
      </div>
    </div>
  );
}
