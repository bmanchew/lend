import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
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

  const { data: kycData, isLoading: isCheckingStatus } = useQuery<KycStatus>({
    queryKey: ['/api/kyc/status', user?.id],
    queryFn: async () => {
      if (!user?.id) throw new Error('User ID is required');
      const response = await fetch(`/api/kyc/status?userId=${user.id}`);
      if (!response.ok && response.status !== 404) {
        throw new Error('Failed to fetch KYC status');
      }
      return response.status === 404 ? { status: 'initial' } : response.json();
    },
    enabled: isOpen && !!user?.id,
    refetchInterval: (data) => 
      ['pending', 'initialized', 'in_progress'].includes(data?.status?.toLowerCase() || '') ? 2000 : false,
  });

  const { mutate: startKyc, isPending: isStarting } = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error('User ID is required');
      const response = await fetch('/api/kyc/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, returnUrl: '/dashboard' }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.details || error.error || 'Failed to start KYC process');
      }
      return response.json();
    },
    onSuccess: (data) => {
      window.open(data.redirectUrl, 'verification', 'width=800,height=800');
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (kycData?.status?.toLowerCase() === 'approved') {
      onVerificationComplete?.();
      onClose();
      window.location.reload();
    }
  }, [kycData?.status, onVerificationComplete, onClose]);

  if (!user) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Identity Verification</DialogTitle>
          <DialogDescription>
            Complete your identity verification to continue
          </DialogDescription>
        </DialogHeader>
        {isCheckingStatus ? (
          <div className="flex justify-center p-4">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : kycData?.status === 'Approved' ? (
          <div className="space-y-4">
            <p className="text-green-600 font-medium">
              Your identity has been verified successfully!
            </p>
            <div className="flex justify-end">
              <Button onClick={onClose}>Continue</Button>
            </div>
          </div>
        ) : ['pending', 'in_progress', 'initialized'].includes(kycData?.status?.toLowerCase() || '') ? (
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
              <Button onClick={() => startKyc()} disabled={isStarting}>
                {isStarting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Restart Verification
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Before proceeding, we need to verify your identity.
              This process is quick and secure.
            </p>
            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={onClose}>Later</Button>
              <Button onClick={() => startKyc()} disabled={isStarting}>
                {isStarting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Start Verification
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}