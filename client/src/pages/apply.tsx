import { useState, useEffect } from "react";
import { useLocation, useRoute } from "wouter";
import { KycVerificationModal } from "../components/kyc/verification-modal";
import { Button } from "@/components/ui/button";

export default function Apply() {
  const [location] = useLocation();
  // Support both token and phone number routes
  const [, params] = useRoute("/apply/:identifier");
  const searchParams = new URLSearchParams(window.location.search);
  const [started, setStarted] = useState(false);
  const [kycCompleted, setKycCompleted] = useState(false);
  const [showVerification, setShowVerification] = useState(false);
  const userId = localStorage.getItem('temp_user_id');

  useEffect(() => {
    const identifier = params?.identifier;
    const isVerification = searchParams.get('verification') === 'true';
    const fromLogin = searchParams.get('from') === 'login';

    console.log('[Apply] Page loaded with params:', {
      identifier,
      isVerification,
      fromLogin,
      userId,
      currentUrl: window.location.href
    });

    // Handle phone number route
    if (identifier && !isVerification && !fromLogin) {
      const phoneNumber = decodeURIComponent(identifier);
      if (phoneNumber.match(/^\+?[\d-]+$/)) {
        const loginUrl = `/auth/customer-login?phone=${encodeURIComponent(phoneNumber)}`;
        console.log('[Apply] Redirecting to login:', loginUrl);
        window.location.href = loginUrl;
        return;
      }
    }

    // Handle verification flow
    if (userId && (fromLogin || isVerification)) {
      console.log('[Apply] Starting verification for user:', userId);
      setShowVerification(true);
    }
  }, [params, searchParams, userId]);

  // KYC status check
  useEffect(() => {
    if (!showVerification || !userId) return;

    const checkKycStatus = async () => {
      console.log('[Apply] Checking KYC status for user:', userId);

      try {
        const response = await fetch(`/api/kyc/status?userId=${userId}`);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        console.log('[Apply] KYC status response:', data);

        if (data.status === 'Approved') {
          console.log('[Apply] User already verified');
          setKycCompleted(true);
        } else {
          console.log('[Apply] Starting verification process');
          setStarted(true);
        }
      } catch (error) {
        console.error('[Apply] Error checking KYC status:', error);
      }
    };

    checkKycStatus();
  }, [showVerification, userId]);

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-4">Loan Application</h1>
      {showVerification && !kycCompleted && userId && (
        <KycVerificationModal
          isOpen={true}
          onClose={() => setKycCompleted(true)}
          onVerificationComplete={() => setKycCompleted(true)}
        />
      )}
    </div>
  );
}