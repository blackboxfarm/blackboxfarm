import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { RefreshCw, Search, Wallet, Copy, ExternalLink, Coins, DollarSign, Trash2, ArrowLeftRight, Percent, Hash, Flame } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useSolPrice } from '@/hooks/useSolPrice';

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

interface WalletWithTokens {
  id: string;
  pubkey: string;
  wallet_type: 'pool' | 'blackbox' | 'super_admin';
  sol_balance: number;
  tokens: TokenBalance[];
  isLoading: boolean;
  debugLogs?: string[];
  hasCommandCodes?: boolean;
  campaigns?: string[];
}

export function EnhancedWalletView() {
  const [wallets, setWallets] = useState<WalletWithTokens[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showDebug, setShowDebug] = useState(false);
  const [sellLoading, setSellLoading] = useState<Set<string>>(new Set());
  const [burnLoading, setBurnLoading] = useState<Set<string>>(new Set());
  const [sellAmounts, setSellAmounts] = useState<Record<string, string>>({});
  const [sellTypes, setSellTypes] = useState<Record<string, 'all' | 'percentage' | 'amount' | 'tokens'>>({});
  const { price: solPrice } = useSolPrice();

  const loadAllWallets = async () => {
    setIsLoading(true);
    try {
      // Get all wallets from different tables with campaign info
      const [poolWallets, blackboxWallets, superAdminWallets] = await Promise.all([
        supabase
          .from('wallet_pools')
          .select('id, pubkey, sol_balance')
          .eq('is_active', true),
        supabase
          .from('blackbox_wallets')
          .select(`
            id, pubkey, sol_balance,
            campaign_wallets!inner (
              blackbox_campaigns!inner (nickname)
            ),
            blackbox_command_codes (id, name, is_active)
          `)
          .eq('is_active', true),
        supabase
          .from('super_admin_wallets')
          .select('id, pubkey')
          .eq('is_active', true)
      ]);

      const allWallets: WalletWithTokens[] = [
        ...(poolWallets.data || []).map(w => ({
          id: w.id,
          pubkey: w.pubkey,
          wallet_type: 'pool' as const,
          sol_balance: w.sol_balance || 0,
          tokens: [],
          isLoading: false,
          hasCommandCodes: false,
          campaigns: []
        })),
        ...(blackboxWallets.data || []).map(w => ({
          id: w.id,
          pubkey: w.pubkey,
          wallet_type: 'blackbox' as const,
          sol_balance: w.sol_balance || 0,
          tokens: [],
          isLoading: false,
          hasCommandCodes: (w.blackbox_command_codes || []).some(cc => cc.is_active),
          campaigns: (w.campaign_wallets || []).map(cw => cw.blackbox_campaigns?.nickname).filter(Boolean)
        })),
        ...(superAdminWallets.data || []).map(w => ({
          id: w.id,
          pubkey: w.pubkey,
          wallet_type: 'super_admin' as const,
          sol_balance: 0,
          tokens: [],
          isLoading: false,
          hasCommandCodes: false,
          campaigns: []
        }))
      ];

      setWallets(allWallets);
      
      // Load tokens for each wallet
      for (const wallet of allWallets) {
        await loadWalletTokens(wallet.pubkey);
      }
      
    } catch (error: any) {
      console.error('Failed to load wallets:', error);
      toast({
        title: "Error loading wallets",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const loadWalletTokens = async (pubkey: string) => {
    setWallets(prev => prev.map(w => 
      w.pubkey === pubkey ? { ...w, isLoading: true } : w
    ));

    try {
      const wallet = wallets.find(w => w.pubkey === pubkey);
      if (!wallet) throw new Error('Wallet not found');

      // Get the encrypted secret key based on wallet type
      let secretKeyEncrypted = '';
      if (wallet.wallet_type === 'blackbox') {
        const { data: walletData, error } = await supabase
          .from('blackbox_wallets')
          .select('secret_key_encrypted')
          .eq('pubkey', pubkey)
          .single();
        
        if (error || !walletData) throw new Error('Failed to get wallet secret');
        secretKeyEncrypted = walletData.secret_key_encrypted;
      } else if (wallet.wallet_type === 'pool') {
        const { data: walletData, error } = await supabase
          .from('wallet_pools')
          .select('secret_key')
          .eq('pubkey', pubkey)
          .single();
        
        if (error || !walletData) throw new Error('Failed to get wallet secret');
        secretKeyEncrypted = walletData.secret_key;
      } else if (wallet.wallet_type === 'super_admin') {
        const { data: walletData, error } = await supabase
          .from('super_admin_wallets')
          .select('secret_key_encrypted')
          .eq('pubkey', pubkey)
          .single();
        
        if (error || !walletData) throw new Error('Failed to get wallet secret');
        secretKeyEncrypted = walletData.secret_key_encrypted;
      }

      console.log('EnhancedWalletView: Fetching tokens for', pubkey);

      // Call the trader-wallet function with debug enabled
      const { data, error } = await supabase.functions.invoke('trader-wallet', {
        body: { getAllTokens: true, debug: showDebug },
        headers: { 'x-owner-secret': secretKeyEncrypted }
      });

      if (error) {
        console.error('EnhancedWalletView: trader-wallet error:', error);
        setWallets(prev => prev.map(w => 
          w.pubkey === pubkey ? { ...w, debugLogs: [error.message], isLoading: false } : w
        ));
        throw new Error(error.message || 'Failed to fetch wallet tokens');
      }

      const tokens: TokenBalance[] = [];

      // Add SOL balance
      if (data.solBalance !== undefined) {
        tokens.push({
          mint: 'So11111111111111111111111111111111111111112',
          symbol: 'SOL',
          name: 'Solana',
          balance: Math.floor(data.solBalance * 1e9),
          uiAmount: data.solBalance,
          decimals: 9,
          logoUri: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
          usdValue: data.solBalance * (solPrice || 0)
        });
      }

      // Add other tokens if present
      if (data.tokens && Array.isArray(data.tokens)) {
        console.log('EnhancedWalletView: Processing', data.tokens.length, 'tokens for', pubkey);
        
        for (const token of data.tokens) {
          if (token.uiAmount && token.uiAmount > 0) {
            try {
              // Get token metadata
              const { data: tokenMetadata, error: metadataError } = await supabase.functions.invoke('token-metadata', {
                body: { tokenMint: token.mint }
              });
              
              if (metadataError) {
                console.warn('Failed to get metadata for token', token.mint, ':', metadataError);
              }
              
              const isStablecoin = ['USDC', 'USDT', 'BUSD', 'DAI'].includes(tokenMetadata?.symbol);
              tokens.push({
                mint: token.mint,
                symbol: tokenMetadata?.symbol || token.symbol || 'UNK',
                name: tokenMetadata?.name || token.name || 'Unknown Token',
                balance: parseInt(token.amount || '0'),
                uiAmount: token.uiAmount,
                decimals: token.decimals || tokenMetadata?.decimals || 6,
                logoUri: tokenMetadata?.logoUri,
                usdValue: isStablecoin ? token.uiAmount : undefined
              });
            } catch (error) {
              console.warn('Error processing token metadata for', token.mint, ':', error);
              tokens.push({
                mint: token.mint,
                symbol: token.symbol || 'UNK',
                name: token.name || 'Unknown Token',
                balance: parseInt(token.amount || '0'),
                uiAmount: token.uiAmount,
                decimals: token.decimals || 6
              });
            }
          }
        }
      }

      console.log('EnhancedWalletView: Final token list for', pubkey, ':', tokens);

      setWallets(prev => prev.map(w => 
        w.pubkey === pubkey ? { 
          ...w, 
          tokens, 
          isLoading: false,
          debugLogs: data.debugLogs 
        } : w
      ));

    } catch (error: any) {
      console.error(`Failed to load tokens for wallet ${pubkey}:`, error);
      setWallets(prev => prev.map(w => 
        w.pubkey === pubkey ? { ...w, isLoading: false } : w
      ));
    }
  };

  const sellToken = async (walletId: string, token: TokenBalance, sellType: string, amount?: string) => {
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

    const sellKey = `${walletId}-${token.mint}`;
    setSellLoading(prev => new Set(prev).add(sellKey));

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
      setSellAmounts(prev => ({ ...prev, [sellKey]: '' }));
      setSellTypes(prev => ({ ...prev, [sellKey]: 'all' }));

      // Refresh token balances
      setTimeout(() => {
        const wallet = wallets.find(w => w.id === walletId);
        if (wallet) {
          loadWalletTokens(wallet.pubkey);
        }
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
        newSet.delete(sellKey);
        return newSet;
      });
    }
  };

  const sellAllTokens = async (walletId: string, tokens: TokenBalance[]) => {
    const nonSolTokens = tokens.filter(t => t.symbol !== 'SOL');
    if (nonSolTokens.length === 0) {
      toast({
        title: "No tokens to sell",
        description: "This wallet only has SOL, which cannot be sold directly.",
        variant: "destructive"
      });
      return;
    }

    let successCount = 0;
    let failCount = 0;

    try {
      for (const token of nonSolTokens) {
        try {
          await sellToken(walletId, token, 'all');
          successCount++;
        } catch (error) {
          failCount++;
          console.error(`Failed to sell ${token.symbol}:`, error);
        }
        // Small delay between sells
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      toast({
        title: "Sell all completed",
        description: `Successfully sold ${successCount} tokens${failCount > 0 ? `, ${failCount} failed` : ''}`,
        variant: successCount > 0 ? "default" : "destructive"
      });
    } catch (error: any) {
      toast({
        title: "Sell all failed",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  const burnToken = async (wallet: WalletWithTokens, token: TokenBalance) => {
    const burnKey = `${wallet.id}-${token.mint}`;
    setBurnLoading(prev => new Set(prev).add(burnKey));

    try {
      // Map wallet_type to source table
      const sourceMap: Record<string, string> = {
        'pool': 'wallet_pools',
        'blackbox': 'blackbox_wallets',
        'super_admin': 'super_admin_wallets'
      };
      
      const walletSource = sourceMap[wallet.wallet_type];
      if (!walletSource) {
        throw new Error(`Unknown wallet type: ${wallet.wallet_type}`);
      }

      const { data, error } = await supabase.functions.invoke('burn-token', {
        body: {
          wallet_id: wallet.id,
          wallet_source: walletSource,
          token_mint: token.mint,
          close_account: true
        }
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast({
        title: "Token burned successfully",
        description: `Burned ${token.uiAmount} ${token.symbol} and closed the account. TX: ${data.signature?.slice(0, 8)}...`,
      });

      // Refresh wallet tokens
      await loadWalletTokens(wallet.pubkey);

    } catch (error: any) {
      console.error("Burn failed:", error);
      toast({
        title: "Burn failed",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setBurnLoading(prev => {
        const next = new Set(prev);
        next.delete(burnKey);
        return next;
      });
    }
  };

  useEffect(() => {
    loadAllWallets();
  }, []);

  const filteredWallets = wallets.filter(wallet => 
    wallet.pubkey.toLowerCase().includes(searchTerm.toLowerCase()) ||
    wallet.tokens.some(token => 
      token.symbol.toLowerCase().includes(searchTerm.toLowerCase()) ||
      token.name.toLowerCase().includes(searchTerm.toLowerCase())
    ) ||
    (wallet.campaigns || []).some(campaign => 
      campaign.toLowerCase().includes(searchTerm.toLowerCase())
    )
  );

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied to clipboard",
      description: `Address copied: ${text.slice(0, 8)}...${text.slice(-8)}`,
    });
  };

  const openInSolscan = (address: string) => {
    window.open(`https://solscan.io/account/${address}`, '_blank');
  };

  const formatUsdValue = (amount: number, isSOL = false) => {
    if (isSOL) {
      return `$${(amount * (solPrice || 0)).toFixed(2)}`;
    }
    return `$${amount.toFixed(2)}`;
  };

  const getTotalUsdValue = (tokens: TokenBalance[]) => {
    return tokens.reduce((total, token) => {
      if (token.symbol === 'SOL') {
        return total + (token.uiAmount * (solPrice || 0));
      }
      return total + (token.usdValue || 0);
    }, 0);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Enhanced Wallet View</h2>
        <div className="flex items-center gap-2">
          <Button variant={showDebug ? 'destructive' : 'outline'} onClick={() => setShowDebug(v => !v)}>
            {showDebug ? 'Debug: ON' : 'Debug'}
          </Button>
          <Button onClick={loadAllWallets} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh All
          </Button>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search wallets, tokens, or campaigns..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      <div className="grid gap-4">
        {filteredWallets.map((wallet) => (
          <Card key={wallet.pubkey}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Wallet className="h-5 w-5" />
                  <span className="font-mono text-sm">
                    {wallet.pubkey.slice(0, 8)}...{wallet.pubkey.slice(-8)}
                  </span>
                  <Badge variant={wallet.wallet_type === 'pool' ? 'default' : wallet.wallet_type === 'blackbox' ? 'secondary' : 'destructive'}>
                    {wallet.wallet_type}
                  </Badge>
                  {wallet.hasCommandCodes && (
                    <Badge variant="outline" className="text-green-600">
                      Command Active
                    </Badge>
                  )}
                  {wallet.campaigns && wallet.campaigns.length > 0 && (
                    <div className="flex gap-1">
                      {wallet.campaigns.map(campaign => (
                        <Badge key={campaign} variant="outline" className="text-xs">
                          {campaign}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => copyToClipboard(wallet.pubkey)}>
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => openInSolscan(wallet.pubkey)}>
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => loadWalletTokens(wallet.pubkey)}
                    disabled={wallet.isLoading}
                  >
                    <RefreshCw className={`h-4 w-4 ${wallet.isLoading ? 'animate-spin' : ''}`} />
                  </Button>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {wallet.isLoading ? (
                <div className="text-center py-4 text-muted-foreground">
                  <RefreshCw className="h-4 w-4 animate-spin mx-auto mb-2" />
                  Loading tokens...
                </div>
              ) : wallet.tokens.length === 0 ? (
                <div className="text-center py-4 text-muted-foreground">
                  No tokens found in this wallet
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border">
                    <div>
                      <div className="text-sm font-medium">Total Portfolio Value</div>
                      <div className="text-lg font-bold text-primary">{formatUsdValue(getTotalUsdValue(wallet.tokens))}</div>
                    </div>
                    {wallet.tokens.some(t => t.symbol !== 'SOL') && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="destructive" size="sm">
                            <Trash2 className="h-4 w-4 mr-2" />
                            Sell All Tokens
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Sell All Tokens</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will sell ALL non-SOL tokens in this wallet. This action cannot be undone.
                              <br /><br />
                              Tokens to be sold: {wallet.tokens.filter(t => t.symbol !== 'SOL').map(t => t.symbol).join(', ')}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction 
                              onClick={() => sellAllTokens(wallet.id, wallet.tokens)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Sell All Tokens
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                  
                  <div className="space-y-3">
                    {wallet.tokens.map((token) => {
                      const sellKey = `${wallet.id}-${token.mint}`;
                      return (
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
                                <div className="text-xs font-mono text-muted-foreground">
                                  {token.mint.slice(0, 8)}...{token.mint.slice(-8)}
                                </div>
                              </div>
                            </div>
                            
                            <div className="text-right">
                              <div className="font-medium">{token.uiAmount.toFixed(6)} {token.symbol}</div>
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
                                  value={sellTypes[sellKey] || 'all'} 
                                  onValueChange={(value: any) => setSellTypes(prev => ({ ...prev, [sellKey]: value }))}
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
                                
                                {sellTypes[sellKey] !== 'all' && (
                                  <div className="flex items-center gap-2 flex-1">
                                    <Input
                                      type="number"
                                      placeholder={
                                        sellTypes[sellKey] === 'percentage' ? '0-100' :
                                        sellTypes[sellKey] === 'amount' ? '0.00' :
                                        '0.000000'
                                      }
                                      value={sellAmounts[sellKey] || ''}
                                      onChange={(e) => setSellAmounts(prev => ({ ...prev, [sellKey]: e.target.value }))}
                                      className="flex-1"
                                      step={
                                        sellTypes[sellKey] === 'percentage' ? '1' :
                                        sellTypes[sellKey] === 'amount' ? '0.01' :
                                        '0.000001'
                                      }
                                      min="0"
                                      max={
                                        sellTypes[sellKey] === 'percentage' ? '100' :
                                        sellTypes[sellKey] === 'amount' ? (token.usdValue || 0).toString() :
                                        token.uiAmount.toString()
                                      }
                                    />
                                    <div className="text-sm text-muted-foreground min-w-fit">
                                      {sellTypes[sellKey] === 'percentage' && <Percent className="h-4 w-4" />}
                                      {sellTypes[sellKey] === 'amount' && <DollarSign className="h-4 w-4" />}
                                      {sellTypes[sellKey] === 'tokens' && <Hash className="h-4 w-4" />}
                                    </div>
                                  </div>
                                )}
                              </div>
                              
                              <div className="flex gap-2">
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  disabled={sellLoading.has(sellKey)}
                                  onClick={() => sellToken(wallet.id, token, sellTypes[sellKey] || 'all', sellAmounts[sellKey])}
                                  className="flex-1"
                                >
                                  {sellLoading.has(sellKey) ? (
                                    <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                                  ) : (
                                    <Trash2 className="h-4 w-4 mr-2" />
                                  )}
                                  {sellTypes[sellKey] === 'all' ? 'Sell All' : 'Sell'}
                                </Button>
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      disabled={burnLoading.has(sellKey)}
                                      className="text-orange-500 hover:text-orange-600 hover:bg-orange-50"
                                    >
                                      {burnLoading.has(sellKey) ? (
                                        <RefreshCw className="h-4 w-4 animate-spin" />
                                      ) : (
                                        <Flame className="h-4 w-4" />
                                      )}
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Burn {token.symbol}?</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        This will permanently burn {token.uiAmount.toFixed(6)} {token.symbol} and close the token account to reclaim ~0.002 SOL rent.
                                        <br /><br />
                                        <strong>This action cannot be undone!</strong>
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                                      <AlertDialogAction
                                        onClick={() => burnToken(wallet, token)}
                                        className="bg-orange-500 text-white hover:bg-orange-600"
                                      >
                                        <Flame className="h-4 w-4 mr-2" />
                                        Burn Token
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => copyToClipboard(token.mint)}
                                >
                                  <Copy className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => openInSolscan(token.mint)}
                                >
                                  <ExternalLink className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              
              {showDebug && wallet.debugLogs && (
                <div className="mt-4 p-3 bg-muted rounded text-xs font-mono">
                  <div className="font-bold mb-2">Debug Logs:</div>
                  {wallet.debugLogs.map((log, i) => (
                    <div key={i} className="text-muted-foreground">{log}</div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredWallets.length === 0 && !isLoading && (
        <div className="text-center py-8 text-muted-foreground">
          <p>No wallets found matching your search criteria</p>
        </div>
      )}
    </div>
  );
}