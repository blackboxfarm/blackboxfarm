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
  tokenMint: string;
  currentBalance: number;
  balanceRaw: string;
  summary: string;
  hasTokens: boolean;
}

export function WalletInvestigator() {
  const [childWallet, setChildWallet] = useState('AovoyjWR6iwzPSZEMjUfKeDtXhS71kq74gkFNyMLomjU');
  const [tokenMint, setTokenMint] = useState('GvkxeDmoghdjdrmMtc7EZQVobTgV7JiBLEkmPdVyBAGS');
  const [isInvestigating, setIsInvestigating] = useState(false);
  const [result, setResult] = useState<InvestigationResult | null>(null);
  const { toast } = useToast();

  // Remove auto-investigation to prevent crashes
  // useEffect(() => {
  //   investigate();
  // }, []);

  const investigate = async () => {
    if (!childWallet || !tokenMint) {
      toast({
        title: "Missing Information",
        description: "Please fill in wallet address and token mint",
        variant: "destructive"
      });
      return;
    }

    setIsInvestigating(true);
    setResult(null);
    
    try {
      console.log('Checking token balance...');
      const { data, error } = await supabase.functions.invoke('bagless-investigation', {
        body: {
          childWallet: childWallet.trim(),
          tokenMint: tokenMint.trim()
        }
      });

      if (error) {
        console.error('Balance check error:', error);
        throw new Error(error.message || 'Balance check failed');
      }

      console.log('Balance check completed:', data);
      setResult(data);
      
      toast({
        title: "Balance Check Complete",
        description: `Current balance: ${data.currentBalance || 0} Bagless tokens`,
      });
    } catch (error) {
      console.error('Balance check failed:', error);
      toast({
        title: "Balance Check Failed",
        description: error instanceof Error ? error.message : "Failed to check token balance",
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
          <CardTitle>Bagless Token Balance Checker</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="childWallet">Wallet Address</Label>
            <Input
              id="childWallet"
              value={childWallet}
              onChange={(e) => setChildWallet(e.target.value)}
              placeholder="Wallet address to check"
            />
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
            {isInvestigating ? 'Checking Balance...' : 'Check Current Balance'}
          </Button>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Current Balance Results
              <Badge variant={result.hasTokens ? "default" : "secondary"}>
                {result.hasTokens ? "Has Tokens" : "No Tokens"}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center p-8 bg-muted rounded-lg mb-4">
              <div className="text-4xl font-bold mb-2">
                {formatTokenAmount(result.currentBalance)}
              </div>
              <div className="text-lg text-muted-foreground">Bagless Tokens Currently Held</div>
              <div className="text-sm text-muted-foreground mt-2">
                Raw Balance: {result.balanceRaw}
              </div>
            </div>

            <div>
              <Label>Summary</Label>
              <Textarea
                value={result.summary}
                readOnly
                className="mt-2 min-h-[100px] font-mono text-sm"
              />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}