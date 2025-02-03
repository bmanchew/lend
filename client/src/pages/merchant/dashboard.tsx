
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
import { useSocket } from "@/hooks/use-socket";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";

export default function MerchantDashboard() {
  const { user } = useAuth();
  const [contractStats, setContractStats] = useState({
    active: 0,
    pending: 0,
    completed: 0,
    total: 0
  });

  const { data: merchant, isLoading, error } = useQuery<SelectMerchant>({
    queryKey: ['merchant', user?.id],
    queryFn: async () => {
      if (!user?.id) throw new Error('No user ID available');
      console.log('Fetching merchant data for user:', user.id);
      const response = await fetch(`/api/merchants/by-user/${user.id}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch merchant');
      }
      const data = await response.json();
      console.log('Merchant data:', data);
      return data;
    },
    enabled: !!user?.id,
    retry: 2,
    retryDelay: 1000,
  });

  useEffect(() => {
    if (error) {
      console.error('Error fetching merchant:', error);
    }
  }, [error]);

  const { data: contracts, refetch: refetchContracts } = useQuery<SelectContract[]>({
    queryKey: [`/api/merchants/${merchant?.id}/contracts`],
    enabled: !!merchant,
    onSuccess: (data) => {
      console.log("[MerchantDashboard] Contracts loaded:", {
        merchantId: merchant?.id,
        contractCount: data?.length,
        timestamp: new Date().toISOString()
      });
    },
    onError: (error) => {
      console.error("[MerchantDashboard] Error loading contracts:", {
        merchantId: merchant?.id,
        error,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Connect to socket for real-time updates
  const socket = useSocket(merchant?.id);

  // Listen for real-time contract updates
  useEffect(() => {
    if (socket && merchant?.id) {
      socket.on('contract_update', (data) => {
        if (data.merchantId === merchant.id) {
          refetchContracts();
        }
      });

      socket.on('application_update', (data) => {
        if (data.merchantId === merchant.id) {
          refetchContracts();
        }
      });

      return () => {
        socket.off('contract_update');
        socket.off('application_update');
      };
    }
  }, [socket, merchant?.id, refetchContracts]);

  useEffect(() => {
    if (contracts) {
      setContractStats({
        active: contracts.filter(c => c.status === "active").length,
        pending: contracts.filter(c => c.status === "draft").length,
        completed: contracts.filter(c => c.status === "completed").length,
        total: contracts.length
      });
    }
  }, [contracts]);

  const chartData = contracts?.reduce((acc, contract) => {
    const month = new Date(contract.createdAt).toLocaleString('default', { month: 'short' });
    const existing = acc.find(d => d.name === month);
    if (existing) {
      existing.value += Number(contract.amount);
    } else {
      acc.push({ name: month, value: Number(contract.amount) });
    }
    return acc;
  }, [] as { name: string; value: number }[]) || [];

  return (
    <PortalLayout>
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold tracking-tight">
            {merchant?.companyName} Dashboard
          </h1>
          {isLoading ? (
            <div>Loading...</div>
          ) : error ? (
            <div className="text-red-500">
              {error instanceof Error ? error.message : "Error loading merchant data"}
            </div>
          ) : merchant ? (
            <div className="flex items-center gap-4">
              <LoanApplicationDialog merchantId={merchant.id} merchantName={merchant.companyName} />
            </div>
          ) : null}
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader>
              <CardTitle>Active Contracts</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{contractStats.active}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Total Volume</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">
                ${contracts?.reduce((sum, c) => sum + Number(c.amount), 0).toFixed(2) ?? "0.00"}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Reserve Balance</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">
                ${merchant?.reserveBalance ?? "0.00"}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Pending Applications</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{contractStats.pending}</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Monthly Performance</CardTitle>
            </CardHeader>
            <CardContent className="h-[300px]">
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
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent Applications</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {contracts?.slice(0, 5).map(contract => (
                  <div key={contract.id} className="flex items-center justify-between p-2 border rounded">
                    <div>
                      <p className="font-medium">Contract #{contract.contractNumber}</p>
                      <p className="text-sm text-muted-foreground">
                        Amount: ${Number(contract.amount).toFixed(2)}
                      </p>
                    </div>
                    <Badge
                      variant={
                        contract.status === "active" ? "success" :
                        contract.status === "draft" ? "secondary" :
                        contract.status === "completed" ? "default" : "destructive"
                      }
                    >
                      {contract.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </PortalLayout>
  );
}
