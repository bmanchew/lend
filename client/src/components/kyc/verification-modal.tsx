import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

export function KycVerificationModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const { toast } = useToast();

  // Query to check KYC status
  const { data: kycStatus, isLoading: isCheckingStatus } = useQuery({
    queryKey: ['/api/kyc/status', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const response = await fetch(`/api/kyc/status?userId=${user.id}`);
      if (!response.ok) throw new Error('Failed to check KYC status');
      return response.json();
    },
    enabled: isOpen && !!user,
  });

  // Mutation to start KYC process
  const { mutate: startKyc, isPending: isStarting } = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error('User not found');
      const response = await fetch('/api/kyc/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      });
      if (!response.ok) throw new Error('Failed to start KYC process');
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Verification Started",
        description: "You will be redirected to complete your verification.",
      });
      // Add userId to redirectUrl for development mode
      const redirectUrl = new URL(data.redirectUrl);
      if (process.env.NODE_ENV !== 'production') {
        redirectUrl.searchParams.append('userId', user?.id.toString() || '');
      }
      // Use window.location.href for full page navigation
      setTimeout(() => {
        window.location.href = redirectUrl.toString();
      }, 1500);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to start verification process. Please try again.",
        variant: "destructive",
      });
    },
  });

  if (isCheckingStatus) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Checking verification status...</DialogTitle>
          </DialogHeader>
          <div className="flex justify-center p-4">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Identity Verification Required</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Before you can proceed with your loan application, we need to verify your identity.
            This process is quick and secure.
          </p>
          <div className="space-y-2">
            <h4 className="font-medium">What you'll need:</h4>
            <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
              <li>Government-issued photo ID</li>
              <li>Proof of address</li>
              <li>Social Security Number</li>
            </ul>
          </div>
          <div className="flex justify-end space-x-2">
            <Button variant="outline" onClick={onClose}>Later</Button>
            <Button 
              onClick={() => startKyc()} 
              disabled={isStarting}
            >
              {isStarting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Start Verification
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}