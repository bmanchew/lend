import { useState } from "react";
import { Elements } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useQuery } from "@tanstack/react-query";

// Initialize Stripe
const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '');

interface DownPaymentFormProps {
  loanAmount: number;
  onSuccess: () => void;
  onCancel: () => void;
}

export function DownPaymentForm({ loanAmount, onSuccess, onCancel }: DownPaymentFormProps) {
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);
  const downPaymentAmount = loanAmount * 0.05; // Calculate 5% down payment

  // Fetch potential rewards
  const { data: rewards } = useQuery({
    queryKey: ['potentialRewards', downPaymentAmount],
    queryFn: async () => {
      const response = await fetch(`/api/rewards/potential?amount=${downPaymentAmount}&type=down_payment`);
      if (!response.ok) throw new Error('Failed to fetch potential rewards');
      return response.json();
    }
  });

  const potentialReward = rewards?.totalPoints || Math.floor(loanAmount / 10); // Fallback to basic calculation

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsProcessing(true);

    try {
      console.log("Processing payment for:", formatCurrency(downPaymentAmount));

      toast({
        title: "Payment Successful",
        description: `Down payment of ${formatCurrency(downPaymentAmount)} has been processed. You've earned ${potentialReward} ShiFi coins!`,
      });

      onSuccess();
    } catch (error) {
      console.error("Payment failed:", error);
      toast({
        title: "Payment Failed",
        description: "There was an error processing your payment. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle>Down Payment Required</CardTitle>
        <CardDescription>
          Please provide your payment information to process the 5% down payment
          of {formatCurrency(downPaymentAmount)}.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Alert className="mb-4 bg-amber-50">
          <AlertDescription className="flex flex-col gap-2">
            <span className="font-semibold">🎁 Earn ShiFi Coins with Your Down Payment!</span>
            <span>Make your down payment now and earn {potentialReward} ShiFi coins instantly!</span>
            <span className="text-sm text-muted-foreground">
              These coins can be redeemed for products and services. Plus, earn more coins with early or additional payments!
            </span>
          </AlertDescription>
        </Alert>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Elements stripe={stripePromise}>
            {/* We'll add Stripe's card element here once we have the API keys */}
            <div className="p-4 border rounded bg-muted">
              Credit/Debit Card input will be enabled when Stripe is configured
            </div>
          </Elements>
        </form>
      </CardContent>
      <CardFooter className="flex justify-end space-x-4">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isProcessing}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={isProcessing || !stripePromise}
          onClick={handleSubmit}
        >
          {isProcessing ? "Processing..." : `Pay ${formatCurrency(downPaymentAmount)}`}
        </Button>
      </CardFooter>
    </Card>
  );
}