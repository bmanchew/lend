import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

interface KycStatus {
  status: string;
  sessionId?: string;
  lastUpdated?: string | null;
}

interface KycStartResponse {
  redirectUrl: string;
}

export function KycVerificationModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const { toast } = useToast();

  // Query to check KYC status
  const { data: kycData, isLoading: isCheckingStatus } = useQuery<KycStatus>({
    queryKey: ['/api/kyc/status', user?.id],
    queryFn: async () => {
      const response = await fetch(`/api/kyc/status?userId=${user?.id}`);
      if (!response.ok) {
        throw new Error('Failed to fetch KYC status');
      }
      return response.json();
    },
    enabled: isOpen && !!user,
  });

  // Mutation to start KYC process
  const { mutate: startKyc, isPending: isStarting } = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/kyc/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user?.id }),
      });
      if (!response.ok) throw new Error('Failed to start KYC process');
      return response.json() as Promise<KycStartResponse>;
    },
    onSuccess: (data) => {
      window.location.href = data.redirectUrl;
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to start verification process. Please try again.",
        variant: "destructive",
      });
    },
  });

  const renderContent = () => {
    if (isCheckingStatus) {
      return (
        <div className="flex justify-center p-4">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      );
    }

    if (kycData?.status === 'verified') {
      return (
        <div className="space-y-4">
          <p className="text-green-600 font-medium">
            Your identity has been verified successfully!
          </p>
          <div className="flex justify-end">
            <Button onClick={onClose}>Close</Button>
          </div>
        </div>
      );
    }

    if (kycData?.status === 'pending' || kycData?.status === 'in_progress') {
      return (
        <div className="space-y-4">
          <p className="text-amber-600">
            Your verification is in progress. Please complete the verification process.
          </p>
          <div className="flex justify-end space-x-2">
            <Button variant="outline" onClick={onClose}>Later</Button>
            <Button 
              onClick={() => startKyc()} 
              disabled={isStarting}
            >
              {isStarting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Continue Verification
            </Button>
          </div>
        </div>
      );
    }

    return (
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
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Identity Verification</DialogTitle>
        </DialogHeader>
        {renderContent()}
      </DialogContent>
    </Dialog>
  );
}