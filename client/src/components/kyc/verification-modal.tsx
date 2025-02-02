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
  const isMobile = useMobile();
  const [verificationUrl, setVerificationUrl] = useState<string | null>(null);

  // Platform detection
  const platform = isMobile ? 'mobile' : 'web';
  console.log('[KYC Modal] Platform detection:', {
    isMobile,
    platform,
    userAgent: navigator.userAgent,
    vendor: navigator.vendor,
    platform: navigator.platform
  });

  const { data: kycData, refetch: refetchStatus } = useQuery({
    queryKey: ['/api/kyc/status', userId],
    queryFn: async () => {
      if (!userId) return null;
      const response = await fetch(`/api/kyc/status?userId=${userId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch KYC status');
      }
      return response.json();
    },
    enabled: !!userId,
    refetchInterval: 5000
  });

  const startVerification = useMutation({
    mutationFn: async () => {
      if (!userId) {
        throw new Error('User ID is required');
      }

      console.log('[KYC] Starting verification with platform details:', {
        userId,
        platform,
        isMobile,
        userAgent: navigator.userAgent
      });

      try {
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
        console.log('[KYC] Received verification URL:', data);

        if (!data.redirectUrl) {
          throw new Error('No redirect URL provided');
        }

        // For mobile browsers, we need to handle the redirection differently
        if (isMobile) {
          console.log('[KYC] Handling mobile redirection');
          // Try to use the app scheme first
          const appUrl = data.redirectUrl.replace('https://', 'didit://');
          console.log('[KYC] Attempting app URL:', appUrl);
          window.location.href = appUrl;

          // Set a fallback timeout to use the HTTPS URL if the app scheme doesn't work
          setTimeout(() => {
            console.log('[KYC] Fallback to web URL:', data.redirectUrl);
            window.location.href = data.redirectUrl;
          }, 1000);
        } else {
          console.log('[KYC] Redirecting to web URL:', data.redirectUrl);
          window.location.href = data.redirectUrl;
        }

        return data;
      } catch (error: any) {
        console.error('[KYC] Verification error:', error);
        toast({
          title: "Verification Error",
          description: "Failed to start verification. Please try again.",
          variant: "destructive"
        });
        throw error;
      }
    }
  });

  useEffect(() => {
    if (isOpen) {
      console.log('[KYC Modal] Modal opened:', {
        isMobile,
        platform,
        status: kycData?.status,
        userId
      });

      if (!kycData?.status || kycData?.status === 'not_started') {
        console.log('[KYC Modal] Starting verification');
        startVerification.mutate();
      } else if (kycData?.status === 'Approved') {
        console.log('[KYC Modal] User already verified');
        toast({
          title: "Verification Complete",
          description: "Your identity has been verified successfully."
        });
        onVerificationComplete?.();
      }
    }
  }, [isOpen, kycData?.status]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Identity Verification</DialogTitle>
        </DialogHeader>
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
      </DialogContent>
    </Dialog>
  );
}

export default KycVerificationModal;