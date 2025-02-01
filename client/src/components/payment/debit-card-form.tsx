
import { useState } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';

interface DebitCardFormProps {
  amount: number;
  onSuccess: () => void;
}

export function DebitCardForm({ amount, onSuccess }: DebitCardFormProps) {
  const [cardNumber, setCardNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvv, setCvv] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // TODO: Integrate with payment processor
    onSuccess();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Down Payment - ${amount}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Input
              placeholder="Card Number"
              value={cardNumber}
              onChange={(e) => setCardNumber(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input
              placeholder="MM/YY"
              value={expiry}
              onChange={(e) => setExpiry(e.target.value)}
            />
            <Input
              placeholder="CVV"
              value={cvv}
              onChange={(e) => setCvv(e.target.value)}
            />
          </div>
          <Button type="submit" className="w-full">
            Pay Down Payment
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
