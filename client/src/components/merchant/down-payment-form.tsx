import { useState } from "react";
import { Elements } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";

// Initialize Stripe (we'll add the key later)
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

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsProcessing(true);

    try {
      // We'll implement the actual payment processing when we have the Stripe keys
      console.log("Processing payment for:", formatCurrency(downPaymentAmount));
      
      toast({
        title: "Payment Successful",
        description: `Down payment of ${formatCurrency(downPaymentAmount)} has been processed.`,
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
        >
          {isProcessing ? "Processing..." : `Pay ${formatCurrency(downPaymentAmount)}`}
        </Button>
      </CardFooter>
    </Card>
  );
}
