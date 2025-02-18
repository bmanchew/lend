import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { usePlaidLink } from 'react-plaid-link';
import { Button } from '../ui/button';
import axios from 'axios';
import { useToast } from '@/hooks/use-toast';
import { formatCurrency } from '@/lib/utils';

interface BankLinkDialogProps {
  contractId: number;
  amount: number;
  onSuccess: () => void;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BankLinkDialog({ 
  contractId, 
  amount, 
  onSuccess, 
  isOpen, 
  onOpenChange 
}: BankLinkDialogProps) {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const handlePlaidSuccess = async (publicToken: string, metadata: any) => {
    try {
      setIsProcessing(true);

      // Exchange public token for access token and initiate payment
      const response = await axios.post('/api/plaid/process-payment', {
        public_token: publicToken,
        account_id: metadata.account_id,
        amount,
        contractId,
      });

      if (response.data.status === 'processing') {
        toast({ 
          title: "Payment Initiated", 
          description: `Your payment of ${formatCurrency(amount)} is being processed`,
          variant: "default" 
        });
        onSuccess();
      } else {
        throw new Error('Payment initiation failed');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to process payment';
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const { open, ready } = usePlaidLink({
    token: linkToken ?? '',
    onSuccess: (public_token, metadata) => {
      handlePlaidSuccess(public_token, metadata);
    },
    onExit: () => {
      setIsLoading(false);
    }
  });

  useEffect(() => {
    async function getToken() {
      try {
        setIsLoading(true);
        const { data } = await axios.post('/api/plaid/create-link-token');
        setLinkToken(data.link_token);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to initialize bank connection';
        toast({
          title: "Error",
          description: errorMessage,
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    }
    if (isOpen) getToken();
  }, [isOpen, toast]);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Make Payment via Bank Account</DialogTitle>
          <DialogDescription>
            Connect your bank account to make a payment of {formatCurrency(amount)}.
            The amount will be directly debited from your selected account.
          </DialogDescription>
        </DialogHeader>
        <Button 
          onClick={() => open()} 
          disabled={!ready || isLoading || isProcessing}
          className="w-full"
          aria-busy={isLoading || isProcessing}
        >
          {isProcessing ? "Processing Payment..." : 
           isLoading ? "Connecting..." : 
           `Pay ${formatCurrency(amount)} with Plaid`}
        </Button>
      </DialogContent>
    </Dialog>
  );
}