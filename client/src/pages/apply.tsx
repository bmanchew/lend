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
      if (!userId) {
        console.error('No user ID found');
        return;
      }

      const isMobile = /iPhone|iPad|iPod|Android|Mobile|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

      try {
        const response = await fetch(`/api/kyc/status?userId=${userId}&platform=${isMobile ? 'mobile' : 'web'}`);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();

        if (!data.status || data.status === 'not_started' || data.status === 'pending') {
          setStarted(true);
          // Auto-start verification if needed
          const autoStartResponse = await fetch(`/api/kyc/auto-start?userId=${userId}`);
          const autoStartData = await autoStartResponse.json();

          if (autoStartData.redirectUrl) {
            window.location.href = autoStartData.redirectUrl;
          }
        } else if (data.status === 'Approved') {
          setKycCompleted(true);
        }
      } catch (error) {
        console.error('Error checking/starting KYC:', error);
      }
    };

    if (verification) {
      checkKycStatus();
    }
  }, [userId, verification]);


  useEffect(() => {
    setStarted(true);
  }, []);

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-4">Loan Application</h1>
      {
        <KycVerificationModal
          isOpen={!kycCompleted && !!userId}
          onClose={() => setKycCompleted(true)}
          onVerificationComplete={() => setKycCompleted(true)}
        />
      }
    </div>
  );
}