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
  const [user, setUser] = useState(null); // Added state to store user data
  const { toast } = useToast();

  const [location] = useLocation();
  const form = useForm({
    defaultValues: {
      phoneNumber: "",
      code: "",
      loginType: "customer"
    },
    mode: "onChange"
  });

  const handleSendOTP = async () => {
    let phoneNumber = form.getValues("phoneNumber").replace(/\D/g, '');
    if (!phoneNumber) {
      toast({
        title: "Error",
        description: "Please enter a phone number",
        variant: "destructive"
      });
      return;
    }
    // Remove leading 1 if present
    phoneNumber = phoneNumber.replace(/^1/, '');
    // Add +1 prefix
    phoneNumber = '+1' + phoneNumber;
    console.log('Formatted phone:', phoneNumber);
    // Update form value with formatted number
    form.setValue("username", phoneNumber);

    try {
      const response = await axios.post("/api/sendOTP", { phoneNumber });
      console.log('OTP Response:', response.data);
      setIsOtpSent(true);
      toast({
        title: "Code Sent",
        description: "Enter the code to sign in to your account"
      });
    } catch (error: any) {
      console.error('OTP send error:', error);
      setIsOtpSent(false);
      toast({
        title: "Error",
        description: error.response?.data?.message || "Failed to send code",
        variant: "destructive"
      });
      console.error("OTP send error:", error);
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

  const handleVerifyAndContinue = async (data) => {
    try {
      const response = await axios.post("/api/verifyOTP", { username: data.phoneNumber, code: data.code });
      if (response.ok) {
        const userData = await response.json();
        localStorage.setItem('temp_user_id', userData.id.toString());
        setUser(userData);
        //Initiate KYC here.  Replace with your actual KYC initiation function.
        initiateKYC(userData.id);
        setLocation('/apply?verification=true&from=login');
      } else {
        toast({ title: "Error", description: "Invalid OTP", variant: "destructive" });
      }
    } catch (error) {
      console.error("Verification error:", error);
      toast({ title: "Error", description: "Verification failed", variant: "destructive" });
    }
  };


  const initiateKYC = (userId) => {
    // Replace this with your actual KYC initiation logic.  This is a placeholder.
    console.log(`Initiating KYC for user ID: ${userId}`);
    //Example using axios:
    // axios.post('/api/initiateKYC', { userId })
    //   .then(res => {
    //     //Handle success
    //   })
    //   .catch(err => {
    //     //Handle error
    //   })
  };


  return (
    <div className="container flex min-h-screen items-center justify-center">
      <div className="mx-auto w-full max-w-sm space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-bold">Verify Your Identity</h1>
          <p className="text-gray-500">Enter your phone number to continue</p>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleVerifyAndContinue)} className="space-y-4"> {/* Changed onSubmit handler */}
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
              <Button type="submit" className="w-full" >
                Verify & Continue
              </Button>
            )}
          </form>
        </Form>
      </div>
    </div>
  );
}