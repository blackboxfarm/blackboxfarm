import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Coins, DollarSign, Trash2, RefreshCw, ArrowLeftRight } from "lucide-react";
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
          logoUri: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png'
        });
      }

      // If we have a token balance from the token-specific query, add it
      if (data.tokenBalance && data.tokenUiAmount && data.tokenUiAmount > 0) {
        // Get token metadata
        try {
          const { data: tokenMetadata } = await supabase.functions.invoke('token-metadata', {
            body: { tokenMint: data.tokenMint }
          });
          
          tokenList.push({
            mint: data.tokenMint,
            symbol: tokenMetadata?.symbol || 'UNK',
            name: tokenMetadata?.name || 'Unknown Token',
            balance: data.tokenBalance,
            uiAmount: data.tokenUiAmount,
            decimals: tokenMetadata?.decimals || 6,
            logoUri: tokenMetadata?.logoUri
          });
        } catch (error) {
          // Add token with minimal data if metadata fetch fails
          tokenList.push({
            mint: data.tokenMint,
            symbol: 'UNK',
            name: 'Unknown Token',
            balance: data.tokenBalance,
            uiAmount: data.tokenUiAmount,
            decimals: 6
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

  const sellAllTokens = async (token: TokenBalance) => {
    if (token.mint === 'So11111111111111111111111111111111111111112') {
      toast({
        title: "Cannot sell SOL",
        description: "SOL cannot be sold directly. Use the withdraw function instead.",
        variant: "destructive"
      });
      return;
    }

    const confirmed = window.confirm(
      `Are you sure you want to sell ALL ${token.uiAmount.toFixed(6)} ${token.symbol} tokens from this wallet?\n\nThis action cannot be undone.`
    );
    
    if (!confirmed) return;

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
          action: 'sell'
        }
      });

      if (error) {
        throw new Error(error.message);
      }

      toast({
        title: "Sell order executed",
        description: `Successfully executed sell order for ${token.symbol}`,
      });

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

  const formatUsdValue = (solAmount: number) => {
    return `$${(solAmount * solPrice).toFixed(2)}`;
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
          <div className="space-y-2">
            {tokens.map((token) => (
              <div key={token.mint} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-3">
                  {token.logoUri && (
                    <img 
                      src={token.logoUri} 
                      alt={token.symbol}
                      className="w-6 h-6 rounded-full"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                  )}
                  <div>
                    <div className="font-medium text-sm">{token.symbol}</div>
                    <div className="text-xs text-muted-foreground">{token.name}</div>
                  </div>
                </div>
                
                <div className="text-right">
                  <div className="font-medium text-sm">
                    {token.uiAmount.toFixed(6)} {token.symbol}
                  </div>
                  {token.symbol === 'SOL' && (
                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                      <DollarSign className="h-3 w-3" />
                      {formatUsdValue(token.uiAmount)}
                    </div>
                  )}
                </div>
                
                <div className="flex gap-2">
                  {/* Show USD value for all tokens */}
                  {token.symbol !== 'SOL' && ['USDC', 'USDT', 'BUSD', 'DAI'].includes(token.symbol) && (
                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                      <DollarSign className="h-3 w-3" />
                      ~${token.uiAmount.toFixed(2)}
                    </div>
                  )}
                  
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={sellLoading.has(token.mint) || token.symbol === 'SOL'}
                        title={token.symbol === 'SOL' ? 'Use withdraw function for SOL' : `Sell all ${token.symbol}`}
                      >
                        {sellLoading.has(token.mint) ? (
                          <RefreshCw className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Sell All {token.symbol}?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Are you sure you want to sell all {token.uiAmount.toFixed(6)} {token.symbol} tokens from this wallet?
                          This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => sellAllTokens(token)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Sell All
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}