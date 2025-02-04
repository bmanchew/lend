/**
 * Loan Application Page Component
 * 
 * Manages the loan application process including KYC verification:
 * - Handles verification flow initiation
 * - Processes URL parameters for mobile deep linking
 * - Manages verification state and completion
 * - Integrates with KYC verification modal
 */

import { useState, useEffect } from "react";
import { useLocation, useRoute } from "wouter";
import { KycVerificationModal } from "../components/kyc/verification-modal";
import { Button } from "@/components/ui/button";

export default function Apply() {
  const [location] = useLocation();
  const [, params] = useRoute("/apply/:token");
  const searchParams = new URLSearchParams(window.location.search);
  const [started, setStarted] = useState(false);
  const [kycCompleted, setKycCompleted] = useState(false);
  const [showVerification, setShowVerification] = useState(false);
  const userId = localStorage.getItem('temp_user_id');

  useEffect(() => {
    // Parse and handle URL parameters
    const phoneNumber = searchParams.get('phone');
    const isVerification = searchParams.get('verification') === 'true';
    const fromLogin = searchParams.get('from') === 'login';

    console.log('[Apply] Page loaded with params:', { 
      phoneNumber, 
      isVerification, 
      fromLogin,
      userId,
      currentUrl: window.location.href 
    });

    // Handle different entry points
    if (phoneNumber) {
      // Redirect to login if phone number provided
      const loginUrl = `/auth/customer-login?phone=${phoneNumber}`;
      console.log('[Apply] Redirecting to login:', loginUrl);
      window.location.href = loginUrl;
    } else if (userId && (fromLogin || isVerification)) {
      // Auto-start verification for authenticated users
      console.log('[Apply] Auto-starting verification for user:', userId);
      setShowVerification(true);
    }
  }, [searchParams, userId]);

  // Check KYC status on component mount or verification start
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