import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
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
  const { user } = useAuth();
  const userId = user?.id;
  const isMobile = useMobile();

  // Log user info for debugging
  console.log('[KYC Modal] User info:', { userId, user });
  const [verificationStarted, setVerificationStarted] = useState(false);

  // Platform detection
  const platform = isMobile ? 'mobile' : 'web';
  console.log('[KYC Modal] Platform detection:', {
    isMobile,
    platform,
    userAgent: navigator.userAgent,
    vendor: navigator.vendor
  });

  const { data: kycData, refetch: refetchStatus } = useQuery({
    queryKey: ['/api/kyc/status', userId],
    queryFn: async () => {
      if (!userId) {
        console.error('[KYC Modal] No user ID found');
        return null;
      }
      console.log('[KYC Modal] Checking status for user:', userId);
      const response = await fetch(`/api/kyc/status?userId=${userId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch KYC status');
      }
      const data = await response.json();
      console.log('[KYC Modal] Status response:', data);
      return data;
    },
    enabled: !!userId && isOpen,
    refetchInterval: 5000
  });

  const startVerification = useMutation({
    mutationFn: async () => {
      if (!userId) {
        console.error('[KYC Modal] Cannot start verification - no user ID');
        throw new Error('User ID is required');
      }

      const platform = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ? 'mobile' : 'web';
      console.log('[KYC Modal] Detected platform:', platform);

      console.log('[KYC Modal] Starting verification:', {
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
        console.log('[KYC Modal] Received verification URL:', data);

        if (!data.redirectUrl) {
          throw new Error('No redirect URL provided');
        }

        // For mobile browsers, we need to handle the redirection differently
        if (isMobile) {
          console.log('[KYC Modal] Handling mobile redirection');
          
          // Try universal link first
          const universalLink = data.redirectUrl;
          console.log('[KYC Modal] Attempting universal link:', universalLink);
          
          // Create and use hidden anchor for better mobile handling
          const link = document.createElement('a');
          link.href = universalLink;
          link.style.display = 'none';
          document.body.appendChild(link);
          link.click();

          // Fallback chain: app scheme -> web URL
          setTimeout(() => {
            const appUrl = data.redirectUrl.replace('https://', 'didit://');
            console.log('[KYC Modal] Attempting app URL:', appUrl);
            window.location.href = appUrl;

            setTimeout(() => {
              console.log('[KYC Modal] Final fallback to web URL:', data.redirectUrl);
              window.location.href = data.redirectUrl;
            }, 1500);
          }, 1500);
        } else {
          console.log('[KYC Modal] Redirecting to web URL:', data.redirectUrl);
          window.location.href = data.redirectUrl;
        }

        return data;
      } catch (error: any) {
        console.error('[KYC Modal] Verification error:', error);
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
    if (!isOpen) return;

    console.log('[KYC Modal] Modal opened:', {
      isMobile,
      platform,
      status: kycData?.status,
      userId,
      verificationStarted
    });

    // Reset verification state on modal open
    setVerificationStarted(false);

    if (!userId) {
      console.error('[KYC Modal] No user ID available');
      toast({
        title: "Verification Error",
        description: "User ID not found. Please try logging in again.",
        variant: "destructive"
      });
      return;
    }

    const initializeVerification = async () => {
      if (verificationStarted) return;

      try {
        console.log('[KYC Modal] Starting new verification');
        setVerificationStarted(true);
        const result = await startVerification.mutateAsync();

        if (!result || !result.redirectUrl) {
          console.error('[KYC Modal] Invalid verification response:', result);
          toast({
            title: "Verification Error",
            description: "Unable to start verification. Please try again.",
            variant: "destructive"
          });
          throw new Error('Invalid verification response');
        }

        console.log('[KYC Modal] Verification initialized:', result);
      } catch (error: any) {
        console.error('[KYC Modal] Failed to initialize verification:', error);
        toast({
          title: "Verification Error",
          description: error.message || "Failed to start verification. Please try again.",
          variant: "destructive"
        });
        setVerificationStarted(false);
      }
    };

    if (!kycData?.status || kycData?.status === 'not_started') {
      initializeVerification();
    } else if (kycData?.status === 'Approved') {
      console.log('[KYC Modal] User already verified');
      toast({
        title: "Verification Complete",
        description: "Your identity has been verified successfully."
      });
      onVerificationComplete?.();
    }
  }, [isOpen, kycData?.status, userId]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Identity Verification</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center justify-center space-y-4 p-4">
          <div className="text-center space-y-3">
            {!userId ? (
              <p className="text-sm text-red-500">
                User ID not found. Please try logging in again.
              </p>
            ) : startVerification.isPending ? (
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