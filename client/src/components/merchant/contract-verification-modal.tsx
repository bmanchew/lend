
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
        throw new Error('Invalid verification code');
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Contract Verified",
        description: "Proceeding to identity verification..."
      });
      onVerified();
      if (data.redirectUrl) {
        window.location.href = data.redirectUrl;
      }
    },
    onError: () => {
      toast({
        title: "Verification Failed",
        description: "Please check the code and try again",
        variant: "destructive"
      });
    }
  });

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Verify Contract</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Input 
            placeholder="Enter verification code"
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
          />
          <Button 
            onClick={() => verifyContract.mutate()}
            disabled={verifyContract.isPending}
          >
            {verifyContract.isPending ? "Verifying..." : "Verify"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
