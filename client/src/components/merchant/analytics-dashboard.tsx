import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";

interface AnalyticsData {
  paymentTrends: Array<{
    month: string;
    amount: number;
  }>;
  loanStatus: Array<{
    name: string;
    value: number;
  }>;
}

interface ApiResponse {
  status: 'success' | 'error';
  data?: AnalyticsData;
  error?: string;
}

export function AnalyticsDashboard({ merchantId }: { merchantId: number }) {
  const {
    data: analyticsResponse,
    isLoading,
    error: analyticsError,
    isError
  } = useQuery<ApiResponse>({
    queryKey: [`/api/merchants/${merchantId}/analytics`],
    enabled: !!merchantId,
    retry: 2,
    retryDelay: 1000,
    queryFn: async () => {
      console.info('[AnalyticsDashboard] Fetching analytics:', {
        merchantId,
        timestamp: new Date().toISOString()
      });

      const response = await fetch(`/api/merchants/${merchantId}/analytics`);
      if (!response.ok) {
        const errorData = await response.json();
        console.error('[AnalyticsDashboard] API Error:', {
          status: response.status,
          error: errorData,
          timestamp: new Date().toISOString()
        });
        throw new Error(errorData.error || 'Failed to fetch analytics');
      }

      const data = await response.json();
      console.info('[AnalyticsDashboard] Analytics received:', {
        status: data.status,
        hasData: !!data.data,
        timestamp: new Date().toISOString()
      });
      return data;
    }
  });

  const analytics = analyticsResponse?.data;
  const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042"];

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <Skeleton className="h-4 w-32" />
          </CardHeader>
          <CardContent className="h-[300px]">
            <Skeleton className="h-full w-full" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Skeleton className="h-4 w-32" />
          </CardHeader>
          <CardContent className="h-[300px]">
            <Skeleton className="h-full w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isError || !analytics) {
    const errorMessage = analyticsResponse?.error ||
      (analyticsError instanceof Error ? analyticsError.message : 'Failed to load analytics');

    console.error('[AnalyticsDashboard] Error state:', {
      error: errorMessage,
      analyticsResponse,
      timestamp: new Date().toISOString()
    });

    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>{errorMessage}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Payment Trends</CardTitle>
        </CardHeader>
        <CardContent className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={analytics.paymentTrends}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip />
              <Line type="monotone" dataKey="amount" stroke="#8884d8" />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Loan Status Distribution</CardTitle>
        </CardHeader>
        <CardContent className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={analytics.loanStatus}
                cx="50%"
                cy="50%"
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
                label
              >
                {analytics.loanStatus.map((_, index) => (
                  <Cell key={index} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}