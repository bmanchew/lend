import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { useEffect } from "react";

interface KycStatus {
  status: string;
  sessionId?: string;
  lastUpdated?: string | null;
}

interface KycStartResponse {
  redirectUrl: string;
}

interface KycStartError {
  error: string;
  details?: string;
}

export function KycVerificationModal({ 
  isOpen, 
  onClose,
  onVerificationComplete
}: { 
  isOpen: boolean; 
  onClose: () => void;
  onVerificationComplete?: () => void;
}) {
  const { user } = useAuth();
  const { toast } = useToast();

  // Query to check KYC status with polling
  const { data: kycData, isLoading: isCheckingStatus } = useQuery<KycStatus>({
    queryKey: ['/api/kyc/status', user?.id],
    queryFn: async () => {
      if (!user?.id) throw new Error('User ID is required');
      const response = await fetch(`/api/kyc/status?userId=${user.id}`);
      if (!response.ok) {
        throw new Error('Failed to fetch KYC status');
      }
      return response.json();
    },
    enabled: isOpen && !!user?.id,
    refetchInterval: (data) => {
      // Poll every 2 seconds if verification is ongoing
      if (!data?.status || data.status === 'pending' || data.status === 'initialized' || data.status === 'in_progress') {
        return 2000;
      }
      // Stop polling once we have a final status
      return false;
    },
  });

  // Effect to handle verification completion
  useEffect(() => {
    if (kycData?.status === 'Approved' && onVerificationComplete) {
      console.log('Verification completed successfully');
      onVerificationComplete();
    }
  }, [kycData?.status, onVerificationComplete]);

  // Mutation to start KYC process
  const { mutate: startKyc, isPending: isStarting } = useMutation<KycStartResponse, Error, void>({
    mutationFn: async () => {
      if (!user?.id) throw new Error('User ID is required');
      const response = await fetch('/api/kyc/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      });
      if (!response.ok) {
        const errorData = await response.json() as KycStartError;
        throw new Error(errorData.details || errorData.error || 'Failed to start KYC process');
      }
      return response.json();
    },
    onSuccess: (data) => {
      // Open Didit verification in a new window
      window.open(data.redirectUrl, 'verification', 'width=800,height=800');
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to start verification process. Please try again.",
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

    if (kycData?.status === 'Approved') {
      return (
        <div className="space-y-4">
          <p className="text-green-600 font-medium">
            Your identity has been verified successfully!
          </p>
          <div className="flex justify-end">
            <Button onClick={onClose}>Continue</Button>
          </div>
        </div>
      );
    }

    if (kycData?.status === 'pending' || kycData?.status === 'in_progress') {
      return (
        <div className="space-y-4">
          <p className="text-amber-600">
            Please complete the verification process in the opened window.
          </p>
          <div className="flex justify-center items-center space-x-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm text-muted-foreground">
              Waiting for verification...
            </span>
          </div>
          <div className="flex justify-end space-x-2">
            <Button variant="outline" onClick={onClose}>Later</Button>
            <Button 
              onClick={() => startKyc()} 
              disabled={isStarting}
            >
              {isStarting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Restart Verification
            </Button>
          </div>
        </div>
      );
    }

    if (kycData?.status === 'Declined') {
      return (
        <div className="space-y-4">
          <p className="text-red-600">
            Your verification was not successful. Please try again.
          </p>
          <div className="flex justify-end space-x-2">
            <Button variant="outline" onClick={onClose}>Later</Button>
            <Button 
              onClick={() => startKyc()} 
              disabled={isStarting}
            >
              {isStarting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Retry Verification
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