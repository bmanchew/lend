import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useMobile } from "@/hooks/use-mobile";

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
  const isMobile = useMobile(); // Using the improved mobile detection hook
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

  const platform = isMobile ? 'mobile' : 'web';

  const startVerification = useMutation({
    mutationFn: async () => {
      if (!userId) {
        throw new Error('User ID is required');
      }

      console.log('[KYC Verification] Starting verification:', {
        userId,
        platform,
        isMobile,
        userAgent: navigator.userAgent
      });

      try {
        console.log('[KYC] Starting verification with platform details:', {
          userAgent: navigator.userAgent,
          platform: navigator.platform,
          vendor: navigator.vendor
        });

        const response = await fetch('/api/kyc/start', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'X-Mobile-Client': isMobile ? 'true' : 'false'
          },
          body: JSON.stringify({ 
            userId,
            platform,
            userAgent: navigator.userAgent
          })
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || 'Failed to start verification');
        }

        const data = await response.json();
        if (!data.redirectUrl) {
          throw new Error('No redirect URL provided');
        }

        window.location.href = data.redirectUrl;
        return data;
      } catch (error: any) {
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
    if (isOpen) {
      if (!kycData?.status || kycData?.status === 'not_started') {
        console.log('[KYC Modal] Auto-starting verification:', {
          isMobile,
          status: kycData?.status
        });
        startVerification.mutate();
      } else if (kycData?.status === 'Approved') {
        toast({
          title: "Verification Complete",
          description: "Your identity has been verified successfully."
        });
        onVerificationComplete?.();
      }
    }
  }, [isOpen, kycData?.status, isMobile, startVerification, toast, onVerificationComplete]);

  return (
    <div className="flex flex-col items-center justify-center space-y-4 p-4">
      <div className="text-center space-y-3">
        {startVerification.isPending ? (
          <div className="flex items-center space-x-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Starting verification process...</span>
          </div>
        ) : (
          <p className="text-sm text-gray-500">
            Please wait while we initialize identity verification...
          </p>
        )}
      </div>
    </div>
  );
}

export default KycVerificationModal;