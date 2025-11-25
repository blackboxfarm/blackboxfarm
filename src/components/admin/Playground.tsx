import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface Wallet {
  id: number;
  tokens: number;
  sol: number;
}

interface SellStrategy {
  startPrice: number;
  sellAmount: number;
  priceStep: number;
  sellType: 'tokens' | 'percent';
}

export const Playground = () => {
  const [pricePoints, setPricePoints] = useState<number[]>([0.00001, 0.00005, 0.0001, 0.0005, 0.001]);
  const [customPrice, setCustomPrice] = useState('');

  // 10 wallets with 25M tokens each
  const largeWallets: Wallet[] = Array.from({ length: 10 }, (_, i) => ({
    id: i + 1,
    tokens: 25_000_000,
    sol: 1
  }));

  // 5 wallets with 20M tokens each
  const mediumWallets: Wallet[] = Array.from({ length: 5 }, (_, i) => ({
    id: i + 11,
    tokens: 20_000_000,
    sol: 1
  }));

  const allWallets = [...largeWallets, ...mediumWallets];
  const totalTokens = allWallets.reduce((sum, w) => sum + w.tokens, 0);
  const totalSol = allWallets.reduce((sum, w) => sum + w.sol, 0);

  // Sell strategies for each wallet
  const [strategies, setStrategies] = useState<Record<number, SellStrategy>>(() => {
    const initial: Record<number, SellStrategy> = {};
    allWallets.forEach(w => {
      initial[w.id] = {
        startPrice: 0.00004,
        sellAmount: 1_000_000,
        priceStep: 0.00001,
        sellType: 'tokens'
      };
    });
    return initial;
  });

  const calculateProfit = (wallet: Wallet, pricePerToken: number) => {
    const tokenValue = wallet.tokens * pricePerToken;
    const totalValue = tokenValue + wallet.sol;
    const profit = totalValue - wallet.sol;
    return { tokenValue, totalValue, profit };
  };

  const addCustomPrice = () => {
    const price = parseFloat(customPrice);
    if (price && price > 0 && !pricePoints.includes(price)) {
      setPricePoints([...pricePoints, price].sort((a, b) => a - b));
      setCustomPrice('');
    }
  };

  const updateStrategy = (walletId: number, field: keyof SellStrategy, value: any) => {
    setStrategies(prev => ({
      ...prev,
      [walletId]: {
        ...prev[walletId],
        [field]: value
      }
    }));
  };

  const calculateFinalSellPrice = (wallet: Wallet, strategy: SellStrategy): number => {
    if (!strategy.startPrice || !strategy.sellAmount || !strategy.priceStep) return 0;
    
    let remainingTokens = wallet.tokens;
    let currentPrice = strategy.startPrice;
    let steps = 0;
    
    if (strategy.sellType === 'tokens') {
      // Fixed token amount per step
      steps = Math.ceil(remainingTokens / strategy.sellAmount);
      return currentPrice + (steps * strategy.priceStep);
    } else {
      // Percentage based - need to iterate
      while (remainingTokens > 0.01) { // Stop when less than 0.01 tokens remain
        const tokensToSell = (remainingTokens * strategy.sellAmount) / 100;
        remainingTokens -= tokensToSell;
        currentPrice += strategy.priceStep;
        steps++;
        
        // Safety break after 10000 steps
        if (steps > 10000) break;
      }
      return currentPrice;
    }
  };

  const calculateStrategyProfit = (wallet: Wallet, strategy: SellStrategy): number => {
    let remainingTokens = wallet.tokens;
    let totalProfit = 0;
    let currentPrice = strategy.startPrice;
    
    // Sort price points to process in order
    const sortedPrices = [...pricePoints].sort((a, b) => a - b);
    
    for (const price of sortedPrices) {
      if (price < strategy.startPrice || remainingTokens <= 0) continue;
      
      // Calculate how many steps we've taken from start price
      const priceIncrease = price - currentPrice;
      if (priceIncrease < strategy.priceStep) continue;
      
      const steps = Math.floor(priceIncrease / strategy.priceStep);
      
      for (let step = 0; step < steps && remainingTokens > 0; step++) {
        const sellPrice = currentPrice + (strategy.priceStep * (step + 1));
        
        let tokensToSell: number;
        if (strategy.sellType === 'tokens') {
          tokensToSell = Math.min(strategy.sellAmount, remainingTokens);
        } else {
          // Percentage based
          tokensToSell = Math.min((remainingTokens * strategy.sellAmount) / 100, remainingTokens);
        }
        
        totalProfit += tokensToSell * sellPrice;
        remainingTokens -= tokensToSell;
      }
      
      currentPrice = price;
    }
    
    // Add value of remaining tokens at highest price
    if (remainingTokens > 0 && sortedPrices.length > 0) {
      const highestPrice = sortedPrices[sortedPrices.length - 1];
      totalProfit += remainingTokens * highestPrice;
    }
    
    return totalProfit;
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Wallet Playground - Profit Simulator</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="p-4 tech-border rounded-lg bg-card">
              <div className="text-sm text-muted-foreground">Total Wallets</div>
              <div className="text-2xl font-bold text-foreground">{allWallets.length}</div>
            </div>
            <div className="p-4 tech-border rounded-lg bg-card">
              <div className="text-sm text-muted-foreground">Total Tokens</div>
              <div className="text-2xl font-bold text-foreground">{(totalTokens / 1_000_000).toFixed(0)}M</div>
            </div>
            <div className="p-4 tech-border rounded-lg bg-card">
              <div className="text-sm text-muted-foreground">Total SOL</div>
              <div className="text-2xl font-bold text-foreground">{totalSol} SOL</div>
            </div>
          </div>

          <div className="flex gap-2 mb-6">
            <div className="flex-1">
              <Label>Add Price Point</Label>
              <Input
                type="number"
                step="0.00001"
                placeholder="e.g., 0.0001"
                value={customPrice}
                onChange={(e) => setCustomPrice(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && addCustomPrice()}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Large Wallets (25M tokens each)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Wallet</TableHead>
                  <TableHead>Tokens</TableHead>
                  <TableHead>SOL</TableHead>
                  {pricePoints.map(price => (
                    <TableHead key={price} className="text-right">
                      @ ${price.toFixed(6)}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {largeWallets.map(wallet => (
                  <>
                    <TableRow key={wallet.id}>
                      <TableCell className="font-medium">W{wallet.id}</TableCell>
                      <TableCell>{(wallet.tokens / 1_000_000).toFixed(1)}M</TableCell>
                      <TableCell>{wallet.sol} SOL</TableCell>
                      {pricePoints.map(price => {
                        const { profit } = calculateProfit(wallet, price);
                        return (
                          <TableCell key={price} className="text-right">
                            <span className={profit > 0 ? 'text-green-500' : 'text-muted-foreground'}>
                              ${profit.toFixed(2)}
                            </span>
                          </TableCell>
                        );
                      })}
                    </TableRow>
                    <TableRow key={`${wallet.id}-strategy`} className="bg-muted/30">
                      <TableCell colSpan={3} className="text-xs">
                        <div className="flex gap-2 items-center flex-wrap">
                          <span className="text-muted-foreground">Strategy:</span>
                          <Input
                            type="number"
                            step="0.00001"
                            placeholder="Start $"
                            value={strategies[wallet.id]?.startPrice || ''}
                            onChange={(e) => updateStrategy(wallet.id, 'startPrice', parseFloat(e.target.value) || 0)}
                            className="w-24 h-7 text-xs"
                          />
                          <span className="text-muted-foreground">sell</span>
                          <Input
                            type="number"
                            placeholder="Amount"
                            value={strategies[wallet.id]?.sellAmount || ''}
                            onChange={(e) => updateStrategy(wallet.id, 'sellAmount', parseFloat(e.target.value) || 0)}
                            className="w-24 h-7 text-xs"
                          />
                          <select
                            value={strategies[wallet.id]?.sellType || 'tokens'}
                            onChange={(e) => updateStrategy(wallet.id, 'sellType', e.target.value)}
                            className="h-7 text-xs bg-background border border-input rounded px-2"
                          >
                            <option value="tokens">tokens</option>
                            <option value="percent">%</option>
                          </select>
                          <span className="text-muted-foreground">every</span>
                          <Input
                            type="number"
                            step="0.00001"
                            placeholder="Step"
                            value={strategies[wallet.id]?.priceStep || ''}
                            onChange={(e) => updateStrategy(wallet.id, 'priceStep', parseFloat(e.target.value) || 0)}
                            className="w-24 h-7 text-xs"
                          />
                          <span className="text-muted-foreground">rise</span>
                          {strategies[wallet.id]?.startPrice > 0 && strategies[wallet.id]?.sellAmount > 0 && strategies[wallet.id]?.priceStep > 0 && (
                            <span className="text-cyan-400 font-mono ml-2">
                              → Final: ${calculateFinalSellPrice(wallet, strategies[wallet.id]).toFixed(6)}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell colSpan={pricePoints.length} className="text-right">
                        <span className="text-green-500 font-bold text-sm">
                          Total: ${calculateStrategyProfit(wallet, strategies[wallet.id] || { startPrice: 0, sellAmount: 0, priceStep: 0, sellType: 'tokens' }).toFixed(2)}
                        </span>
                      </TableCell>
                    </TableRow>
                  </>
                ))}
                <TableRow className="font-bold bg-muted/50">
                  <TableCell>Subtotal</TableCell>
                  <TableCell>{(largeWallets.reduce((sum, w) => sum + w.tokens, 0) / 1_000_000).toFixed(0)}M</TableCell>
                  <TableCell>{largeWallets.reduce((sum, w) => sum + w.sol, 0)} SOL</TableCell>
                  {pricePoints.map(price => {
                    const totalProfit = largeWallets.reduce((sum, w) => sum + calculateProfit(w, price).profit, 0);
                    return (
                      <TableCell key={price} className="text-right">
                        <span className={totalProfit > 0 ? 'text-green-500' : 'text-muted-foreground'}>
                          ${totalProfit.toFixed(2)}
                        </span>
                      </TableCell>
                    );
                  })}
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Medium Wallets (20M tokens each)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Wallet</TableHead>
                  <TableHead>Tokens</TableHead>
                  <TableHead>SOL</TableHead>
                  {pricePoints.map(price => (
                    <TableHead key={price} className="text-right">
                      @ ${price.toFixed(6)}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {mediumWallets.map(wallet => (
                  <>
                    <TableRow key={wallet.id}>
                      <TableCell className="font-medium">W{wallet.id}</TableCell>
                      <TableCell>{(wallet.tokens / 1_000_000).toFixed(1)}M</TableCell>
                      <TableCell>{wallet.sol} SOL</TableCell>
                      {pricePoints.map(price => {
                        const { profit } = calculateProfit(wallet, price);
                        return (
                          <TableCell key={price} className="text-right">
                            <span className={profit > 0 ? 'text-green-500' : 'text-muted-foreground'}>
                              ${profit.toFixed(2)}
                            </span>
                          </TableCell>
                        );
                      })}
                    </TableRow>
                    <TableRow key={`${wallet.id}-strategy`} className="bg-muted/30">
                      <TableCell colSpan={3} className="text-xs">
                        <div className="flex gap-2 items-center flex-wrap">
                          <span className="text-muted-foreground">Strategy:</span>
                          <Input
                            type="number"
                            step="0.00001"
                            placeholder="Start $"
                            value={strategies[wallet.id]?.startPrice || ''}
                            onChange={(e) => updateStrategy(wallet.id, 'startPrice', parseFloat(e.target.value) || 0)}
                            className="w-24 h-7 text-xs"
                          />
                          <span className="text-muted-foreground">sell</span>
                          <Input
                            type="number"
                            placeholder="Amount"
                            value={strategies[wallet.id]?.sellAmount || ''}
                            onChange={(e) => updateStrategy(wallet.id, 'sellAmount', parseFloat(e.target.value) || 0)}
                            className="w-24 h-7 text-xs"
                          />
                          <select
                            value={strategies[wallet.id]?.sellType || 'tokens'}
                            onChange={(e) => updateStrategy(wallet.id, 'sellType', e.target.value)}
                            className="h-7 text-xs bg-background border border-input rounded px-2"
                          >
                            <option value="tokens">tokens</option>
                            <option value="percent">%</option>
                          </select>
                          <span className="text-muted-foreground">every</span>
                          <Input
                            type="number"
                            step="0.00001"
                            placeholder="Step"
                            value={strategies[wallet.id]?.priceStep || ''}
                            onChange={(e) => updateStrategy(wallet.id, 'priceStep', parseFloat(e.target.value) || 0)}
                            className="w-24 h-7 text-xs"
                          />
                          <span className="text-muted-foreground">rise</span>
                          {strategies[wallet.id]?.startPrice > 0 && strategies[wallet.id]?.sellAmount > 0 && strategies[wallet.id]?.priceStep > 0 && (
                            <span className="text-cyan-400 font-mono ml-2">
                              → Final: ${calculateFinalSellPrice(wallet, strategies[wallet.id]).toFixed(6)}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell colSpan={pricePoints.length} className="text-right">
                        <span className="text-green-500 font-bold text-sm">
                          Total: ${calculateStrategyProfit(wallet, strategies[wallet.id] || { startPrice: 0, sellAmount: 0, priceStep: 0, sellType: 'tokens' }).toFixed(2)}
                        </span>
                      </TableCell>
                    </TableRow>
                  </>
                ))}
                <TableRow className="font-bold bg-muted/50">
                  <TableCell>Subtotal</TableCell>
                  <TableCell>{(mediumWallets.reduce((sum, w) => sum + w.tokens, 0) / 1_000_000).toFixed(0)}M</TableCell>
                  <TableCell>{mediumWallets.reduce((sum, w) => sum + w.sol, 0)} SOL</TableCell>
                  {pricePoints.map(price => {
                    const totalProfit = mediumWallets.reduce((sum, w) => sum + calculateProfit(w, price).profit, 0);
                    return (
                      <TableCell key={price} className="text-right">
                        <span className={totalProfit > 0 ? 'text-green-500' : 'text-muted-foreground'}>
                          ${totalProfit.toFixed(2)}
                        </span>
                      </TableCell>
                    );
                  })}
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Total Portfolio Profit</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Price Point</TableHead>
                <TableHead className="text-right">Token Value</TableHead>
                <TableHead className="text-right">Total Value (+ SOL)</TableHead>
                <TableHead className="text-right">Net Profit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pricePoints.map(price => {
                const totalTokenValue = totalTokens * price;
                const totalValue = totalTokenValue + totalSol;
                const netProfit = totalValue - totalSol;
                return (
                  <TableRow key={price}>
                    <TableCell className="font-medium">${price.toFixed(6)}</TableCell>
                    <TableCell className="text-right">${totalTokenValue.toFixed(2)}</TableCell>
                    <TableCell className="text-right">${totalValue.toFixed(2)}</TableCell>
                    <TableCell className="text-right">
                      <span className={netProfit > 0 ? 'text-green-500 font-bold' : 'text-muted-foreground'}>
                        ${netProfit.toFixed(2)}
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};
