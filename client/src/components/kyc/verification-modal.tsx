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
  const [verificationStarted, setVerificationStarted] = useState(false);
  const [redirectAttempted, setRedirectAttempted] = useState(false);

  // Enhanced platform detection
  const platform = isMobile ? 'mobile' : 'web';
  console.log('[KYC Modal] Platform detection:', {
    isMobile,
    platform,
    userAgent: navigator.userAgent,
    vendor: navigator.vendor,
    deviceMemory: (navigator as any).deviceMemory,
    hardwareConcurrency: navigator.hardwareConcurrency,
    screenInfo: {
      width: window.screen.width,
      height: window.screen.height,
      orientation: window.screen.orientation?.type
    }
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
    refetchInterval: isMobile ? 3000 : 5000 // More frequent polling on mobile
  });

  const startVerification = useMutation({
    mutationFn: async () => {
      if (!userId) {
        console.error('[KYC Modal] Cannot start verification - no user ID');
        throw new Error('User ID is required');
      }

      console.log('[KYC Modal] Starting verification:', {
        userId,
        platform,
        isMobile,
        userAgent: navigator.userAgent,
        timestamp: new Date().toISOString()
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

        // Enhanced mobile redirection with better fallback handling
        if (isMobile && !redirectAttempted) {
          setRedirectAttempted(true);
          console.log('[KYC Modal] Initiating mobile redirection sequence');

          // Try universal link first
          const universalLink = data.redirectUrl;
          console.log('[KYC Modal] Attempting universal link:', universalLink);

          // Create and use hidden anchor for better mobile handling
          const link = document.createElement('a');
          link.href = universalLink;
          link.style.display = 'none';
          document.body.appendChild(link);

          // Sequential fallback chain with timeouts
          const tryRedirect = async () => {
            // 1. Try universal link
            link.click();

            // 2. Try app scheme after short delay
            await new Promise(resolve => setTimeout(resolve, 1000));
            const appUrl = data.redirectUrl.replace('https://', 'didit://');
            console.log('[KYC Modal] Attempting app URL:', appUrl);
            window.location.href = appUrl;

            // 3. Final fallback to web URL after another delay
            await new Promise(resolve => setTimeout(resolve, 1000));
            if (!document.hidden) {
              console.log('[KYC Modal] Final fallback to web URL:', data.redirectUrl);
              window.location.href = data.redirectUrl;
            }
          };

          tryRedirect().catch(err => {
            console.error('[KYC Modal] Redirection sequence error:', err);
            // Fallback to direct web URL
            window.location.href = data.redirectUrl;
          });
        } else {
          console.log('[KYC Modal] Using web flow:', data.redirectUrl);
          window.location.href = data.redirectUrl;
        }

        return data;
      } catch (error: any) {
        console.error('[KYC Modal] Verification error:', error);
        toast({
          title: "Verification Error",
          description: error.message || "Failed to start verification. Please try again.",
          variant: "destructive"
        });
        throw error;
      }
    }
  });

  useEffect(() => {
    if (!isOpen) {
      setRedirectAttempted(false);
      setVerificationStarted(false);
      return;
    }

    console.log('[KYC Modal] Modal opened:', {
      isMobile,
      platform,
      status: kycData?.status,
      userId,
      verificationStarted,
      redirectAttempted
    });

    if (!userId) {
      console.error('[KYC Modal] No user ID available');
      toast({
        title: "Verification Error",
        description: "Please log in to continue with verification.",
        variant: "destructive"
      });
      return;
    }

    const initializeVerification = async () => {
      if (verificationStarted) return;

      try {
        console.log('[KYC Modal] Starting new verification');
        setVerificationStarted(true);
        await startVerification.mutateAsync();
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

  const renderContent = () => {
    if (!userId) {
      return (
        <p className="text-sm text-red-500">
          Please log in to continue with verification.
        </p>
      );
    }

    if (startVerification.isPending) {
      return (
        <div className="flex items-center space-x-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>{isMobile ? "Preparing mobile verification..." : "Starting verification process..."}</span>
        </div>
      );
    }

    if (redirectAttempted && isMobile) {
      return (
        <p className="text-sm text-gray-500">
          Opening Didit verification app... If nothing happens, please check if the app is installed or try refreshing the page.
        </p>
      );
    }

    return (
      <p className="text-sm text-gray-500">
        {isMobile 
          ? "Initializing mobile verification..." 
          : "Please wait while we initialize identity verification..."}
      </p>
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Identity Verification</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center justify-center space-y-4 p-4">
          <div className="text-center space-y-3">
            {renderContent()}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default KycVerificationModal;