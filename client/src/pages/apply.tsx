
import { useState, useEffect } from 'react';
import { useRoute } from 'wouter';
import { VerificationModal } from '@/components/kyc/verification-modal';
import { Button } from '@/components/ui/button';

export default function ApplyPage() {
  const [_, params] = useRoute('/apply/:token');
  const [started, setStarted] = useState(false);
  const [kycCompleted, setKycCompleted] = useState(false);

  const handleStart = async () => {
    try {
      const response = await fetch(`/api/apply/${params.token}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          firstName: '',  // These will be collected during KYC
          lastName: '',
          email: '',
          phone: ''
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to create account');
      }
      
      const data = await response.json();
      setStarted(true);
    } catch (error) {
      console.error('Error starting application:', error);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-4">Loan Application</h1>
      
      {!started ? (
        <div className="text-center">
          <Button onClick={handleStart}>Get Started</Button>
        </div>
      ) : (
        <VerificationModal
          isOpen={!kycCompleted}
          onComplete={() => setKycCompleted(true)}
          onOpenChange={(open) => !open && setKycCompleted(true)}
        />
      )}
    </div>
  );
}
