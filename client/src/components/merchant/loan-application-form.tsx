import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { BankLinkDialog } from "../plaid/bank-link-dialog";

export function LoanApplicationForm({ merchantId, onSuccess }: { merchantId: number, onSuccess?: () => void }) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showBankLink, setShowBankLink] = useState(false);
  const [contractId, setContractId] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    dateOfBirth: '',
    streetAddress: '',
    aptNumber: '',
    city: '',
    state: '',
    zipCode: '',
    program: '',
    fundingAmount: '',
    salesRepEmail: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      // Validate phone number
      const cleanPhone = formData.phone.replace(/\D/g, '');
      if (cleanPhone.length !== 10) {
        toast({
          title: "Invalid Phone Number",
          description: "Please enter a valid 10-digit phone number",
          variant: "destructive"
        });
        setIsSubmitting(false);
        return;
      }

      // Validate funding amount
      const amount = parseFloat(formData.fundingAmount);
      if (isNaN(amount) || amount <= 0) {
        toast({
          title: "Invalid Amount",
          description: "Please enter a valid funding amount",
          variant: "destructive"
        });
        setIsSubmitting(false);
        return;
      }

      // Add logging for debugging
      console.log("[LoanApplicationForm] Submitting application:", {
        ...formData,
        merchantId,
        phone: cleanPhone,
        amount,
        timestamp: new Date().toISOString()
      });

      const response = await fetch('/api/contracts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          merchantId,
          customerDetails: {
            ...formData,
            phone: cleanPhone
          },
          amount,
          term: 12, // Default term
          interestRate: 24.99, // Fixed interest rate
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to create contract');
      }

      const contract = await response.json();
      setContractId(contract.id);
      setShowBankLink(true);

    } catch (error) {
      console.error('Error creating contract:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to submit application",
        variant: "destructive"
      });
      setIsSubmitting(false);
    }
  };

  const handleBankLinkSuccess = () => {
    // Clear form after successful payment
    setFormData({
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      dateOfBirth: '',
      streetAddress: '',
      aptNumber: '',
      city: '',
      state: '',
      zipCode: '',
      program: '',
      fundingAmount: '',
      salesRepEmail: ''
    });

    setShowBankLink(false);
    toast({
      title: "Success",
      description: "Application and payment completed successfully",
    });
    onSuccess?.();
  };

  if (showBankLink && contractId) {
    return (
      <BankLinkDialog
        contractId={contractId}
        amount={parseFloat(formData.fundingAmount) * 0.05} // 5% down payment
        onSuccess={handleBankLinkSuccess}
        isOpen={showBankLink}
        onOpenChange={setShowBankLink}
      />
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Client First Name</Label>
          <Input 
            value={formData.firstName}
            onChange={e => setFormData({...formData, firstName: e.target.value})}
            required
          />
        </div>
        <div>
          <Label>Client Last Name</Label>
          <Input 
            value={formData.lastName}
            onChange={e => setFormData({...formData, lastName: e.target.value})}
            required
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Client Email</Label>
          <Input 
            type="email"
            value={formData.email}
            onChange={e => setFormData({...formData, email: e.target.value})}
            required
          />
        </div>
        <div>
          <Label>Client Phone (US only)</Label>
          <Input 
            type="tel"
            placeholder="(555) 000-0000"
            value={formData.phone}
            onChange={e => {
              // Clean the phone number to only digits
              let phone = e.target.value.replace(/\D/g, '');
              // Remove leading 1 if present
              phone = phone.replace(/^1/, '');
              // Only take first 10 digits
              phone = phone.slice(0, 10);

              // Format for display as (XXX) XXX-XXXX
              let formattedPhone = phone;
              if (phone.length >= 6) {
                formattedPhone = `(${phone.slice(0,3)}) ${phone.slice(3,6)}-${phone.slice(6)}`;
              } else if (phone.length >= 3) {
                formattedPhone = `(${phone.slice(0,3)}) ${phone.slice(3)}`;
              } else if (phone.length > 0) {
                formattedPhone = `(${phone}`;
              }

              setFormData({...formData, phone: formattedPhone});
            }}
            maxLength={14}
            required
          />
        </div>
      </div>

      <div>
        <Label>Date of Birth</Label>
        <Input 
          type="date"
          value={formData.dateOfBirth}
          onChange={e => setFormData({...formData, dateOfBirth: e.target.value})}
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Street Address</Label>
          <Input 
            value={formData.streetAddress}
            onChange={e => setFormData({...formData, streetAddress: e.target.value})}
            required
          />
        </div>
        <div>
          <Label>APT/STE #</Label>
          <Input 
            value={formData.aptNumber}
            onChange={e => setFormData({...formData, aptNumber: e.target.value})}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <Label>City</Label>
          <Input 
            value={formData.city}
            onChange={e => setFormData({...formData, city: e.target.value})}
            required
          />
        </div>
        <div>
          <Label>State</Label>
          <Input 
            value={formData.state}
            onChange={e => setFormData({...formData, state: e.target.value})}
            required
          />
        </div>
        <div>
          <Label>ZIP Code</Label>
          <Input 
            value={formData.zipCode}
            onChange={e => setFormData({...formData, zipCode: e.target.value})}
            required
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Program</Label>
          <Input 
            value={formData.program}
            onChange={e => setFormData({...formData, program: e.target.value})}
            required
          />
        </div>
        <div>
          <Label>Funding Amount Needed</Label>
          <Input 
            type="number"
            min="0"
            step="0.01"
            value={formData.fundingAmount}
            onChange={e => setFormData({...formData, fundingAmount: e.target.value})}
            required
          />
        </div>
      </div>

      <div>
        <Label>Sales Rep Email</Label>
        <Input 
          type="email"
          value={formData.salesRepEmail}
          onChange={e => setFormData({...formData, salesRepEmail: e.target.value})}
          required
        />
      </div>

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? "Submitting..." : "Submit Application"}
      </Button>
    </form>
  );
}