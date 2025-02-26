import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { KycVerificationModal } from "@/components/kyc/verification-modal";
import { RewardsDisplay } from "@/components/ui/rewards-display";
import { BankLinkDialog } from "@/components/plaid/bank-link-dialog";
import { PaymentHistory } from "@/components/payment/payment-history";
import { formatCurrency } from "@/lib/utils";
import type { SelectContract } from "@db/schema";
import { apiRequest } from "@/lib/queryClient";
import { debugLog } from "@/lib/utils";

export default function CustomerDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isKycModalOpen, setIsKycModalOpen] = useState(false);
  const [isBankModalOpen, setIsBankModalOpen] = useState(false);
  const [selectedContractId, setSelectedContractId] = useState<number | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const userId = user?.id;
  
  // KYC status check
  const { data: kycResponse } = useQuery<{success: boolean, status: string, verified: boolean}>({
    queryKey: [`/api/kyc/status`],
    enabled: !!userId,
  });
  
  const isVerified = kycResponse?.verified;
  const currentKycStatus = kycResponse?.status;
  const currentKycVerified = kycResponse?.verified;
  
  // Fetch user's contracts
  const { data: contractsResponse, refetch: refetchContracts } = useQuery<{status: string, data: any[]}>({
    queryKey: [`/api/contracts/customer`, refreshTrigger],
    enabled: !!user?.id,
  });
  
  // Extract contracts from response
  const contracts = contractsResponse?.contracts;
  
  // Debug logging
  debugLog("CustomerDashboard", "Loan offer visibility check", { isVerified, currentKycStatus, currentKycVerified });
  
  // Create additional contract sample offer
  const createSampleOffer = useMutation({
    mutationFn: async () => {
      return apiRequest("/api/contracts/create-offer", {
        method: "POST",
        body: JSON.stringify({
          customerId: userId,
          amount: 5000,
          term: 36,
          interestRate: 24.99
        })
      });
    },
    onSuccess: () => {
      toast({
        title: "Offer Created",
        description: "A new loan offer has been created for testing purposes.",
      });
      debugLog("Dashboard", "Contract offer created successfully");
      setRefreshTrigger(prev => prev + 1);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to create sample offer. Please try again.",
        variant: "destructive",
      });
    }
  });
  
  // Check if KYC is needed when the component mounts
  useEffect(() => {
    const needsKycVerification = !isVerified;
    debugLog("CustomerDashboard", "User KYC status", currentKycStatus);
    debugLog("CustomerDashboard", "Needs KYC verification", needsKycVerification);
    
    if (needsKycVerification) {
      setIsKycModalOpen(true);
    }
  }, [isVerified, currentKycStatus]);
  
  // Submit payment mutation
  const submitPayment = useMutation({
    mutationFn: async (contractId: number) => {
      return apiRequest(`/api/payments/submit`, {
        method: "POST",
        body: JSON.stringify({
          contractId,
          amount: 200,
          paymentMethod: "bank"
        })
      });
    },
    onSuccess: () => {
      toast({
        title: "Payment Submitted",
        description: "Your payment has been processed successfully.",
      });
      setRefreshTrigger(prev => prev + 1);
    },
    onError: () => {
      toast({
        title: "Payment Failed",
        description: "There was an error processing your payment. Please try again.",
        variant: "destructive",
      });
    }
  });
  
  // Accept contract mutation
  const acceptContract = useMutation({
    mutationFn: async (contractId: number) => {
      return apiRequest(`/api/contracts/${contractId}/accept`, {
        method: "POST"
      });
    },
    onSuccess: () => {
      toast({
        title: "Contract Accepted",
        description: "You have successfully accepted the loan offer.",
      });
      setRefreshTrigger(prev => prev + 1);
      setIsBankModalOpen(true);
    },
    onError: () => {
      toast({
        title: "Acceptance Failed",
        description: "There was an error accepting your loan offer. Please try again.",
        variant: "destructive",
      });
    }
  });
  
  // Decline contract mutation
  const declineContract = useMutation({
    mutationFn: async (contractId: number) => {
      return apiRequest(`/api/contracts/${contractId}/decline`, {
        method: "POST"
      });
    },
    onSuccess: () => {
      toast({
        title: "Contract Declined",
        description: "You have declined the loan offer.",
      });
      setRefreshTrigger(prev => prev + 1);
    },
    onError: () => {
      toast({
        title: "Action Failed",
        description: "There was an error declining your loan offer. Please try again.",
        variant: "destructive",
      });
    }
  });
  
  const handleVerificationComplete = () => {
    refetchContracts();
  };
  
  const handlePaymentSuccess = () => {
    setRefreshTrigger(prev => prev + 1);
  };
  
  // Group contracts by status
  const pendingOffers = contracts?.filter(contract => contract.status === "pending") || [];
  const activeContracts = contracts?.filter(contract => contract.status === "active") || [];
  const completedContracts = contracts?.filter(contract => contract.status === "completed") || [];
  
  return (
    <div className="container mx-auto p-4 max-w-7xl">
      <h1 className="text-3xl font-bold mb-6">Welcome, {user?.name || "Customer"}</h1>
      
      {/* KYC Verification Modal */}
      <KycVerificationModal 
        isOpen={isKycModalOpen} 
        onClose={() => setIsKycModalOpen(false)}
        onVerificationComplete={handleVerificationComplete}
      />
      
      {/* Bank Link Dialog */}
      {selectedContractId && (
        <BankLinkDialog 
          contractId={selectedContractId}
          amount={200} // Placeholder amount
          onSuccess={handlePaymentSuccess}
          isOpen={isBankModalOpen}
          onOpenChange={setIsBankModalOpen}
        />
      )}
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <Card>
          <CardHeader>
            <CardTitle>Loan Offers</CardTitle>
            <CardDescription>Pending offers for your review</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{pendingOffers.length}</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>Active Loans</CardTitle>
            <CardDescription>Your current active loans</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{activeContracts.length}</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>Rewards</CardTitle>
            <CardDescription>Your ShiFi rewards points</CardDescription>
          </CardHeader>
          <CardContent>
            <RewardsDisplay />
          </CardContent>
        </Card>
      </div>
      
      <Tabs defaultValue="offers" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="offers">Loan Offers</TabsTrigger>
          <TabsTrigger value="active">Active Loans</TabsTrigger>
          <TabsTrigger value="completed">Completed Loans</TabsTrigger>
        </TabsList>
        
        <TabsContent value="offers">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {pendingOffers.length > 0 ? (
              pendingOffers.map((contract) => (
                <Card key={contract.id} className="overflow-hidden">
                  <CardHeader className="bg-primary/10">
                    <CardTitle>Loan Offer #{contract.id}</CardTitle>
                    <CardDescription>From {contract.merchantId ? `Merchant #${contract.merchantId}` : 'ShiFi Direct'}</CardDescription>
                  </CardHeader>
                  <CardContent className="pt-6">
                    <div className="space-y-4">
                      <div className="flex justify-between">
                        <span className="font-medium">Amount:</span>
                        <span className="font-bold">{formatCurrency(parseFloat(contract.amount))}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="font-medium">Term:</span>
                        <span>{contract.term} months</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="font-medium">Interest Rate:</span>
                        <span>{contract.interestRate}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="font-medium">Monthly Payment:</span>
                        <span className="font-bold">
                          {formatCurrency(
                            parseFloat(contract.amount) * 
                            (parseFloat(contract.interestRate) / 100 / 12) * 
                            Math.pow(1 + parseFloat(contract.interestRate) / 100 / 12, contract.term) / 
                            (Math.pow(1 + parseFloat(contract.interestRate) / 100 / 12, contract.term) - 1)
                          )}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                  <CardFooter className="flex justify-between gap-4">
                    <Button 
                      variant="outline" 
                      className="w-full" 
                      onClick={() => declineContract.mutate(contract.id)}
                      disabled={declineContract.isPending}
                    >
                      Decline
                    </Button>
                    <Button 
                      className="w-full" 
                      onClick={() => {
                        setSelectedContractId(contract.id);
                        acceptContract.mutate(contract.id);
                      }}
                      disabled={acceptContract.isPending || !isVerified}
                    >
                      {!isVerified ? "Verify Identity First" : "Accept"}
                    </Button>
                  </CardFooter>
                </Card>
              ))
            ) : (
              <div className="col-span-1 md:col-span-2 text-center p-12 border rounded-lg">
                <h3 className="text-xl font-semibold mb-2">No Loan Offers</h3>
                <p className="text-muted-foreground mb-6">You currently don't have any pending loan offers.</p>
                <Button onClick={() => createSampleOffer.mutate()}>
                  Create Sample Offer
                </Button>
              </div>
            )}
          </div>
        </TabsContent>
        
        <TabsContent value="active">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {activeContracts.length > 0 ? (
              activeContracts.map((contract) => (
                <Card key={contract.id}>
                  <CardHeader>
                    <CardTitle>Loan #{contract.id}</CardTitle>
                    <CardDescription>Active since {new Date(contract.createdAt!).toLocaleDateString()}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="flex justify-between">
                        <span className="font-medium">Amount:</span>
                        <span className="font-bold">{formatCurrency(parseFloat(contract.amount))}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="font-medium">Remaining Balance:</span>
                        <span className="font-bold">{formatCurrency(parseFloat(contract.remainingBalance || contract.amount))}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="font-medium">Next Payment:</span>
                        <span>{contract.nextPaymentDate ? new Date(contract.nextPaymentDate).toLocaleDateString() : 'Not scheduled'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="font-medium">Monthly Payment:</span>
                        <span className="font-bold">
                          {formatCurrency(
                            parseFloat(contract.amount) * 
                            (parseFloat(contract.interestRate) / 100 / 12) * 
                            Math.pow(1 + parseFloat(contract.interestRate) / 100 / 12, contract.term) / 
                            (Math.pow(1 + parseFloat(contract.interestRate) / 100 / 12, contract.term) - 1)
                          )}
                        </span>
                      </div>
                    </div>
                    
                    <div className="mt-6">
                      <h4 className="font-semibold mb-4">Payment History</h4>
                      <PaymentHistory contractId={contract.id} />
                    </div>
                  </CardContent>
                  <CardFooter>
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button className="w-full">Make Payment</Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Make a Payment</DialogTitle>
                        </DialogHeader>
                        <div className="py-4">
                          <div className="mb-4">
                            <p className="font-medium">Loan #{contract.id}</p>
                            <p className="text-muted-foreground">Monthly payment: 
                              {formatCurrency(
                                parseFloat(contract.amount) * 
                                (parseFloat(contract.interestRate) / 100 / 12) * 
                                Math.pow(1 + parseFloat(contract.interestRate) / 100 / 12, contract.term) / 
                                (Math.pow(1 + parseFloat(contract.interestRate) / 100 / 12, contract.term) - 1)
                              )}
                            </p>
                          </div>
                          <div className="flex gap-4">
                            <Button 
                              variant="outline" 
                              className="w-full"
                              onClick={() => {
                                setSelectedContractId(contract.id);
                                setIsBankModalOpen(true);
                              }}
                            >
                              Pay with Bank
                            </Button>
                            <Button 
                              className="w-full"
                              onClick={() => {
                                submitPayment.mutate(contract.id);
                              }}
                              disabled={submitPayment.isPending}
                            >
                              Pay Now (Test)
                            </Button>
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </CardFooter>
                </Card>
              ))
            ) : (
              <div className="col-span-1 md:col-span-2 text-center p-12 border rounded-lg">
                <h3 className="text-xl font-semibold mb-2">No Active Loans</h3>
                <p className="text-muted-foreground">You currently don't have any active loans.</p>
              </div>
            )}
          </div>
        </TabsContent>
        
        <TabsContent value="completed">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {completedContracts.length > 0 ? (
              completedContracts.map((contract) => (
                <Card key={contract.id}>
                  <CardHeader>
                    <CardTitle>Loan #{contract.id}</CardTitle>
                    <CardDescription>Completed on {new Date(contract.updatedAt!).toLocaleDateString()}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="flex justify-between">
                        <span className="font-medium">Amount:</span>
                        <span className="font-bold">{formatCurrency(parseFloat(contract.amount))}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="font-medium">Term:</span>
                        <span>{contract.term} months</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="font-medium">Interest Rate:</span>
                        <span>{contract.interestRate}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="font-medium">Total Paid:</span>
                        <span className="font-bold">{formatCurrency(parseFloat(contract.amount) * 1.2)}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : (
              <div className="col-span-1 md:col-span-2 text-center p-12 border rounded-lg">
                <h3 className="text-xl font-semibold mb-2">No Completed Loans</h3>
                <p className="text-muted-foreground">You haven't completed any loans yet.</p>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
      
      {/* Additional information or app features could go here */}
    </div>
  );
}