import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { SelectContract } from "@db/schema";
import { formatDistance } from "date-fns";
import { Loader2 } from "lucide-react";

interface Props {
  merchantId: number;
}

export function ApplicationTracker({ merchantId }: Props) {
  const { data: applications, isLoading, error } = useQuery<SelectContract[]>({
    queryKey: ['applications', merchantId],
    queryFn: async () => {
      console.log('[ApplicationTracker] Fetching applications for merchant:', merchantId);
      const response = await fetch(`/api/merchants/${merchantId}/applications`, {
        credentials: 'include'
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to fetch applications: ${response.status} - ${errorText}`);
      }
      const data = await response.json();
      console.log('[ApplicationTracker] Fetched applications:', data);
      return data;
    },
    refetchInterval: 30000 // Refresh every 30 seconds
  });

  const getStatusBadgeVariant = (status: string) => {
    switch (status.toLowerCase()) {
      case 'pending':
      case 'draft':
        return 'secondary';
      case 'approved':
      case 'active':
        return 'default';
      case 'rejected':
        return 'destructive';
      default:
        return 'default';
    }
  };

  const formatCurrency = (amount: string | number) => {
    const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(numAmount);
  };

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Loan Applications</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-destructive py-8">
            Error loading applications: {error instanceof Error ? error.message : 'Unknown error'}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Loan Applications</CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[400px]">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span className="ml-2">Loading applications...</span>
            </div>
          ) : (
            <div className="space-y-4">
              {applications?.map((application) => (
                <Card key={application.id} className="p-4">
                  <div className="flex justify-between items-start">
                    <div className="space-y-1">
                      <div className="font-medium">
                        Application #{application.contractNumber || application.id}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Amount: {formatCurrency(application.amount)}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {application.createdAt && (
                          <>Submitted: {formatDistance(new Date(application.createdAt), new Date(), { addSuffix: true })}</>
                        )}
                      </div>
                      {application.borrowerEmail && (
                        <div className="text-sm text-muted-foreground">
                          Contact: {application.borrowerEmail}
                        </div>
                      )}
                      {application.notes && (
                        <div className="text-sm text-muted-foreground">
                          Notes: {application.notes}
                        </div>
                      )}
                    </div>
                    <Badge variant={getStatusBadgeVariant(application.status)}>
                      {application.status}
                    </Badge>
                  </div>
                </Card>
              ))}
              {(!applications || applications.length === 0) && (
                <div className="text-center text-muted-foreground py-8">
                  No applications found
                </div>
              )}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}