import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

interface ContractVerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  contractId: number;
  onVerified: () => void;
}

export function ContractVerificationModal({
  isOpen,
  onClose,
  contractId,
  onVerified
}: ContractVerificationModalProps) {
  const [otp, setOtp] = useState("");
  const { toast } = useToast();

  const verifyContract = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/contracts/${contractId}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ otp })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Invalid verification code');
      }

      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Contract Verified",
        description: "Proceeding to identity verification...",
        variant: "default"
      });
      onVerified();
      if (data.redirectUrl) {
        window.location.href = data.redirectUrl;
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Verification Failed",
        description: error.message || "Please check the code and try again",
        variant: "destructive"
      });
    }
  });

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent aria-describedby="verification-description">
        <DialogHeader>
          <DialogTitle>Verify Contract</DialogTitle>
          <DialogDescription id="verification-description">
            Please enter the verification code sent to your registered phone number.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Input 
            placeholder="Enter verification code"
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
            aria-label="Verification code input"
            type="text"
            pattern="[0-9]*"
            inputMode="numeric"
            maxLength={6}
          />
          <Button 
            onClick={() => verifyContract.mutate()}
            disabled={verifyContract.isPending || !otp}
            aria-busy={verifyContract.isPending}
          >
            {verifyContract.isPending ? "Verifying..." : "Verify"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}