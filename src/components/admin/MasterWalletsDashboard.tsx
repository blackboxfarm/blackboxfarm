import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { 
  RefreshCw, Search, Wallet, Copy, ExternalLink, ChevronDown, ChevronUp,
  Coins, TrendingUp, TrendingDown, DollarSign, Shield, Zap, Target,
  AlertTriangle, Users, Bot, Crown
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useSolPrice } from '@/hooks/useSolPrice';
import { WalletTokenManager } from '@/components/blackbox/WalletTokenManager';
import { Connection, PublicKey, clusterApiUrl } from '@solana/web3.js';

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

interface MasterWallet {
  id: string;
  pubkey: string;
  source: 'wallet_pool' | 'blackbox' | 'super_admin' | 'airdrop';
  sourceEmoji: string;
  sourceLabel: string;
  purpose?: string;
  purposeEmoji?: string;
  label?: string;
  isActive: boolean;
  solBalance: number;
  tokens: TokenBalance[];
  isLoading: boolean;
  lastUpdated?: Date;
  linkedCampaigns?: string[];
}

const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const TOKEN_2022_PROGRAM_ID = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');

const WALLET_SOURCE_CONFIG = {
  wallet_pool: { emoji: '🏊', label: 'Pool Wallet', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' },
  blackbox: { emoji: '📦', label: 'BlackBox', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200' },
  super_admin: { emoji: '👑', label: 'Super Admin', color: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200' },
  airdrop: { emoji: '🪂', label: 'Airdrop', color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' },
};

const WALLET_PURPOSE_EMOJIS: Record<string, { emoji: string; label: string }> = {
  treasury: { emoji: '💰', label: 'Treasury' },
  campaign_funding: { emoji: '🎯', label: 'Campaign Funding' },
  refund_processing: { emoji: '↩️', label: 'Refunds' },
  emergency: { emoji: '🚨', label: 'Emergency' },
  trading: { emoji: '📈', label: 'Trading' },
  volume: { emoji: '📊', label: 'Volume Bot' },
  bump: { emoji: '🔥', label: 'Bump Bot' },
  airdrop: { emoji: '🪂', label: 'Airdrop' },
};

export function MasterWalletsDashboard() {
  const [wallets, setWallets] = useState<MasterWallet[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedWallets, setExpandedWallets] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState('all');
  const { price: solPrice } = useSolPrice();

  const loadTokensViaRPC = useCallback(async (ownerAddress: string): Promise<{ solBalance: number; tokens: TokenBalance[] }> => {
    const tokens: TokenBalance[] = [];
    let solBalance = 0;
    
    try {
      const connection = new Connection(clusterApiUrl('mainnet-beta'), 'confirmed');
      const owner = new PublicKey(ownerAddress);

      const [lamports, classicParsed, v22Parsed] = await Promise.all([
        connection.getBalance(owner),
        connection.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_PROGRAM_ID }),
        connection.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_2022_PROGRAM_ID }),
      ]);

      solBalance = lamports / 1e9;
      
      tokens.push({
        mint: 'So11111111111111111111111111111111111111112',
        symbol: 'SOL',
        name: 'Solana',
        balance: lamports,
        uiAmount: solBalance,
        decimals: 9,
        logoUri: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
        usdValue: solBalance * (solPrice || 0)
      });

      const combined = [...classicParsed.value, ...v22Parsed.value];
      for (const acct of combined) {
        const info: any = (acct as any).account.data.parsed?.info;
        if (!info?.tokenAmount) continue;
        const tokenAmount = info.tokenAmount;
        const uiAmount = parseFloat(tokenAmount.uiAmountString || tokenAmount.uiAmount || '0');
        if (uiAmount > 0) {
          const mint = info.mint as string;
          tokens.push({
            mint,
            symbol: mint.slice(0, 4).toUpperCase(),
            name: 'Token',
            balance: parseInt(tokenAmount.amount || '0'),
            uiAmount,
            decimals: tokenAmount.decimals ?? 0,
          });
        }
      }
    } catch (e) {
      console.warn('RPC token load failed for', ownerAddress, e);
    }
    
    return { solBalance, tokens };
  }, [solPrice]);

  const loadAllWallets = useCallback(async () => {
    setIsLoading(true);
    
    try {
      // Fetch all wallet sources in parallel
      const [poolWallets, blackboxWallets, superAdminWallets, airdropWallets, campaignLinks] = await Promise.all([
        supabase.from('wallet_pools').select('id, pubkey, sol_balance, is_active'),
        supabase.from('blackbox_wallets').select('id, pubkey, sol_balance, is_active, updated_at'),
        supabase.from('super_admin_wallets').select('id, pubkey, label, wallet_type, is_active, created_at'),
        supabase.from('airdrop_wallets').select('id, pubkey, nickname, sol_balance, is_active, updated_at'),
        supabase.from('campaign_wallets').select('wallet_id, campaign_id, blackbox_campaigns(nickname)')
      ]);

      // Build campaign linkage map
      const campaignMap = new Map<string, string[]>();
      (campaignLinks.data || []).forEach((link: any) => {
        const existing = campaignMap.get(link.wallet_id) || [];
        if (link.blackbox_campaigns?.nickname) {
          existing.push(link.blackbox_campaigns.nickname);
        }
        campaignMap.set(link.wallet_id, existing);
      });

      const allWallets: MasterWallet[] = [];

      // Process pool wallets
      (poolWallets.data || []).forEach(w => {
        const cfg = WALLET_SOURCE_CONFIG.wallet_pool;
        allWallets.push({
          id: w.id,
          pubkey: w.pubkey,
          source: 'wallet_pool',
          sourceEmoji: cfg.emoji,
          sourceLabel: cfg.label,
          purpose: 'trading',
          purposeEmoji: WALLET_PURPOSE_EMOJIS.trading.emoji,
          isActive: w.is_active ?? true,
          solBalance: w.sol_balance || 0,
          tokens: [],
          isLoading: false,
        });
      });

      // Process blackbox wallets
      (blackboxWallets.data || []).forEach(w => {
        const cfg = WALLET_SOURCE_CONFIG.blackbox;
        const campaigns = campaignMap.get(w.id) || [];
        allWallets.push({
          id: w.id,
          pubkey: w.pubkey,
          source: 'blackbox',
          sourceEmoji: cfg.emoji,
          sourceLabel: cfg.label,
          purpose: campaigns.length > 0 ? 'volume' : 'bump',
          purposeEmoji: campaigns.length > 0 ? WALLET_PURPOSE_EMOJIS.volume.emoji : WALLET_PURPOSE_EMOJIS.bump.emoji,
          isActive: w.is_active ?? true,
          solBalance: w.sol_balance || 0,
          tokens: [],
          isLoading: false,
          lastUpdated: w.updated_at ? new Date(w.updated_at) : undefined,
          linkedCampaigns: campaigns,
        });
      });

      // Process super admin wallets
      (superAdminWallets.data || []).forEach(w => {
        const cfg = WALLET_SOURCE_CONFIG.super_admin;
        const purposeInfo = WALLET_PURPOSE_EMOJIS[w.wallet_type] || WALLET_PURPOSE_EMOJIS.treasury;
        allWallets.push({
          id: w.id,
          pubkey: w.pubkey,
          source: 'super_admin',
          sourceEmoji: cfg.emoji,
          sourceLabel: cfg.label,
          label: w.label,
          purpose: w.wallet_type,
          purposeEmoji: purposeInfo.emoji,
          isActive: w.is_active ?? true,
          solBalance: 0,
          tokens: [],
          isLoading: false,
          lastUpdated: w.created_at ? new Date(w.created_at) : undefined,
        });
      });

      // Process airdrop wallets
      (airdropWallets.data || []).forEach(w => {
        const cfg = WALLET_SOURCE_CONFIG.airdrop;
        allWallets.push({
          id: w.id,
          pubkey: w.pubkey,
          source: 'airdrop',
          sourceEmoji: cfg.emoji,
          sourceLabel: cfg.label,
          label: w.nickname,
          purpose: 'airdrop',
          purposeEmoji: WALLET_PURPOSE_EMOJIS.airdrop.emoji,
          isActive: w.is_active ?? true,
          solBalance: w.sol_balance || 0,
          tokens: [],
          isLoading: false,
          lastUpdated: w.updated_at ? new Date(w.updated_at) : undefined,
        });
      });

      setWallets(allWallets);
      
      // Auto-load balances for active wallets (first 10 to avoid rate limits)
      const activeWallets = allWallets.filter(w => w.isActive).slice(0, 10);
      for (const wallet of activeWallets) {
        loadWalletBalance(wallet.pubkey);
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
  }, []);

  const loadWalletBalance = useCallback(async (pubkey: string) => {
    setWallets(prev => prev.map(w => 
      w.pubkey === pubkey ? { ...w, isLoading: true } : w
    ));

    try {
      const { solBalance, tokens } = await loadTokensViaRPC(pubkey);
      
      setWallets(prev => prev.map(w => 
        w.pubkey === pubkey ? { 
          ...w, 
          solBalance, 
          tokens, 
          isLoading: false,
          lastUpdated: new Date()
        } : w
      ));
    } catch (error) {
      console.error(`Failed to load balance for ${pubkey}:`, error);
      setWallets(prev => prev.map(w => 
        w.pubkey === pubkey ? { ...w, isLoading: false } : w
      ));
    }
  }, [loadTokensViaRPC]);

  useEffect(() => {
    loadAllWallets();
  }, [loadAllWallets]);

  const toggleExpanded = (id: string) => {
    setExpandedWallets(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied!", description: `${text.slice(0, 8)}...${text.slice(-8)}` });
  };

  const openInSolscan = (address: string) => {
    window.open(`https://solscan.io/account/${address}`, '_blank');
  };

  // Filter wallets based on search and tab
  const filteredWallets = wallets.filter(wallet => {
    const matchesSearch = 
      wallet.pubkey.toLowerCase().includes(searchTerm.toLowerCase()) ||
      wallet.label?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      wallet.sourceLabel.toLowerCase().includes(searchTerm.toLowerCase()) ||
      wallet.tokens.some(t => t.symbol.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesTab = 
      activeTab === 'all' ||
      (activeTab === 'active' && wallet.isActive) ||
      (activeTab === 'inactive' && !wallet.isActive) ||
      activeTab === wallet.source;

    return matchesSearch && matchesTab;
  });

  // Calculate totals
  const totalSol = filteredWallets.reduce((sum, w) => sum + w.solBalance, 0);
  const totalUsd = totalSol * (solPrice || 0);
  const activeCount = filteredWallets.filter(w => w.isActive).length;

  return (
    <div className="space-y-6">
      {/* Header Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-primary" />
              <div>
                <div className="text-2xl font-bold">{wallets.length}</div>
                <div className="text-xs text-muted-foreground">Total Wallets</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-green-500" />
              <div>
                <div className="text-2xl font-bold">{activeCount}</div>
                <div className="text-xs text-muted-foreground">Active</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Coins className="h-5 w-5 text-amber-500" />
              <div>
                <div className="text-2xl font-bold">{totalSol.toFixed(4)}</div>
                <div className="text-xs text-muted-foreground">Total SOL</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-green-500" />
              <div>
                <div className="text-2xl font-bold">${totalUsd.toFixed(2)}</div>
                <div className="text-xs text-muted-foreground">Total Value</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters and Controls */}
      <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search wallets, tokens, labels..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Button onClick={loadAllWallets} disabled={isLoading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh All
        </Button>
      </div>

      {/* Tabs for filtering by source */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="all">🔮 All ({wallets.length})</TabsTrigger>
          <TabsTrigger value="active">✅ Active ({wallets.filter(w => w.isActive).length})</TabsTrigger>
          <TabsTrigger value="inactive">⏸️ Inactive ({wallets.filter(w => !w.isActive).length})</TabsTrigger>
          <TabsTrigger value="wallet_pool">🏊 Pool ({wallets.filter(w => w.source === 'wallet_pool').length})</TabsTrigger>
          <TabsTrigger value="blackbox">📦 BlackBox ({wallets.filter(w => w.source === 'blackbox').length})</TabsTrigger>
          <TabsTrigger value="super_admin">👑 Admin ({wallets.filter(w => w.source === 'super_admin').length})</TabsTrigger>
          <TabsTrigger value="airdrop">🪂 Airdrop ({wallets.filter(w => w.source === 'airdrop').length})</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-4">
          {/* Wallet List */}
          <div className="space-y-3">
            {filteredWallets.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center text-muted-foreground">
                  <Wallet className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No wallets found matching your criteria.</p>
                </CardContent>
              </Card>
            ) : (
              filteredWallets.map((wallet) => (
                <Card key={wallet.id} className={`transition-all ${!wallet.isActive ? 'opacity-60' : ''}`}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 flex-wrap">
                        {/* Source Badge */}
                        <Badge className={WALLET_SOURCE_CONFIG[wallet.source].color}>
                          <span className="mr-1">{wallet.sourceEmoji}</span>
                          {wallet.sourceLabel}
                        </Badge>
                        
                        {/* Purpose Badge */}
                        {wallet.purpose && (
                          <Badge variant="outline">
                            <span className="mr-1">{wallet.purposeEmoji}</span>
                            {WALLET_PURPOSE_EMOJIS[wallet.purpose]?.label || wallet.purpose}
                          </Badge>
                        )}
                        
                        {/* Active Status */}
                        <Badge variant={wallet.isActive ? "default" : "secondary"}>
                          {wallet.isActive ? '✅ Active' : '⏸️ Inactive'}
                        </Badge>
                        
                        {/* Label if exists */}
                        {wallet.label && (
                          <span className="text-sm font-medium">{wallet.label}</span>
                        )}
                        
                        {/* Linked campaigns */}
                        {wallet.linkedCampaigns && wallet.linkedCampaigns.length > 0 && (
                          <Badge variant="outline" className="bg-primary/10">
                            🎯 {wallet.linkedCampaigns.length} campaign{wallet.linkedCampaigns.length > 1 ? 's' : ''}
                          </Badge>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-2">
                        {/* Balance display */}
                        <div className="text-right">
                          <div className="font-mono font-bold">
                            {wallet.isLoading ? (
                              <RefreshCw className="h-4 w-4 animate-spin inline" />
                            ) : (
                              <>
                                {wallet.solBalance.toFixed(4)} SOL
                                <span className="text-xs text-muted-foreground ml-1">
                                  (${(wallet.solBalance * (solPrice || 0)).toFixed(2)})
                                </span>
                              </>
                            )}
                          </div>
                          {wallet.tokens.length > 1 && (
                            <div className="text-xs text-muted-foreground">
                              +{wallet.tokens.length - 1} tokens
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    {/* Wallet address row */}
                    <div className="flex items-center gap-2 mt-2">
                      <span className="font-mono text-sm bg-muted px-2 py-1 rounded">
                        {wallet.pubkey}
                      </span>
                      <Button variant="ghost" size="sm" onClick={() => copyToClipboard(wallet.pubkey)}>
                        <Copy className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => openInSolscan(wallet.pubkey)}>
                        <ExternalLink className="h-3 w-3" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => loadWalletBalance(wallet.pubkey)}
                        disabled={wallet.isLoading}
                      >
                        <RefreshCw className={`h-3 w-3 ${wallet.isLoading ? 'animate-spin' : ''}`} />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => toggleExpanded(wallet.id)}
                      >
                        {expandedWallets.has(wallet.id) ? (
                          <><ChevronUp className="h-3 w-3 mr-1" /> Hide</>
                        ) : (
                          <><ChevronDown className="h-3 w-3 mr-1" /> Manage</>
                        )}
                      </Button>
                    </div>
                    
                    {/* Last updated */}
                    {wallet.lastUpdated && (
                      <div className="text-xs text-muted-foreground mt-1">
                        Last updated: {wallet.lastUpdated.toLocaleString()}
                      </div>
                    )}
                  </CardHeader>
                  
                  {/* Expandable Token Manager */}
                  <Collapsible open={expandedWallets.has(wallet.id)}>
                    <CollapsibleContent>
                      <CardContent className="pt-0">
                        <div className="border-t pt-4">
                          <WalletTokenManager
                            walletId={wallet.id}
                            walletPubkey={wallet.pubkey}
                            onTokensSold={() => loadWalletBalance(wallet.pubkey)}
                          />
                        </div>
                      </CardContent>
                    </CollapsibleContent>
                  </Collapsible>
                </Card>
              ))
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Legend */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">📚 Wallet Legend</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <div className="font-medium mb-2">Sources:</div>
              <div className="space-y-1">
                <div>🏊 Pool - User trading wallets</div>
                <div>📦 BlackBox - Automation wallets</div>
                <div>👑 Admin - Platform wallets</div>
                <div>🪂 Airdrop - Distribution wallets</div>
              </div>
            </div>
            <div>
              <div className="font-medium mb-2">Purposes:</div>
              <div className="space-y-1">
                <div>💰 Treasury - Revenue storage</div>
                <div>🎯 Campaign - Active campaigns</div>
                <div>📈 Trading - Buy/sell operations</div>
                <div>📊 Volume - Volume generation</div>
              </div>
            </div>
            <div>
              <div className="font-medium mb-2">More Purposes:</div>
              <div className="space-y-1">
                <div>🔥 Bump - Bump bot operations</div>
                <div>↩️ Refunds - Refund processing</div>
                <div>🚨 Emergency - Emergency access</div>
                <div>🪂 Airdrop - Token airdrops</div>
              </div>
            </div>
            <div>
              <div className="font-medium mb-2">Status:</div>
              <div className="space-y-1">
                <div>✅ Active - Ready to use</div>
                <div>⏸️ Inactive - Disabled</div>
                <div>🎯 + campaigns - Linked to campaign(s)</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
