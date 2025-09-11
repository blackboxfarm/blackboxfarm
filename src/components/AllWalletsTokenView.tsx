import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { RefreshCw, Search, Wallet, Copy, ExternalLink } from 'lucide-react';
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
}

export function AllWalletsTokenView() {
  const [wallets, setWallets] = useState<WalletWithTokens[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const { price: solPrice } = useSolPrice();

  const loadAllWallets = async () => {
    setIsLoading(true);
    try {
      // Get all wallets from different tables
      const [poolWallets, blackboxWallets, superAdminWallets] = await Promise.all([
        supabase
          .from('wallet_pools')
          .select('id, pubkey, sol_balance')
          .eq('is_active', true),
        supabase
          .from('blackbox_wallets')
          .select('id, pubkey, sol_balance')
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
          isLoading: false
        })),
        ...(blackboxWallets.data || []).map(w => ({
          id: w.id,
          pubkey: w.pubkey,
          wallet_type: 'blackbox' as const,
          sol_balance: w.sol_balance || 0,
          tokens: [],
          isLoading: false
        })),
        ...(superAdminWallets.data || []).map(w => ({
          id: w.id,
          pubkey: w.pubkey,
          wallet_type: 'super_admin' as const,
          sol_balance: 0, // Will be fetched from token data
          tokens: [],
          isLoading: false
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
      // Find the wallet in our state to get the wallet type and ID
      const wallet = wallets.find(w => w.pubkey === pubkey);
      if (!wallet) {
        throw new Error('Wallet not found');
      }

      // Get the encrypted secret key based on wallet type
      let secretKeyEncrypted = '';
      if (wallet.wallet_type === 'blackbox') {
        const { data: walletData, error } = await supabase
          .from('blackbox_wallets')
          .select('secret_key_encrypted')
          .eq('pubkey', pubkey)
          .single();
        
        if (error || !walletData) {
          throw new Error('Failed to get wallet secret');
        }
        secretKeyEncrypted = walletData.secret_key_encrypted;
      } else if (wallet.wallet_type === 'pool') {
        const { data: walletData, error } = await supabase
          .from('wallet_pools')
          .select('secret_key')
          .eq('pubkey', pubkey)
          .single();
        
        if (error || !walletData) {
          throw new Error('Failed to get wallet secret');
        }
        secretKeyEncrypted = walletData.secret_key;
      } else if (wallet.wallet_type === 'super_admin') {
        const { data: walletData, error } = await supabase
          .from('super_admin_wallets')
          .select('secret_key_encrypted')
          .eq('pubkey', pubkey)
          .single();
        
        if (error || !walletData) {
          throw new Error('Failed to get wallet secret');
        }
        secretKeyEncrypted = walletData.secret_key_encrypted;
      }

      // Call the trader-wallet function with the encrypted secret and getAllTokens parameter
      const url = `https://apxauapuusmgwbbzjgfl.supabase.co/functions/v1/trader-wallet?getAllTokens=true`;
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFweGF1YXB1dXNtZ3diYnpqZ2ZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ1OTEzMDUsImV4cCI6MjA3MDE2NzMwNX0.w8IrKq4YVStF3TkdEcs5mCSeJsxjkaVq2NFkypYOXHU`,
          'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFweGF1YXB1dXNtZ3diYnpqZ2ZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ1OTEzMDUsImV4cCI6MjA3MDE2NzMwNX0.w8IrKq4YVStF3TkdEcs5mCSeJsxjkaVq2NFkypYOXHU',
          'x-owner-secret': secretKeyEncrypted
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json();

      const tokens: TokenBalance[] = [];

      // Add SOL balance
      if (data.solBalance && data.solBalance > 0) {
        tokens.push({
          mint: 'So11111111111111111111111111111111111111112',
          symbol: 'SOL',
          name: 'Solana',
          balance: data.solBalance * 1e9,
          uiAmount: data.solBalance,
          decimals: 9,
          logoUri: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
          usdValue: data.solBalance * solPrice
        });
      }

      // Add other tokens if present
      if (data.tokens && Array.isArray(data.tokens)) {
        for (const token of data.tokens) {
          if (token.uiAmount && token.uiAmount > 0) {
            try {
              // Get token metadata
              const { data: tokenMetadata } = await supabase.functions.invoke('token-metadata', {
                body: { tokenMint: token.mint }
              });
              
              tokens.push({
                mint: token.mint,
                symbol: tokenMetadata?.symbol || 'UNK',
                name: tokenMetadata?.name || 'Unknown Token',
                balance: token.amount,
                uiAmount: token.uiAmount,
                decimals: token.decimals,
                logoUri: tokenMetadata?.logoUri,
                usdValue: ['USDC', 'USDT', 'BUSD', 'DAI'].includes(tokenMetadata?.symbol) ? token.uiAmount : undefined
              });
            } catch (error) {
              // Add token with minimal data if metadata fetch fails
              tokens.push({
                mint: token.mint,
                symbol: 'UNK',
                name: 'Unknown Token',
                balance: token.amount,
                uiAmount: token.uiAmount,
                decimals: token.decimals
              });
            }
          }
        }
      }

      setWallets(prev => prev.map(w => 
        w.pubkey === pubkey ? { ...w, tokens, isLoading: false } : w
      ));

    } catch (error: any) {
      console.error(`Failed to load tokens for wallet ${pubkey}:`, error);
      setWallets(prev => prev.map(w => 
        w.pubkey === pubkey ? { ...w, isLoading: false } : w
      ));
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">All Wallet Tokens</h2>
        <Button onClick={loadAllWallets} disabled={isLoading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh All
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search wallets or tokens..."
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
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(wallet.pubkey)}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openInSolscan(wallet.pubkey)}
                  >
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
                <div className="space-y-2">
                  {wallet.tokens.map((token) => (
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
                          <div className="text-xs font-mono text-muted-foreground">
                            {token.mint.slice(0, 8)}...{token.mint.slice(-8)}
                          </div>
                        </div>
                      </div>
                      
                      <div className="text-right">
                        <div className="font-medium text-sm">
                          {token.uiAmount.toFixed(6)} {token.symbol}
                        </div>
                        {token.usdValue && (
                          <div className="text-xs text-muted-foreground">
                            ${token.usdValue.toFixed(2)}
                          </div>
                        )}
                      </div>
                      
                      <div className="flex gap-2">
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