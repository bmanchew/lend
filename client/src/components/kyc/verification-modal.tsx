import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";

interface KycVerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onVerificationComplete?: () => void;
}

console.log("[KYC Modal] Module loaded");

export function KycVerificationModal({ 
  isOpen, 
  onClose,
  onVerificationComplete
}: KycVerificationModalProps) {
  console.log("[KYC Modal] Component rendering", { 
    isOpen, 
    onClose: !!onClose,
    onVerificationComplete: !!onVerificationComplete 
  });
  const [searchParams] = useSearchParams();
  const userId = searchParams.get('userId');
  const { toast } = useToast();

  const { data: kycData, isLoading: isCheckingStatus } = useQuery({
    queryKey: ['/api/kyc/status', userId],
    enabled: !!userId && isOpen,
    queryFn: async () => {
      console.log("[KYC Modal] Fetching status for userId:", userId);
      const response = await fetch(`/api/kyc/status?userId=${userId}`);
      console.log("[KYC Modal] Status response:", response.status);

      if (!response.ok) {
        console.error("[KYC Modal] Status fetch failed:", await response.text());
        throw new Error('Failed to fetch KYC status');
      }
      const data = await response.json();
      console.log("[KYC Modal] Status data:", data);
      return data;
    },
  });

  const { mutate: startKyc, isPending: isStarting } = useMutation({
    mutationFn: async () => {
      console.log("[KYC Start] Initiating verification for userId:", userId);

      if (!userId) {
        console.error("[KYC Start] Missing userId");
        throw new Error('User ID is required');
      }

      try {
        const response = await fetch('/api/kyc/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId }),
        });

        console.log("[KYC Start] Response status:", response.status);
        const data = await response.json();

        if (!response.ok) {
          console.error("[KYC Start] API error:", data);
          throw new Error(data.details || data.error || 'Failed to start verification');
        }

        console.log("[KYC Start] Success:", data);
        return data;
      } catch (error) {
        console.error("[KYC Start] Request failed:", error);
        throw error;
      }
    },
    onSuccess: (data) => {
      window.open(data.redirectUrl, 'verification', 'width=800,height=800');
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    console.log("[KYC Modal] Effect triggered", { 
      status: kycData?.status,
      hasComplete: !!onVerificationComplete,
      hasClose: !!onClose
    });

    try {
      if (kycData?.status === 'approved') {
        console.log("[KYC Modal] Verification approved, triggering callbacks");
        onVerificationComplete?.();
        onClose();
      }
    } catch (error) {
      console.error("[KYC Modal] Error in completion handlers:", error);
      // Still close modal on error to prevent UI lock
      onClose();
    }
  }, [kycData?.status, onVerificationComplete, onClose]);

  const renderContent = () => {
    if (isCheckingStatus) {
      return (
        <div className="flex justify-center p-4">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      );
    }

    if (kycData?.status === 'approved') {
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