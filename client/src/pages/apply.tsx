import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { KycVerificationModal } from "../components/kyc/verification-modal";
import { Button } from "@/components/ui/button";

export default function Apply() {
  const [searchParams] = useSearchParams();
  const [started, setStarted] = useState(false);
  const [kycCompleted, setKycCompleted] = useState(false);
  const [verification, setVerification] = useState(false);
  const userId = localStorage.getItem('temp_user_id');

  useEffect(() => {
    const phoneNumber = searchParams.get('phone');
    const isVerification = searchParams.get('verification') === 'true';
    const fromLogin = searchParams.get('from') === 'login';

    console.log('[Apply] URL parameters:', { 
      phoneNumber, 
      isVerification, 
      fromLogin,
      userId 
    });

    if (phoneNumber) {
      // Auto-fill phone number if provided in URL
      const loginUrl = `/auth/customer-login?phone=${phoneNumber}`;
      window.location.href = loginUrl;
    } else if (fromLogin || isVerification) {
      // Start verification if coming from login or verification flag is set
      setVerification(true);
    }
  }, [searchParams]);

  useEffect(() => {
    const checkKycStatus = async () => {
      if (!userId) {
        console.error('[Apply] No user ID found');
        return;
      }

      const isMobile = /iPhone|iPad|iPod|Android|Mobile|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      console.log('[Apply] Checking KYC status:', { userId, isMobile });

      try {
        const response = await fetch(`/api/kyc/status?userId=${userId}&platform=${isMobile ? 'mobile' : 'web'}`);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        console.log('[Apply] KYC status response:', data);

        if (!data.status || data.status === 'not_started' || data.status === 'pending') {
          setStarted(true);
          // Auto-start verification if needed
          const autoStartResponse = await fetch(`/api/kyc/auto-start?userId=${userId}`);
          const autoStartData = await autoStartResponse.json();

          if (autoStartData.redirectUrl) {
            console.log('[Apply] Redirecting to verification:', autoStartData.redirectUrl);
            window.location.href = autoStartData.redirectUrl;
          }
        } else if (data.status === 'Approved') {
          setKycCompleted(true);
        }
      } catch (error) {
        console.error('[Apply] Error checking/starting KYC:', error);
      }
    };

    if (verification && userId) {
      console.log('[Apply] Starting KYC verification check');
      checkKycStatus();
    }
  }, [userId, verification]);

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-4">Loan Application</h1>
      {verification && !kycCompleted && userId && (
        <KycVerificationModal
          isOpen={true}
          onClose={() => setKycCompleted(true)}
          onVerificationComplete={() => setKycCompleted(true)}
        />
      )}
    </div>
  );
}