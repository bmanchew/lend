import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Loader2, AlertTriangle } from "lucide-react";
import { useEffect, useState } from "react";
import { useMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

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
  const [redirectUrl, setRedirectUrl] = useState<string | null>(null);
  const [appInstallRequired, setAppInstallRequired] = useState(false);

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
    refetchInterval: (data) => 
      data?.status === 'COMPLETED' ? false : (isMobile ? 3000 : 5000)
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
        setRedirectUrl(data.redirectUrl);
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

  // Handle mobile app redirection
  useEffect(() => {
    if (isMobile && redirectUrl && !redirectAttempted) {
      setRedirectAttempted(true);
      let appCheckTimeout: NodeJS.Timeout;
      let storeRedirectTimeout: NodeJS.Timeout;

      const tryRedirect = async () => {
        console.log('[KYC Modal] Attempting app redirect:', redirectUrl);

        // Try universal link first
        window.location.href = redirectUrl;

        // Check if app is installed after a delay
        appCheckTimeout = setTimeout(() => {
          if (!document.hidden) {
            console.log('[KYC Modal] Universal link failed, trying app scheme');
            // Try deep link
            const appUrl = redirectUrl.replace('https://', 'didit://');
            window.location.href = appUrl;

            // If still here after delay, show app store prompt
            storeRedirectTimeout = setTimeout(() => {
              if (!document.hidden) {
                console.log('[KYC Modal] App not installed, showing prompt');
                setAppInstallRequired(true);
                toast({
                  title: "Didit App Required",
                  description: "Please install the Didit app to complete verification.",
                  variant: "default"
                });
              }
            }, 2000);
          }
        }, 2000);
      };

      tryRedirect().catch(console.error);

      // Cleanup timeouts
      return () => {
        clearTimeout(appCheckTimeout);
        clearTimeout(storeRedirectTimeout);
      };
    }
  }, [redirectUrl, isMobile, redirectAttempted]);

  // Monitor verification status
  useEffect(() => {
    if (!isOpen) {
      setRedirectAttempted(false);
      setVerificationStarted(false);
      setRedirectUrl(null);
      setAppInstallRequired(false);
      return;
    }

    if (kycData?.status === 'COMPLETED') {
      console.log('[KYC Modal] Verification completed');
      toast({
        title: "Verification Complete",
        description: "Your identity has been verified successfully."
      });
      onVerificationComplete?.();
      onClose();
    }
  }, [isOpen, kycData?.status]);

  // Initialize verification on open
  useEffect(() => {
    if (!isOpen || verificationStarted || kycData?.status === 'COMPLETED') return;

    if (!userId) {
      console.error('[KYC Modal] No user ID available');
      toast({
        title: "Verification Error",
        description: "Please log in to continue with verification.",
        variant: "destructive"
      });
      return;
    }

    console.log('[KYC Modal] Starting new verification');
    setVerificationStarted(true);
    startVerification.mutate();
  }, [isOpen, userId, verificationStarted, kycData?.status]);

  const handleRetry = () => {
    setRedirectAttempted(false);
    setVerificationStarted(false);
    setRedirectUrl(null);
    setAppInstallRequired(false);
    startVerification.mutate();
  };

  const renderContent = () => {
    if (!userId) {
      return (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Please log in to continue with verification.
          </AlertDescription>
        </Alert>
      );
    }

    if (startVerification.isPending) {
      return (
        <div className="flex flex-col items-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p className="text-center text-sm text-muted-foreground">
            {isMobile ? "Preparing mobile verification..." : "Starting verification process..."}
          </p>
        </div>
      );
    }

    if (appInstallRequired) {
      return (
        <div className="flex flex-col items-center space-y-4">
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              The Didit app is required to complete verification.
              Please install it from your device's app store.
            </AlertDescription>
          </Alert>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleRetry}>
              Try Again
            </Button>
            <Button
              onClick={() => {
                window.open('https://didit.me/download', '_blank');
              }}
            >
              Download App
            </Button>
          </div>
        </div>
      );
    }

    if (redirectAttempted && isMobile) {
      return (
        <div className="flex flex-col items-center space-y-4">
          <p className="text-sm text-center">
            Opening Didit verification app...
          </p>
          <Button variant="outline" onClick={handleRetry}>
            Retry Verification
          </Button>
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center space-y-4">
        <Loader2 className="h-6 w-6 animate-spin" />
        <p className="text-sm text-center text-muted-foreground">
          {isMobile 
            ? "Initializing mobile verification..." 
            : "Please wait while we initialize identity verification..."}
        </p>
      </div>
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Identity Verification</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center justify-center space-y-4 p-4">
          {renderContent()}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default KycVerificationModal;