import { useAuth } from "@/hooks/use-auth";
import PortalLayout from "@/components/layout/portal-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { SelectMerchant, SelectContract } from "@db/schema";
import { DataTable } from "@/components/ui/data-table";
import { ColumnDef } from "@tanstack/react-table";
import { format } from "date-fns";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, Phone, Mail, FileText, UserCheck, Clock } from "lucide-react";
import { useState } from "react";

export default function AdminDashboard() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("all");

  const { data: contracts, error: contractsError, isLoading: contractsLoading } = useQuery<SelectContract[]>({
    queryKey: ["/api/contracts"],
    onError: (error) => {
      console.error("[AdminDashboard] Failed to fetch contracts:", error);
    }
  });

  const { data: merchants, error: merchantsError, isLoading: merchantsLoading } = useQuery<SelectMerchant[]>({
    queryKey: ["/api/merchants"],
    onSuccess: (data) => {
      console.log("[AdminDashboard] Merchants loaded:", {
        count: data?.length,
        timestamp: new Date().toISOString()
      });
    },
    onError: (error) => {
      console.error("[AdminDashboard] Error loading merchants:", {
        error,
        timestamp: new Date().toISOString()
      });
    }
  });

  const contractColumns: ColumnDef<SelectContract>[] = [
    {
      accessorKey: "contractNumber",
      header: "Contract #",
    },
    {
      accessorKey: "merchants.companyName",
      header: "Merchant",
    },
    {
      accessorKey: "amount",
      header: "Amount",
      cell: ({ row }) => `$${Number(row.getValue("amount")).toFixed(2)}`,
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ getValue }) => (
        <Badge variant={getValue() === "active" ? "success" : "secondary"}>
          {getValue()}
        </Badge>
      ),
    },
    {
      accessorKey: "createdAt",
      header: "Created",
      cell: ({ getValue }) => {
        const value = getValue();
        return value ? format(new Date(value), "MMM d, yyyy") : "N/A";
      },
    },
  ];

  const filteredContracts = contracts?.filter(contract => {
    const matchesSearch = 
      (contract?.contractNumber?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
      (contract?.merchants?.companyName?.toLowerCase() || '').includes(searchTerm.toLowerCase());
    const matchesStatus = selectedStatus === "all" || contract?.status === selectedStatus;
    return matchesSearch && matchesStatus;
  });

  const updateContractStatus = useMutation({
    mutationFn: async ({ contractId, status }: { contractId: number; status: string }) => {
      const response = await fetch(`/api/contracts/${contractId}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contracts"] });
    },
  });

  console.log("[AdminDashboard] Rendering with:", {
    contractsLoading,
    merchantsLoading,
    contractsError,
    merchantsError,
    contractsCount: contracts?.length,
    merchantsCount: merchants?.length
  });

  if (contractsLoading || merchantsLoading) {
    return <div>Loading...</div>;
  }

  if (contractsError || merchantsError) {
    return <div>Error loading data: {(contractsError || merchantsError)?.message}</div>;
  }

  return (
    <PortalLayout>
      <div className="space-y-8">
        <h1 className="text-2xl font-bold tracking-tight">Admin CRM Dashboard</h1>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader>
              <CardTitle>Total Contracts</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{contracts?.length ?? 0}</p>
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
              <CardTitle>Merchants</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{merchants?.length ?? 0}</p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="contracts">
          <TabsList>
            <TabsTrigger value="contracts">Contract Management</TabsTrigger>
            <TabsTrigger value="merchants">Merchant Management</TabsTrigger>
            <TabsTrigger value="communications">Communications</TabsTrigger>
          </TabsList>

          <TabsContent value="contracts">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Contract Management</CardTitle>
                  <div className="flex gap-4">
                    <Input
                      placeholder="Search contracts..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-64"
                    />
                    <select
                      value={selectedStatus}
                      onChange={(e) => setSelectedStatus(e.target.value)}
                      className="border rounded p-2"
                    >
                      <option value="all">All Statuses</option>
                      <option value="active">Active</option>
                      <option value="pending">Pending</option>
                      <option value="completed">Completed</option>
                    </select>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <DataTable
                  columns={contractColumns}
                  data={filteredContracts || []}
                  onRowClick={(row) => {
                    // Open contract details dialog
                  }}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="merchants">
            <Card>
              <CardHeader>
                <CardTitle>Merchant Management</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {merchants?.map((merchant) => (
                    <Collapsible key={merchant.id}>
                      <CollapsibleTrigger className="flex items-center justify-between w-full p-4 bg-gray-50 rounded-lg">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{merchant.companyName}</span>
                          <Badge>{merchant.status}</Badge>
                        </div>
                        <ChevronDown className="h-4 w-4" />
                      </CollapsibleTrigger>
                      <CollapsibleContent className="p-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <h4 className="font-medium mb-2">Contact Information</h4>
                            <div className="space-y-2">
                              <div className="flex items-center gap-2">
                                <Mail className="h-4 w-4" />
                                <span>{merchant.email}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <Phone className="h-4 w-4" />
                                <span>{merchant.phoneNumber}</span>
                              </div>
                            </div>
                          </div>
                          <div>
                            <h4 className="font-medium mb-2">Performance</h4>
                            <div className="space-y-2">
                              <div>Total Contracts: {
                                contracts?.filter(c => c.merchantId === merchant.id).length
                              }</div>
                              <div>Active Contracts: {
                                contracts?.filter(c => c.merchantId === merchant.id && c.status === "active").length
                              }</div>
                            </div>
                          </div>
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="communications">
            <Card>
              <CardHeader>
                <CardTitle>Communication History</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {/* Communication logs would go here */}
                  <p>Communication history and logs will be displayed here</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </PortalLayout>
  );
}