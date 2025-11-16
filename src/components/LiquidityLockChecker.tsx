import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Lock, Unlock, Search, CheckCircle, XCircle, Info } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface LiquidityCheckResult {
  tokenMint: string;
  isLocked: boolean;
  lockPercentage: number;
  lockMechanism: string;
  dexInfo: string;
  tokenInfo: {
    name: string;
    symbol: string;
    price: number;
  } | null;
  checkedMethods: string[];
  error?: string;
  lpAccount?: string | null;
  lpSource?: 'solscan' | 'dexscreener' | 'heuristic';
}

export function LiquidityLockChecker() {
  const [tokenAddress, setTokenAddress] = useState("");
  const [isChecking, setIsChecking] = useState(false);
  const [result, setResult] = useState<LiquidityCheckResult | null>(null);
  const { toast } = useToast();

  const validateTokenAddress = (address: string): boolean => {
    // Basic Solana address validation (base58, 32-44 characters)
    const solanaAddressRegex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
    return solanaAddressRegex.test(address);
  };

  const checkLiquidityLock = async () => {
    if (!tokenAddress.trim()) {
      toast({
        title: "Error",
        description: "Please enter a token address",
        variant: "destructive",
      });
      return;
    }

    if (!validateTokenAddress(tokenAddress.trim())) {
      toast({
        title: "Invalid Address",
        description: "Please enter a valid Solana token address",
        variant: "destructive",
      });
      return;
    }

    setIsChecking(true);
    setResult(null);

    try {
      const { data, error } = await supabase.functions.invoke('liquidity-lock-checker', {
        body: { tokenMint: tokenAddress.trim() }
      });

      if (error) throw error;

      setResult(data);
      
      toast({
        title: "Check Complete",
        description: `Liquidity status: ${data.isLocked ? 'LOCKED' : 'NOT LOCKED'}`,
        variant: data.isLocked ? "default" : "destructive",
      });
    } catch (error) {
      console.error('Liquidity check error:', error);
      toast({
        title: "Check Failed",
        description: "Failed to check liquidity lock status. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsChecking(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isChecking) {
      checkLiquidityLock();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col space-y-4">
        <div>
          <h2 className="text-2xl font-bold mb-2">Liquidity Lock Checker</h2>
          <p className="text-muted-foreground">
            Check if a token's liquidity pool is locked or burned to prevent rug pulls
          </p>
        </div>

        <div className="flex space-x-2">
          <Input
            placeholder="Enter Solana token address (mint)"
            value={tokenAddress}
            onChange={(e) => setTokenAddress(e.target.value)}
            onKeyPress={handleKeyPress}
            className="flex-1"
          />
          <Button 
            onClick={checkLiquidityLock} 
            disabled={isChecking}
            className="min-w-[120px]"
          >
            {isChecking ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Checking...
              </>
            ) : (
              <>
                <Search className="w-4 h-4 mr-2" />
                Check Status
              </>
            )}
          </Button>
        </div>
      </div>

      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              {result.isLocked ? (
                <Lock className="w-5 h-5 text-green-500" />
              ) : (
                <Unlock className="w-5 h-5 text-red-500" />
              )}
              <span>Liquidity Lock Status</span>
              <Badge variant={result.isLocked ? "default" : "destructive"}>
                {result.isLocked ? "LOCKED" : "NOT LOCKED"}
              </Badge>
            </CardTitle>
            <CardDescription>
              Analysis for: {result.tokenMint}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {result.lpAccount && result.lpSource === 'solscan' && (
              <div className="mb-3 p-3 bg-primary/10 rounded-lg border border-primary/20">
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle className="w-4 h-4 text-primary" />
                  <span className="text-sm font-semibold text-primary">Verified by Solscan</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  LP Pool: <code className="text-xs bg-background/50 px-1 rounded">{result.lpAccount.slice(0, 8)}...{result.lpAccount.slice(-6)}</code>
                </p>
                <a 
                  href={`https://solscan.io/account/${result.lpAccount}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline"
                >
                  View on Solscan →
                </a>
              </div>
            )}
            {result.tokenInfo && (
              <div className="grid grid-cols-2 gap-4 p-4 bg-muted/20 rounded-lg">
                <div>
                  <p className="text-sm text-muted-foreground">Token Name</p>
                  <p className="font-medium">{result.tokenInfo.name}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Symbol</p>
                  <p className="font-medium">{result.tokenInfo.symbol}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Price (USD)</p>
                  <p className="font-medium">${result.tokenInfo.price.toFixed(8)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">DEX</p>
                  <p className="font-medium">{result.dexInfo}</p>
                </div>
              </div>
            )}

            <CardContent className="space-y-4">
              {result.lpAccount && result.lpSource === 'solscan' && (
                <div className="mb-3 p-3 bg-primary/10 rounded-lg border border-primary/20">
                  <div className="flex items-center gap-2 mb-1">
                    <CheckCircle className="w-4 h-4 text-primary" />
                    <span className="text-sm font-semibold text-primary">Verified by Solscan</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    LP Pool: <code className="text-xs bg-background/50 px-1 rounded">{result.lpAccount.slice(0, 8)}...{result.lpAccount.slice(-6)}</code>
                  </p>
                  <a 
                    href={`https://solscan.io/account/${result.lpAccount}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline"
                  >
                    View on Solscan →
                  </a>
                </div>
              )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Lock Percentage</p>
                <div className="flex items-center space-x-2">
                  <div className="flex-1 bg-muted rounded-full h-2">
                    <div 
                      className={`h-2 rounded-full transition-all ${
                        result.lockPercentage > 80 ? 'bg-green-500' :
                        result.lockPercentage > 50 ? 'bg-yellow-500' : 'bg-red-500'
                      }`}
                      style={{ width: `${Math.min(result.lockPercentage, 100)}%` }}
                    />
                  </div>
                  <span className="text-sm font-medium min-w-[40px]">
                    {result.lockPercentage}%
                  </span>
                </div>
              </div>

              <div>
                <p className="text-sm text-muted-foreground">Lock Mechanism</p>
                <Badge variant="outline" className="capitalize">
                  {result.lockMechanism.replace('_', ' ')}
                </Badge>
              </div>
            </div>

            <div>
              <p className="text-sm text-muted-foreground mb-2">Detection Methods Used</p>
              <div className="space-y-1">
                {result.checkedMethods.map((method, index) => (
                  <div key={index} className="flex items-center space-x-2 text-sm">
                    {method.includes('FAILED') ? (
                      <XCircle className="w-3 h-3 text-red-500" />
                    ) : (
                      <CheckCircle className="w-3 h-3 text-green-500" />
                    )}
                    <span className={method.includes('FAILED') ? 'text-red-500' : 'text-green-600'}>
                      {method}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {result.error && (
              <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
                <div className="flex items-center space-x-2">
                  <Info className="w-4 h-4 text-red-500" />
                  <p className="text-sm text-red-700 dark:text-red-300">{result.error}</p>
                </div>
              </div>
            )}

            <div className="text-xs text-muted-foreground p-3 bg-muted/20 rounded-md">
              <p className="font-medium mb-1">Important Notes:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>A high lock percentage (&gt;80%) typically indicates good liquidity security</li>
                <li>Burned tokens are permanently removed and cannot be recovered</li>
                <li>This tool analyzes available on-chain data but cannot guarantee 100% accuracy</li>
                <li>Always do your own research before making investment decisions</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}