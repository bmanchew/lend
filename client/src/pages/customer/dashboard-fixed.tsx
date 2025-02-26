import { useAuth } from "@/hooks/use-auth";
import PortalLayout from "@/components/layout/portal-layout";
import { KycVerificationModal } from "@/components/kyc/verification-modal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useState, useEffect } from "react";
import { BankLinkDialog } from "@/components/plaid/bank-link-dialog";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { SelectContract, ContractStatus, KycStatus } from "@db/schema";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DebitCardForm } from "@/components/payment/debit-card-form";
import { apiRequest } from "@/lib/queryClient";

export default function CustomerDashboard() {
  const [showBankLink, setShowBankLink] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  const [showKycModal, setShowKycModal] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const queryClient = useQueryClient();

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
      } else {
        // Check if we need to create a contract offer for user that just logged in
        checkAndCreateContractOffer();
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
  
  // Fetch user's contracts
  const { data: contracts, refetch: refetchContracts } = useQuery<SelectContract[]>({
    queryKey: [`/api/contracts/customer`, refreshTrigger],
    enabled: !!user?.id,
  });

  const hasActiveContract = contracts?.some((c) => c.status === ContractStatus.ACTIVE);
  const hasPendingContract = contracts?.some((c) => c.status === ContractStatus.PENDING);
  
  // Function to check KYC status and create a contract offer if needed
  const checkAndCreateContractOffer = async () => {
    if (!user?.id) return;
    
    try {
      console.log("[CustomerDashboard] Checking if contract offer needed");
      
      // Force refresh contracts data to ensure we have the latest
      await refetchContracts();
      
      // Check if the user already has contracts
      if (contracts && contracts.length > 0) {
        console.log("[CustomerDashboard] User already has contracts:", contracts.length);
        return;
      }
      
      // Check KYC status to see if user is verified
      // Cover all possible variations of "verified" status
      const isVerified = 
        user?.kycStatus?.toLowerCase() === KycStatus.VERIFIED.toLowerCase() || 
        user?.kycStatus?.toLowerCase() === "verified" ||
        user?.kycStatus?.toLowerCase() === "confirmed" ||
        user?.kycStatus?.toLowerCase() === "approved" ||
        currentKycStatus?.status?.toLowerCase() === "verified" || 
        currentKycStatus?.status?.toLowerCase() === "confirmed" ||
        currentKycStatus?.status?.toLowerCase() === "approved" ||
        currentKycStatus?.verified === true;
      
      if (!isVerified) {
        console.log("[CustomerDashboard] User is not verified yet, not creating contract offer:", { 
          userKycStatus: user?.kycStatus,
          currentKycStatus: currentKycStatus?.status
        });
        return;
      }
      
      console.log("[CustomerDashboard] Creating default contract offer for verified user");
      const result = await createDefaultContractOffer();
      
      if (result) {
        toast({
          title: "Welcome to ShiFi",
          description: "Based on your verification, we've prepared a personalized loan offer for you.",
        });
      }
    } catch (error) {
      console.error("[CustomerDashboard] Error in checkAndCreateContractOffer:", error);
      toast({
        title: "Error",
        description: "There was a problem loading your offers. Please try again later.",
        variant: "destructive",
      });
    }
  };
  
  // Function to create a default contract offer if none exists
  const createDefaultContractOffer = async () => {
    if (!user?.id) return;
    
    try {
      const response = await apiRequest('/api/contracts/create-offer', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          customerId: user.id,
          amount: 5000, // Default amount
          term: 36, // 36 months
          interestRate: 24.99,
        }),
      });
      
      // Refresh contracts data
      await queryClient.invalidateQueries({ queryKey: [`/api/contracts/customer`] });
      console.log("[Dashboard] Contract offer created successfully");
      
      toast({
        title: "Loan offer created",
        description: "A new loan offer is now available for you",
      });
      
      return response;
    } catch (error) {
      console.error("[Dashboard] Error creating contract offer:", error);
      toast({
        title: "Error",
        description: "Unable to create loan offer. Please try again later.",
        variant: "destructive",
      });
      return null;
    }
  };
  
  // Check if we need to show the loan offer
  const showLoanOffer = () => {
    // User has verified KYC status - check multiple possibilities for verification status
    const isVerified = 
      user?.kycStatus?.toLowerCase() === KycStatus.VERIFIED.toLowerCase() || 
      user?.kycStatus?.toLowerCase() === "verified" ||
      user?.kycStatus?.toLowerCase() === "confirmed" ||
      user?.kycStatus?.toLowerCase() === "approved" ||
      currentKycStatus?.status?.toLowerCase() === "verified" || 
      currentKycStatus?.status?.toLowerCase() === "confirmed" ||
      currentKycStatus?.status?.toLowerCase() === "approved" ||
      currentKycStatus?.verified === true;
    
    // Has at least one contract (that's not active) to show as an offer
    // This checks for PENDING contracts, which are offers
    const hasPendingOffer = contracts?.some(c => c.status === ContractStatus.PENDING);
    const hasContractOffer = contracts && contracts.length > 0 && hasPendingOffer;
    
    const shouldShowOffer = isVerified && hasContractOffer;
    
    console.log("[CustomerDashboard] Loan offer visibility check:", {
      isVerified,
      hasActiveContract,
      hasPendingOffer,
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
          Welcome back, {user?.name || "Customer"}
        </h1>

        <KycVerificationModal
          isOpen={showKycModal}
          onClose={() => setShowKycModal(false)}
          onVerificationComplete={() => {
            setShowKycModal(false);
            // Refresh data when verification is complete
            setRefreshTrigger(prev => prev + 1);
            // Trigger contract offer creation after successful verification
            setTimeout(() => {
              createDefaultContractOffer();
            }, 1000);
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
              <div className="mt-4">
                <Button 
                  variant="outline" 
                  className="text-yellow-700 border-yellow-400 hover:bg-yellow-100"
                  onClick={() => setRefreshTrigger(prev => prev + 1)}
                >
                  Check Status
                </Button>
              </div>
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
                        <p className="text-2xl font-bold">{contracts?.[0]?.term || 36} Months</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">
                          Interest Rate
                        </p>
                        <p className="text-2xl font-bold">{contracts?.[0]?.interestRate || "24.99"}% APR</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">
                          Monthly Payment
                        </p>
                        <p className="text-2xl font-bold">${contracts?.[0]?.monthlyPayment || "199.99"}</p>
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
                        queryClient.invalidateQueries({ queryKey: [`/api/contracts/customer`] });
                        setRefreshTrigger(prev => prev + 1);
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
                    {contracts?.filter((c) => c.status === ContractStatus.ACTIVE).length ??
                      0}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Next Payment</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">
                    ${contracts?.find(c => c.status === ContractStatus.ACTIVE)?.monthlyPayment || "0.00"}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Reward Points</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">250 pts</p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Loan Details</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {contracts?.filter(c => c.status === ContractStatus.ACTIVE).map((contract) => (
                    <div
                      key={contract.id}
                      className="flex flex-col gap-4 p-4 border rounded-lg"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">Loan #{contract.contractNumber || contract.id}</p>
                          <p className="text-sm text-muted-foreground">
                            Principal: ${contract.amount}
                          </p>
                        </div>
                        <Button variant="outline" size="sm">
                          View Details
                        </Button>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                        <div>
                          <p className="text-sm text-muted-foreground">Monthly Payment</p>
                          <p className="font-medium">${contract.monthlyPayment}</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Next Due</p>
                          <p className="font-medium">Mar 15, 2025</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Remaining Term</p>
                          <p className="font-medium">{contract.term} months</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Interest Rate</p>
                          <p className="font-medium">{contract.interestRate}%</p>
                        </div>
                      </div>
                      
                      <Button className="w-full sm:w-auto">
                        Make Payment
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {!hasActiveContract && !showLoanOffer() && !showKycModal && 
         user?.kycStatus !== KycStatus.PENDING && 
         currentKycStatus?.status !== "pending" && (
          <Card className="p-8 text-center">
            <CardContent className="pt-6">
              <h3 className="text-xl font-semibold mb-4">No Active Loans</h3>
              <p className="text-muted-foreground mb-6">
                You don't have any active loans or pending offers at the moment.
              </p>
              <Button
                onClick={() => setShowKycModal(true)}
                className="mx-auto"
              >
                Apply for a Loan
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </PortalLayout>
  );
}