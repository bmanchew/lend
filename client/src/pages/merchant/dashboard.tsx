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
import { LoanProgramManager } from "@/components/merchant/loan-program-manager";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { ApplicationTracker } from "@/components/merchant/application-tracker";

interface ContractStats {
  active: number;
  pending: number;
  completed: number;
  total: number;
}

export default function MerchantDashboard() {
  const { user } = useAuth();
  const [contractStats, setContractStats] = useState<ContractStats>({
    active: 0,
    pending: 0,
    completed: 0,
    total: 0
  });

  const { data: merchant, isLoading, error } = useQuery<SelectMerchant>({
    queryKey: ['merchant', user?.id],
    queryFn: async () => {
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
    },
    enabled: !!user?.id
  });

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

  return (
    <PortalLayout>
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold tracking-tight">
            {merchant?.companyName || 'Loading...'} Dashboard
          </h1>
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
          )}
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
                ${contracts?.reduce((sum, c) => sum + (Number(c.amount) || 0), 0).toFixed(2) ?? "0.00"}
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

          {merchant && <ApplicationTracker merchantId={merchant.id} />}
        </div>

        {merchant && (
          <Card>
            <CardHeader>
              <CardTitle>Loan Programs</CardTitle>
            </CardHeader>
            <CardContent>
              <LoanProgramManager merchantId={merchant.id} />
            </CardContent>
          </Card>
        )}
      </div>
    </PortalLayout>
  );
}