import { useState, useEffect } from 'react';
import { useRoute } from 'wouter';
import { KycVerificationModal } from '@/components/kyc/verification-modal';
import { Button } from '@/components/ui/button';
console.log("[Apply Page] Loading with URL params:", window.location.search);

export default function ApplyPage() {
  const [_, params] = useRoute('/apply/:token');
  const [started, setStarted] = useState(false);
  const [kycCompleted, setKycCompleted] = useState(false);

  const handleStart = async () => {
    try {
      console.log('[Apply Page] Starting application with token:', params.token);
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
      console.log('[Apply Page] Server response:', data);

      if (!data.userId) {
        throw new Error('No user ID returned from server');
      }

      setStarted(true);

      if (data.redirectUrl) {
        // Store user ID before redirect
        localStorage.setItem('temp_user_id', data.userId.toString());
        window.location.href = data.redirectUrl;
      }
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
        <KycVerificationModal
          isOpen={!kycCompleted}
          onClose={() => setKycCompleted(true)}
          onVerificationComplete={() => setKycCompleted(true)}
        />
      )}
    </div>
  );
}