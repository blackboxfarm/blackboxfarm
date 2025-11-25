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
