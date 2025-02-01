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
import type { SelectMerchant, SelectContract, InsertUser } from "@db/schema";
import { useForm } from "react-hook-form";
import { CreateMerchantForm } from "@/components/admin/create-merchant-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertUserSchema } from "@db/schema";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

export default function AdminDashboard() {
  const { user, registerMutation } = useAuth();
  const { toast } = useToast();

  const form = useForm<InsertUser>({
    resolver: zodResolver(insertUserSchema),
    defaultValues: {
      username: "",
      password: "",
      email: "",
      name: "",
      role: "admin" as const,
    },
  });

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

  const onSubmit = async (data: InsertUser) => {
    try {
      await registerMutation.mutateAsync(data);
      toast({
        title: "Success",
        description: "New admin user created successfully",
      });
      form.reset();
    } catch (error) {
      // Error handling is already done in the mutation
    }
  };

  return (
    <PortalLayout>
      <div className="space-y-8">
        <h1 className="text-2xl font-bold tracking-tight">
          Admin Dashboard
        </h1>

        <div className="p-6 bg-white rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-4">Create Merchant Account</h2>
          <CreateMerchantForm />
        </div>

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

        <div className="grid gap-4 grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Create Admin User</CardTitle>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="username"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Username</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Password</FormLabel>
                        <FormControl>
                          <Input type="password" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input type="email" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Full Name</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button 
                    type="submit" 
                    className="w-full"
                    disabled={registerMutation.isPending}
                  >
                    Create Admin User
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>

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
        </div>
        <Card className="col-span-2">
            <CardHeader>
              <CardTitle>Active Merchants</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {merchants?.map(merchant => (
                  <div key={merchant.id} className="space-y-2 p-4 border rounded">
                    <div className="flex items-center justify-between">
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
                    
                    <div className="space-y-2">
                      <h4 className="font-medium">Programs</h4>
                      <div className="grid gap-2">
                        {merchant.programs?.map(program => (
                          <div key={program.id} className="text-sm p-2 bg-gray-50 rounded">
                            {program.name} - {program.term} months @ {program.interestRate}%
                          </div>
                        ))}
                        <form 
                          className="flex gap-2"
                          onSubmit={async (e) => {
                            e.preventDefault();
                            const form = e.target as HTMLFormElement;
                            const formData = new FormData(form);
                            
                            await fetch(`/api/merchants/${merchant.id}/programs`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                name: formData.get('name'),
                                term: parseInt(formData.get('term') as string),
                                interestRate: parseFloat(formData.get('interestRate') as string),
                              }),
                            });
                            
                            form.reset();
                          }}
                        >
                          <Input name="name" placeholder="Program Name" required />
                          <Input name="term" type="number" placeholder="Term (months)" required />
                          <Input name="interestRate" type="number" step="0.01" placeholder="Rate %" required />
                          <Button type="submit" size="sm">Add</Button>
                        </form>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
      </div>
    </PortalLayout>
  );
}