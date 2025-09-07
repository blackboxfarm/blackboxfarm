import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface TokenTransfer {
  signature: string;
  timestamp: number;
  type: 'send' | 'receive';
  amount: number;
  fromAddress: string;
  toAddress: string;
  slot: number;
  blockTime: number;
}

interface InvestigationResult {
  childWallet: string;
  parentWallet: string;
  tokenMint: string;
  totalTokensSold: number;
  totalTransactions: number;
  firstTokenReceived: TokenTransfer | null;
  allTransfers: TokenTransfer[];
  tokenOrigins: string[];
  investigationSummary: string;
}

export function WalletInvestigator() {
  const [childWallet, setChildWallet] = useState('AovoyjWR6iwzPSZEMjUfKeDtXhS71kq74gkFNyMLomjU');
  const [parentWallet, setParentWallet] = useState('AbFwiFMeVaUyUDGfNJ1HhoBBbnFcjncq5twrk6HrqdxP');
  const [tokenMint, setTokenMint] = useState('GvkxeDmoghdjdrmMtc7EZQVobTgV7JiBLEkmPdVyBAGS');
  const [isInvestigating, setIsInvestigating] = useState(false);
  const [result, setResult] = useState<InvestigationResult | null>(null);
  const { toast } = useToast();

  // Auto-investigate on component mount
  useEffect(() => {
    investigate();
  }, []);

  const investigate = async () => {
    if (!childWallet || !parentWallet || !tokenMint) {
      toast({
        title: "Missing Information",
        description: "Please fill in all wallet addresses and token mint",
        variant: "destructive"
      });
      return;
    }

    setIsInvestigating(true);
    try {
      const { data, error } = await supabase.functions.invoke('bagless-investigation', {
        body: {
          childWallet: childWallet.trim(),
          parentWallet: parentWallet.trim(),
          tokenMint: tokenMint.trim()
        }
      });

      if (error) throw error;

      setResult(data);
      toast({
        title: "Investigation Complete",
        description: `Found ${data.totalTransactions} token transactions`,
      });
    } catch (error) {
      console.error('Investigation failed:', error);
      toast({
        title: "Investigation Failed",
        description: error.message || "Failed to investigate wallets",
        variant: "destructive"
      });
    } finally {
      setIsInvestigating(false);
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString();
  };

  const formatTokenAmount = (amount: number) => {
    return amount.toLocaleString();
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Blockchain Wallet Investigator</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="childWallet">Child Wallet</Label>
              <Input
                id="childWallet"
                value={childWallet}
                onChange={(e) => setChildWallet(e.target.value)}
                placeholder="Child wallet address"
              />
            </div>
            <div>
              <Label htmlFor="parentWallet">Parent Wallet</Label>
              <Input
                id="parentWallet"
                value={parentWallet}
                onChange={(e) => setParentWallet(e.target.value)}
                placeholder="Parent wallet address"
              />
            </div>
          </div>
          
          <div>
            <Label htmlFor="tokenMint">Token Mint (Bagless)</Label>
            <Input
              id="tokenMint"
              value={tokenMint}
              onChange={(e) => setTokenMint(e.target.value)}
              placeholder="Token mint address"
            />
          </div>

          <Button 
            onClick={investigate} 
            disabled={isInvestigating}
            className="w-full"
          >
            {isInvestigating ? 'Investigating...' : 'Start Investigation'}
          </Button>
        </CardContent>
      </Card>

      {result && (
        <div className="space-y-6">
          {/* Summary Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Investigation Results 
                <Badge variant="outline">{result.totalTransactions} Transactions</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div className="text-center p-4 bg-muted rounded-lg">
                  <div className="text-2xl font-bold text-red-600">
                    {formatTokenAmount(result.totalTokensSold)}
                  </div>
                  <div className="text-sm text-muted-foreground">Total Tokens Sold</div>
                </div>
                <div className="text-center p-4 bg-muted rounded-lg">
                  <div className="text-2xl font-bold">
                    {result.totalTransactions}
                  </div>
                  <div className="text-sm text-muted-foreground">Total Transactions</div>
                </div>
                <div className="text-center p-4 bg-muted rounded-lg">
                  <div className="text-2xl font-bold">
                    {result.tokenOrigins.length}
                  </div>
                  <div className="text-sm text-muted-foreground">Token Sources</div>
                </div>
              </div>

              <div>
                <Label>Investigation Summary</Label>
                <Textarea
                  value={result.investigationSummary}
                  readOnly
                  className="mt-2 min-h-[300px] font-mono text-sm"
                />
              </div>
            </CardContent>
          </Card>

          {/* First Token Receipt */}
          {result.firstTokenReceived && (
            <Card>
              <CardHeader>
                <CardTitle>First Token Receipt</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div><strong>Date:</strong> {formatDate(result.firstTokenReceived.timestamp)}</div>
                  <div><strong>Amount:</strong> {formatTokenAmount(result.firstTokenReceived.amount)}</div>
                  <div><strong>From:</strong> {result.firstTokenReceived.fromAddress}</div>
                  <div><strong>Transaction:</strong> 
                    <a 
                      href={`https://solscan.io/tx/${result.firstTokenReceived.signature}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline ml-2"
                    >
                      {result.firstTokenReceived.signature.slice(0, 20)}...
                    </a>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Token Origins */}
          <Card>
            <CardHeader>
              <CardTitle>Token Origins ({result.tokenOrigins.length} sources)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {result.tokenOrigins.map((origin, index) => (
                  <div key={index} className="p-2 bg-muted rounded font-mono text-sm">
                    {origin}
                    {origin === result.parentWallet && (
                      <Badge variant="destructive" className="ml-2">PARENT WALLET</Badge>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Recent Transactions */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Bagless Transactions (Last 10)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {result.allTransfers.slice(-10).reverse().map((transfer, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-muted rounded">
                    <div>
                      <Badge variant={transfer.type === 'send' ? 'destructive' : 'default'}>
                        {transfer.type.toUpperCase()}
                      </Badge>
                      <span className="ml-2 font-mono text-sm">
                        {formatTokenAmount(transfer.amount)} tokens
                      </span>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {formatDate(transfer.timestamp)}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}