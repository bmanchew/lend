import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { usePlaidLink } from 'react-plaid-link';
import { Button } from '../ui/button';
import axios from 'axios';
import { useToast } from '@/hooks/use-toast';
import { formatCurrency } from '@/lib/utils';
import { Alert, AlertDescription } from '../ui/alert';
import { Input } from '../ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '../ui/form';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';

const microDepositsSchema = z.object({
  amount1: z.string().min(1, 'Required'),
  amount2: z.string().min(1, 'Required')
});

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
  const [showMicroDeposits, setShowMicroDeposits] = useState(false);

  const form = useForm<z.infer<typeof microDepositsSchema>>({
    resolver: zodResolver(microDepositsSchema),
    defaultValues: {
      amount1: '',
      amount2: ''
    }
  });

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
          setShowMicroDeposits(true);
          setStatusMessage('ACH verification pending. Please enter the micro-deposit amounts.');
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

  const handleMicroDepositsSubmit = async (values: z.infer<typeof microDepositsSchema>) => {
    try {
      setIsProcessing(true);
      setError(null);

      const amounts = [
        parseFloat(values.amount1),
        parseFloat(values.amount2)
      ];

      await axios.post('/api/plaid/verify-micro-deposits', {
        contractId,
        amounts
      });

      setAchConfirmationStatus('verified');
      setShowMicroDeposits(false);
      setStatusMessage('Bank account verified successfully!');

      // Reinitiate the payment process
      handlePlaidSuccess(linkToken!, { account_id: '' }); // We'll get the account_id from the stored contract
    } catch (error: any) {
      const errorMsg = error?.response?.data?.message || error.message || 'Failed to verify micro-deposits';
      setError(errorMsg);
      toast({
        title: "Verification Failed",
        description: errorMsg,
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

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
        setShowMicroDeposits(true);
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
        setLinkToken(data.linkToken); //Corrected typo here
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Make Payment via Bank Account</DialogTitle>
          <DialogDescription>
            Connect your bank account to make a payment of {formatCurrency(amount)}.
            The amount will be directly debited from your selected account.
            {showMicroDeposits && (
              <p className="mt-2 text-sm font-medium text-yellow-600">
                Please enter the two small deposit amounts that will appear in your bank account
                within 1-2 business days to verify your account.
              </p>
            )}
            {statusMessage && !showMicroDeposits && (
              <p className="mt-2 text-sm font-medium text-primary">{statusMessage}</p>
            )}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {showMicroDeposits ? (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleMicroDepositsSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="amount1"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>First Deposit Amount ($)</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        step="0.01"
                        placeholder="0.00" 
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="amount2"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Second Deposit Amount ($)</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        step="0.01"
                        placeholder="0.00" 
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button 
                type="submit"
                disabled={isProcessing}
                className="w-full"
              >
                {isProcessing ? "Verifying..." : "Verify Amounts"}
              </Button>
            </form>
          </Form>
        ) : (
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
        )}
      </DialogContent>
    </Dialog>
  );
}