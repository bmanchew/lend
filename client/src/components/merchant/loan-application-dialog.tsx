import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

const applicationSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"), 
  email: z.string().email("Valid email is required"),
  phone: z.string().min(10, "Valid phone number is required"),
  program: z.string().min(1, "Program is required"),
  fundingAmount: z.string().min(1, "Funding amount is required").transform(val => parseFloat(val)),
  salesRepEmail: z.string().email("Valid sales rep email is required")
}).required();

type ApplicationFormData = z.infer<typeof applicationSchema>;

interface Props {
  merchantId: number;
  merchantName: string;
}

export function LoanApplicationDialog({ merchantId, merchantName }: Props) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: programs } = useQuery({
    queryKey: ['programs', merchantId],
    queryFn: async () => {
      console.log('Fetching programs for merchant:', merchantId);
      const response = await fetch(`/api/merchants/${merchantId}/programs`);
      if (!response.ok) {
        console.error('Failed to fetch programs:', response.statusText);
        throw new Error('Failed to fetch programs');
      }
      const data = await response.json();
      console.log('Fetched programs:', data);
      return data;
    },
  });

  const form = useForm<ApplicationFormData>({
    resolver: zodResolver(applicationSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      program: "",
      fundingAmount: "",
      salesRepEmail: ""
    }
  });

  const sendInviteMutation = useMutation({
    mutationFn: async (data: ApplicationFormData) => {
      console.log('[LoanApplication] Starting submission:', {
        data,
        timestamp: new Date().toISOString(),
        merchantId,
        merchantName
      });
      const debugLog = (message: string, data?: any) => {
        console.log(`[LoanDialog][${Date.now().toString(36)}] ${message}`, data || '');
      };

      debugLog('Starting mutation', {
        ...data,
        merchantId,
        merchantName,
        timestamp: new Date().toISOString()
      });

      if (!merchantId) {
        console.error('[LoanDialog] Missing merchantId');
        throw new Error('Missing merchant ID');
      }

      // Validate phone format
      const phone = data.phone?.replace(/\D/g, '');
      if (!phone || phone.length !== 10) {
        throw new Error('Invalid phone number format');
      }

      const fundingAmount = parseFloat(data.fundingAmount);
      if (isNaN(fundingAmount) || fundingAmount <= 0) {
        throw new Error('Invalid funding amount');
      }

      const response = await fetch(`/api/merchants/${merchantId}/send-loan-application`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...data,
          merchantName,
          amount: fundingAmount,
          fundingAmount: data.fundingAmount,
          phone: data.phone?.replace(/\D/g, '').replace(/^1/, '').slice(-10),
          rawPhone: data.phone?.replace(/\D/g, '').replace(/^1/, '').slice(-10)
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('[LoanApplication] API Error:', {
          status: response.status,
          statusText: response.statusText,
          error: errorData,
          timestamp: new Date().toISOString()
        });
        throw new Error(errorData.error || "Failed to send invitation");
      }
      
      console.log('[LoanApplication] API Success Response:', {
        status: response.status,
        timestamp: new Date().toISOString()
      });

      const responseData = await response.json();
      debugLog('Application submission successful', responseData);
      return responseData;
    },
    onSuccess: (data) => {
      console.log('[LoanApplication] Submission successful:', {
        data,
        timestamp: new Date().toISOString()
      });
      
      toast({
        title: "Success",
        description: "Loan application sent successfully",
      });
      
      // Reset form and update UI state
      setOpen(false);
      form.reset();
      queryClient.invalidateQueries({ queryKey: [`/api/merchants/${merchantId}/contracts`] });
      
      toast({
        title: "Success",
        description: "Application sent successfully",
        variant: "default"
      });
    },
    onError: (error: any) => {
      console.error('[LoanDialog] Error:', error);
      const errorMessage = error.response?.data?.error || error.message || "Failed to send loan application invitation";
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: ApplicationFormData) => {
    sendInviteMutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button 
          size="lg" 
          className="gap-2 bg-primary text-white hover:bg-primary/90"
          onClick={() => setOpen(true)}
        >
          <span>Send Loan Application</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Send Loan Application</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="firstName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Client First Name</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Jane" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="lastName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Client Last Name</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Smith" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Client Email</FormLabel>
                    <FormControl>
                      <Input {...field} type="email" placeholder="jane@example.com" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Client Phone</FormLabel>
                    <FormControl>
                      <Input {...field} type="tel" placeholder="123-456-7890" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>



            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="program"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Program</FormLabel>
                    <FormControl>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select program" />
                        </SelectTrigger>
                        <SelectContent>
                          {programs?.map((program) => (
                            <SelectItem key={program.id} value={program.id.toString()}>
                              {program.name} ({program.term} months @ {program.interestRate}%)
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="fundingAmount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Funding Amount Needed</FormLabel>
                    <FormControl>
                      <Input {...field} type="number" min="0" step="0.01" placeholder="9800" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="salesRepEmail"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Sales Rep Email</FormLabel>
                  <FormControl>
                    <Input {...field} type="email" placeholder="sales@example.com" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit">Send Application</Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}