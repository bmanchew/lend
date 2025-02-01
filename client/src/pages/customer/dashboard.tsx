import { useAuth } from "@/hooks/use-auth";
import PortalLayout from "@/components/layout/portal-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import type { SelectContract } from "@db/schema";
import { KycVerificationModal } from "@/components/kyc/verification-modal";
import { useState, useEffect } from "react";

export default function CustomerDashboard() {
  const { user } = useAuth();
  const [showKycModal, setShowKycModal] = useState(false);

  // Check if KYC is needed on first load
  useEffect(() => {
    console.log('[Dashboard] Checking KYC status:', {
      userId: user?.id,
      role: user?.role,
      kycStatus: user?.kycStatus
    });
    
    if (user && user.role === 'customer') {
      const needsKyc = !user.kycStatus || 
                      user.kycStatus === 'initial' || 
                      user.kycStatus === 'failed' ||
                      user.kycStatus === 'pending';
      
      if (needsKyc) {
        console.log('[Dashboard] Opening KYC modal:', { userId: user.id, status: user.kycStatus });
        setShowKycModal(true);
      }
    }
  }, [user]);

  const { data: contracts } = useQuery<SelectContract[]>({
    queryKey: [`/api/customers/${user?.id}/contracts`],
  });

  return (
    <PortalLayout>
      <div className="space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">Welcome back, {user?.name}</h1>

        {/* KYC Verification Modal */}
        <KycVerificationModal 
          isOpen={showKycModal} 
          onClose={() => setShowKycModal(false)} 
        />

        {/* Show verification status if pending */}
        {user?.kycStatus === 'pending' && (
          <Card className="bg-yellow-50 border-yellow-200">
            <CardHeader>
              <CardTitle className="text-yellow-800">Verification in Progress</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-yellow-700">
                Your identity verification is being processed. This usually takes 1-2 business days.
              </p>
            </CardContent>
          </Card>
        )}

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>Active Loans</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">
                {contracts?.filter(c => c.status === "active").length ?? 0}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Next Payment</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">
                {/* Add next payment logic */}
                $0.00
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Credit Score</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">
                {/* Add credit score integration */}
                Not Available
              </p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {contracts?.map(contract => (
                <div key={contract.id} className="flex items-center justify-between p-2 border rounded">
                  <div>
                    <p className="font-medium">Loan #{contract.id}</p>
                    <p className="text-sm text-muted-foreground">
                      Amount: ${contract.amount}
                    </p>
                  </div>
                  <Button variant="outline" size="sm">
                    View Details
                  </Button>
                </div>
              ))}
              {!contracts?.length && (
                <p className="text-muted-foreground">No active loans</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </PortalLayout>
  );
}