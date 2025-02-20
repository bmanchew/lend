import { useEffect, useMemo, useCallback } from "react";
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
import type { SelectContract } from "@db/schema";
import { LoanApplicationDialog } from "@/components/merchant/loan-application-dialog";
import { useSocket } from "@/hooks/use-socket";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/queryClient";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";

// Define proper types for merchant data
interface MerchantData {
  id: number;
  userId: number;
  companyName: string;
  status: string | null;
  reserveBalance: string | null;
  address: string | null;
  website: string | null;
  phone: string | null;
  createdAt: Date | null;
}

interface ApiResponse {
  status: 'success' | 'error';
  data?: MerchantData;
  error?: string;
}

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

  // Enhanced error logging and loading state
  const [isLoadingMerchant, setIsLoadingMerchant] = useState(false);
  const [merchantError, setMerchantError] = useState<string | null>(null);

  const {
    data: merchantResponse,
    isLoading,
    error,
  } = useQuery<ApiResponse>({
    queryKey: [`/api/merchants/by-user/${user?.id}`],
    enabled: !!user?.id,
    retry: 3, // Increased retries
    retryDelay: 2000, // Increased retry delay
    queryFn: async () => {
      setIsLoadingMerchant(true);
      setMerchantError(null);
      if (!user?.id) throw new Error('No user ID available');
      console.info('[MerchantDashboard] Fetching merchant data:', {
        userId: user.id,
        timestamp: new Date().toISOString()
      });

      try {
        const response = await apiRequest(`/api/merchants/by-user/${user.id}`);
        if (!response.ok) {
          const errorData = await response.json();
          console.error('[MerchantDashboard] API Error:', {
            status: response.status,
            error: errorData,
            timestamp: new Date().toISOString()
          });
          throw new Error(errorData.error || 'Failed to fetch merchant');
        }

        const data = await response.json();
        console.info('[MerchantDashboard] Merchant data received:', {
          status: data.status,
          hasMerchantData: !!data.data,
          timestamp: new Date().toISOString()
        });
        return data;
      } finally {
        setIsLoadingMerchant(false);
      }
    }
  });

  useEffect(() => {
    if (error) {
      setMerchantError(error.message);
      console.error('[MerchantDashboard] Error fetching merchant data:', error);
    }
  }, [error]);


  const merchant = merchantResponse?.data;

  const {
    data: contracts = [],
    isLoading: contractsLoading,
    refetch: refetchContracts,
    error: contractsError
  } = useQuery<SelectContract[]>({
    queryKey: [`/api/merchants/${merchant?.id}/contracts`],
    enabled: !!merchant?.id,
    staleTime: 1000 * 60, // 1 minute
    onError: (error) => {
      console.error('[MerchantDashboard] Contracts fetch error:', {
        error,
        merchantId: merchant?.id,
        timestamp: new Date().toISOString()
      });
    }
  });

  const socket = useSocket(merchant?.id ?? 0);
  const [isHealthy, setIsHealthy] = useState(true);

  const healthCheck = useCallback(() => {
    if (!socket) {
      setIsHealthy(false);
      return;
    }
    socket.emit('health_check', { merchantId: merchant?.id });
    setIsHealthy(true);
  }, [socket, merchant?.id]);

  useEffect(() => {
    if (!socket || !merchant?.id) {
      console.info('[MerchantDashboard] Socket or merchant ID not available:', {
        hasSocket: !!socket,
        merchantId: merchant?.id,
        timestamp: new Date().toISOString()
      });
      return;
    }

    healthCheck();
    const interval = setInterval(healthCheck, 30000);

    const handleContractUpdate = (data: any) => {
      console.info('[MerchantDashboard] Contract update received:', {
        data,
        timestamp: new Date().toISOString()
      });
      if (data.merchantId === merchant?.id) {
        refetchContracts();
      }
    };

    socket.on('contract_update', handleContractUpdate);
    socket.on('application_update', handleContractUpdate);

    return () => {
      clearInterval(interval);
      socket.off('contract_update', handleContractUpdate);
      socket.off('application_update', handleContractUpdate);
    };
  }, [socket, merchant?.id, refetchContracts, healthCheck]);

  const contractStats = useMemo(() => {
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

  if (isLoadingMerchant) {
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

  if (merchantError || !merchant) {
    console.error('[MerchantDashboard] Error state:', {
      error: merchantError,
      timestamp: new Date().toISOString()
    });

    return (
      <PortalLayout>
        <div className="p-4">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>
              {merchantError || 'Failed to load merchant data'}
            </AlertDescription>
          </Alert>
        </div>
      </PortalLayout>
    );
  }

  return (
    <PortalLayout>
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold tracking-tight">
            {merchant.companyName} Dashboard
          </h1>
          <div className="flex items-center gap-4">
            <LoanApplicationDialog merchantId={merchant.id} merchantName={merchant.companyName} />
          </div>
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

          <Card>
            <CardHeader>
              <CardTitle>Recent Applications</CardTitle>
            </CardHeader>
            <CardContent>
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
            </CardContent>
          </Card>
        </div>
      </div>
    </PortalLayout>
  );
}

interface ContractStats {
  active: number;
  pending: number;
  completed: number;
  total: number;
}
import { useState } from 'react';