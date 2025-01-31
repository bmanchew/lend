import { VerificationSessions } from "@/components/kyc/verification-sessions";
import PortalLayout from "@/components/layout/portal-layout";

export default function KycVerificationsPage() {
  return (
    <PortalLayout>
      <div className="container mx-auto py-6">
        <VerificationSessions />
      </div>
    </PortalLayout>
  );
}