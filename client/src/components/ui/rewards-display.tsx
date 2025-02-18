import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./card";
import { ScrollArea } from "./scroll-area";
import { formatDistance } from "date-fns";

interface RewardsTransaction {
  id: number;
  amount: number;
  type: string;
  description: string;
  createdAt: string;
}

interface RewardsBalance {
  balance: number;
  lifetimeEarned: number;
}

export function RewardsDisplay() {
  const { data: balance } = useQuery<RewardsBalance>({
    queryKey: ['rewards-balance'],
    queryFn: async () => {
      const response = await fetch('/api/rewards/balance');
      if (!response.ok) throw new Error('Failed to fetch rewards balance');
      return response.json();
    }
  });

  const { data: transactions } = useQuery<RewardsTransaction[]>({
    queryKey: ['rewards-transactions'],
    queryFn: async () => {
      const response = await fetch('/api/rewards/transactions');
      if (!response.ok) throw new Error('Failed to fetch rewards transactions');
      return response.json();
    }
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your ShiFi Coins</CardTitle>
        <CardDescription>
          Earn coins by making payments early or paying extra on your loan
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  Available Balance
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {balance?.balance || 0}
                  <span className="text-sm font-normal text-muted-foreground ml-2">
                    coins
                  </span>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  Lifetime Earned
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {balance?.lifetimeEarned || 0}
                  <span className="text-sm font-normal text-muted-foreground ml-2">
                    coins
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
          
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">
                Recent Transactions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[300px]">
                <div className="space-y-4">
                  {transactions?.map((transaction) => (
                    <div
                      key={transaction.id}
                      className="flex items-center justify-between"
                    >
                      <div className="space-y-1">
                        <p className="text-sm font-medium leading-none">
                          {transaction.description}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {formatDistance(new Date(transaction.createdAt), new Date(), { addSuffix: true })}
                        </p>
                      </div>
                      <div className={`text-sm font-medium ${
                        transaction.amount > 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {transaction.amount > 0 ? '+' : ''}{transaction.amount} coins
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </CardContent>
    </Card>
  );
}
