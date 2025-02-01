import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { useEffect } from "react";

// Debug log on module load
console.log('[KYC Modal] Module loaded');

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

interface VerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onVerificationComplete?: () => void;
}

export function VerificationModal({ 
  isOpen, 
  onClose,
  onVerificationComplete
}: VerificationModalProps) {
  console.log('[KYC Modal] Rendering with props:', { isOpen });

  const { user } = useAuth();
  const tempUserId = localStorage.getItem('temp_user_id');
  const effectiveUserId = user?.id || tempUserId;

  console.log('[KYC Modal] User context:', {
    authUserId: user?.id,
    tempUserId,
    effectiveUserId
  });
  const { toast } = useToast();

  console.log('[KYC Modal] Current user context:', { 
    userId: user?.id,
    isOpen,
    hasAuth: !!user
  });

  const { data: kycData, isLoading: isCheckingStatus } = useQuery<KycStatus>({
    queryKey: ['/api/kyc/status', effectiveUserId],
    enabled: !!effectiveUserId && isOpen,
    staleTime: 0,
    queryFn: async () => {
      console.log('[KYC Modal] Checking status for user:', user?.id);

      if (!user?.id) {
        console.error('[KYC Modal] No user ID available');
        throw new Error('User ID is required');
      }

      try {
        const response = await fetch(`/api/kyc/status?userId=${user.id}`);
        console.log('[KYC Modal] Status response:', response.status);

        if (!response.ok) {
          if (response.status === 404) {
            console.log('[KYC Modal] No existing session found');
            return { status: 'initial' };
          }
          throw new Error('Failed to fetch KYC status');
        }

        const data = await response.json();
        console.log('[KYC Modal] Status data:', data);
        return data;
      } catch (error) {
        console.error('[KYC Modal] Status check error:', error);
        throw error;
      }
    },
    refetchInterval: (data) => {
      const pollableStatus = data?.status === 'pending' || 
                           data?.status === 'initialized' || 
                           data?.status === 'in_progress';
      console.log('[KYC Modal] Poll status:', { status: data?.status, shouldPoll: pollableStatus });
      return pollableStatus ? 2000 : false;
    },
  });

  const { mutate: startKyc, isPending: isStarting } = useMutation<KycStartResponse, Error>({
    mutationFn: async () => {
      console.log('[KYC Modal] Starting verification for user:', user?.id);

      if (!user?.id) {
        throw new Error('User ID is required');
      }

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
        console.error('[KYC Modal] Start error:', errorData);
        throw new Error(errorData.details || errorData.error);
      }

      const data = await response.json();
      console.log('[KYC Modal] Start successful:', data);
      return data;
    },
    onSuccess: (data) => {
      console.log('[KYC Modal] Opening verification window');
      window.open(data.redirectUrl, 'verification', 'width=800,height=800');
    },
    onError: (error) => {
      console.error('[KYC Modal] Start error:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to start verification",
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    try {
      console.log('[KYC Modal] Effect triggered:', {
        isOpen,
        userId: user?.id,
        status: kycData?.status
      });

      if (kycData?.status === 'approved') {
        console.log('[KYC Modal] Verification completed');
        onVerificationComplete?.();
        onClose();
      }
    } catch (error) {
      console.error('[KYC Modal] Effect error:', error);
    }
  }, [kycData?.status, onVerificationComplete, onClose, isOpen, user?.id]);

  const renderContent = () => {
    console.log('[KYC Modal] Rendering content for status:', kycData?.status);

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
            Verification successful!
          </p>
          <div className="flex justify-end">
            <Button onClick={onClose}>Continue</Button>
          </div>
        </div>
      );
    }

    const isPending = ['pending', 'in_progress', 'initialized'].includes(kycData?.status || '');
    if (isPending) {
      return (
        <div className="space-y-4">
          <p className="text-amber-600">
            Please complete the verification in the opened window.
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

    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          We need to verify your identity to proceed.
          This process is quick and secure.
        </p>
        <div className="space-y-2">
          <h4 className="font-medium">You'll need:</h4>
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