import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Coins, DollarSign, Trash2, RefreshCw, ArrowLeftRight, Percent, Hash } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useSolPrice } from "@/hooks/useSolPrice";

interface TokenBalance {
  mint: string;
  symbol: string;
  name: string;
  balance: number;
  uiAmount: number;
  decimals: number;
  logoUri?: string;
  usdValue?: number;
}

interface WalletTokenManagerProps {
  walletId: string;
  walletPubkey: string;
  isOrphaned?: boolean;
  onTokensSold?: () => void;
}

export function WalletTokenManager({ 
  walletId, 
  walletPubkey, 
  isOrphaned = false,
  onTokensSold 
}: WalletTokenManagerProps) {
  const [tokens, setTokens] = useState<TokenBalance[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [sellLoading, setSellLoading] = useState<Set<string>>(new Set());
  const [convertLoading, setConvertLoading] = useState(false);
  const [sellAmounts, setSellAmounts] = useState<Record<string, string>>({});
  const [sellTypes, setSellTypes] = useState<Record<string, 'all' | 'percentage' | 'amount' | 'tokens'>>({});
  const { price: solPrice } = useSolPrice();

  const loadTokenBalances = async () => {
    if (!walletId) return;
    
    setIsLoading(true);
    try {
      // Get wallet secret key
      const { data: walletData, error: walletError } = await supabase
        .from('blackbox_wallets')
        .select('secret_key_encrypted')
        .eq('id', walletId)
        .single();

      if (walletError || !walletData) {
        throw new Error('Failed to get wallet credentials');
      }

      // Fetch wallet balances including all tokens
      const { data: balanceData, error: balanceError } = await supabase.functions.invoke('refresh-wallet-balances', {
        body: { 
          walletId: walletId,
          walletPubkey: walletPubkey,
          fetchTokens: true
        }
      });

      if (balanceError) {
        throw new Error(balanceError.message || 'Failed to fetch token balances');
      }

      const data = balanceData;

      // For now, just track SOL balance as a "token"
      const tokenList: TokenBalance[] = [];
      
      if (data.solBalance && data.solBalance > 0) {
        tokenList.push({
          mint: 'So11111111111111111111111111111111111111112', // SOL mint
          symbol: 'SOL',
          name: 'Solana',
          balance: data.solBalance * 1e9, // Convert to lamports
          uiAmount: data.solBalance,
          decimals: 9,
          logoUri: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
          usdValue: data.solBalance * solPrice
        });
      }

      // If we have a token balance from the token-specific query, add it
      if (data.tokenBalance && data.tokenUiAmount && data.tokenUiAmount > 0) {
        // Get token metadata
        try {
          const { data: tokenMetadata } = await supabase.functions.invoke('token-metadata', {
            body: { tokenMint: data.tokenMint }
          });
          
          const isStablecoin = ['USDC', 'USDT', 'BUSD', 'DAI', 'PYUSD'].includes(tokenMetadata?.symbol || '');
          tokenList.push({
            mint: data.tokenMint,
            symbol: tokenMetadata?.symbol || 'UNK',
            name: tokenMetadata?.name || 'Unknown Token',
            balance: data.tokenBalance,
            uiAmount: data.tokenUiAmount,
            decimals: tokenMetadata?.decimals || 6,
            logoUri: tokenMetadata?.logoUri,
            usdValue: isStablecoin ? data.tokenUiAmount : undefined
          });
        } catch (error) {
          // Add token with minimal data if metadata fetch fails
          tokenList.push({
            mint: data.tokenMint,
            symbol: 'UNK',
            name: 'Unknown Token',
            balance: data.tokenBalance,
            uiAmount: data.tokenUiAmount,
            decimals: 6,
            usdValue: undefined
          });
        }
      }

      setTokens(tokenList);
    } catch (error: any) {
      console.error('Failed to load token balances:', error);
      toast({
        title: "Error loading tokens",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const sellTokens = async (token: TokenBalance, sellType: string, amount?: string) => {
    if (token.mint === 'So11111111111111111111111111111111111111112') {
      toast({
        title: "Cannot sell SOL",
        description: "SOL cannot be sold directly. Use the withdraw function instead.",
        variant: "destructive"
      });
      return;
    }

    let sellAmount = 0;
    let description = '';

    if (sellType === 'all') {
      sellAmount = token.uiAmount;
      description = `ALL ${token.uiAmount.toFixed(6)} ${token.symbol}`;
    } else if (sellType === 'percentage' && amount) {
      const percentage = parseFloat(amount);
      if (percentage <= 0 || percentage > 100) {
        toast({
          title: "Invalid percentage",
          description: "Please enter a percentage between 1 and 100",
          variant: "destructive"
        });
        return;
      }
      sellAmount = (token.uiAmount * percentage) / 100;
      description = `${percentage}% (${sellAmount.toFixed(6)} ${token.symbol})`;
    } else if (sellType === 'amount' && amount) {
      const usdAmount = parseFloat(amount);
      if (usdAmount <= 0 || !token.usdValue || usdAmount > token.usdValue) {
        toast({
          title: "Invalid USD amount",
          description: "Please enter a valid USD amount within available balance",
          variant: "destructive"
        });
        return;
      }
      sellAmount = token.usdValue > 0 ? (token.uiAmount * usdAmount) / token.usdValue : 0;
      description = `$${usdAmount} worth (${sellAmount.toFixed(6)} ${token.symbol})`;
    } else if (sellType === 'tokens' && amount) {
      sellAmount = parseFloat(amount);
      if (sellAmount <= 0 || sellAmount > token.uiAmount) {
        toast({
          title: "Invalid token amount",
          description: "Please enter a valid token amount within available balance",
          variant: "destructive"
        });
        return;
      }
      description = `${sellAmount.toFixed(6)} ${token.symbol}`;
    }

    if (sellAmount <= 0) {
      toast({
        title: "Invalid amount",
        description: "Please enter a valid amount to sell",
        variant: "destructive"
      });
      return;
    }

    setSellLoading(prev => new Set(prev).add(token.mint));

    try {
      // Find active command for this wallet with the token
      const { data: commandsData, error: commandsError } = await supabase
        .from('blackbox_command_codes')
        .select('id, name, config')
        .eq('wallet_id', walletId)
        .eq('is_active', true);

      if (commandsError) {
        throw new Error(`Failed to get commands: ${commandsError.message}`);
      }

      // Find command that matches this token
      const relevantCommand = commandsData?.find(cmd => {
        const config = cmd.config as any;
        return config && config.tokenAddress === token.mint;
      });

      if (!relevantCommand) {
        toast({
          title: "No active command found",
          description: `No active command found for token ${token.symbol}. Create a command for this token first.`,
          variant: "destructive"
        });
        return;
      }

      // Execute sell via blackbox executor
      const { data, error } = await supabase.functions.invoke('blackbox-executor', {
        body: {
          command_code_id: relevantCommand.id,
          action: 'sell',
          amount: sellType === 'all' ? undefined : sellAmount
        }
      });

      if (error) {
        throw new Error(error.message);
      }

      toast({
        title: "Sell order executed",
        description: `Successfully executed sell order for ${description}`,
      });

      // Clear the input for this token
      setSellAmounts(prev => ({ ...prev, [token.mint]: '' }));
      setSellTypes(prev => ({ ...prev, [token.mint]: 'all' }));

      // Refresh token balances
      setTimeout(() => {
        loadTokenBalances();
        onTokensSold?.();
      }, 2000);

    } catch (error: any) {
      console.error('Sell error:', error);
      toast({
        title: "Sell failed",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setSellLoading(prev => {
        const newSet = new Set(prev);
        newSet.delete(token.mint);
        return newSet;
      });
    }
  };

  useEffect(() => {
    loadTokenBalances();
  }, [walletId]);

  const formatUsdValue = (amount: number, isSOL = false) => {
    if (isSOL) {
      return `$${(amount * solPrice).toFixed(2)}`;
    }
    return `$${amount.toFixed(2)}`;
  };

  const getTotalUsdValue = () => {
    return tokens.reduce((total, token) => {
      if (token.symbol === 'SOL') {
        return total + (token.uiAmount * solPrice);
      }
      return total + (token.usdValue || 0);
    }, 0);
  };

  const convertSolToUsd = async () => {
    const solToken = tokens.find(t => t.symbol === 'SOL');
    if (!solToken || solToken.uiAmount <= 0) {
      toast({
        title: "No SOL to convert",
        description: "This wallet doesn't have SOL balance to convert",
        variant: "destructive"
      });
      return;
    }

    setConvertLoading(true);
    try {
      // Here you would implement SOL to USD conversion logic
      // This could involve using a DEX aggregator like Jupiter
      toast({
        title: "SOL to USD conversion",
        description: "SOL to USD conversion is not yet implemented. This would require integration with a USD stablecoin DEX.",
        variant: "destructive"
      });
    } catch (error: any) {
      toast({
        title: "Conversion failed",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setConvertLoading(false);
    }
  };

  const convertUsdToSol = async () => {
    // Find USD stablecoins (USDC, USDT, etc.)
    const usdTokens = tokens.filter(t => ['USDC', 'USDT', 'BUSD', 'DAI'].includes(t.symbol));
    if (usdTokens.length === 0) {
      toast({
        title: "No USD tokens to convert",
        description: "This wallet doesn't have USD stablecoins to convert to SOL",
        variant: "destructive"
      });
      return;
    }

    setConvertLoading(true);
    try {
      // Here you would implement USD to SOL conversion logic
      toast({
        title: "USD to SOL conversion",
        description: "USD to SOL conversion is not yet implemented. This would require integration with a DEX.",
        variant: "destructive"
      });
    } catch (error: any) {
      toast({
        title: "Conversion failed",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setConvertLoading(false);
    }
  };

  return (
    <Card className="mt-4">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Coins className="h-4 w-4" />
            Token Holdings
            {isOrphaned && <Badge variant="outline" className="text-xs">Orphaned</Badge>}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button 
              onClick={convertSolToUsd} 
              variant="outline" 
              size="sm"
              disabled={convertLoading || !tokens.find(t => t.symbol === 'SOL' && t.uiAmount > 0)}
              title="Convert SOL to USD stablecoin"
            >
              <ArrowLeftRight className="h-4 w-4" />
              SOL→USD
            </Button>
            <Button 
              onClick={convertUsdToSol} 
              variant="outline" 
              size="sm"
              disabled={convertLoading || !tokens.some(t => ['USDC', 'USDT', 'BUSD', 'DAI'].includes(t.symbol) && t.uiAmount > 0)}
              title="Convert USD stablecoins to SOL"
            >
              <ArrowLeftRight className="h-4 w-4" />
              USD→SOL
            </Button>
            <Button 
              onClick={loadTokenBalances} 
              variant="outline" 
              size="sm"
              disabled={isLoading}
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-4 text-muted-foreground">
            <RefreshCw className="h-4 w-4 animate-spin mx-auto mb-2" />
            Loading token balances...
          </div>
        ) : tokens.length === 0 ? (
          <div className="text-center py-4 text-muted-foreground">
            <p>No tokens found in this wallet</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="p-3 bg-muted/50 rounded-lg border">
              <div className="text-sm font-medium">Total Portfolio Value</div>
              <div className="text-lg font-bold text-primary">{formatUsdValue(getTotalUsdValue())}</div>
            </div>
            
            <div className="space-y-3">
              {tokens.map((token) => (
                <div key={token.mint} className="p-4 border rounded-lg space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {token.logoUri && (
                        <img 
                          src={token.logoUri} 
                          alt={token.symbol}
                          className="w-8 h-8 rounded-full"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                      )}
                      <div>
                        <div className="font-medium">{token.symbol}</div>
                        <div className="text-sm text-muted-foreground">{token.name}</div>
                      </div>
                    </div>
                    
                    <div className="text-right">
                      <div className="font-medium">
                        {token.uiAmount.toFixed(6)} {token.symbol}
                      </div>
                      <div className="text-sm text-muted-foreground flex items-center gap-1">
                        <DollarSign className="h-3 w-3" />
                        {token.symbol === 'SOL' ? formatUsdValue(token.uiAmount, true) : formatUsdValue(token.usdValue || 0)}
                      </div>
                    </div>
                  </div>
                  
                  {token.symbol !== 'SOL' && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Select 
                          value={sellTypes[token.mint] || 'all'} 
                          onValueChange={(value: any) => setSellTypes(prev => ({ ...prev, [token.mint]: value }))}
                        >
                          <SelectTrigger className="w-32">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Sell All</SelectItem>
                            <SelectItem value="percentage">Percentage</SelectItem>
                            {token.usdValue && <SelectItem value="amount">USD Amount</SelectItem>}
                            <SelectItem value="tokens">Token Amount</SelectItem>
                          </SelectContent>
                        </Select>
                        
                        {sellTypes[token.mint] !== 'all' && (
                          <div className="flex items-center gap-2 flex-1">
                            <Input
                              type="number"
                              placeholder={
                                sellTypes[token.mint] === 'percentage' ? '0-100' :
                                sellTypes[token.mint] === 'amount' ? '0.00' :
                                '0.000000'
                              }
                              value={sellAmounts[token.mint] || ''}
                              onChange={(e) => setSellAmounts(prev => ({ ...prev, [token.mint]: e.target.value }))}
                              className="flex-1"
                              step={
                                sellTypes[token.mint] === 'percentage' ? '1' :
                                sellTypes[token.mint] === 'amount' ? '0.01' :
                                '0.000001'
                              }
                              min="0"
                              max={
                                sellTypes[token.mint] === 'percentage' ? '100' :
                                sellTypes[token.mint] === 'amount' ? (token.usdValue || 0).toString() :
                                token.uiAmount.toString()
                              }
                            />
                            <div className="text-sm text-muted-foreground min-w-fit">
                              {sellTypes[token.mint] === 'percentage' && <Percent className="h-4 w-4" />}
                              {sellTypes[token.mint] === 'amount' && <DollarSign className="h-4 w-4" />}
                              {sellTypes[token.mint] === 'tokens' && <Hash className="h-4 w-4" />}
                            </div>
                          </div>
                        )}
                      </div>
                      
                      <div className="flex gap-2">
                        <Button
                          variant="destructive"
                          size="sm"
                          disabled={sellLoading.has(token.mint)}
                          onClick={() => sellTokens(token, sellTypes[token.mint] || 'all', sellAmounts[token.mint])}
                          className="flex-1"
                        >
                          {sellLoading.has(token.mint) ? (
                            <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                          ) : (
                            <Trash2 className="h-4 w-4 mr-2" />
                          )}
                          {sellTypes[token.mint] === 'all' ? 'Sell All' : 'Sell'}
                          {sellTypes[token.mint] === 'all' && ` (${formatUsdValue(token.usdValue || 0)})`}
                        </Button>
                      </div>
                    </div>
                  )}
                  
                  {token.symbol === 'SOL' && (
                    <div className="text-sm text-muted-foreground">
                      Use the withdraw function to move SOL from this wallet
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}