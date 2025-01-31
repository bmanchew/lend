import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useQuery, useMutation, QueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { useLocation } from "wouter";
import React from 'react';

export function KycVerificationModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const queryClient = new QueryClient();// Added this line

  // Query to check KYC status
  const { data: kycStatus, isLoading: isCheckingStatus } = useQuery({
    queryKey: ['/api/kyc/status', user?.id],
    enabled: isOpen && !!user,
  });

  // Mutation to start KYC process
  const { mutate: startKyc, isPending: isStarting } = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/kyc/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user?.id }),
      });
      if (!response.ok) throw new Error('Failed to start KYC process');
      return response.json();
    },
    onSuccess: (data) => {
      // Store current page URL in sessionStorage before redirect
      sessionStorage.setItem('returnToUrl', window.location.pathname);
      // Handle redirect to Didit verification flow
      window.location.href = data.redirectUrl;
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to start verification process. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Handle KYC status from URL params after redirect
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const kycParam = params.get('kyc');
    const sessionId = params.get('session');
    const returnUrl = sessionStorage.getItem('returnToUrl');

    if (kycParam) {
      // Show appropriate toast message based on status
      switch (kycParam) {
        case 'success':
          toast({
            title: "Verification Successful",
            description: "Your identity has been verified successfully.",
          });
          break;
        case 'failed':
          toast({
            title: "Verification Failed",
            description: "Identity verification failed. Please try again.",
            variant: "destructive",
          });
          break;
        case 'pending':
          toast({
            title: "Verification Pending",
            description: "Your verification is being reviewed. We'll notify you once complete.",
          });
          break;
        default:
          toast({
            title: "Verification Status Unknown",
            description: "Please contact support if this persists.",
            variant: "destructive",
          });
      }

      // If we have a session ID, update the verification status
      if (sessionId) {
        // Refetch the KYC status
        queryClient.invalidateQueries({
          queryKey: ['/api/kyc/status', user?.id]
        });
      }

      // Clear KYC param from URL and redirect back
      const newUrl = returnUrl || '/dashboard';
      setLocation(newUrl);
      sessionStorage.removeItem('returnToUrl');
    }
  }, [toast, setLocation, user?.id]);

  if (isCheckingStatus) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Checking verification status...</DialogTitle>
          </DialogHeader>
          <div className="flex justify-center p-4">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Identity Verification Required</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Before you can proceed with your loan application, we need to verify your identity.
            This process is quick and secure.
          </p>
          <div className="space-y-2">
            <h4 className="font-medium">What you'll need:</h4>
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
      </DialogContent>
    </Dialog>
  );
}