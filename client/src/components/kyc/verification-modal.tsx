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
  const auth = useAuth();
  const { toast } = useToast();
  const user = auth?.user;

  // Query to check KYC status with polling
  const { data: kycData, isLoading: isCheckingStatus } = useQuery<KycStatus>({
    queryKey: ['/api/kyc/status', user?.id],
    queryFn: async () => {
      if (!user?.id) throw new Error('User ID is required');
      console.log('[KYC Modal] Checking KYC status for user:', user.id);

      try {
        const response = await fetch(`/api/kyc/status?userId=${user.id}`);
        if (!response.ok) {
          // If 404, return initial status instead of throwing
          if (response.status === 404) {
            console.log('[KYC Modal] No existing KYC session, using initial status');
            return { status: 'initial' };
          }
          console.error('[KYC Modal] Failed to fetch KYC status:', {
            status: response.status,
            statusText: response.statusText
          });
          throw new Error('Failed to fetch KYC status');
        }

        const data = await response.json();
        console.log('[KYC Modal] Received KYC status:', data);
        return data;
      } catch (error) {
        console.error('[KYC Modal] Error in status check:', error);
        throw error;
      }
    },
    enabled: isOpen && !!user?.id,
    refetchInterval: (data) => {
      // Poll every 2 seconds if verification is ongoing
      if (data?.status === 'pending' || data?.status === 'initialized' || data?.status === 'in_progress') {
        console.log('[KYC Modal] Polling status:', data.status);
        return 2000;
      }
      console.log('[KYC Modal] Stopping poll, final status:', data?.status);
      return false;
    },
  });

  // Effect to handle verification completion
  useEffect(() => {
    if (kycData?.status?.toLowerCase() === 'approved') {
      console.log('[KYC Modal] Verification completed successfully');
      if (onVerificationComplete) {
        onVerificationComplete();
      }
      onClose();
      // Force reload to update UI state
      window.location.reload();
    }
  }, [kycData?.status, onVerificationComplete, onClose]);

  // Mutation to start KYC process
  const { mutate: startKyc, isPending: isStarting } = useMutation<KycStartResponse, Error, void>({
    mutationFn: async () => {
      if (!user?.id) throw new Error('User ID is required');

      console.log('[KYC Modal] Starting KYC process for user:', user.id);
      try {
        const response = await fetch('/api/kyc/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            userId: user.id,
            returnUrl: '/dashboard'
          }),
        });

        if (!response.ok) {
          const errorData = await response.json() as KycStartError;
          console.error('[KYC Modal] Failed to start KYC:', errorData);
          throw new Error(errorData.details || errorData.error || 'Failed to start KYC process');
        }

        const data = await response.json();
        console.log('[KYC Modal] KYC process started successfully:', {
          userId: user.id,
          redirectUrl: data.redirectUrl
        });
        return data;
      } catch (error) {
        console.error('[KYC Modal] Error starting KYC process:', error);
        throw error;
      }
    },
    onSuccess: (data) => {
      console.log('[KYC Modal] Opening verification window');
      window.open(data.redirectUrl, 'verification', 'width=800,height=800');
    },
    onError: (error: Error) => {
      console.error('[KYC Modal] Error starting KYC:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to start verification process. Please try again.",
        variant: "destructive",
      });
    },
  });

  const renderContent = () => {
    if (isCheckingStatus) {
      console.log('[KYC Modal] Rendering loading state');
      return (
        <div className="flex justify-center p-4">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      );
    }

    if (kycData?.status === 'Approved') {
      console.log('[KYC Modal] Rendering success state');
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

    if (kycData?.status === 'pending' || kycData?.status === 'in_progress' || kycData?.status === 'initialized') {
      console.log('[KYC Modal] Rendering pending state');
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
              onClick={() => {
                console.log('[KYC Modal] Restarting verification');
                startKyc();
              }} 
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
      console.log('[KYC Modal] Rendering declined state');
      return (
        <div className="space-y-4">
          <p className="text-red-600">
            Your verification was not successful. Please try again.
          </p>
          <div className="flex justify-end space-x-2">
            <Button variant="outline" onClick={onClose}>Later</Button>
            <Button 
              onClick={() => {
                console.log('[KYC Modal] Retrying verification after decline');
                startKyc();
              }} 
              disabled={isStarting}
            >
              {isStarting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Retry Verification
            </Button>
          </div>
        </div>
      );
    }

    console.log('[KYC Modal] Rendering initial state');
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
            onClick={() => {
              console.log('[KYC Modal] Starting initial verification');
              startKyc();
            }} 
            disabled={isStarting}
          >
            {isStarting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Start Verification
          </Button>
        </div>
      </div>
    );
  };

  useEffect(() => {
    console.log('[KYC Modal] Modal state changed:', {
      isOpen,
      userId: user?.id,
      currentStatus: kycData?.status
    });
  }, [isOpen, user?.id, kycData?.status]);

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