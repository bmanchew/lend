
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

  const { open, ready } = usePlaidLink({
    token: linkToken ?? '',
    onSuccess: async (public_token) => {
      try {
        await axios.post('/api/plaid/link-account', {
          public_token,
          contractId,
        });
        toast({ title: "Success", description: "Bank account linked successfully" });
        onSuccess();
      } catch (error) {
        toast({
          title: "Error",
          description: "Failed to link bank account",
          variant: "destructive",
        });
      }
    },
  });

  useEffect(() => {
    async function getToken() {
      const { data } = await axios.post('/api/plaid/create-link-token');
      setLinkToken(data.link_token);
    }
    if (isOpen) getToken();
  }, [isOpen]);

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
          disabled={!ready}
          className="w-full"
        >
          Connect with Plaid
        </Button>
      </DialogContent>
    </Dialog>
  );
}
