import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

interface Props {
  merchantId: number;
}

export function LoanApplicationDialog({ merchantId }: Props) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);

  const sendInviteMutation = useMutation({
    mutationFn: (data: { borrowerName: string; borrowerPhone: string; borrowerEmail?: string }) =>
      apiRequest(`/api/merchants/${merchantId}/send-loan-application`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Loan application invitation sent successfully",
      });
      setOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to send loan application invitation",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    sendInviteMutation.mutate({
      borrowerName: formData.get("borrowerName") as string,
      borrowerPhone: formData.get("borrowerPhone") as string,
      borrowerEmail: formData.get("borrowerEmail") as string,
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Send Loan Application</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Send Loan Application</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="borrowerName">Borrower Name</Label>
            <Input
              id="borrowerName"
              name="borrowerName"
              required
              placeholder="Enter borrower's full name"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="borrowerPhone">Phone Number</Label>
            <Input
              id="borrowerPhone"
              name="borrowerPhone"
              type="tel"
              required
              placeholder="+1 (555) 000-0000"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="borrowerEmail">Email (Optional)</Label>
            <Input
              id="borrowerEmail"
              name="borrowerEmail"
              type="email"
              placeholder="borrower@example.com"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={sendInviteMutation.isPending}
            >
              Send Invitation
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
