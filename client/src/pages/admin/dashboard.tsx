import { useAuth } from "@/hooks/use-auth";
import PortalLayout from "@/components/layout/portal-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useQuery } from "@tanstack/react-query";
import type { SelectMerchant, SelectContract } from "@db/schema";
import { DataTable } from "@/components/ui/data-table";
import { ColumnDef } from "@tanstack/react-table";
import { format } from "date-fns";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, Phone, Mail } from "lucide-react";
import { useState } from "react";
import { CreateMerchantForm } from "@/components/admin/create-merchant-form";

interface MerchantWithContact extends SelectMerchant {
  email?: string | null;
  phone?: string | null;
}

// Add type safety for contract amounts
const formatAmount = (value: string | number | null | undefined): string => {
  if (typeof value === 'string') {
    return `$${(parseFloat(value) || 0).toFixed(2)}`;
  }
  if (typeof value === 'number') {
    return `$${value.toFixed(2)}`;
  }
  return '$0.00';
};

export default function AdminDashboard() {
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("all");

  // Format date with proper error handling
  const formatDate = (value: string | Date | null): string => {
    if (!value) return "N/A";
    try {
      return format(new Date(value), "MMM d, yyyy");
    } catch (e) {
      console.error("Invalid date format:", e);
      return "Invalid Date";
    }
  };

  const { data: contracts = [], error: contractsError, isLoading: contractsLoading } = useQuery<SelectContract[]>({
    queryKey: ["/api/contracts"],
    retry: 1,
    throwOnError: false
  });

  const { data: merchants = [], error: merchantsError, isLoading: merchantsLoading } = useQuery<MerchantWithContact[]>({
    queryKey: ["/api/merchants"],
    retry: 1,
    throwOnError: false
  });

  const contractColumns: ColumnDef<SelectContract>[] = [
    {
      accessorKey: "contractNumber",
      header: "Contract #",
    },
    {
      accessorKey: "merchantId",
      header: "Merchant",
      cell: ({ row }) => {
        const merchant = merchants.find(m => m.id === row.original.merchantId);
        return merchant?.companyName || 'N/A';
      },
    },
    {
      accessorKey: "amount",
      header: "Amount",
      cell: ({ row }) => formatAmount(row.getValue("amount")),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ getValue }) => {
        const value = getValue() as string;
        return (
          <Badge variant={value === "active" ? "default" : "secondary"}>
            {value}
          </Badge>
        );
      },
    },
    {
      accessorKey: "createdAt",
      header: "Created",
      cell: ({ row }) => formatDate(row.getValue("createdAt")),
    },
  ];

  const filteredContracts = contracts.filter(contract => {
    const matchesSearch =
      (contract?.contractNumber?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
      (merchants.find(m => m.id === contract.merchantId)?.companyName?.toLowerCase() || '').includes(searchTerm.toLowerCase());
    const matchesStatus = selectedStatus === "all" || contract?.status === selectedStatus;
    return matchesSearch && matchesStatus;
  });

  if (contractsLoading || merchantsLoading) {
    return (
      <PortalLayout>
        <div className="p-8">Loading...</div>
      </PortalLayout>
    );
  }

  if (contractsError || merchantsError) {
    console.error("[AdminDashboard] Errors:", { contractsError, merchantsError });
    return (
      <PortalLayout>
        <div className="p-8 text-red-500">
          Error loading data. Please try again later.
        </div>
      </PortalLayout>
    );
  }

  return (
    <PortalLayout>
      <div className="space-y-8">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold tracking-tight">Admin CRM Dashboard</h1>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader>
              <CardTitle>Total Contracts</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{contracts.length}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Active Contracts</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">
                {contracts.filter(c => c.status === "active").length}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Total Volume</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">
                {formatAmount(
                  contracts
                    .filter(c => c.status === 'active')
                    .reduce((sum, c) => sum + (parseFloat(String(c.amount)) || 0), 0)
                )}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Merchants</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{merchants.length}</p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="contracts">
          <TabsList>
            <TabsTrigger value="contracts">Contract Management</TabsTrigger>
            <TabsTrigger value="merchants">Merchant Management</TabsTrigger>
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
                  data={filteredContracts}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="merchants">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Merchant Management</CardTitle>
                  <CreateMerchantForm />
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {merchants.map((merchant) => (
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
                                <span>{merchant.email || 'N/A'}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <Phone className="h-4 w-4" />
                                <span>{merchant.phone || 'N/A'}</span>
                              </div>
                            </div>
                          </div>
                          <div>
                            <h4 className="font-medium mb-2">Performance</h4>
                            <div className="space-y-2">
                              <div>Total Contracts: {
                                contracts.filter(c => c.merchantId === merchant.id).length
                              }</div>
                              <div>Active Contracts: {
                                contracts.filter(c => c.merchantId === merchant.id && c.status === "active").length
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
        </Tabs>
      </div>
    </PortalLayout>
  );
}