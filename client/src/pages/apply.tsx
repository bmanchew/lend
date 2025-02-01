import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { KycVerificationModal } from "../components/kyc/verification-modal";
import { Button } from "@/components/ui/button";

export default function Apply() {
  const [searchParams] = useSearchParams();
  const [started, setStarted] = useState(false);
  const [kycCompleted, setKycCompleted] = useState(false);
  const userId = localStorage.getItem('temp_user_id');

  useEffect(() => {
    const isVerification = searchParams.get('verification') === 'true';
    if (isVerification) {
      setStarted(true);
    }
  }, [searchParams]);

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