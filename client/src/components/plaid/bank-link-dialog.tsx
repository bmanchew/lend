import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { usePlaidLink } from 'react-plaid-link';
import { Button } from '../ui/button';
import axios from 'axios';
import { useToast } from '@/hooks/use-toast';

interface BankLinkDialogProps {
  contractId: number;
  onSuccess: () => void;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BankLinkDialog({ contractId, onSuccess, isOpen, onOpenChange }: BankLinkDialogProps) {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const { open, ready } = usePlaidLink({
    token: linkToken ?? '',
    onSuccess: async (public_token) => {
      try {
        setIsLoading(true);
        await axios.post('/api/plaid/link-account', {
          public_token,
          contractId,
        });
        toast({ 
          title: "Success", 
          description: "Bank account linked successfully",
          variant: "default" 
        });
        onSuccess();
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to link bank account';
        toast({
          title: "Error",
          description: errorMessage,
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    },
    onExit: () => {
      // Reset loading state if user exits Plaid Link
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
        const errorMessage = error instanceof Error ? error.message : 'Failed to initialize bank linking';
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
          <DialogTitle>Link Your Bank Account</DialogTitle>
          <DialogDescription>
            Connect your bank account to set up automatic payments and process the down payment.
          </DialogDescription>
        </DialogHeader>
        <Button 
          onClick={() => open()} 
          disabled={!ready || isLoading}
          className="w-full"
          aria-busy={isLoading}
        >
          {isLoading ? "Connecting..." : "Connect with Plaid"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}