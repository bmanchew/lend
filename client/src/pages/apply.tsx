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
  const [isCheckingKyc, setIsCheckingKyc] = useState(false);
  const [kycError, setKycError] = useState<string | null>(null);

  useEffect(() => {
    if (!showVerification || !userId) return;

    const checkKycStatus = async () => {
      setIsCheckingKyc(true);
      setKycError(null);
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
        const errorMsg = 'Unable to check verification status. Please try again.';
        setKycError(errorMsg);
        toast({
          title: "Verification Error",
          description: errorMsg,
          variant: "destructive",
        });
      } finally {
        setIsCheckingKyc(false);
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

  if (isCheckingKyc) {
    return (
      <div className="container mx-auto px-4 py-8 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-4"></div>
          <p>Checking verification status...</p>
        </div>
      </div>
    );
  }

  if (kycError) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="bg-red-50 border border-red-200 rounded p-4 text-center">
          <h2 className="text-red-800 font-semibold mb-2">Verification Error</h2>
          <p className="text-red-600">{kycError}</p>
          <Button onClick={() => window.location.reload()} className="mt-4">
            Try Again
          </Button>
        </div>
      </div>
    );
  }

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