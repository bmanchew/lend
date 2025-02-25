import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useMobile } from "@/hooks/use-mobile";
import { KycStatus } from "@db/schema";

interface VerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onVerificationComplete?: () => void;
}

export function KycVerificationModal({
  isOpen,
  onClose,
  onVerificationComplete,
}: VerificationModalProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const userId = user?.id;
  const isMobile = useMobile();
  const [verificationStarted, setVerificationStarted] = useState(false);

  // Platform detection
  const platform = isMobile ? "mobile" : "web";
  console.log("[KYC Modal] User info:", {
    userId,
    user,
    kycStatus: user?.kycStatus,
  });

  const { data: kycData, refetch: refetchStatus } = useQuery({
    queryKey: ["/api/kyc/status", userId],
    queryFn: async () => {
      if (!userId) {
        console.error("[KYC Modal] No user ID found");
        return null;
      }
      console.log("[KYC Modal] Checking status for user:", userId);
      const response = await fetch(`/api/kyc/status?userId=${userId}`);
      if (!response.ok) {
        throw new Error("Failed to fetch KYC status");
      }
      const data = await response.json();
      console.log("[KYC Modal] Status response:", data);
      return data;
    },
    enabled: !!userId && isOpen,
    refetchInterval: 5000,
  });

  const startVerification = useMutation({
    mutationFn: async () => {
      if (!userId) {
        console.error("[KYC Modal] Cannot start verification - no user ID");
        throw new Error("User ID is required");
      }

      // Don't start verification if user is already verified or pending
      if (user?.kycStatus === "verified" || user?.kycStatus === "pending") {
        console.log("[KYC Modal] User already has status:", user.kycStatus);
        return null;
      }

      try {
        // Add redirectUrl to direct users back to the dashboard after verification
        const redirectUrl = window.location.origin + "/customer/dashboard";

        const response = await fetch("/api/kyc/start", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Mobile-Client": isMobile ? "true" : "false",
          },
          body: JSON.stringify({
            userId,
            platform,
            userAgent: navigator.userAgent,
            redirectUrl,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || "Failed to start verification");
        }

        const data = await response.json();
        console.log("[KYC Modal] Received verification response:", data);

        // If user is already verified, just return success without redirecting
        if (
          data.alreadyVerified ||
          data.currentStatus === "verified" ||
          data.currentStatus === "pending"
        ) {
          console.log(
            "[KYC Modal] User already verified or pending, no redirect needed",
          );
          return null;
        }

        if (!data.verificationUrl) {
          throw new Error("No verification URL provided");
        }

        return data.verificationUrl;
      } catch (error: any) {
        console.error("[KYC Modal] Verification error:", error);
        toast({
          title: "Verification Error",
          description: "Failed to start verification. Please try again.",
          variant: "destructive",
        });
        throw error;
      }
    },
    onSuccess: (verificationUrl) => {
      if (verificationUrl) {
        console.log("[KYC Modal] Redirecting to:", verificationUrl);
        window.location.href = verificationUrl;
      } else {
        console.log(
          "[KYC Modal] No redirect needed - user already verified or pending",
        );
        // User is already verified or pending
        if (user?.kycStatus === "verified") {
          toast({
            title: "Verification Complete",
            description: "Your identity has been verified successfully.",
          });
        } else if (user?.kycStatus === "pending") {
          toast({
            title: "Verification in Progress",
            description: "Your verification is already in progress.",
          });
        }
        onVerificationComplete?.();
      }
    },
  });

  // Streamlined verification flow
  useEffect(() => {
    if (!isOpen || !userId) return;

    console.log("[KYC Modal] Modal opened - current status:", user?.kycStatus);

    // Handle already verified or pending users
    if (user?.kycStatus === "verified") {
      console.log("[KYC Modal] User already verified - closing modal");
      toast({
        title: "Verification Complete",
        description: "Your identity has been verified successfully.",
      });
      onVerificationComplete?.();
      return;
    }

    if (user?.kycStatus === "pending") {
      console.log(
        "[KYC Modal] User already has pending verification - showing pending status",
      );
      // Keep modal open to show pending status
      return;
    }

    // Start verification if not already started
    if (!verificationStarted) {
      console.log("[KYC Modal] Starting verification process");
      setVerificationStarted(true);
      startVerification.mutate();
    }
  }, [isOpen, userId, user?.kycStatus]);

  // Monitor for completion from webhook updates
  useEffect(() => {
    if (!kycData) return;

    console.log("[KYC Modal] KYC status update:", kycData);

    if (kycData.status === "verified" || kycData.status === "Approved") {
      console.log("[KYC Modal] Verification completed successfully");
      toast({
        title: "Verification Complete",
        description: "Your identity has been verified successfully.",
      });
      onVerificationComplete?.();
    }
  }, [kycData]);

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
            ) : user?.kycStatus === "pending" ? (
              <p className="text-sm text-amber-500">
                Your verification is in progress. We'll notify you when it's
                complete.
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
