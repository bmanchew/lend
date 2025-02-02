
import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

export function LoanApplicationForm({ merchantId, onSuccess }: { merchantId: number, onSuccess?: () => void }) {
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
    try {
      const response = await fetch('/api/contracts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          merchantId,
          customerDetails: formData,
          amount: parseFloat(formData.fundingAmount),
          term: 12, // Default term
          interestRate: 24.99, // Fixed interest rate
        }),
      });
      
      if (response.ok) {
        onSuccess?.();
      }
    } catch (error) {
      console.error('Error creating contract:', error);
    }
  };

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
              
              // Store raw digits for submission
              const rawPhone = phone;
              
              // Format for display as (XXX) XXX-XXXX
              if (phone.length >= 6) {
                phone = `(${phone.slice(0,3)}) ${phone.slice(3,6)}-${phone.slice(6)}`;
              } else if (phone.length >= 3) {
                phone = `(${phone.slice(0,3)}) ${phone.slice(3)}`;
              } else if (phone.length > 0) {
                phone = `(${phone}`;
              }
              
              // Store both formatted display value and raw digits
              setFormData({...formData, phone, rawPhone});
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

      <Button type="submit" className="w-full">Submit Application</Button>
    </form>
  );
}
