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
import { LoanApplicationForm } from "../components/merchant/loan-application-form";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";

export default function Apply() {
  const [location] = useLocation();
  const [, params] = useRoute("/apply/:identifier");
  const { toast } = useToast();
  const searchParams = new URLSearchParams(window.location.search);
  const [started, setStarted] = useState(false);
  const [kycCompleted, setKycCompleted] = useState(false);
  const [showVerification, setShowVerification] = useState(false);
  const [applicationSubmitted, setApplicationSubmitted] = useState(false);
  const userId = localStorage.getItem('temp_user_id');

  useEffect(() => {
<<<<<<< HEAD
    const identifier = params?.identifier;
=======
    // Parse and handle URL parameters
    const phoneNumber = searchParams.get('phone');
>>>>>>> 5f3313f344debc3d201818f060b5e618febf5116
    const isVerification = searchParams.get('verification') === 'true';
    const fromLogin = searchParams.get('from') === 'login';

    console.log('[Apply] Page loaded with params:', {
      identifier,
      isVerification,
      fromLogin,
      userId,
      currentUrl: window.location.href
    });

<<<<<<< HEAD
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
=======
    // Handle different entry points
    if (phoneNumber) {
      // Redirect to login if phone number provided
      const loginUrl = `/auth/customer-login?phone=${phoneNumber}`;
      console.log('[Apply] Redirecting to login:', loginUrl);
      window.location.href = loginUrl;
    } else if (userId && (fromLogin || isVerification)) {
      // Auto-start verification for authenticated users
      console.log('[Apply] Auto-starting verification for user:', userId);
>>>>>>> 5f3313f344debc3d201818f060b5e618febf5116
      setShowVerification(true);
    }
  }, [params, searchParams, userId]);

<<<<<<< HEAD
  // KYC status check
=======
  // Check KYC status on component mount or verification start
>>>>>>> 5f3313f344debc3d201818f060b5e618febf5116
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
          toast({
            title: "Verification Completed",
            description: "You can now proceed with your loan application.",
          });
        } else {
          console.log('[Apply] Starting verification process');
          setStarted(true);
        }
      } catch (error) {
        console.error('[Apply] Error checking KYC status:', error);
        toast({
          title: "Verification Error",
          description: "Unable to check verification status. Please try again.",
          variant: "destructive",
        });
      }
    };

    checkKycStatus();
  }, [showVerification, userId, toast]);

  const handleApplicationSuccess = () => {
    setApplicationSubmitted(true);
    toast({
      title: "Application Submitted",
      description: "Your loan application has been submitted successfully.",
    });
  };

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

      {kycCompleted && !applicationSubmitted && (
        <div className="mt-4">
          <LoanApplicationForm
            merchantId={parseInt(searchParams.get('merchantId') || '0')}
            onSuccess={handleApplicationSuccess}
          />
        </div>
      )}

      {applicationSubmitted && (
        <div className="mt-8 text-center">
          <h2 className="text-xl font-semibold text-green-600 mb-4">
            Application Submitted Successfully
          </h2>
          <p className="text-gray-600 mb-4">
            Thank you for submitting your loan application. We will review your application
            and contact you soon with the next steps.
          </p>
          <Button onClick={() => window.location.href = '/'}>
            Return to Home
          </Button>
        </div>
      )}
    </div>
  );
}