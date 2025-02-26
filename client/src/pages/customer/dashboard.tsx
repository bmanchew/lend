import { useAuth } from "@/hooks/use-auth";
import PortalLayout from "@/components/layout/portal-layout";
import { KycVerificationModal } from "@/components/kyc/verification-modal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useState, useEffect } from "react";
import { BankLinkDialog } from "@/components/plaid/bank-link-dialog";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { SelectContract, KycStatus } from "@db/schema";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DebitCardForm } from "@/components/payment/debit-card-form";

export default function CustomerDashboard() {
  const [showBankLink, setShowBankLink] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  const [showKycModal, setShowKycModal] = useState(false);

  // Check if KYC is needed on first load
  useEffect(() => {
    if (user && user.role === "customer") {
      console.log("[CustomerDashboard] User KYC status:", user.kycStatus);

      // Only show verification if:
      // - No status exists
      // - Status is initial or failed
      // - Don't include pending as this will create a loop for users waiting for verification
      const needsKyc =
        !user.kycStatus ||
        user.kycStatus === KycStatus.INITIAL ||
        user.kycStatus === KycStatus.FAILED;

      console.log("[CustomerDashboard] Needs KYC verification:", needsKyc);

      if (needsKyc) {
        setShowKycModal(true);
      }
    }
  }, [user]);

  const { data: contracts } = useQuery<SelectContract[]>({
    queryKey: [`/api/customers/${user?.id}/contracts`],
  });

  const hasActiveContract = contracts?.some((c) => c.status === "active");

  return (
    <PortalLayout>
      <div className="space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">
          Welcome back, {user?.name}
        </h1>

        <KycVerificationModal
          isOpen={showKycModal}
          onClose={() => setShowKycModal(false)}
          onVerificationComplete={() => {
            setShowKycModal(false);
            // If you've added refetchUser to your auth context
            // you can refresh user data here
            // refetchUser?.();
          }}
        />

        {user?.kycStatus === KycStatus.PENDING && (
          <Card className="bg-yellow-50 border-yellow-200">
            <CardHeader>
              <CardTitle className="text-yellow-800">
                Verification in Progress
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-yellow-700">
                Your identity verification is being processed. This usually
                takes 1-2 business days.
              </p>
            </CardContent>
          </Card>
        )}

        {!hasActiveContract && user?.kycStatus === KycStatus.VERIFIED && (
          <Card>
            <CardHeader>
              <CardTitle>Loan Offer</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="max-w-xl mx-auto">
                <Card className="border-2 hover:border-primary">
                  <CardHeader>
                    <CardTitle>Personal Loan Terms</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-muted-foreground">
                          Loan Amount
                        </p>
                        <p className="text-2xl font-bold">
                          ${contracts?.[0]?.amount?.toString() || "0.00"}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">
                          Term Length
                        </p>
                        <p className="text-2xl font-bold">36 Months</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">
                          Interest Rate
                        </p>
                        <p className="text-2xl font-bold">24.99% APR</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">
                          Down Payment
                        </p>
                        <p className="text-2xl font-bold">5%</p>
                      </div>
                    </div>
                    <Button
                      className="w-full mt-6"
                      onClick={() => {
                        if (contracts?.[0]?.id) {
                          setShowBankLink(true);
                        }
                      }}
                    >
                      Accept Offer
                    </Button>
                    <BankLinkDialog
                      contractId={contracts?.[0]?.id ?? 0}
                      amount={Number(contracts?.[0]?.amount ?? 0) * 0.05}
                      isOpen={showBankLink}
                      onOpenChange={setShowBankLink}
                      onSuccess={() => {
                        toast({
                          title: "Success",
                          description:
                            "Bank account linked and payment processed successfully",
                        });
                        window.location.reload();
                      }}
                    />
                  </CardContent>
                </Card>
              </div>
            </CardContent>
          </Card>
        )}

        {hasActiveContract && (
          <>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <Card>
                <CardHeader>
                  <CardTitle>Active Loans</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">
                    {contracts?.filter((c) => c.status === "active").length ??
                      0}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Next Payment</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">$0.00</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Credit Score</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">Not Available</p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Recent Activity</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {contracts?.map((contract) => (
                    <div
                      key={contract.id}
                      className="flex items-center justify-between p-2 border rounded"
                    >
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
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </PortalLayout>
  );
}
