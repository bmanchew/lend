import { useAuth } from "@/hooks/use-auth";
import PortalLayout from "@/components/layout/portal-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";
import { useQuery } from "@tanstack/react-query";
import type { SelectContract, SelectMerchant } from "@db/schema";
import { LoanApplicationDialog } from "@/components/merchant/loan-application-dialog";
<<<<<<< HEAD
import { useSocket } from "@/hooks/use-socket";
import { useEffect, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/queryClient";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";

type ContractStats = {
=======
import { LoanProgramManager } from "@/components/merchant/loan-program-manager";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { ApplicationTracker } from "@/components/merchant/application-tracker";

interface ContractStats {
>>>>>>> 5f3313f344debc3d201818f060b5e618febf5116
  active: number;
  pending: number;
  completed: number;
  total: number;
<<<<<<< HEAD
};

const formatAmount = (amount: string | number | null | undefined): string => {
  if (typeof amount === 'string') {
    return parseFloat(amount || '0').toFixed(2);
  }
  if (typeof amount === 'number') {
    return amount.toFixed(2);
  }
  return '0.00';
};

export default function MerchantDashboard() {
  const { user } = useAuth();
=======
}

export default function MerchantDashboard() {
  const { user } = useAuth();
  const [contractStats, setContractStats] = useState<ContractStats>({
    active: 0,
    pending: 0,
    completed: 0,
    total: 0
  });
>>>>>>> 5f3313f344debc3d201818f060b5e618febf5116

  const {
    data: merchant,
    isLoading: merchantLoading,
    error: merchantError,
    isError: isMerchantError,
    fetchStatus
  } = useQuery<SelectMerchant>({
    onError: (error) => {
      console.error('[Merchant] Data fetch error:', error);
    },
    onSuccess: (data) => {
      const fetchTime = performance.now() - (window.merchantFetchStart || 0);
      console.info('[Merchant] Data fetch completed in:', fetchTime, 'ms');
    },
    queryKey: ['merchant', user?.id],
    queryFn: async () => {
<<<<<<< HEAD
      if (!user?.id) throw new Error('No user ID available');
      try {
        const response = await apiRequest(`/api/merchants/by-user/${user.id}`);
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to fetch merchant');
        }
        const result = await response.json();
        if (result.status === 'error') {
          throw new Error(result.error);
        }
        return result.data;
      } catch (error) {
        console.error('Error fetching merchant:', error);
        throw error;
      }
=======
      if (!user?.id) {
        throw new Error('No user ID available');
      }

      const response = await fetch(`/api/merchants/by-user/${user.id}`, {
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache'
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to fetch merchant: ${response.status} - ${errorText}`);
      }

      return response.json();
>>>>>>> 5f3313f344debc3d201818f060b5e618febf5116
    },
    enabled: !!user?.id
  });

<<<<<<< HEAD
  const {
    data: contracts = [],
    isLoading: contractsLoading,
    refetch: refetchContracts
  } = useQuery<SelectContract[]>({
    queryKey: [`/merchants/${merchant?.id}/contracts`],
    enabled: !!merchant?.id,
    staleTime: 1000 * 60 // 1 minute
  });

  const socket = useSocket(merchant?.id ?? 0);

  useEffect(() => {
    if (!socket || !merchant?.id) return;

    const handleContractUpdate = (data: any) => {
      if (data.merchantId === merchant.id) {
        refetchContracts();
      }
    };

    socket.on('contract_update', handleContractUpdate);
    socket.on('application_update', handleContractUpdate);

    return () => {
      socket.off('contract_update', handleContractUpdate);
      socket.off('application_update', handleContractUpdate);
    };
  }, [socket, merchant?.id, refetchContracts]);
=======
  const { data: contracts, isLoading: contractsLoading, error: contractsError, refetch: refetchContracts } = useQuery<SelectContract[]>({
    queryKey: [`/api/merchants/${merchant?.id}/contracts`],
    enabled: !!merchant?.id,
    queryFn: async () => {
      if (!merchant?.id) throw new Error('No merchant ID available');
      const response = await fetch(`/api/merchants/${merchant.id}/contracts`, {
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache'
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to fetch contracts: ${response.status} - ${errorText}`);
      }

      return response.json();
    },
  });

  // Polling for updates
  useEffect(() => {
    if (merchant?.id) {
      const pollInterval = setInterval(() => {
        refetchContracts();
      }, 30000); // Poll every 30 seconds

      return () => clearInterval(pollInterval);
    }
  }, [merchant?.id, refetchContracts]);
>>>>>>> 5f3313f344debc3d201818f060b5e618febf5116

  const contractStats = useMemo<ContractStats>(() => {
    if (!contracts?.length) {
      return {
        active: 0,
        pending: 0,
        completed: 0,
        total: 0
      };
    }

    return {
      active: contracts.filter(c => c.status === "active").length,
      pending: contracts.filter(c => c.status === "draft").length,
      completed: contracts.filter(c => c.status === "completed").length,
      total: contracts.length
    };
  }, [contracts]);

<<<<<<< HEAD
  const chartData = useMemo(() => {
    if (!contracts?.length) return [];

    const monthlyData = contracts.reduce((acc: { [key: string]: number }, contract) => {
      if (!contract.createdAt) return acc;
      try {
        const month = new Date(contract.createdAt).toLocaleString('default', { month: 'short' });
        acc[month] = (acc[month] || 0) + (Number(contract.amount) || 0);
        return acc;
      } catch (e) {
        console.error('Error processing contract for chart:', e);
        return acc;
      }
    }, {});

    return Object.entries(monthlyData).map(([name, value]) => ({ name, value }));
  }, [contracts]);

  if (merchantLoading) {
    return (
      <PortalLayout>
        <div className="space-y-4">
          <Skeleton className="h-8 w-64" />
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-4 w-32" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-8 w-16" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </PortalLayout>
    );
  }

  if (isMerchantError) {
    return (
      <PortalLayout>
        <div className="p-4">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>
              Error loading merchant data: {merchantError instanceof Error ? merchantError.message : 'Unknown error'}
            </AlertDescription>
          </Alert>
        </div>
      </PortalLayout>
    );
  }
=======
  const chartData = contracts?.reduce((acc: { name: string; value: number }[], contract) => {
    const month = new Date(contract.createdAt || new Date()).toLocaleString('default', { month: 'short' });
    const existing = acc.find(d => d.name === month);
    if (existing) {
      existing.value += Number(contract.amount) || 0;
    } else {
      acc.push({ name: month, value: Number(contract.amount) || 0 });
    }
    return acc;
  }, []) || [];
>>>>>>> 5f3313f344debc3d201818f060b5e618febf5116

  return (
    <PortalLayout>
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold tracking-tight">
            {merchant?.companyName || 'Loading...'} Dashboard
          </h1>
<<<<<<< HEAD
          {merchant && (
            <div className="flex items-center gap-4">
              <LoanApplicationDialog merchantId={merchant.id} merchantName={merchant.companyName} />
            </div>
=======
          {isLoading || contractsLoading ? (
            <div>Loading...</div>
          ) : error || contractsError ? (
            <div className="text-red-500">
              {error instanceof Error ? error.message : "Error loading merchant data"} {contractsError instanceof Error ? contractsError.message : ""}
            </div>
          ) : merchant ? (
            <div className="flex items-center gap-4">
              <LoanApplicationDialog merchantId={merchant.id} merchantName={merchant.companyName} />
            </div>
          ) : (
            <div className="text-red-500">No merchant data found.</div>
>>>>>>> 5f3313f344debc3d201818f060b5e618febf5116
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader>
              <CardTitle>Active Contracts</CardTitle>
            </CardHeader>
            <CardContent>
              {contractsLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <p className="text-2xl font-bold">{contractStats.active}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Total Volume</CardTitle>
            </CardHeader>
            <CardContent>
<<<<<<< HEAD
              {contractsLoading ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <p className="text-2xl font-bold">
                  ${contracts
                    .filter(c => c.status === 'active')
                    .reduce((sum, c) => sum + parseFloat(formatAmount(c.amount)), 0)
                    .toFixed(2)}
                </p>
              )}
=======
              <p className="text-2xl font-bold">
                ${contracts?.reduce((sum, c) => sum + (Number(c.amount) || 0), 0).toFixed(2) ?? "0.00"}
              </p>
>>>>>>> 5f3313f344debc3d201818f060b5e618febf5116
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Reserve Balance</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">
                ${formatAmount(merchant?.reserveBalance)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Pending Applications</CardTitle>
            </CardHeader>
            <CardContent>
              {contractsLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <p className="text-2xl font-bold">{contractStats.pending}</p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Monthly Performance</CardTitle>
            </CardHeader>
            <CardContent className="h-[300px]">
              {contractsLoading ? (
                <div className="h-full w-full flex items-center justify-center">
                  <Skeleton className="h-full w-full" />
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Bar
                      dataKey="value"
                      fill="hsl(var(--primary))"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {merchant && <ApplicationTracker merchantId={merchant.id} />}
        </div>

        {merchant && (
          <Card>
            <CardHeader>
              <CardTitle>Loan Programs</CardTitle>
            </CardHeader>
            <CardContent>
<<<<<<< HEAD
              {contractsLoading ? (
                <div className="space-y-2">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  {contracts.slice(0, 5).map(contract => (
                    <div key={contract.id} className="flex items-center justify-between p-2 border rounded">
                      <div>
                        <p className="font-medium">Contract #{contract.contractNumber}</p>
                        <p className="text-sm text-muted-foreground">
                          Amount: ${formatAmount(contract.amount)}
                        </p>
                      </div>
                      <Badge
                        variant={
                          contract.status === "active" ? "default" :
                            contract.status === "draft" ? "secondary" :
                              contract.status === "completed" ? "outline" : "destructive"
                        }
                      >
                        {contract.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
=======
              <LoanProgramManager merchantId={merchant.id} />
>>>>>>> 5f3313f344debc3d201818f060b5e618febf5116
            </CardContent>
          </Card>
        )}
      </div>
    </PortalLayout>
  );
}