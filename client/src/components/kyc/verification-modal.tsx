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

  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  const startVerification = useMutation({
    mutationFn: async () => {
      if (!userId) {
        throw new Error('User ID is required');
      }

      try {
        console.log("Starting verification for user:", userId);
        const response = await fetch('/api/kyc/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId })
        });

        const data = await response.json();
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
    <Dialog open={isOpen} onOpenChange={() => onClose()}>
      <DialogContent>
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
            onClick={(e) => {
              e.preventDefault();
              console.log("Verification button clicked", e);
              startVerification.mutate();
            }}
            onTouchStart={(e) => {
              console.log("Touch start on verification button", e);
            }}
            onTouchEnd={(e) => {
              e.preventDefault();
              console.log("Touch end on verification button", e);
              startVerification.mutate();
            }}
            disabled={startVerification.isPending}
            style={{ touchAction: 'manipulation' }}
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
          {verificationUrl && (
            <iframe
              title="Verification Iframe"
              src={verificationUrl}
              style={{ width: '100%', height: '600px', border: 'none' }}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default KycVerificationModal;