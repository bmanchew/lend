import { useAuth } from "@/hooks/use-auth";
import PortalLayout from "@/components/layout/portal-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";
import { useQuery } from "@tanstack/react-query";
import type { SelectMerchant, SelectContract } from "@db/schema";

export default function AdminDashboard() {
  const { user } = useAuth();

  const { data: merchants } = useQuery<SelectMerchant[]>({
    queryKey: ["/api/merchants"],
  });

  const { data: contracts } = useQuery<SelectContract[]>({
    queryKey: ["/api/contracts"],
  });

  const chartData = [
    { name: "Jan", value: 4000 },
    { name: "Feb", value: 3000 },
    { name: "Mar", value: 6000 },
    { name: "Apr", value: 8000 },
    { name: "May", value: 7000 },
  ];

  return (
    <PortalLayout>
      <div className="space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">
          Admin Dashboard
        </h1>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader>
              <CardTitle>Total Merchants</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{merchants?.length ?? 0}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Active Contracts</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">
                {contracts?.filter(c => c.status === "active").length ?? 0}
              </p>
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
              <CardTitle>Default Rate</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">
                {((contracts?.filter(c => c.status === "defaulted").length ?? 0) / 
                  (contracts?.length ?? 1) * 100).toFixed(1)}%
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Platform Performance</CardTitle>
            </CardHeader>
            <CardContent className="h-[400px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Active Merchants</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {merchants?.map(merchant => (
                  <div key={merchant.id} className="flex items-center justify-between p-2 border rounded">
                    <div>
                      <p className="font-medium">{merchant.companyName}</p>
                      <p className="text-sm text-muted-foreground">
                        Reserve Balance: ${merchant.reserveBalance}
                      </p>
                    </div>
                    <span className={`px-2 py-1 rounded-full text-xs ${
                      merchant.status === "active" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                    }`}>
                      {merchant.status}
                    </span>
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
