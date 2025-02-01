import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { KycVerificationModal } from "../components/kyc/verification-modal";
import { Button } from "@/components/ui/button";

export default function Apply() {
  const [searchParams] = useSearchParams();
  const [started, setStarted] = useState(false);
  const [kycCompleted, setKycCompleted] = useState(false);
  const [verification, setVerification] = useState(false); // Added state for verification status
  const userId = localStorage.getItem('temp_user_id');

  useEffect(() => {
    const phoneNumber = searchParams.get('phone');
    if (phoneNumber) {
      // Auto-fill phone number if provided in URL
      const loginUrl = `/auth/customer-login?phone=${phoneNumber}`;
      window.location.href = loginUrl;
    } else {
        const isVerification = searchParams.get('verification') === 'true';
        if (isVerification) {
          setVerification(true); // Set verification status
        }
    }
  }, [searchParams]);

  useEffect(() => {
    const checkKycStatus = async () => {
      if (!userId) return;
      
      try {
        const response = await fetch(`/api/kyc/status?userId=${userId}`);
        const data = await response.json();
        
        if (!data.status || data.status === 'not_started' || data.status === 'pending') {
          setStarted(true);
        } else if (data.status === 'Approved') {
          setKycCompleted(true);
        }
      } catch (error) {
        console.error('Error checking KYC status:', error);
      }
    };

    checkKycStatus();
  }, [userId]);


  const handleStart = () => {
    setStarted(true);
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
          isOpen={!kycCompleted && !!userId}
          onClose={() => setKycCompleted(true)}
          onVerificationComplete={() => setKycCompleted(true)}
        />
      )}
    </div>
  );
}