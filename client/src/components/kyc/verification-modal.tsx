import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";

interface VerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onVerificationComplete?: () => void;
}

export function KycVerificationModal({
  isOpen,
  onClose,
  onVerificationComplete
}: VerificationModalProps) {
  const { toast } = useToast();
  const userId = localStorage.getItem('temp_user_id');

  const { data: kycData, refetch: refetchStatus } = useQuery({
    queryKey: ['kyc-status', userId],
    queryFn: async () => {
      if (!userId) return null;
      const response = await fetch(`/api/kyc/status?userId=${userId}`);
      return response.json();
    },
    enabled: !!userId,
    refetchInterval: 5000
  });

  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  
  const startVerification = useMutation({
    mutationFn: async () => {
      if (!userId) {
        throw new Error('User ID is required');
      }
      
      try {
        const response = await fetch('/api/kyc/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId })
        });
        
        const data = await response.json();
        
        if (!data.redirectUrl) {
          throw new Error('No redirect URL provided');
        }

        if (isMobile) {
          // Try to open in Didit app first
          const appUrl = `didit://verify?session=${data.sessionId}`;
          window.location.href = appUrl;
          
          // Set up fallback to web version after delay
          setTimeout(() => {
            // Check if we're still on same page (app wasn't opened)
            if (document.hidden) {
              return; // App was opened, don't redirect
            }
            window.location.href = data.redirectUrl;
          }, 1500); // Increased delay for slower devices
        } else {
          window.location.href = data.redirectUrl;
        }
      } catch (error) {
        console.error('Verification error:', error);
        toast({
          title: "Verification Error",
          description: "Failed to start verification. Please try again.",
          variant: "destructive"
        });
      }
    }
  });

  useEffect(() => {
    if (kycData?.status === 'Approved') {
      toast({
        title: "Verification Complete",
        description: "Your identity has been verified successfully."
      });
      onVerificationComplete?.();
    }
  }, [kycData?.status, onVerificationComplete]);

  return (
    <Dialog open={isOpen} onOpenChange={() => onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Identity Verification Required</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center justify-center space-y-4 p-4">
          <p className="text-center text-sm text-gray-500">
            We need to verify your identity before proceeding with your application.
          </p>
          <Button
            onClick={() => startVerification.mutate()}
            disabled={startVerification.isPending}
          >
            {startVerification.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Starting...
              </>
            ) : (
              'Start Verification'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default KycVerificationModal;