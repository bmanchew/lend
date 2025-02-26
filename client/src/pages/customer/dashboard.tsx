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
import { queryClient } from "@/lib/queryClient";

export default function CustomerDashboard() {
  const [showBankLink, setShowBankLink] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  const [showKycModal, setShowKycModal] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [kycChecked, setKycChecked] = useState(false);

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

  // Refresh current user KYC status
  const { data: currentKycStatus } = useQuery({
    queryKey: ["/api/kyc/status", user?.id, refreshTrigger],
    queryFn: async () => {
      if (!user?.id) return null;
      const response = await fetch(`/api/kyc/status?userId=${user.id}`);
      if (!response.ok) throw new Error("Failed to fetch KYC status");
      return response.json();
    },
    enabled: !!user?.id,
  });
  
  // Function to manually check KYC status
  const checkKycStatus = async () => {
    if (!user?.id || kycChecked) return;
    
    try {
      console.log("[CustomerDashboard] Checking KYC status manually");
      
      // Fetch the latest KYC status
      const response = await fetch(`/api/kyc/status?userId=${user.id}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to check KYC status');
      }
      
      const data = await response.json();
      console.log("[CustomerDashboard] KYC status check result:", data);
      
      // If the status is verified but we don't have any contract offers
      if ((data.status === 'verified' || data.verified === true) && 
          (!contracts || contracts.length === 0)) {
        console.log("[CustomerDashboard] User is verified but has no contract offers, creating one");
        await createDefaultContractOffer();
      }
      
      // Mark that we've checked the KYC status
      setKycChecked(true);
      
      // Force a refresh of the data
      setRefreshTrigger(prev => prev + 1);
      
      return data;
    } catch (error) {
      console.error("[CustomerDashboard] Error checking KYC status:", error);
      return null;
    }
  };
  
  // Check KYC status when component mounts or when user changes
  useEffect(() => {
    if (user?.id && !kycChecked) {
      checkKycStatus();
    }
  }, [user?.id, kycChecked, contracts]);

  // Fetch user's contracts
  const { data: contracts, refetch: refetchContracts } = useQuery<SelectContract[]>({
    queryKey: [`/api/customers/${user?.id}/contracts`, refreshTrigger],
    enabled: !!user?.id,
  });

  const hasActiveContract = contracts?.some((c) => c.status === "active");
  
  // Function to create a default contract offer if none exists
  const createDefaultContractOffer = async () => {
    if (!user?.id) return;
    
    try {
      // Use apiRequest from queryClient to handle auth headers
      const response = await fetch('/api/contracts/create-offer', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({
          customerId: user.id,
          amount: 5000, // Default amount
          term: 36, // 36 months
          interestRate: 24.99,
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to create contract offer');
      }
      
      // Refresh contracts data
      refetchContracts();
      console.log("[Dashboard] Contract offer created successfully");
      
      // Add a small delay before showing toast to ensure UI is updated
      setTimeout(() => {
        toast({
          title: "Loan offer created",
          description: "A new loan offer is now available for you",
        });
      }, 500);
    } catch (error) {
      console.error("[Dashboard] Error creating contract offer:", error);
      toast({
        title: "Error",
        description: "Unable to create loan offer. Please try again later.",
        variant: "destructive",
      });
    }
  };
  
  // Check if we need to show the loan offer
  const showLoanOffer = () => {
    // User has verified KYC status - check multiple possibilities for verification status
    const isVerified = 
      user?.kycStatus?.toLowerCase() === KycStatus.VERIFIED.toLowerCase() || 
      currentKycStatus?.status?.toLowerCase() === "verified" || 
      currentKycStatus?.verified === true;
    
    // Has at least one contract (that's not active) to show as an offer
    const hasContractOffer = contracts && contracts.length > 0 && !hasActiveContract;
    
    const shouldShowOffer = isVerified && !hasActiveContract;
    
    console.log("[CustomerDashboard] Loan offer visibility check:", {
      isVerified,
      hasActiveContract,
      hasContractOffer,
      userKycStatus: user?.kycStatus,
      currentKycStatus: currentKycStatus?.status,
      currentKycVerified: currentKycStatus?.verified,
      contractsCount: contracts?.length,
      shouldShowOffer
    });
    
    return shouldShowOffer;
  };

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
            // Refresh data when verification is complete
            setRefreshTrigger(prev => prev + 1);
            // Create a default contract offer if none exists yet
            if (!contracts || contracts.length === 0) {
              createDefaultContractOffer();
            }
          }}
        />

        {(user?.kycStatus === KycStatus.PENDING || currentKycStatus?.status === "pending") && (
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

        {showLoanOffer() && (
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
