import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Activity, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Transaction {
  date: string;
  type: 'Buy' | 'Sell';
  usdAmount: number;
  tokenAmount: number;
  solAmount: number;
  price: number;
  maker: string;
  volume: number;
  timeAgo: string;
}

interface TransactionTableProps {
  tokenSymbol?: string;
  className?: string;
}

export function TransactionTable({ tokenSymbol = "TOKEN", className }: TransactionTableProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Generate more sample transaction data for a fuller table
  const generateSampleTransactions = () => {
    const sampleData: Transaction[] = [
      {
        date: "1h 46m ago",
        type: "Sell",
        usdAmount: 14.10,
        tokenAmount: 785997,
        solAmount: 0.06764,
        price: 0.00001793,
        maker: "PKgL5A",
        volume: 648,
        timeAgo: "1h 46m ago"
      },
      {
        date: "2h 11m ago", 
        type: "Buy",
        usdAmount: 1.32,
        tokenAmount: 70858,
        solAmount: 0.006364,
        price: 0.00001871,
        maker: "bvBy5p",
        volume: 648,
        timeAgo: "2h 11m ago"
      },
      {
        date: "2h 12m ago",
        type: "Buy", 
        usdAmount: 178.25,
        tokenAmount: 9755675,
        solAmount: 0.8551,
        price: 0.00001827,
        maker: "bvBy5p",
        volume: 648,
        timeAgo: "2h 12m ago"
      },
      {
        date: "3h 05m ago",
        type: "Sell",
        usdAmount: 8.45,
        tokenAmount: 465432,
        solAmount: 0.04123,
        price: 0.00001816,
        maker: "Mx9K2p",
        volume: 648,
        timeAgo: "3h 05m ago"
      },
      {
        date: "3h 22m ago",
        type: "Buy",
        usdAmount: 45.67,
        tokenAmount: 2567891,
        solAmount: 0.2198,
        price: 0.00001779,
        maker: "RtY8Qw",
        volume: 648,
        timeAgo: "3h 22m ago"
      },
      {
        date: "4h 15m ago",
        type: "Sell",
        usdAmount: 23.89,
        tokenAmount: 1345678,
        solAmount: 0.1145,
        price: 0.00001776,
        maker: "Ab7Nx9",
        volume: 648,
        timeAgo: "4h 15m ago"
      },
      {
        date: "4h 33m ago",
        type: "Buy",
        usdAmount: 156.78,
        tokenAmount: 8821445,
        solAmount: 0.7523,
        price: 0.00001778,
        maker: "Qp4Wr2",
        volume: 648,
        timeAgo: "4h 33m ago"
      },
      {
        date: "5h 02m ago",
        type: "Buy",
        usdAmount: 67.34,
        tokenAmount: 3789012,
        solAmount: 0.3229,
        price: 0.00001778,
        maker: "Zx8Cv5",
        volume: 648,
        timeAgo: "5h 02m ago"
      },
      {
        date: "5h 18m ago",
        type: "Sell",
        usdAmount: 91.23,
        tokenAmount: 5134567,
        solAmount: 0.4378,
        price: 0.00001777,
        maker: "Mn3Df6",
        volume: 648,
        timeAgo: "5h 18m ago"
      },
      {
        date: "6h 07m ago",
        type: "Buy",
        usdAmount: 203.45,
        tokenAmount: 11456789,
        solAmount: 0.9767,
        price: 0.00001776,
        maker: "Lk9Hg2",
        volume: 648,
        timeAgo: "6h 07m ago"
      }
    ];
    
    setTransactions(sampleData);
  };

  useEffect(() => {
    generateSampleTransactions();
  }, []);

  const formatNumber = (num: number, decimals: number = 2) => {
    if (num >= 1e6) return `${(num / 1e6).toFixed(decimals)}M`;
    if (num >= 1e3) return `${(num / 1e3).toFixed(decimals)}K`;
    return num.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  };

  const formatPrice = (price: number) => {
    return `$${price.toFixed(8)}`;
  };

  const refresh = () => {
    setIsLoading(true);
    setTimeout(() => {
      generateSampleTransactions();
      setIsLoading(false);
    }, 1000);
  };

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            Transactions
          </CardTitle>
          <Button 
            onClick={refresh} 
            disabled={isLoading}
            size="sm"
            variant="outline"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-3">
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 h-8">
                <TableHead className="w-[80px] text-xs font-medium py-1">DATE</TableHead>
                <TableHead className="w-[60px] text-xs font-medium py-1">TYPE</TableHead>
                <TableHead className="text-right w-[80px] text-xs font-medium py-1">USD</TableHead>
                <TableHead className="text-right w-[100px] text-xs font-medium py-1">{tokenSymbol}</TableHead>
                <TableHead className="text-right w-[80px] text-xs font-medium py-1">SOL</TableHead>
                <TableHead className="text-right w-[100px] text-xs font-medium py-1">PRICE</TableHead>
                <TableHead className="text-center w-[70px] text-xs font-medium py-1">MAKER</TableHead>
                <TableHead className="text-right w-[80px] text-xs font-medium py-1">VOLUME</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.map((tx, index) => (
                <TableRow key={index} className="hover:bg-muted/20 h-8">
                  <TableCell className="font-mono text-xs text-muted-foreground py-1">
                    {tx.timeAgo}
                  </TableCell>
                  <TableCell className="py-1">
                    <Badge 
                      variant={tx.type === 'Buy' ? 'default' : 'destructive'}
                      className={`text-xs px-2 py-0 h-5 min-w-[40px] justify-center ${
                        tx.type === 'Buy' 
                          ? 'bg-green-500 hover:bg-green-600 text-white' 
                          : 'bg-red-500 hover:bg-red-600 text-white'
                      }`}
                    >
                      {tx.type}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs py-1">
                    {formatNumber(tx.usdAmount)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs py-1">
                    {formatNumber(tx.tokenAmount, 0)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs py-1">
                    {tx.solAmount.toFixed(5)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs py-1">
                    {formatPrice(tx.price)}
                  </TableCell>
                  <TableCell className="text-center py-1">
                    <Badge variant="outline" className="font-mono text-xs px-1 py-0 h-4">
                      {tx.maker}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs py-1">
                    ${formatNumber(tx.volume, 0)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        
        {transactions.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No transactions available</p>
          </div>
        )}
        
        <div className="mt-4 text-center">
          <p className="text-xs text-muted-foreground">
            Sample transaction data - Real data requires blockchain transaction parsing
          </p>
        </div>
      </CardContent>
    </Card>
  );
}