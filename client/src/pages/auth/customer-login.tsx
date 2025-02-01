
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
    }
  });

  const handleSendOTP = async () => {
    let phoneNumber = form.getValues("phoneNumber");
    if (!phoneNumber.startsWith('+1')) {
      phoneNumber = '+1' + phoneNumber.replace(/\D/g, '');
    }
    
    try {
      await axios.post("/api/sendOTP", { phoneNumber });
      setIsOtpSent(true);
      toast({
        title: "Code Sent",
        description: "Enter the code to sign in to your account"
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to send code",
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
                  <FormItem className="space-y-4">
                    <FormLabel className="text-center block">Enter Verification Code</FormLabel>
                    <FormControl>
                      <div className="flex flex-col items-center gap-4">
                        <InputOTP 
                          maxLength={6} 
                          value={field.value} 
                          onChange={field.onChange}
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
