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
  phone: z
    .string()
    .min(10, "Phone number must be at least 10 digits")
    .refine((val) => {
      const cleaned = val.replace(/\D/g, '');
      return cleaned.length === 10;
    }, "Must be a valid 10-digit phone number"),
  program: z.string().min(1, "Program is required"),
  fundingAmount: z.number().min(1000, "Minimum funding amount is $1,000"),
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const queryClient = useQueryClient();

  // Enhanced logging function
  const logEvent = (event: string, data?: any, error?: any) => {
    const logData = {
      timestamp: new Date().toISOString(),
      event,
      merchantId,
      merchantName,
      ...data
    };

    if (error) {
      console.error(`[LoanApplication] ${event}:`, { ...logData, error });
    } else {
      console.log(`[LoanApplication] ${event}:`, logData);
    }
  };

  const { data: programs, error: programsError } = useQuery({
    queryKey: ['programs', merchantId],
    queryFn: async () => {
      logEvent('FETCH_PROGRAMS_START');
      try {
        const response = await fetch(`/api/merchants/${merchantId}/programs`);
        if (!response.ok) {
          throw new Error('Failed to fetch programs');
        }
        const data = await response.json();
        logEvent('FETCH_PROGRAMS_SUCCESS', { programCount: data.length });
        return data;
      } catch (error) {
        logEvent('FETCH_PROGRAMS_ERROR', undefined, error);
        throw error;
      }
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
      fundingAmount: 0,
      salesRepEmail: ""
    }
  });

  const sendInviteMutation = useMutation({
    mutationFn: async (data: ApplicationFormData) => {
      setIsSubmitting(true);
      logEvent('SUBMIT_APPLICATION_START', { formData: data });

      try {
        const phone = data.phone.replace(/\D/g, '');
        if (phone.length !== 10) {
          const error = new Error('Invalid phone number format');
          logEvent('VALIDATION_ERROR', { field: 'phone' }, error);
          throw error;
        }

        const payload = {
          ...data,
          merchantName,
          phone: phone,
        };

        logEvent('API_REQUEST_START', { endpoint: '/send-loan-application', payload });

        const response = await fetch(`/api/merchants/${merchantId}/send-loan-application`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const errorData = await response.json();
          logEvent('API_REQUEST_ERROR', { statusCode: response.status }, errorData);
          throw new Error(errorData.error || "Failed to send invitation");
        }

        const responseData = await response.json();
        logEvent('API_REQUEST_SUCCESS', { responseData });
        return responseData;
      } catch (error) {
        logEvent('SUBMIT_APPLICATION_ERROR', undefined, error);
        throw error;
      } finally {
        setIsSubmitting(false);
      }
    },
    onSuccess: (data) => {
      logEvent('SUBMIT_APPLICATION_SUCCESS', { data });
      toast({
        title: "Success",
        description: "Loan application sent successfully",
        variant: "default"
      });

      setOpen(false);
      form.reset();
      queryClient.invalidateQueries({ queryKey: [`/api/merchants/${merchantId}/contracts`] });
    },
    onError: (error: any) => {
      logEvent('SUBMIT_APPLICATION_FAILURE', undefined, error);
      toast({
        title: "Error",
        description: error.message || "Failed to send loan application invitation",
        variant: "destructive",
      });
    },
  });

  if (programsError) {
    logEvent('PROGRAMS_LOAD_ERROR', undefined, programsError);
  }

  const onSubmit = (data: ApplicationFormData) => {
    logEvent('FORM_SUBMIT', { formData: data });
    sendInviteMutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button 
          size="lg" 
          className="gap-2 bg-primary text-white hover:bg-primary/90"
          onClick={() => {
            logEvent('DIALOG_OPEN');
            setOpen(true);
          }}
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
                      <Input 
                        {...field} 
                        type="tel" 
                        placeholder="(123) 456-7890"
                        onChange={(e) => {
                          let value = e.target.value.replace(/\D/g, '');
                          if (value.length > 10) value = value.slice(0, 10);

                          // Format for display
                          if (value.length >= 6) {
                            value = `(${value.slice(0,3)}) ${value.slice(3,6)}-${value.slice(6)}`;
                          } else if (value.length >= 3) {
                            value = `(${value.slice(0,3)}) ${value.slice(3)}`;
                          } else if (value.length > 0) {
                            value = `(${value}`;
                          }

                          field.onChange(value);
                        }}
                      />
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
                          {programs?.map((program: any) => (
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
                      <Input 
                        {...field} 
                        type="number" 
                        min="1000" 
                        step="100" 
                        placeholder="10000"
                        onChange={(e) => {
                          logEvent('FUNDING_AMOUNT_CHANGED', {value: e.target.value});
                          field.onChange(parseFloat(e.target.value));
                        }}
                      />
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
                onClick={() => {
                  logEvent('DIALOG_CANCEL');
                  setOpen(false);
                }}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={isSubmitting}
                onClick={() => {
                  logEvent('FORM_VALIDATION_CHECK', {formState: form.formState});
                }}
              >
                {isSubmitting ? "Sending..." : "Send Application"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}