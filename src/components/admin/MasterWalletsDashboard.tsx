import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { 
  RefreshCw, Search, Wallet, Copy, ExternalLink, ChevronDown, ChevronUp,
  Coins, TrendingUp, TrendingDown, DollarSign, Shield, Zap, Target,
  AlertTriangle, Users, Bot, Crown, Key, History, Flame, Send
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useSolPrice } from '@/hooks/useSolPrice';
import { WalletTokenManager } from '@/components/blackbox/WalletTokenManager';
import { CustomWalletManager } from './CustomWalletManager';
import { SortableWalletCard } from './SortableWalletCard';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';

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
  source: 'wallet_pool' | 'blackbox' | 'super_admin' | 'airdrop' | 'custom';
  sourceTable: string;
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
  hasTransactionHistory?: boolean;
}

const WALLET_SOURCE_CONFIG = {
  wallet_pool: { emoji: '🏊', label: 'Pool Wallet', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200', table: 'wallet_pools' },
  blackbox: { emoji: '📦', label: 'BlackBox', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200', table: 'blackbox_wallets' },
  super_admin: { emoji: '👑', label: 'Super Admin', color: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200', table: 'super_admin_wallets' },
  airdrop: { emoji: '🪂', label: 'Airdrop', color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200', table: 'airdrop_wallets' },
  custom: { emoji: '🔑', label: 'Custom Import', color: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200', table: 'rent_reclaimer_wallets' },
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
  const [walletOrder, setWalletOrder] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedWallets, setExpandedWallets] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState('all');
  const [showOnlyWithHistory, setShowOnlyWithHistory] = useState(false);
  const [exportingKey, setExportingKey] = useState<string | null>(null);
  const [isReclaiming, setIsReclaiming] = useState(false);
  const [isConsolidating, setIsConsolidating] = useState(false);
  const { price: solPrice } = useSolPrice();

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Reclaim rent from empty token accounts across all wallets
  const handleReclaimRent = async () => {
    setIsReclaiming(true);
    toast({
      title: "🔥 Reclaiming Rent...",
      description: "Scanning all wallets for empty token accounts...",
    });

    try {
      // First scan
      const { data: scanData, error: scanError } = await supabase.functions.invoke('token-account-cleaner', {
        body: { action: 'scan' }
      });

      if (scanError) throw scanError;
      if (!scanData?.success) throw new Error(scanData?.error || 'Scan failed');

      const totalEmptyAccounts = scanData.results?.reduce((sum: number, r: any) => sum + (r.empty_accounts?.length || 0), 0) || 0;
      const totalRecoverable = scanData.results?.reduce((sum: number, r: any) => sum + (r.total_recoverable_sol || 0), 0) || 0;

      if (totalEmptyAccounts === 0) {
        toast({
          title: "✨ All Clean!",
          description: "No empty token accounts found across any wallets.",
        });
        setIsReclaiming(false);
        return;
      }

      toast({
        title: "📊 Found Empty Accounts",
        description: `${totalEmptyAccounts} empty accounts (~${totalRecoverable.toFixed(4)} SOL). Cleaning now...`,
      });

      // Now clean
      const { data: cleanData, error: cleanError } = await supabase.functions.invoke('token-account-cleaner', {
        body: { action: 'clean_all' }
      });

      if (cleanError) throw cleanError;
      if (!cleanData?.success) throw new Error(cleanData?.error || 'Clean failed');

      const totalClosed = cleanData.results?.reduce((sum: number, r: any) => sum + (r.accounts_closed || 0), 0) || 0;
      const totalRecovered = cleanData.results?.reduce((sum: number, r: any) => sum + (r.sol_recovered || 0), 0) || 0;

      toast({
        title: "🔥 Rent Reclaimed!",
        description: `Closed ${totalClosed} accounts, recovered ${totalRecovered.toFixed(4)} SOL to FlipIt wallet.`,
      });

      // Refresh wallet balances
      loadAllWallets();
    } catch (error: any) {
      console.error('[MasterWallets] Reclaim rent failed:', error);
      toast({
        title: "Reclaim Failed",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setIsReclaiming(false);
    }
  };

  // Consolidate all SOL from all wallets to FlipIt wallet
  const handleConsolidateAll = async () => {
    setIsConsolidating(true);
    toast({
      title: "📤 Consolidating SOL...",
      description: "Transferring all SOL to FlipIt wallet...",
    });

    try {
      const { data, error } = await supabase.functions.invoke('token-account-cleaner', {
        body: { action: 'consolidate_all' }
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Consolidation failed');

      const totalTransferred = data.total_transferred || 0;
      const walletsProcessed = data.wallets_processed || 0;

      toast({
        title: "📤 SOL Consolidated!",
        description: `Transferred ${totalTransferred.toFixed(4)} SOL from ${walletsProcessed} wallets to FlipIt.`,
      });

      // Refresh wallet balances
      loadAllWallets();
    } catch (error: any) {
      console.error('[MasterWallets] Consolidate failed:', error);
      toast({
        title: "Consolidation Failed",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setIsConsolidating(false);
    }
  };

  // Load wallet balance via edge function (uses Helius API key server-side)
  const loadWalletBalance = useCallback(async (pubkey: string) => {
    setWallets(prev => prev.map(w => 
      w.pubkey === pubkey ? { ...w, isLoading: true } : w
    ));

    try {
      console.log(`[MasterWallets] Fetching balance via edge function for ${pubkey.slice(0, 8)}...`);
      
      const { data, error } = await supabase.functions.invoke('refresh-wallet-balances', {
        body: { pubkey }
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Unknown error');

      const tokens: TokenBalance[] = [];
      
      // Add SOL as first token
      tokens.push({
        mint: 'So11111111111111111111111111111111111111112',
        symbol: 'SOL',
        name: 'Solana',
        balance: Math.round(data.sol_balance * 1e9),
        uiAmount: data.sol_balance,
        decimals: 9,
        logoUri: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
        usdValue: data.sol_balance * (solPrice || 0)
      });

      // Add other tokens from response
      if (data.tokens && Array.isArray(data.tokens)) {
        data.tokens.forEach((t: any) => {
          tokens.push({
            mint: t.mint,
            symbol: t.symbol || t.mint.slice(0, 4).toUpperCase(),
            name: t.name || 'Token',
            balance: t.balance,
            uiAmount: t.balance,
            decimals: t.decimals || 0,
          });
        });
      }

      console.log(`[MasterWallets] Got ${tokens.length} tokens for ${pubkey.slice(0, 8)}...`);
      
      setWallets(prev => prev.map(w => 
        w.pubkey === pubkey ? { 
          ...w, 
          solBalance: data.sol_balance, 
          tokens, 
          isLoading: false,
          lastUpdated: new Date()
        } : w
      ));
    } catch (error: any) {
      console.error(`[MasterWallets] Failed to load balance for ${pubkey}:`, error);
      toast({
        title: "Balance fetch failed",
        description: `${pubkey.slice(0, 8)}...: ${error.message}`,
        variant: "destructive"
      });
      setWallets(prev => prev.map(w => 
        w.pubkey === pubkey ? { ...w, isLoading: false } : w
      ));
    }
  }, [solPrice]);

  const loadAllWallets = useCallback(async () => {
    setIsLoading(true);
    
    try {
      // Fetch all wallet sources in parallel (including custom imported wallets)
      const [poolWallets, blackboxWallets, superAdminWallets, airdropWallets, customWallets, campaignLinks] = await Promise.all([
        supabase.from('wallet_pools').select('id, pubkey, sol_balance, is_active, nickname'),
        supabase.from('blackbox_wallets').select('id, pubkey, sol_balance, is_active, updated_at, nickname'),
        supabase.from('super_admin_wallets').select('id, pubkey, label, wallet_type, is_active, created_at'),
        supabase.from('airdrop_wallets').select('id, pubkey, nickname, sol_balance, is_active, updated_at'),
        supabase.functions.invoke('rent-reclaimer-wallets', { body: { action: 'list' } }),
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
          sourceTable: cfg.table,
          sourceEmoji: cfg.emoji,
          sourceLabel: cfg.label,
          purpose: 'trading',
          purposeEmoji: WALLET_PURPOSE_EMOJIS.trading.emoji,
          label: (w as any).nickname || undefined,
          isActive: w.is_active ?? true,
          solBalance: w.sol_balance || 0,
          tokens: [],
          isLoading: false,
          hasTransactionHistory: true, // Pool wallets likely have history
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
          sourceTable: cfg.table,
          sourceEmoji: cfg.emoji,
          sourceLabel: cfg.label,
          purpose: campaigns.length > 0 ? 'volume' : 'bump',
          purposeEmoji: campaigns.length > 0 ? WALLET_PURPOSE_EMOJIS.volume.emoji : WALLET_PURPOSE_EMOJIS.bump.emoji,
          label: (w as any).nickname || undefined,
          isActive: w.is_active ?? true,
          solBalance: w.sol_balance || 0,
          tokens: [],
          isLoading: false,
          lastUpdated: w.updated_at ? new Date(w.updated_at) : undefined,
          linkedCampaigns: campaigns,
          hasTransactionHistory: campaigns.length > 0 || (w.sol_balance || 0) > 0,
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
          sourceTable: cfg.table,
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
          hasTransactionHistory: true, // Admin wallets usually have history
        });
      });

      // Process airdrop wallets
      (airdropWallets.data || []).forEach(w => {
        const cfg = WALLET_SOURCE_CONFIG.airdrop;
        allWallets.push({
          id: w.id,
          pubkey: w.pubkey,
          source: 'airdrop',
          sourceTable: cfg.table,
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
          hasTransactionHistory: (w.sol_balance || 0) > 0,
        });
      });

      // Process custom imported wallets (from rent-reclaimer-wallets edge function)
      const customWalletsData = customWallets.data?.wallets || [];
      customWalletsData.forEach((w: any) => {
        const cfg = WALLET_SOURCE_CONFIG.custom;
        allWallets.push({
          id: w.id,
          pubkey: w.pubkey,
          source: 'custom',
          sourceTable: cfg.table,
          sourceEmoji: cfg.emoji,
          sourceLabel: cfg.label,
          label: w.nickname,
          purpose: 'trading',
          purposeEmoji: WALLET_PURPOSE_EMOJIS.trading.emoji,
          isActive: w.is_active ?? true,
          solBalance: 0,
          tokens: [],
          isLoading: false,
          lastUpdated: w.updated_at ? new Date(w.updated_at) : undefined,
          hasTransactionHistory: false,
        });
      });

      setWallets(allWallets);
      setIsLoading(false);
      
      // Auto-load balances for ALL active wallets in batches
      const activeWallets = allWallets.filter(w => w.isActive && w.pubkey.length === 44);
      console.log(`[MasterWallets] Loading balances for ${activeWallets.length} active wallets`);
      
      // Load in parallel batches of 5
      const batchSize = 5;
      for (let i = 0; i < activeWallets.length; i += batchSize) {
        const batch = activeWallets.slice(i, i + batchSize);
        await Promise.all(batch.map(w => loadWalletBalance(w.pubkey)));
        // Small delay between batches to avoid rate limits
        if (i + batchSize < activeWallets.length) {
          await new Promise(r => setTimeout(r, 500));
        }
      }

    } catch (error: any) {
      console.error('[MasterWallets] Failed to load wallets:', error);
      toast({
        title: "Error loading wallets",
        description: error.message,
        variant: "destructive"
      });
      setIsLoading(false);
    }
  }, [loadWalletBalance]);

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

  // Export private key
  const exportPrivateKey = async (wallet: MasterWallet) => {
    setExportingKey(wallet.id);
    try {
      const { data, error } = await supabase.functions.invoke('export-wallet-key', {
        body: { wallet_id: wallet.id, source: wallet.sourceTable }
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Export failed');

      // Copy to clipboard
      await navigator.clipboard.writeText(data.secret_key);
      toast({
        title: "🔐 Private Key Copied",
        description: `Key for ${wallet.pubkey.slice(0, 8)}... copied to clipboard`,
      });
    } catch (error: any) {
      console.error('[MasterWallets] Export key failed:', error);
      toast({
        title: "Export Failed",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setExportingKey(null);
    }
  };

  // Toggle wallet active status
  const toggleWalletActive = async (wallet: MasterWallet) => {
    const newStatus = !wallet.isActive;
    
    // Optimistically update UI
    setWallets(prev => prev.map(w => 
      w.id === wallet.id ? { ...w, isActive: newStatus } : w
    ));

    try {
      // Different tables have different column names
      const { error } = await supabase
        .from(wallet.sourceTable as any)
        .update({ is_active: newStatus })
        .eq('id', wallet.id);

      if (error) throw error;

      toast({
        title: newStatus ? "✅ Wallet Activated" : "⏸️ Wallet Deactivated",
        description: `${wallet.pubkey.slice(0, 8)}... is now ${newStatus ? 'active' : 'inactive'}`,
      });
    } catch (error: any) {
      // Revert on failure
      setWallets(prev => prev.map(w => 
        w.id === wallet.id ? { ...w, isActive: !newStatus } : w
      ));
      console.error('[MasterWallets] Toggle active failed:', error);
      toast({
        title: "Toggle Failed",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  // Edit wallet label/nickname
  const handleEditLabel = async (wallet: MasterWallet, newLabel: string) => {
    const oldLabel = wallet.label;
    
    // Optimistically update UI
    setWallets(prev => prev.map(w => 
      w.id === wallet.id ? { ...w, label: newLabel || undefined } : w
    ));

    try {
      if (wallet.source === 'custom') {
        // Use edge function for rent_reclaimer_wallets
        const { data, error } = await supabase.functions.invoke('rent-reclaimer-wallets', {
          body: { action: 'update', id: wallet.id, nickname: newLabel || null }
        });
        if (error) throw error;
        if (!data?.success) throw new Error(data?.error || 'Update failed');
      } else if (wallet.source === 'super_admin') {
        const { error } = await supabase
          .from('super_admin_wallets')
          .update({ label: newLabel || null })
          .eq('id', wallet.id);
        if (error) throw error;
      } else if (wallet.source === 'airdrop') {
        const { error } = await supabase
          .from('airdrop_wallets')
          .update({ nickname: newLabel || null })
          .eq('id', wallet.id);
        if (error) throw error;
      } else if (wallet.source === 'wallet_pool') {
        const { error } = await supabase
          .from('wallet_pools' as any)
          .update({ nickname: newLabel || null })
          .eq('id', wallet.id);
        if (error) throw error;
      } else if (wallet.source === 'blackbox') {
        const { error } = await supabase
          .from('blackbox_wallets' as any)
          .update({ nickname: newLabel || null })
          .eq('id', wallet.id);
        if (error) throw error;
      }

      toast({
        title: "✏️ Label Updated",
        description: `Wallet ${wallet.pubkey.slice(0, 8)}... renamed to "${newLabel || '(no label)'}"`,
      });
    } catch (error: any) {
      // Revert on failure
      setWallets(prev => prev.map(w => 
        w.id === wallet.id ? { ...w, label: oldLabel } : w
      ));
      console.error('[MasterWallets] Edit label failed:', error);
      toast({
        title: "Label Update Failed",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  // Filter wallets based on search, tab, and history filter
  const filteredWallets = useMemo(() => {
    const filtered = wallets.filter(wallet => {
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

      const matchesHistory = !showOnlyWithHistory || wallet.hasTransactionHistory || wallet.solBalance > 0;

      return matchesSearch && matchesTab && matchesHistory;
    });

    // Sort: custom order first, then active wallets first, then by balance
    return filtered.sort((a, b) => {
      // Check custom order first
      const aOrderIndex = walletOrder.indexOf(a.id);
      const bOrderIndex = walletOrder.indexOf(b.id);
      
      if (aOrderIndex !== -1 && bOrderIndex !== -1) {
        return aOrderIndex - bOrderIndex;
      }
      if (aOrderIndex !== -1) return -1;
      if (bOrderIndex !== -1) return 1;
      
      // Active wallets first
      if (a.isActive !== b.isActive) {
        return a.isActive ? -1 : 1;
      }
      
      // Then by balance (higher first)
      return b.solBalance - a.solBalance;
    });
  }, [wallets, searchTerm, activeTab, showOnlyWithHistory, walletOrder]);

  // Handle drag end
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = filteredWallets.findIndex(w => w.id === active.id);
      const newIndex = filteredWallets.findIndex(w => w.id === over.id);
      
      const newOrder = arrayMove(
        filteredWallets.map(w => w.id),
        oldIndex,
        newIndex
      );
      
      setWalletOrder(newOrder);
      toast({
        title: "📋 Order Updated",
        description: "Wallet order has been changed",
      });
    }
  };

  // Count wallets with balance (for history filter)
  const walletsWithBalance = wallets.filter(w => w.solBalance > 0 || w.hasTransactionHistory).length;

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
        <div className="flex gap-2 items-center flex-1">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search wallets, tokens, labels..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <Button
            variant={showOnlyWithHistory ? "default" : "outline"}
            size="sm"
            onClick={() => setShowOnlyWithHistory(!showOnlyWithHistory)}
            className="whitespace-nowrap"
          >
            <History className="h-4 w-4 mr-1" />
            With Balance ({walletsWithBalance})
          </Button>
        </div>
        <div className="flex gap-2 flex-wrap">
          {/* Import Custom Wallet Button */}
          <CustomWalletManager onWalletsChange={loadAllWallets} />

          {/* Reclaim Rent Button */}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" disabled={isReclaiming || isLoading}>
                <Flame className={`h-4 w-4 mr-2 ${isReclaiming ? 'animate-pulse' : ''}`} />
                {isReclaiming ? 'Reclaiming...' : 'Reclaim Rent'}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>🔥 Reclaim Rent from All Wallets?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will scan ALL {wallets.length} wallets for empty token accounts, close them to reclaim ~0.002 SOL each, and send the recovered SOL to the FlipIt treasury wallet.
                  <br /><br />
                  <strong>This action cannot be undone.</strong>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleReclaimRent} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  🔥 Reclaim All Rent
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Consolidate All SOL Button */}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" disabled={isConsolidating || isLoading}>
                <Send className={`h-4 w-4 mr-2 ${isConsolidating ? 'animate-pulse' : ''}`} />
                {isConsolidating ? 'Consolidating...' : 'Consolidate All'}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>📤 Consolidate All SOL to FlipIt?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will transfer ALL SOL (minus transaction fees) from ALL {wallets.length} wallets to the FlipIt treasury wallet.
                  <br /><br />
                  Total SOL to consolidate: <strong>{totalSol.toFixed(4)} SOL</strong> (${totalUsd.toFixed(2)})
                  <br /><br />
                  <strong className="text-destructive">⚠️ This will empty all wallets! This action cannot be undone.</strong>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleConsolidateAll} className="bg-primary text-primary-foreground hover:bg-primary/90">
                  📤 Consolidate All SOL
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <Button onClick={loadAllWallets} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh All
          </Button>
        </div>
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
          <TabsTrigger value="custom">🔑 Custom ({wallets.filter(w => w.source === 'custom').length})</TabsTrigger>
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
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={filteredWallets.map(w => w.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {filteredWallets.map((wallet) => (
                    <SortableWalletCard
                      key={wallet.id}
                      wallet={wallet}
                      solPrice={solPrice}
                      isExpanded={expandedWallets.has(wallet.id)}
                      isExporting={exportingKey === wallet.id}
                      sourceConfig={WALLET_SOURCE_CONFIG}
                      purposeEmojis={WALLET_PURPOSE_EMOJIS}
                      onToggleActive={toggleWalletActive}
                      onToggleExpanded={toggleExpanded}
                      onRefreshBalance={loadWalletBalance}
                      onExportKey={exportPrivateKey}
                      onCopy={copyToClipboard}
                      onOpenSolscan={openInSolscan}
                      onEditLabel={handleEditLabel}
                    />
                  ))}
                </SortableContext>
              </DndContext>
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
                <div>🔑 Custom - Imported via private key</div>
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
