import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
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
  const [verificationUrl, setVerificationUrl] = useState<string | null>(null);

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

  const isMobile = /iPhone|iPad|iPod|Android|Mobile|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  const platform = isMobile ? 'mobile' : 'web';
  
  useEffect(() => {
    console.log("Device detection:", {
      isMobile,
      platform,
      userAgent: navigator.userAgent,
      width: window.innerWidth
    });
  }, [isMobile, platform]);

  const startVerification = useMutation({
    mutationFn: async () => {
      if (!userId) {
        throw new Error('User ID is required');
      }

      try {
        console.log("Starting verification:", {
          userId,
          isMobile,
          userAgent: navigator.userAgent
        });

        const response = await fetch('/api/kyc/start', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'X-Mobile-Client': isMobile ? 'true' : 'false'
          },
          body: JSON.stringify({ 
            userId,
            platform: platform,
            userAgent: navigator.userAgent
          })
        });

        if (!response.ok) {
          const errorData = await response.json();
          console.error("Verification error:", errorData);
          throw new Error(errorData.message || 'Failed to start verification');
        }

        const data = await response.json();
        console.log("Verification response:", data);
        console.log("Verification response:", data);

        if (!data.redirectUrl) {
          throw new Error('No redirect URL provided');
        }

        // Set the verification URL to load in iframe
        setVerificationUrl(data.redirectUrl);
        return data;
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
    <Dialog open={isOpen} onOpenChange={() => onClose()} className="z-[9999] fixed">
      <DialogContent className="z-[9999] relative touch-auto">
        <DialogHeader>
          <DialogTitle>Identity Verification Required</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center justify-center space-y-4 p-4">
          <div className="text-center space-y-3">
            <p className="text-sm text-gray-500">
              We need to verify your identity before proceeding with your application.
            </p>
            <div className="text-xs text-gray-600">
              <p>Accepted documents:</p>
              <ul className="list-disc list-inside">
                <li>Driver's License</li>
                <li>Passport</li>
                <li>Government-issued ID</li>
              </ul>
            </div>
          </div>
          <Button
            type="button"
            role="button"
            style={{ 
              touchAction: 'manipulation',
              WebkitTapHighlightColor: 'transparent',
              cursor: 'pointer',
              pointerEvents: 'auto',
              userSelect: 'none'
            }}
            className="relative z-[9999] touch-auto active:scale-95 transition-transform hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2"
            onClick={async (e) => {
              e.preventDefault();
              e.stopPropagation();
              console.log("Button clicked", {
                type: e.type,
                target: e.target,
                currentTarget: e.currentTarget
              });
              try {
                console.log("Starting verification...");
                const result = await startVerification.mutateAsync();
                console.log("Verification result:", result);
                if (result?.redirectUrl) {
                  console.log("Redirecting to verification URL:", result.redirectUrl);
                  window.location.href = result.redirectUrl;
                } else {
                  console.error("No redirect URL received from verification start");
                  toast({
                    title: "Error",
                    description: "Failed to get verification link",
                    variant: "destructive"
                  });
                }
              } catch (error) {
                console.error("Verification error:", error);
              }
            }}
            disabled={startVerification.isPending}
            className="w-full touch-action-manipulation active:opacity-80 hover:opacity-90"
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