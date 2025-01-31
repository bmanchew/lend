import { useQuery } from "@tanstack/react-query";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";

interface VerificationSession {
  id: number;
  userId: number;
  sessionId: string;
  status: string;
  features: string;
  createdAt: string;
  updatedAt: string;
}

export function VerificationSessions() {
  const { data: sessions, isLoading } = useQuery<VerificationSession[]>({
    queryKey: ['/api/kyc/sessions'],
    queryFn: async () => {
      const response = await fetch('/api/kyc/sessions');
      if (!response.ok) {
        throw new Error('Failed to fetch verification sessions');
      }
      return response.json();
    },
  });

  if (isLoading) {
    return (
      <div className="flex justify-center p-4">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'approved':
        return 'bg-green-500';
      case 'declined':
        return 'bg-red-500';
      case 'pending':
      case 'initialized':
        return 'bg-yellow-500';
      default:
        return 'bg-gray-500';
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">Verification Sessions</h2>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Session ID</TableHead>
            <TableHead>User ID</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Features</TableHead>
            <TableHead>Created</TableHead>
            <TableHead>Last Updated</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sessions?.map((session) => (
            <TableRow key={session.id}>
              <TableCell className="font-mono">{session.sessionId}</TableCell>
              <TableCell>{session.userId}</TableCell>
              <TableCell>
                <Badge className={getStatusColor(session.status)}>
                  {session.status}
                </Badge>
              </TableCell>
              <TableCell>{session.features}</TableCell>
              <TableCell>
                {format(new Date(session.createdAt), 'PPp')}
              </TableCell>
              <TableCell>
                {format(new Date(session.updatedAt), 'PPp')}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
