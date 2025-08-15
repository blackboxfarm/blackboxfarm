import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { TrendingUp, TrendingDown, DollarSign, BarChart3, Target } from "lucide-react";
import CoinScanner from "./CoinScanner";
import { toast } from "sonner";

interface FantasyTrade {
  id: string;
  timestamp: Date;
  type: 'BUY' | 'SELL';
  tokenMint: string;
  tokenSymbol: string;
  tokenName: string;
  priceUsd: number;
  quantity: number;
  usdAmount: number;
  profit?: number;
  currentPrice?: number;
}

interface FantasyPosition {
  tokenMint: string;
  tokenSymbol: string;
  tokenName: string;
  quantity: number;
  entryPrice: number;
  currentPrice: number;
  usdValue: number;
  profit: number;
  profitPercent: number;
}

interface FantasyWallet {
  cash: number;
  totalValue: number;
  totalProfit: number;
  totalProfitPercent: number;
  positions: FantasyPosition[];
  trades: FantasyTrade[];
}

const INITIAL_BALANCE = 300;
const TRADE_AMOUNT = 100;

export default function FantasyTrading() {
  const [wallet, setWallet] = useState<FantasyWallet>({
    cash: INITIAL_BALANCE,
    totalValue: INITIAL_BALANCE,
    totalProfit: 0,
    totalProfitPercent: 0,
    positions: [],
    trades: []
  });
  
  const [isScanning, setIsScanning] = useState(false);
  const [selectedToken, setSelectedToken] = useState<any>(null);

  // Load wallet from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('fantasy-wallet');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setWallet({
          ...parsed,
          trades: parsed.trades.map((t: any) => ({
            ...t,
            timestamp: new Date(t.timestamp)
          }))
        });
      } catch (error) {
        console.error('Failed to load fantasy wallet:', error);
      }
    }
  }, []);

  // Save wallet to localStorage
  useEffect(() => {
    localStorage.setItem('fantasy-wallet', JSON.stringify(wallet));
  }, [wallet]);

  // Fetch current price for a token
  const fetchTokenPrice = useCallback(async (mint: string): Promise<number | null> => {
    try {
      const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`);
      const data = await response.json();
      
      if (data.pairs && data.pairs.length > 0) {
        return parseFloat(data.pairs[0].priceUsd) || null;
      }
      return null;
    } catch (error) {
      console.error('Failed to fetch token price:', error);
      return null;
    }
  }, []);

  // Update positions with current prices
  const updatePositions = useCallback(async () => {
    if (wallet.positions.length === 0) return;

    const updatedPositions = await Promise.all(
      wallet.positions.map(async (position) => {
        const currentPrice = await fetchTokenPrice(position.tokenMint);
        if (currentPrice) {
          const usdValue = position.quantity * currentPrice;
          const profit = usdValue - (position.quantity * position.entryPrice);
          const profitPercent = ((currentPrice - position.entryPrice) / position.entryPrice) * 100;
          
          return {
            ...position,
            currentPrice,
            usdValue,
            profit,
            profitPercent
          };
        }
        return position;
      })
    );

    const totalPositionValue = updatedPositions.reduce((sum, pos) => sum + pos.usdValue, 0);
    const totalValue = wallet.cash + totalPositionValue;
    const totalProfit = totalValue - INITIAL_BALANCE;
    const totalProfitPercent = ((totalValue - INITIAL_BALANCE) / INITIAL_BALANCE) * 100;

    setWallet(prev => ({
      ...prev,
      positions: updatedPositions,
      totalValue,
      totalProfit,
      totalProfitPercent
    }));
  }, [wallet.positions, wallet.cash, fetchTokenPrice]);

  // Update prices every 30 seconds
  useEffect(() => {
    const interval = setInterval(updatePositions, 30000);
    return () => clearInterval(interval);
  }, [updatePositions]);

  const buyToken = useCallback(async (token: any) => {
    if (wallet.cash < TRADE_AMOUNT) {
      toast.error("Insufficient cash for trade");
      return;
    }

    const currentPrice = await fetchTokenPrice(token.mint);
    if (!currentPrice) {
      toast.error("Could not fetch current token price");
      return;
    }

    const quantity = TRADE_AMOUNT / currentPrice;
    const newTrade: FantasyTrade = {
      id: crypto.randomUUID(),
      timestamp: new Date(),
      type: 'BUY',
      tokenMint: token.mint,
      tokenSymbol: token.symbol,
      tokenName: token.name,
      priceUsd: currentPrice,
      quantity,
      usdAmount: TRADE_AMOUNT
    };

    setWallet(prev => {
      const existingPosition = prev.positions.find(p => p.tokenMint === token.mint);
      
      let newPositions;
      if (existingPosition) {
        // Add to existing position
        const totalQuantity = existingPosition.quantity + quantity;
        const avgPrice = ((existingPosition.quantity * existingPosition.entryPrice) + TRADE_AMOUNT) / totalQuantity;
        
        newPositions = prev.positions.map(p => 
          p.tokenMint === token.mint 
            ? { ...p, quantity: totalQuantity, entryPrice: avgPrice, usdValue: totalQuantity * currentPrice }
            : p
        );
      } else {
        // Create new position
        newPositions = [...prev.positions, {
          tokenMint: token.mint,
          tokenSymbol: token.symbol,
          tokenName: token.name,
          quantity,
          entryPrice: currentPrice,
          currentPrice,
          usdValue: TRADE_AMOUNT,
          profit: 0,
          profitPercent: 0
        }];
      }

      return {
        ...prev,
        cash: prev.cash - TRADE_AMOUNT,
        positions: newPositions,
        trades: [newTrade, ...prev.trades]
      };
    });

    toast.success(`Bought ${quantity.toFixed(6)} ${token.symbol} for $${TRADE_AMOUNT}`);
  }, [wallet.cash, fetchTokenPrice]);

  const sellPosition = useCallback(async (position: FantasyPosition) => {
    const currentPrice = await fetchTokenPrice(position.tokenMint);
    if (!currentPrice) {
      toast.error("Could not fetch current token price");
      return;
    }

    const usdAmount = position.quantity * currentPrice;
    const profit = usdAmount - (position.quantity * position.entryPrice);

    const newTrade: FantasyTrade = {
      id: crypto.randomUUID(),
      timestamp: new Date(),
      type: 'SELL',
      tokenMint: position.tokenMint,
      tokenSymbol: position.tokenSymbol,
      tokenName: position.tokenName,
      priceUsd: currentPrice,
      quantity: position.quantity,
      usdAmount,
      profit
    };

    setWallet(prev => ({
      ...prev,
      cash: prev.cash + usdAmount,
      positions: prev.positions.filter(p => p.tokenMint !== position.tokenMint),
      trades: [newTrade, ...prev.trades]
    }));

    toast.success(`Sold ${position.quantity.toFixed(6)} ${position.tokenSymbol} for $${usdAmount.toFixed(2)} (${profit >= 0 ? '+' : ''}$${profit.toFixed(2)})`);
  }, [fetchTokenPrice]);

  const resetWallet = useCallback(() => {
    setWallet({
      cash: INITIAL_BALANCE,
      totalValue: INITIAL_BALANCE,
      totalProfit: 0,
      totalProfitPercent: 0,
      positions: [],
      trades: []
    });
    toast.success("Fantasy wallet reset");
  }, []);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', { 
      style: 'currency', 
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  };

  const formatPercent = (percent: number) => {
    return `${percent >= 0 ? '+' : ''}${percent.toFixed(2)}%`;
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Fantasy Trading
          </CardTitle>
          <CardDescription>
            Paper trading with virtual $300 wallet. Each trade is $100.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Wallet Overview */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Cash</span>
                </div>
                <p className="text-2xl font-bold">{formatCurrency(wallet.cash)}</p>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Total Value</span>
                </div>
                <p className="text-2xl font-bold">{formatCurrency(wallet.totalValue)}</p>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  {wallet.totalProfit >= 0 ? (
                    <TrendingUp className="h-4 w-4 text-green-500" />
                  ) : (
                    <TrendingDown className="h-4 w-4 text-red-500" />
                  )}
                  <span className="text-sm font-medium">Total P&L</span>
                </div>
                <p className={`text-2xl font-bold ${wallet.totalProfit >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {formatCurrency(wallet.totalProfit)}
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">ROI</span>
                </div>
                <p className={`text-2xl font-bold ${wallet.totalProfitPercent >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {formatPercent(wallet.totalProfitPercent)}
                </p>
                <Progress 
                  value={Math.min(100, Math.max(0, (wallet.totalValue / INITIAL_BALANCE) * 100))} 
                  className="mt-2"
                />
              </CardContent>
            </Card>
          </div>

          <div className="flex gap-4 mb-6">
            <Button onClick={() => updatePositions()}>
              Refresh Prices
            </Button>
            <Button variant="outline" onClick={resetWallet}>
              Reset Wallet
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Token Scanner */}
      <Card>
        <CardHeader>
          <CardTitle>Token Scanner</CardTitle>
          <CardDescription>
            Find the best tokens to trade
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CoinScanner 
            onTokenSuggestion={(token) => {
              setSelectedToken(token);
              if (wallet.cash >= TRADE_AMOUNT) {
                buyToken(token);
              } else {
                toast.error("Insufficient cash for trade");
              }
            }}
            autoScanEnabled={isScanning}
          />
        </CardContent>
      </Card>

      {/* Current Positions */}
      {wallet.positions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Current Positions</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Token</TableHead>
                  <TableHead>Quantity</TableHead>
                  <TableHead>Entry Price</TableHead>
                  <TableHead>Current Price</TableHead>
                  <TableHead>Value</TableHead>
                  <TableHead>P&L</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {wallet.positions.map((position) => (
                  <TableRow key={position.tokenMint}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{position.tokenSymbol}</div>
                        <div className="text-sm text-muted-foreground">{position.tokenName}</div>
                      </div>
                    </TableCell>
                    <TableCell>{position.quantity.toFixed(6)}</TableCell>
                    <TableCell>{formatCurrency(position.entryPrice)}</TableCell>
                    <TableCell>{formatCurrency(position.currentPrice)}</TableCell>
                    <TableCell>{formatCurrency(position.usdValue)}</TableCell>
                    <TableCell>
                      <div className={position.profit >= 0 ? 'text-green-500' : 'text-red-500'}>
                        {formatCurrency(position.profit)}
                        <br />
                        <span className="text-xs">
                          {formatPercent(position.profitPercent)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => sellPosition(position)}
                      >
                        Sell
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Trade History */}
      {wallet.trades.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Trade History</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Token</TableHead>
                  <TableHead>Quantity</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>P&L</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {wallet.trades.slice(0, 20).map((trade) => (
                  <TableRow key={trade.id}>
                    <TableCell className="text-sm">
                      {trade.timestamp.toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Badge variant={trade.type === 'BUY' ? 'default' : 'secondary'}>
                        {trade.type}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium">{trade.tokenSymbol}</div>
                        <div className="text-xs text-muted-foreground">{trade.tokenName}</div>
                      </div>
                    </TableCell>
                    <TableCell>{trade.quantity.toFixed(6)}</TableCell>
                    <TableCell>{formatCurrency(trade.priceUsd)}</TableCell>
                    <TableCell>{formatCurrency(trade.usdAmount)}</TableCell>
                    <TableCell>
                      {trade.profit !== undefined && (
                        <span className={trade.profit >= 0 ? 'text-green-500' : 'text-red-500'}>
                          {formatCurrency(trade.profit)}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}