import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { usePlaidLink } from 'react-plaid-link';
import { Button } from '../ui/button';
import axios from 'axios';
import { useToast } from '@/hooks/use-toast';
import { formatCurrency } from '@/lib/utils';
import { Alert, AlertDescription } from '../ui/alert';

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
  const [transferId, setTransferId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [achConfirmationStatus, setAchConfirmationStatus] = useState<'pending' | 'verified' | 'failed' | null>(null);

  // Poll for payment status
  useEffect(() => {
    let pollInterval: NodeJS.Timeout;

    const checkPaymentStatus = async () => {
      if (!transferId) return;

      try {
        const { data } = await axios.get(`/api/plaid/payment-status/${transferId}`);
        setStatusMessage(getStatusMessage(data.status));
        setError(null);

        if (data.achConfirmationRequired && !data.achConfirmed) {
          setAchConfirmationStatus('pending');
          setStatusMessage('ACH verification pending...');
          return;
        }

        switch (data.status) {
          case 'posted':
          case 'settled':
            clearInterval(pollInterval);
            toast({ 
              title: "Payment Successful", 
              description: `Your payment of ${formatCurrency(amount)} has been processed`,
              variant: "default" 
            });
            onSuccess();
            break;
          case 'failed':
          case 'returned':
          case 'canceled':
            clearInterval(pollInterval);
            const errorMsg = data.status === 'returned' 
              ? "The payment was returned by your bank. Please try again or use a different account."
              : "There was an issue processing your payment. Please try again.";
            setError(errorMsg);
            toast({
              title: "Payment Failed",
              description: errorMsg,
              variant: "destructive"
            });
            setIsProcessing(false);
            break;
          case 'pending':
          case 'processing':
          case 'approved':
            // Continue polling
            break;
        }
      } catch (error) {
        console.error('Error checking payment status:', error);
        clearInterval(pollInterval);
        const errorMsg = "Unable to check payment status. Please contact support.";
        setError(errorMsg);
        toast({
          title: "Error",
          description: errorMsg,
          variant: "destructive"
        });
        setIsProcessing(false);
      }
    };

    if (transferId) {
      pollInterval = setInterval(checkPaymentStatus, 5000); // Poll every 5 seconds
    }

    return () => {
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [transferId, amount, onSuccess, toast]);

  const getStatusMessage = (status: string): string => {
    switch (status) {
      case 'pending':
        return 'Initiating payment...';
      case 'processing':
        return 'Processing payment...';
      case 'approved':
        return 'Payment approved, finalizing...';
      case 'posted':
      case 'settled':
        return 'Payment successful!';
      case 'failed':
        return 'Payment failed';
      case 'returned':
        return 'Payment returned by bank';
      case 'canceled':
        return 'Payment canceled';
      default:
        return 'Verifying payment status...';
    }
  };

  const handlePlaidSuccess = async (publicToken: string, metadata: any) => {
    try {
      setIsProcessing(true);
      setStatusMessage('Verifying bank account...');
      setError(null);

      // Check Plaid Ledger balance first
      const balanceResponse = await axios.get('/api/plaid/ledger/balance');
      if (!balanceResponse.data.available || balanceResponse.data.available < amount) {
        const errorMsg = "Payment system temporarily unavailable. Please try again later.";
        setError(errorMsg);
        toast({
          title: "Payment Failed",
          description: errorMsg,
          variant: "destructive"
        });
        setIsProcessing(false);
        return;
      }

      setStatusMessage('Initiating ACH verification...');

      // Exchange public token and initiate ACH verification
      const response = await axios.post('/api/plaid/process-payment', {
        public_token: publicToken,
        account_id: metadata.account_id,
        amount,
        contractId,
        requireAchVerification: true
      });

      if (response.data.achConfirmationRequired) {
        setAchConfirmationStatus('pending');
        setStatusMessage('ACH verification initiated. Please check your bank account for micro-deposits.');
      } else if (response.data.status === 'processing' || response.data.status === 'pending') {
        setTransferId(response.data.transferId);
        toast({ 
          title: "Payment Initiated", 
          description: `Your payment of ${formatCurrency(amount)} is being processed`,
          variant: "default" 
        });
      } else {
        throw new Error('Payment initiation failed');
      }
    } catch (error: any) {
      const errorMsg = error?.response?.data?.message || error.message || 'Failed to process payment';
      setError(errorMsg);
      toast({
        title: "Error",
        description: errorMsg,
        variant: "destructive",
      });
      setIsProcessing(false);
      setStatusMessage('');
    }
  };

  const { open, ready } = usePlaidLink({
    token: linkToken ?? '',
    onSuccess: (public_token, metadata) => {
      handlePlaidSuccess(public_token, metadata);
    },
    onExit: () => {
      setIsLoading(false);
      setStatusMessage('');
    }
  });

  useEffect(() => {
    async function getToken() {
      try {
        setIsLoading(true);
        setError(null);
        const { data } = await axios.post('/api/plaid/create-link-token', {
          requireAchVerification: true
        });
        setLinkToken(data.link_token);
      } catch (error: any) {
        const errorMsg = error?.response?.data?.message || error.message || 'Failed to initialize bank connection';
        setError(errorMsg);
        toast({
          title: "Error",
          description: errorMsg,
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
            {achConfirmationStatus === 'pending' && (
              <p className="mt-2 text-sm font-medium text-yellow-600">
                Please check your bank account for micro-deposits to verify your account.
                This process may take 1-2 business days.
              </p>
            )}
            {statusMessage && (
              <p className="mt-2 text-sm font-medium text-primary">{statusMessage}</p>
            )}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Button 
          onClick={() => open()} 
          disabled={!ready || isLoading || isProcessing || achConfirmationStatus === 'pending'}
          className="w-full"
          variant={error ? "secondary" : "default"}
          aria-busy={isLoading || isProcessing}
        >
          {isProcessing ? statusMessage || "Processing Payment..." : 
           isLoading ? "Connecting..." : 
           error ? "Try Again" :
           achConfirmationStatus === 'pending' ? "Awaiting Verification" :
           `Pay ${formatCurrency(amount)} with Plaid`}
        </Button>
      </DialogContent>
    </Dialog>
  );
}