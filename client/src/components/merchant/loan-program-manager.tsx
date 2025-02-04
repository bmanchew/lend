import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import type { SelectProgram } from "@db/schema";

const programSchema = z.object({
  name: z.string().min(1, "Program name is required"),
  term: z.number().min(1, "Term must be at least 1 month"),
  interestRate: z.number().min(0, "Interest rate must be positive").max(100, "Interest rate cannot exceed 100%"),
});

type ProgramFormData = z.infer<typeof programSchema>;

interface Props {
  merchantId: number;
}

export function LoanProgramManager({ merchantId }: Props) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: programs } = useQuery<SelectProgram[]>({
    queryKey: ['programs', merchantId],
    queryFn: async () => {
      const response = await fetch(`/api/merchants/${merchantId}/programs`);
      if (!response.ok) throw new Error('Failed to fetch programs');
      return response.json();
    },
  });

  const form = useForm<ProgramFormData>({
    resolver: zodResolver(programSchema),
    defaultValues: {
      name: "",
      term: 12,
      interestRate: 5.99,
    }
  });

  const createProgramMutation = useMutation({
    mutationFn: async (data: ProgramFormData) => {
      const response = await fetch(`/api/merchants/${merchantId}/programs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to create program');
      }
      
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Loan program created successfully",
      });
      setOpen(false);
      form.reset();
      queryClient.invalidateQueries({ queryKey: ['programs', merchantId] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: ProgramFormData) => {
    createProgramMutation.mutate(data);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Loan Programs</h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>Create New Program</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Loan Program</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Program Name</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Standard Term Loan" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="term"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Term (months)</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          {...field} 
                          onChange={e => field.onChange(parseInt(e.target.value))}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="interestRate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Interest Rate (%)</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          step="0.01" 
                          {...field} 
                          onChange={e => field.onChange(parseFloat(e.target.value))}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit">Create Program</Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4">
        {programs?.map((program) => (
          <div 
            key={program.id} 
            className="p-4 border rounded-lg bg-card"
          >
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-semibold">{program.name}</h3>
                <p className="text-sm text-muted-foreground">
                  {program.term} months @ {program.interestRate}% APR
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
