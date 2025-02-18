
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

interface Payment {
  id: string;
  amount: number;
  status: string;
  createdAt: string;
  dueDate: string;
}

export function PaymentHistory({ contractId }: { contractId: number }) {
  const { data: payments = [] } = useQuery<Payment[]>({
    queryKey: [`/api/contracts/${contractId}/payments`],
  });

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Payment History</h2>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Amount</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Due Date</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {payments.map((payment) => (
            <TableRow key={payment.id}>
              <TableCell>
                {format(new Date(payment.createdAt), "MMM d, yyyy")}
              </TableCell>
              <TableCell>${payment.amount}</TableCell>
              <TableCell>{payment.status}</TableCell>
              <TableCell>
                {format(new Date(payment.dueDate), "MMM d, yyyy")}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
