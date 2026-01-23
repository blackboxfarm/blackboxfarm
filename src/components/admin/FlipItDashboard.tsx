import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Flame, RefreshCw, TrendingUp, TrendingDown, DollarSign, Wallet, Clock, CheckCircle2, XCircle, Loader2, Plus, Copy, ArrowUpRight, Key, Settings, Zap, Activity, Radio, Pencil, ChevronDown, Coins, Eye, EyeOff, RotateCcw, AlertTriangle, Trash2, Globe, Send, Rocket, Megaphone, Users, Shield, ClipboardPaste, FlaskConical, Lock, LockOpen, BarChart3 } from 'lucide-react';
import { SocialIcon } from '@/components/token/SocialIcon';
import { detectSocialPlatform } from '@/utils/socialPlatformDetector';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useSolPrice } from '@/hooks/useSolPrice';
import { useHolderQualityCheck } from '@/hooks/useHolderQualityCheck';
import { FlipItFeeCalculator } from './flipit/FlipItFeeCalculator';
import { MomentumIndicator } from './flipit/MomentumIndicator';
import { TokenPreviewCard } from './flipit/TokenPreviewCard';
import { HolderQualityIndicator } from './flipit/HolderQualityIndicator';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { WalletTokenManager } from '@/components/blackbox/WalletTokenManager';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import TweetTemplateEditor from './TweetTemplateEditor';
import { FlipItNotificationSettings } from './FlipItNotificationSettings';
import { usePreviewSuperAdmin } from '@/hooks/usePreviewSuperAdmin';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';

interface DexPaidStatus {
  tokenMint?: string;
  activeBoosts: number;
  hasPaidProfile?: boolean;
  hasDexPaid?: boolean; // Alias for hasPaidProfile (used by unified-monitor)
  hasActiveAds?: boolean;
  hasAds?: boolean; // Alias for hasActiveAds (used by unified-monitor)
  hasCTO: boolean;
  orders?: Array<{
    type: string;
    status: string;
    paymentTimestamp?: number;
  }>;
  checkedAt?: string;
}

interface FlipPosition {
  id: string;
  token_mint: string;
  token_symbol: string | null;
  token_name: string | null;
  token_image: string | null;
  twitter_url: string | null;
  website_url: string | null;
  telegram_url: string | null;
  buy_amount_usd: number;
  buy_price_usd: number | null;
  quantity_tokens: number | null;
  buy_signature: string | null;
  buy_executed_at: string | null;
  target_multiplier: number;
  target_price_usd: number | null;
  sell_price_usd: number | null;
  sell_signature: string | null;
  sell_executed_at: string | null;
  profit_usd: number | null;
  status: string;
  error_message: string | null;
  created_at: string;
  wallet_id: string | null;
  // Test position flag
  is_test_position: boolean | null;
  // Rebuy fields
  rebuy_enabled: boolean | null;
  rebuy_price_usd: number | null;
  rebuy_price_high_usd: number | null;
  rebuy_price_low_usd: number | null;
  rebuy_amount_usd: number | null;
  rebuy_target_multiplier: number | null;
  rebuy_status: string | null;
  rebuy_executed_at: string | null;
  rebuy_position_id: string | null;
  rebuy_loop_enabled: boolean | null;
  // Emergency sell fields
  emergency_sell_enabled: boolean | null;
  emergency_sell_price_usd: number | null;
  emergency_sell_status: string | null;
  emergency_sell_executed_at: string | null;
  // Moonbag fields
  moon_bag_enabled: boolean | null;
  moon_bag_percent: number | null;
  moon_bag_quantity_tokens: number | null;
  moon_bag_peak_price_usd: number | null;
  moon_bag_dump_threshold_pct: number | null;
  // DEX paid status
  dex_paid_status: DexPaidStatus | null;
  // Dev trust rating for blacklist/whitelist/neutrallist
  dev_trust_rating: 'unknown' | 'concern' | 'danger' | 'good' | null;
  // Creator wallet for cross-referencing
  creator_wallet: string | null;
  // Tracking lock - when true, triggers data capture
  tracking_locked: boolean | null;
  // Bonding curve status
  is_on_curve: boolean | null;
  bonding_curve_progress: number | null;
}

interface SuperAdminWallet {
  id: string;
  label: string;
  pubkey: string;
  wallet_type?: string;
}

interface LimitOrder {
  id: string;
  token_mint: string;
  token_symbol: string | null;
  token_name: string | null;
  buy_price_min_usd: number;
  buy_price_max_usd: number;
  buy_amount_sol: number;
  target_multiplier: number;
  slippage_bps: number;
  priority_fee_mode: string;
  status: string;
  expires_at: string;
  executed_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  notification_email: string | null;
}

interface InputTokenData {
  mint: string;
  symbol: string | null;
  name: string | null;
  price: number | null;
  image: string | null;
  marketCap: number | null;
  liquidity: number | null;
  holders: number | null;
  dexStatus: {
    hasPaidProfile?: boolean;
    hasCTO?: boolean;
    activeBoosts?: number;
    hasActiveAds?: boolean;
  } | null;
  twitterUrl: string | null;
  websiteUrl: string | null;
  telegramUrl: string | null;
  lastFetched: string | null;
  source: 'token-metadata' | 'raydium-quote' | 'dexscreener' | null;
  creatorWallet: string | null;
}

interface BlacklistWarning {
  level: 'high' | 'medium' | 'low' | 'trusted' | 'review' | 'team_blacklisted' | null;
  reason: string | null;
  source: 'token_mint' | 'creator_wallet' | 'twitter' | 'team' | 'x_community' | null;
  entryType: string | null;
  teamId?: string | null;
}

export function FlipItDashboard() {
  const isPreviewAdmin = usePreviewSuperAdmin();
  const navigate = useNavigate();
  const { isAuthenticated, loading: authLoading } = useAuth();

  const [positions, setPositions] = useState<FlipPosition[]>([]);
  const [wallets, setWallets] = useState<SuperAdminWallet[]>([]);
  const [selectedWallet, setSelectedWallet] = useState<string>('');
  const [tokenAddress, setTokenAddress] = useState('');
  const [buyAmount, setBuyAmount] = useState('0.1');
  // REMOVED: buyAmountMode - always SOL only, no USD option
  const [targetMultiplier, setTargetMultiplier] = useState(2);
  const [isLoading, setIsLoading] = useState(false);
  const [isFlipping, setIsFlipping] = useState(false);
  const [isMonitoring, setIsMonitoring] = useState(false);
  // Separate manual refresh state from background monitoring to prevent button flicker
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);
  const [currentPrices, setCurrentPrices] = useState<Record<string, number>>({});
  const [bondingCurveData, setBondingCurveData] = useState<Record<string, number>>({});
  const [marketData, setMarketData] = useState<Record<string, {
    priceChange5m?: number;
    priceChange1h?: number;
    priceChange24h?: number;
    volume5m?: number;
    volume1h?: number;
    volume24h?: number;
    volumeSurgeRatio?: number;
  }>>({});
  const [tokenImages, setTokenImages] = useState<Record<string, string>>({});
  const [isGeneratingWallet, setIsGeneratingWallet] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [isRefreshingBalance, setIsRefreshingBalance] = useState(false);
  
  // Withdraw amount state
  const [withdrawAmount, setWithdrawAmount] = useState<string>('');
  const [withdrawDestination, setWithdrawDestination] = useState<string>('');
  
  // Private key modal state
  const [showKeysModal, setShowKeysModal] = useState(false);
  const [decryptedPrivateKey, setDecryptedPrivateKey] = useState<string | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [showTokenManager, setShowTokenManager] = useState(false);
  
  // Unified input token state - single source of truth
  const [inputToken, setInputToken] = useState<InputTokenData>({
    mint: '',
    symbol: null,
    name: null,
    price: null,
    image: null,
    marketCap: null,
    liquidity: null,
    holders: null,
    dexStatus: null,
    twitterUrl: null,
    websiteUrl: null,
    telegramUrl: null,
    lastFetched: null,
    source: null,
    creatorWallet: null
  });
  const [isLoadingInputToken, setIsLoadingInputToken] = useState(false);
  const inputFetchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Last execution price comparison state
  const [lastExecutionPrices, setLastExecutionPrices] = useState<{
    requested: number | null;
    received: number | null;
    tokenSymbol: string | null;
    timestamp: string | null;
  } | null>(null);
  
  // Price confirmation dialog state (Phase 3: UI confirmation for price deviation)
  const [priceConfirmation, setPriceConfirmation] = useState<{
    show: boolean;
    displayedPrice: number | null;
    executablePrice: number | null;
    deviationPct: number;
    venue: string;
    confidence: string;
    source: string;
    onConfirm: (() => void) | null;
  }>({
    show: false,
    displayedPrice: null,
    executablePrice: null,
    deviationPct: 0,
    venue: '',
    confidence: '',
    source: '',
    onConfirm: null
  });
  const [isFetchingPreflight, setIsFetchingPreflight] = useState(false);
  
  // Blacklist warning state for input token
  const [blacklistWarning, setBlacklistWarning] = useState<BlacklistWarning>({
    level: null,
    reason: null,
    source: null,
    entryType: null
  });
  const [isCheckingBlacklist, setIsCheckingBlacklist] = useState(false);
  
  // Helper for empty input token state
  const getEmptyInputToken = (): InputTokenData => ({
    mint: '',
    symbol: null,
    name: null,
    price: null,
    image: null,
    marketCap: null,
    liquidity: null,
    holders: null,
    dexStatus: null,
    twitterUrl: null,
    websiteUrl: null,
    telegramUrl: null,
    lastFetched: null,
    source: null,
    creatorWallet: null
  });
  
  // SOL price for USD conversion
  const { price: solPrice, isLoading: solPriceLoading } = useSolPrice();
  
  // Holder quality check hook
  const holderQuality = useHolderQualityCheck();
  
  // Settings
  const [slippageBps, setSlippageBps] = useState(500); // 5% default
  const [priorityFeeMode, setPriorityFeeMode] = useState<'low' | 'medium' | 'high' | 'turbo' | 'ultra'>('medium'); // 0.0005 SOL default
  const [autoMonitorEnabled, setAutoMonitorEnabled] = useState(true);
  const [lastAutoCheck, setLastAutoCheck] = useState<string | null>(null);
  
  // Auto-refresh state
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);
  const [countdown, setCountdown] = useState(5);
  const countdownRef = useRef(5);
  
  // Rebuy monitoring state
  const [rebuyMonitorEnabled, setRebuyMonitorEnabled] = useState(true);
  const [rebuyCountdown, setRebuyCountdown] = useState(15);
  const rebuyCountdownRef = useRef(15);
  const [lastRebuyCheck, setLastRebuyCheck] = useState<string | null>(null);
  const [isRebuyMonitoring, setIsRebuyMonitoring] = useState(false);
  
  // Rebuy settings for editing individual positions
  const [rebuyEditing, setRebuyEditing] = useState<Record<string, { enabled: boolean; priceHigh: string; priceLow: string; amount: string; targetMultiplier: number; loopEnabled: boolean }>>({});

  // Emergency sell monitoring state
  const [emergencyMonitorEnabled, setEmergencyMonitorEnabled] = useState(true);
  const [emergencyCountdown, setEmergencyCountdown] = useState(5);
  const emergencyCountdownRef = useRef(5);
  const [lastEmergencyCheck, setLastEmergencyCheck] = useState<string | null>(null);
  const [isEmergencyMonitoring, setIsEmergencyMonitoring] = useState(false);
  const [emergencyEditing, setEmergencyEditing] = useState<Record<string, { enabled: boolean; price: string }>>({});

  // Moonbag editing state
  const [moonbagEditing, setMoonbagEditing] = useState<Record<string, { enabled: boolean; percent: string }>>({});

  // Limit Order mode state
  const [limitOrderMode, setLimitOrderMode] = useState(false);
  const [limitPriceMin, setLimitPriceMin] = useState('');
  const [limitPriceMax, setLimitPriceMax] = useState('');
  const [limitExpiry, setLimitExpiry] = useState('168'); // 7 days in hours
  const [limitOrders, setLimitOrders] = useState<LimitOrder[]>([]);
  const [isSubmittingLimitOrder, setIsSubmittingLimitOrder] = useState(false);
  const [limitOrderMonitorEnabled, setLimitOrderMonitorEnabled] = useState(true);
  const [limitOrderCountdown, setLimitOrderCountdown] = useState(2);
  const limitOrderCountdownRef = useRef(2);
  const [lastLimitOrderCheck, setLastLimitOrderCheck] = useState<string | null>(null);
  const [isLimitOrderMonitoring, setIsLimitOrderMonitoring] = useState(false);
  const [isExecutingLimitOrder, setIsExecutingLimitOrder] = useState<string | null>(null);
  const [notificationEmail, setNotificationEmail] = useState('wilsondavid@live.ca');

  // Chain sync state
  const [isSyncingWithChain, setIsSyncingWithChain] = useState(false);
  const [lastSyncResult, setLastSyncResult] = useState<{
    phantomCount: number;
    cleanedCount: number;
    validCount: number;
    timestamp: string;
  } | null>(null);

  useEffect(() => {
    // RLS is enforced by Supabase using your auth session.
    // "Preview admin" only affects UI gating; it does NOT create an auth session.
    if (authLoading) return;

    // Preview admins can proceed even without Supabase auth session
    // In production, only authenticated users should load data
    const canLoadData = isAuthenticated || isPreviewAdmin;
    
    console.log('[FlipIt] Auth state:', { isAuthenticated, isPreviewAdmin, authLoading, canLoadData });
    
    if (!canLoadData) {
      console.log('[FlipIt] Not authorized to load data, clearing state');
      setWallets([]);
      setSelectedWallet('');
      setPositions([]);
      setBondingCurveData({});
      setCurrentPrices({});
      return;
    }

    // Load all data for authorized users
    const loadAllData = async () => {
      console.log('[FlipIt] Loading all data for authorized user');
      await loadWallets();
      await loadPositions();
      await loadLimitOrders();
      
      // Immediately trigger price/bonding curve fetch after initial load
      // This ensures production users get the same data as preview users
      console.log('[FlipIt] Triggering initial price fetch');
      handleAutoRefresh();
    };
    
    loadAllData();
  }, [isPreviewAdmin, isAuthenticated, authLoading]);

  // Debounced real-time subscription to flip_positions changes
  const realtimeDebounceRef = useRef<NodeJS.Timeout | null>(null);
  
  // Only subscribe to real-time changes after auth is confirmed
  useEffect(() => {
    // Don't subscribe until authenticated to prevent RLS rejections
    if (!isAuthenticated && !isPreviewAdmin) {
      console.log('[FlipIt] Real-time subscription skipped - not authenticated');
      return;
    }
    
    const channel = supabase
      .channel('flip-positions-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'flip_positions' },
        (payload) => {
          console.log('[FlipIt] Position changed (realtime):', payload.eventType);
          
          // Debounce: wait 2 seconds before reloading to batch multiple rapid changes
          if (realtimeDebounceRef.current) {
            clearTimeout(realtimeDebounceRef.current);
          }
          
          realtimeDebounceRef.current = setTimeout(() => {
            console.log('[FlipIt] Debounced reload triggered (silent)');
            loadPositions({ silent: true });
          }, 2000);
        }
      )
      .subscribe();

    return () => {
      if (realtimeDebounceRef.current) {
        clearTimeout(realtimeDebounceRef.current);
      }
      supabase.removeChannel(channel);
    };
  }, [isAuthenticated, isPreviewAdmin]);

  // Loading guard refs to prevent concurrent API calls
  const isAutoRefreshingRef = useRef(false);
  const isRebuyCheckingRef = useRef(false);
  const isEmergencyCheckingRef = useRef(false);
  const isLimitOrderCheckingRef = useRef(false);
  const isLoadingPositionsRef = useRef(false);
  const lastErrorToastRef = useRef<number>(0); // Rate limit error toasts
  
  // Use refs for data to avoid stale closures in callbacks
  const positionsRef = useRef(positions);
  const walletsRef = useRef(wallets);
  const selectedWalletRef = useRef(selectedWallet);
  
  useEffect(() => { positionsRef.current = positions; }, [positions]);
  useEffect(() => { walletsRef.current = wallets; }, [wallets]);
  useEffect(() => { selectedWalletRef.current = selectedWallet; }, [selectedWallet]);

  // UNIFIED MONITOR - combines price check, rebuy, emergency, and limit order monitoring
  const handleUnifiedMonitor = useCallback(async () => {
    // Guard: prevent concurrent calls
    if (isAutoRefreshingRef.current) {
      console.log('[FlipIt] Unified monitor skipped - already running');
      return;
    }

    const currentPositions = positionsRef.current;
    const hasHoldings = currentPositions.some(p => p.status === 'holding');
    const hasRebuyWatching = currentPositions.some(p => p.rebuy_status === 'watching');
    
    // Skip if nothing to monitor
    if (!hasHoldings && !hasRebuyWatching && limitOrders.filter(o => o.status === 'watching').length === 0) {
      console.log('[FlipIt] Nothing to monitor, skipping');
      return;
    }

    isAutoRefreshingRef.current = true;
    console.log('[FlipIt] Unified monitor running...');

    try {
      // Call the unified monitor edge function
      const { data, error } = await supabase.functions.invoke('flipit-unified-monitor', {
        body: { 
          slippageBps: slippageBps,
          priorityFeeMode: priorityFeeMode
        }
      });

      if (error) {
        console.error('[FlipIt] Unified monitor error:', error);
        return;
      }

      console.log('[FlipIt] Unified monitor response:', {
        pricesCount: Object.keys(data?.prices || {}).length,
        summary: data?.summary
      });

      // Update prices and market data
      if (data?.prices) {
        setCurrentPrices(data.prices);
      }
      if (data?.marketData) {
        setMarketData(prev => ({ ...prev, ...data.marketData }));
      }
      if (data?.bondingCurveData) {
        setBondingCurveData(prev => ({ ...prev, ...data.bondingCurveData }));
      }
      if (data?.checkedAt) {
        setLastAutoCheck(data.checkedAt);
        setLastRebuyCheck(data.checkedAt);
        setLastEmergencyCheck(data.checkedAt);
        setLastLimitOrderCheck(data.checkedAt);
      }

      // Handle executed actions (use silent reload to prevent flicker)
      if (data?.emergencyMonitor?.executed?.length > 0) {
        toast.error(`🚨 EMERGENCY SELL: ${data.emergencyMonitor.executed.length} position(s) sold!`, { duration: 10000 });
        loadPositions({ silent: true });
      }
      if (data?.rebuyMonitor?.executed?.length > 0) {
        toast.success(`Rebuy executed for ${data.rebuyMonitor.executed.length} position(s)!`);
        loadPositions({ silent: true });
      }
      if (data?.limitOrderMonitor?.executed?.length > 0) {
        toast.success(`Limit order executed for ${data.limitOrderMonitor.executed.length} order(s)!`);
        loadPositions({ silent: true });
        loadLimitOrders();
      }
      if (data?.limitOrderMonitor?.expired > 0) {
        loadLimitOrders();
      }

      // Update wallet balance
      const currentWallet = walletsRef.current.find(w => w.id === selectedWalletRef.current);
      if (currentWallet) {
        try {
          const { data: balanceData, error: balErr } = await supabase.functions.invoke('get-wallet-balance', {
            body: { walletAddress: currentWallet.pubkey }
          });
          if (!balErr && !balanceData.error) {
            setWalletBalance(balanceData.balance);
          }
        } catch (balanceErr) {
          console.error('[FlipIt] Balance refresh failed:', balanceErr);
        }
      }
    } catch (err) {
      console.error('[FlipIt] Unified monitor failed:', err);
    } finally {
      isAutoRefreshingRef.current = false;
    }
  }, [slippageBps, priorityFeeMode, limitOrders]);

  // Legacy handlers for backward compatibility (used by manual refresh buttons)
  const handleAutoRefresh = useCallback(async () => {
    if (isAutoRefreshingRef.current) return;
    
    const currentPositions = positionsRef.current;
    if (currentPositions.length === 0) {
      console.log('[FlipIt] No positions, skipping auto-refresh');
      return;
    }

    isAutoRefreshingRef.current = true;
    try {
      const { data, error } = await supabase.functions.invoke('flipit-price-monitor', {
        body: { 
          action: 'check',
          slippageBps: slippageBps,
          priorityFeeMode: priorityFeeMode
        }
      });

      if (error) throw error;

      if (data?.prices) {
        setCurrentPrices(data.prices);
      }
      if (data?.bondingCurveData) {
        setBondingCurveData(prev => ({ ...prev, ...data.bondingCurveData }));
      }
      if (data?.checkedAt) {
        setLastAutoCheck(data.checkedAt);
      }
    } catch (err) {
      console.error('[FlipIt] Auto-refresh failed:', err);
    } finally {
      isAutoRefreshingRef.current = false;
    }
  }, [slippageBps, priorityFeeMode]);

  const handleRebuyCheck = useCallback(async () => {
    if (isRebuyCheckingRef.current) return;
    
    const currentPositions = positionsRef.current;
    const watchingPositions = currentPositions.filter(p => p.rebuy_status === 'watching');
    if (watchingPositions.length === 0) return;

    isRebuyCheckingRef.current = true;
    setIsRebuyMonitoring(true);
    try {
      const { data, error } = await supabase.functions.invoke('flipit-rebuy-monitor', {
        body: { 
          slippageBps: slippageBps,
          priorityFeeMode: priorityFeeMode,
          targetMultiplier: targetMultiplier
        }
      });

      if (error) throw error;

      if (data?.checkedAt) {
        setLastRebuyCheck(data.checkedAt);
      }
      if (data?.executed?.length > 0) {
        toast.success(`Rebuy executed for ${data.executed.length} position(s)!`);
        loadPositions({ silent: true });
      }
    } catch (err) {
      console.error('Rebuy check failed:', err);
    } finally {
      setIsRebuyMonitoring(false);
      isRebuyCheckingRef.current = false;
    }
  }, [slippageBps, priorityFeeMode, targetMultiplier]);

  const handleEmergencyCheck = useCallback(async () => {
    if (isEmergencyCheckingRef.current) return;
    
    const currentPositions = positionsRef.current;
    const watchingPositions = currentPositions.filter(p => p.status === 'holding' && p.emergency_sell_status === 'watching');
    if (watchingPositions.length === 0) return;

    isEmergencyCheckingRef.current = true;
    setIsEmergencyMonitoring(true);
    try {
      const { data, error } = await supabase.functions.invoke('flipit-emergency-monitor');

      if (error) throw error;

      if (data?.checkedAt) {
        setLastEmergencyCheck(data.checkedAt);
      }
      if (data?.prices) {
        setCurrentPrices(prev => ({ ...prev, ...data.prices }));
      }
      if (data?.executed?.length > 0) {
        toast.error(`🚨 EMERGENCY SELL: ${data.executed.length} position(s) sold at stop-loss!`, {
          duration: 10000,
        });
        loadPositions({ silent: true });
      }
    } catch (err) {
      console.error('Emergency check failed:', err);
    } finally {
      setIsEmergencyMonitoring(false);
      isEmergencyCheckingRef.current = false;
    }
  }, []);

  // CONSOLIDATED SINGLE POLLING INTERVAL - replaces 4 separate intervals
  useEffect(() => {
    // Only run if at least one monitor type is enabled
    if (!autoRefreshEnabled && !rebuyMonitorEnabled && !emergencyMonitorEnabled && !limitOrderMonitorEnabled) {
      return;
    }

    const hasHoldings = positions.some(p => p.status === 'holding');
    const hasRebuyWatching = positions.some(p => p.rebuy_status === 'watching');
    const hasEmergencyWatching = positions.some(p => p.status === 'holding' && p.emergency_sell_status === 'watching');
    const hasLimitOrderWatching = limitOrders.some(o => o.status === 'watching');

    // Skip if nothing to monitor
    if (!hasHoldings && !hasRebuyWatching && !hasEmergencyWatching && !hasLimitOrderWatching) {
      console.log('[FlipIt] No active positions/orders to monitor');
      return;
    }

    console.log('[FlipIt] Starting unified monitor interval (5s)');
    
    // Run immediately on mount
    handleUnifiedMonitor();
    
    // Then run every 5 seconds (compromise between 2s limit orders and 15s price check)
    const intervalId = setInterval(() => {
      handleUnifiedMonitor();
    }, 5000);

    return () => {
      console.log('[FlipIt] Clearing unified monitor interval');
      clearInterval(intervalId);
    };
  }, [
    autoRefreshEnabled, 
    rebuyMonitorEnabled, 
    emergencyMonitorEnabled, 
    limitOrderMonitorEnabled,
    positions.length, // Only re-run effect when position count changes
    limitOrders.length, // Only re-run effect when order count changes
    handleUnifiedMonitor
  ]);

  // Limit order monitoring handler
  const handleLimitOrderCheck = useCallback(async () => {
    const watchingOrders = limitOrders.filter(o => o.status === 'watching');
    if (watchingOrders.length === 0 || isLimitOrderMonitoring) return;

    setIsLimitOrderMonitoring(true);
    try {
      const { data, error } = await supabase.functions.invoke('flipit-limit-order-monitor');

      if (error) throw error;

      if (data?.checkedAt) {
        setLastLimitOrderCheck(data.checkedAt);
      }
      if (data?.executed?.length > 0) {
        toast.success(`Limit buy executed for ${data.executed.length} order(s)!`);
        loadLimitOrders();
        loadPositions({ silent: true });
      }
      if (data?.expiredCount > 0) {
        loadLimitOrders();
      }
    } catch (err) {
      console.error('Limit order check failed:', err);
    } finally {
      setIsLimitOrderMonitoring(false);
    }
  }, [limitOrders, isLimitOrderMonitoring]);

  // Limit order monitoring poll (every 2 seconds for fast dips)
  useEffect(() => {
    if (!limitOrderMonitorEnabled) return;

    const hasWatching = limitOrders.some((o) => o.status === 'watching');
    if (!hasWatching) return;

    setLimitOrderCountdown(2);
    limitOrderCountdownRef.current = 2;

    const id = setInterval(() => {
      void handleLimitOrderCheck();
    }, 2000);

    return () => {
      clearInterval(id);
    };
  }, [limitOrderMonitorEnabled, limitOrders, handleLimitOrderCheck]);

  // Real-time subscription to limit orders
  useEffect(() => {
    const channel = supabase
      .channel('flip-limit-orders-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'flip_limit_orders' },
        (payload) => {
          console.log('Limit order changed:', payload);
          loadLimitOrders();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (selectedWallet) {
      refreshWalletBalance();
    }
  }, [selectedWallet]);

  // Check blacklist/whitelist status for token, creator wallet, or twitter
  const checkBlacklistStatus = useCallback(async (tokenMint: string, creatorWallet: string | null, twitterUrl: string | null) => {
    setIsCheckingBlacklist(true);
    setBlacklistWarning({ level: null, reason: null, source: null, entryType: null });
    
    try {
      // Extract twitter handle from URL
      const twitterHandle = twitterUrl ? twitterUrl.match(/(?:twitter\.com|x\.com)\/([^/?]+)/i)?.[1]?.toLowerCase() : null;
      
      // Build list of identifiers to check
      const identifiers = [tokenMint];
      if (creatorWallet) identifiers.push(creatorWallet);
      if (twitterHandle) identifiers.push(twitterHandle);
      
      // Check dev_teams first (highest priority - organized groups)
      if (creatorWallet || twitterHandle) {
        const teamIdentifiers = [];
        if (creatorWallet) teamIdentifiers.push(creatorWallet);
        if (twitterHandle) teamIdentifiers.push(twitterHandle);
        
        const { data: teamData } = await supabase
          .from('dev_teams')
          .select('*')
          .or(`member_wallets.cs.{${creatorWallet || ''}},member_twitter_accounts.cs.{${twitterHandle || ''}}`)
          .eq('is_active', true)
          .limit(1);
        
        if (teamData && teamData.length > 0) {
          const team = teamData[0];
          if (team.risk_level === 'high' || team.tokens_rugged > 0) {
            setBlacklistWarning({
              level: 'team_blacklisted',
              reason: `🚨 Part of known rug team${team.team_name ? `: ${team.team_name}` : ''} (${team.tokens_rugged || 0} rugs, ${team.member_wallets?.length || 0} wallets)`,
              source: 'team',
              entryType: 'dev_team',
              teamId: team.id
            });
            return;
          }
        }
      }
      
      // Check blacklist first (higher priority)
      const { data: blacklistData } = await supabase
        .from('pumpfun_blacklist')
        .select('*')
        .in('identifier', identifiers)
        .eq('is_active', true)
        .limit(1);
      
      if (blacklistData && blacklistData.length > 0) {
        const entry = blacklistData[0];
        const source = entry.identifier === tokenMint ? 'token_mint' 
          : entry.identifier === creatorWallet ? 'creator_wallet'
          : 'twitter';
        
        setBlacklistWarning({
          level: entry.risk_level === 'high' ? 'high' : 'medium',
          reason: entry.blacklist_reason || `Blacklisted ${entry.entry_type}`,
          source: source as any,
          entryType: entry.entry_type
        });
        return;
      }
      
      // Check whitelist
      const { data: whitelistData } = await supabase
        .from('pumpfun_whitelist')
        .select('*')
        .in('identifier', identifiers)
        .eq('is_active', true)
        .limit(1);
      
      if (whitelistData && whitelistData.length > 0) {
        const entry = whitelistData[0];
        const source = entry.identifier === tokenMint ? 'token_mint' 
          : entry.identifier === creatorWallet ? 'creator_wallet'
          : 'twitter';
        
        setBlacklistWarning({
          level: 'trusted',
          reason: entry.whitelist_reason || `Whitelisted ${entry.entry_type}`,
          source: source as any,
          entryType: entry.entry_type
        });
        return;
      }
      
      // Check neutrallist
      const { data: neutrallistData } = await supabase
        .from('pumpfun_neutrallist')
        .select('*')
        .in('identifier', identifiers)
        .eq('is_active', true)
        .limit(1);
      
      if (neutrallistData && neutrallistData.length > 0) {
        const entry = neutrallistData[0];
        const source = entry.identifier === tokenMint ? 'token_mint' 
          : entry.identifier === creatorWallet ? 'creator_wallet'
          : 'twitter';
        
        setBlacklistWarning({
          level: 'review',
          reason: entry.reason || `Under review: ${entry.entry_type}`,
          source: source as any,
          entryType: entry.entry_type
        });
      }
    } catch (err) {
      console.error('Failed to check blacklist status:', err);
    } finally {
      setIsCheckingBlacklist(false);
    }
  }, []);
  
  // Unified token data fetch function - single source of truth
  const fetchInputTokenData = useCallback(async (tokenMint: string, forceRefresh = false): Promise<boolean> => {
    const mint = tokenMint.trim();
    if (!mint || mint.length < 32) {
      setInputToken(getEmptyInputToken());
      return false;
    }

    // REMOVED CACHE: Always fetch fresh price to avoid stale price bugs
    // The 30-second cache was causing users to see old prices and buy at stale rates
    // Fresh prices are critical for accurate FlipIt execution

    setIsLoadingInputToken(true);
    
    try {
      // Primary: Use token-metadata which returns both metadata AND price
      const { data: metaData, error: metaError } = await supabase.functions.invoke('token-metadata', {
        body: { tokenMint: mint }
      });

      if (metaError) throw metaError;

      if (metaData?.success && metaData?.metadata) {
        const meta = metaData.metadata;
        const priceInfo = metaData.priceInfo;
        
        const creatorWallet = meta.creatorWallet || metaData.launchpadInfo?.creatorWallet || null;
        
        setInputToken({
          mint: mint,
          symbol: meta.symbol || null,
          name: meta.name || null,
          price: priceInfo?.priceUsd ?? null,
          image: meta.image || meta.logoURI || null,
          marketCap: priceInfo?.marketCap ?? null,
          liquidity: priceInfo?.liquidity ?? null,
          holders: null, // Will be populated separately if available
          dexStatus: null, // Not available from token-metadata directly
          twitterUrl: meta.socialLinks?.twitter ?? null,
          websiteUrl: meta.socialLinks?.website ?? null,
          telegramUrl: meta.socialLinks?.telegram ?? null,
          lastFetched: new Date().toISOString(),
          source: 'token-metadata',
          creatorWallet: creatorWallet
        });
        
        // Check blacklist/whitelist for the token and creator
        checkBlacklistStatus(mint, creatorWallet, meta.socialLinks?.twitter);

        // If token-metadata returned a price, we're done
        if (priceInfo?.priceUsd) {
          toast.success(`${meta.symbol || 'Token'}: $${priceInfo.priceUsd.toFixed(10).replace(/\.?0+$/, '')}`);
          return true;
        }

        // Fallback: If no price from token-metadata, try raydium-quote
        try {
          const response = await fetch(
            `https://apxauapuusmgwbbzjgfl.supabase.co/functions/v1/raydium-quote?priceMint=${encodeURIComponent(mint)}`,
            {
              method: 'GET',
              headers: {
                'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFweGF1YXB1dXNtZ3diYnpqZ2ZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ1OTEzMDUsImV4cCI6MjA3MDE2NzMwNX0.w8IrKq4YVStF3TkdEcs5mCSeJsxjkaVq2NFkypYOXHU'
              }
            }
          );
          
          if (response.ok) {
            const priceData = await response.json();
            if (priceData?.priceUSD) {
              setInputToken(prev => ({
                ...prev,
                price: priceData.priceUSD,
                source: 'raydium-quote',
                lastFetched: new Date().toISOString()
              }));
              toast.success(`${meta.symbol || 'Token'}: $${priceData.priceUSD.toFixed(10).replace(/\.?0+$/, '')}`);
              return true;
            }
          }
        } catch (priceErr) {
          console.warn('Raydium price fallback failed:', priceErr);
        }

        // Got metadata but no price
        toast.info(`${meta.symbol || 'Token'} loaded (no price available)`);
        return true;
      }

      // token-metadata failed - try raydium-quote alone as last resort
      const response = await fetch(
        `https://apxauapuusmgwbbzjgfl.supabase.co/functions/v1/raydium-quote?priceMint=${encodeURIComponent(mint)}`,
        {
          method: 'GET',
          headers: {
            'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFweGF1YXB1dXNtZ3diYnpqZ2ZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ1OTEzMDUsImV4cCI6MjA3MDE2NzMwNX0.w8IrKq4YVStF3TkdEcs5mCSeJsxjkaVq2NFkypYOXHU'
          }
        }
      );
      
      if (response.ok) {
        const priceData = await response.json();
        if (priceData?.priceUSD) {
          setInputToken({
            ...getEmptyInputToken(),
            mint: mint,
            price: priceData.priceUSD,
            lastFetched: new Date().toISOString(),
            source: 'raydium-quote'
          });
          toast.success(`Price: $${priceData.priceUSD.toFixed(10).replace(/\.?0+$/, '')}`);
          return true;
        }
      }

      toast.error('Could not fetch token data');
      return false;
    } catch (err: any) {
      console.error('Failed to fetch token data:', err);
      toast.error(err.message || 'Failed to fetch token data');
      return false;
    } finally {
      setIsLoadingInputToken(false);
    }
  }, [inputToken.mint, inputToken.lastFetched]);

  // Store fetchInputTokenData in a ref to avoid useEffect re-triggering
  const fetchInputTokenDataRef = useRef(fetchInputTokenData);
  fetchInputTokenDataRef.current = fetchInputTokenData;

  // Debounced auto-fetch when token address changes - SINGLE FETCH ONLY
  useEffect(() => {
    if (inputFetchTimeoutRef.current) {
      clearTimeout(inputFetchTimeoutRef.current);
    }
    
    const mint = tokenAddress.trim();
    if (!mint || mint.length < 32) {
      setInputToken(getEmptyInputToken());
      setLastExecutionPrices(null); // Clear previous execution prices
      return;
    }

    // Debounce: wait 500ms after user stops typing - FETCH ONCE
    inputFetchTimeoutRef.current = setTimeout(() => {
      fetchInputTokenDataRef.current(mint, false);
    }, 500);

    return () => {
      if (inputFetchTimeoutRef.current) {
        clearTimeout(inputFetchTimeoutRef.current);
      }
    };
  }, [tokenAddress]); // REMOVED fetchInputTokenData from deps to stop refresh loop

  // Trigger holder quality check when token price is loaded
  useEffect(() => {
    if (inputToken.mint && inputToken.price !== null && !isLoadingInputToken) {
      // Token loaded with price, check holder quality
      holderQuality.checkQuality(inputToken.mint);
    } else if (!inputToken.mint) {
      // Token cleared, reset quality
      holderQuality.reset();
    }
  }, [inputToken.mint, inputToken.price, isLoadingInputToken]);
  const handleCheckPrice = () => {
    if (!tokenAddress.trim() || tokenAddress.trim().length < 32) {
      toast.error('Enter a valid token address');
      return;
    }
    fetchInputTokenData(tokenAddress.trim(), true); // Force refresh
  };

  const loadWallets = async () => {
    try {
      console.log('[FlipIt] loadWallets called, isPreviewAdmin:', isPreviewAdmin, 'isAuthenticated:', isAuthenticated);
      
      // Get session for auth header
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      
      // Try direct DB query first if we have an authenticated session (RLS will work)
      if (accessToken) {
        console.log('[FlipIt] Trying direct DB query with auth session');
        const { data: walletsData, error: dbError } = await supabase
          .from('super_admin_wallets')
          .select('id, label, pubkey, wallet_type, is_active')
          .eq('wallet_type', 'flipit')
          .eq('is_active', true)
          .order('created_at', { ascending: false });

        if (!dbError && walletsData && walletsData.length > 0) {
          console.log('[FlipIt] Loaded wallets from DB:', walletsData.length);
          const flipitWallets = walletsData as SuperAdminWallet[];
          setWallets(flipitWallets);
          if (flipitWallets.length > 0 && !selectedWallet) {
            setSelectedWallet(flipitWallets[0].id);
          }
          return;
        }
        
        if (dbError) {
          console.warn('[FlipIt] Direct DB query failed (RLS?), trying edge function:', dbError.message);
        }
      }

      // Fall back to edge function (uses service role, bypasses RLS)
      console.log('[FlipIt] Using edge function to load wallets');
      const { data: response, error } = await supabase.functions.invoke('super-admin-wallet-generator', {
        method: 'GET',
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
      });

      if (error) {
        console.error('[FlipIt] Edge function failed:', error);
        toast.error('Failed to load wallets');
        return;
      }

      const allWallets = (response as any)?.data as SuperAdminWallet[] | undefined;
      const flipitWallets = (allWallets || []).filter((w: any) => w.wallet_type === 'flipit' && w.is_active);
      
      console.log('[FlipIt] Loaded wallets from edge function:', flipitWallets.length);

      setWallets(flipitWallets);
      
      // Restore previously selected wallet from localStorage
      const savedWalletId = localStorage.getItem('flipit-selected-wallet');
      if (savedWalletId && flipitWallets.find(w => w.id === savedWalletId)) {
        setSelectedWallet(savedWalletId);
      } else if (flipitWallets.length > 0 && !selectedWallet) {
        setSelectedWallet(flipitWallets[0].id);
        localStorage.setItem('flipit-selected-wallet', flipitWallets[0].id);
      }
    } catch (err) {
      console.error('[FlipIt] Error loading wallets:', err);
      toast.error('Failed to load wallets');
    }
  };

  const refreshWalletBalance = async () => {
    if (!selectedWallet) return;
    
    const wallet = wallets.find(w => w.id === selectedWallet);
    if (!wallet) return;

    setIsRefreshingBalance(true);
    try {
      // Use edge function to fetch balance via Helius (avoids browser CORS/rate limits)
      const { data, error } = await supabase.functions.invoke('get-wallet-balance', {
        body: { walletAddress: wallet.pubkey }
      });
      
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      
      setWalletBalance(data.balance);
    } catch (err) {
      console.error('Failed to fetch balance:', err);
      toast.error('Failed to fetch wallet balance');
    } finally {
      setIsRefreshingBalance(false);
    }
  };

  const handleGenerateWallet = async () => {
    setIsGeneratingWallet(true);
    try {
      const { data, error } = await supabase.functions.invoke('flipit-wallet-generator');

      if (error) throw error;

      if (data?.error) {
        toast.error(data.error);
      } else {
        toast.success(`Wallet generated: ${data.wallet.pubkey.slice(0, 8)}...`);
        loadWallets();
        setSelectedWallet(data.wallet.id);
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to generate wallet');
    } finally {
      setIsGeneratingWallet(false);
    }
  };

  const handleWithdraw = async () => {
    if (!selectedWallet) {
      toast.error('Select a wallet first');
      return;
    }

    // Parse custom amount if provided
    const customAmount = withdrawAmount.trim() ? parseFloat(withdrawAmount) : null;
    if (customAmount !== null && (isNaN(customAmount) || customAmount <= 0)) {
      toast.error('Please enter a valid SOL amount');
      return;
    }

    // Validate destination address if provided
    const destination = withdrawDestination.trim() || null;
    if (destination && !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(destination)) {
      toast.error('Invalid Solana wallet address');
      return;
    }

    setIsWithdrawing(true);
    try {
      const { data, error } = await supabase.functions.invoke('flipit-wallet-withdrawal', {
        body: { 
          walletId: selectedWallet,
          amount: customAmount, // null means withdraw all
          destinationAddress: destination // null means find funder
        }
      });

      if (error) throw error;

      if (data?.error) {
        toast.error(data.error);
      } else {
        toast.success(`Withdrawn ${data.amountSol.toFixed(4)} SOL to ${data.destination.slice(0, 6)}...! TX: ${data.signature.slice(0, 8)}...`);
        setWithdrawAmount('');
        setWithdrawDestination('');
        refreshWalletBalance();
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to withdraw');
    } finally {
      setIsWithdrawing(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied!`);
  };

  const handleShowPrivateKey = async () => {
    if (!selectedWallet) {
      toast.error('Select a wallet first');
      return;
    }

    setIsDecrypting(true);
    setDecryptedPrivateKey(null);
    setShowPrivateKey(false);

    try {
      // Use the edge function that properly decrypts using AES-256-GCM
      const { data, error } = await supabase.functions.invoke('decrypt-super-admin-wallet', {
        body: { wallet_id: selectedWallet }
      });

      if (error) {
        throw new Error(error.message || 'Decryption failed');
      }

      if (!data?.success || !data?.secret_key) {
        throw new Error(data?.error || 'Could not decrypt wallet secret');
      }

      setDecryptedPrivateKey(data.secret_key);
      setShowKeysModal(true);
    } catch (err: any) {
      console.error('Failed to decrypt private key:', err);
      toast.error(err.message || 'Failed to decrypt private key');
    } finally {
      setIsDecrypting(false);
    }
  };

  const handleCloseKeysModal = () => {
    setShowKeysModal(false);
    setDecryptedPrivateKey(null);
    setShowPrivateKey(false);
  };

  // Cache for fetched token metadata - prevents repeated API calls
  const fetchedMetadataRef = useRef<Set<string>>(new Set());
  const lastMetadataFetchRef = useRef<number>(0);

  type LoadPositionsOptions = {
    silent?: boolean;
  };

  const loadPositions = async (options?: LoadPositionsOptions): Promise<FlipPosition[] | null> => {
    const silent = options?.silent ?? false;

    // Snapshot: do we already have positions rendered?
    // If yes, avoid noisy toasts on transient reload failures.
    const hadExistingData = positionsRef.current.length > 0;

    // Guard: only load if authenticated
    if (!isAuthenticated && !isPreviewAdmin) {
      console.log('[FlipIt] loadPositions skipped - not authenticated');
      return null;
    }

    // Prevent concurrent loads
    if (isLoadingPositionsRef.current) {
      console.log('[FlipIt] loadPositions skipped - already loading');
      return null;
    }

    isLoadingPositionsRef.current = true;
    console.log('[FlipIt] loadPositions called', silent ? '(silent)' : '');

    // Only toggle loading UI for non-silent calls (prevents flicker on background reloads)
    if (!silent) {
      setIsLoading(true);
    }

    const maybeToastLoadError = (errorMsg?: string) => {
      // If we already have positions on screen, treat the reload failure as non-fatal.
      if (hadExistingData) return;
      
      // Don't show toast for auth-related errors (user not logged in yet)
      if (errorMsg?.includes('JWT') || errorMsg?.includes('auth') || errorMsg?.includes('policy')) {
        console.log('[FlipIt] Suppressing auth-related error toast:', errorMsg);
        return;
      }

      const now = Date.now();
      // Increase debounce to 30 seconds to reduce toast spam
      if (now - lastErrorToastRef.current > 30000) {
        toast.error('Failed to load positions');
        lastErrorToastRef.current = now;
      }
    };

    try {
      const { data, error } = await supabase
        .from('flip_positions')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[FlipIt] Failed to load positions from database:', error);
        if (!silent) {
          maybeToastLoadError(error.message);
          setIsLoading(false);
        }
        isLoadingPositionsRef.current = false;
        return null;
      }

      console.log('[FlipIt] Loaded positions:', data?.length || 0);
      const loadedPositions = (data || []) as unknown as FlipPosition[];

      // Set positions immediately so UI can render
      setPositions(loadedPositions);
      // Keep ref in sync for callbacks that run before React re-renders
      positionsRef.current = loadedPositions;

      if (!silent) {
        setIsLoading(false);
      }

      // Only fetch metadata for HOLDING positions missing symbols (not all 100+ historical positions)
      const now = Date.now();
      const timeSinceLastFetch = now - lastMetadataFetchRef.current;
      const holdingMissingSymbols = loadedPositions.filter((p) => p.status === 'holding' && !p.token_symbol);
      const newMints = holdingMissingSymbols
        .map((p) => p.token_mint)
        .filter((mint) => !fetchedMetadataRef.current.has(mint));

      // Only fetch if: we have NEW mints we haven't seen, OR it's been 60+ seconds
      if (newMints.length > 0 || (holdingMissingSymbols.length > 0 && timeSinceLastFetch > 60000)) {
        const mintsToFetch =
          newMints.length > 0 ? newMints : [...new Set(holdingMissingSymbols.map((p) => p.token_mint))];
        console.log('[FlipIt] Fetching metadata for', mintsToFetch.length, 'tokens');
        lastMetadataFetchRef.current = now;

        // Mark as fetched immediately to prevent duplicate requests
        mintsToFetch.forEach((mint) => fetchedMetadataRef.current.add(mint));

        fetchTokenSymbols(mintsToFetch)
          .then((symbolsMap) => {
            setPositions((prev) =>
              prev.map((p) => {
                if (!p.token_symbol && symbolsMap[p.token_mint]) {
                  return {
                    ...p,
                    token_symbol: symbolsMap[p.token_mint].symbol,
                    token_name: symbolsMap[p.token_mint].name,
                  };
                }
                return p;
              })
            );

            // Update the database with missing symbols (fire and forget)
            for (const mint of Object.keys(symbolsMap)) {
              supabase
                .from('flip_positions')
                .update({ token_symbol: symbolsMap[mint].symbol, token_name: symbolsMap[mint].name })
                .eq('token_mint', mint)
                .then(() => {});
            }
          })
          .catch((err) => {
            console.warn('[FlipIt] Token metadata fetch failed (non-critical):', err);
          });
      }

      // Fetch current prices for holding positions to display Current Value column
      const holdingPositions = loadedPositions.filter(p => p.status === 'holding');
      if (holdingPositions.length > 0) {
        const mints = [...new Set(holdingPositions.map(p => p.token_mint))];
        console.log('[FlipIt] Fetching current prices for', mints.length, 'holding positions');
        fetchCurrentPrices(mints);
      }

      return loadedPositions;
    } catch (err: any) {
      console.error('[FlipIt] Failed to load positions:', err);
      if (!silent) {
        maybeToastLoadError(err?.message || String(err));
        setIsLoading(false);
      }
      return null;
    } finally {
      isLoadingPositionsRef.current = false;
    }
  };

  const loadLimitOrders = async () => {
    const { data, error } = await supabase
      .from('flip_limit_orders')
      .select('*')
      .in('status', ['watching', 'executed'])
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('Failed to load limit orders:', error);
      return;
    }

    setLimitOrders((data || []) as LimitOrder[]);
  };

  // Check DEX paid status for positions
  const checkDexPaidStatus = async (tokenMints: string[]) => {
    if (tokenMints.length === 0) return;
    
    try {
      const { data, error } = await supabase.functions.invoke('dex-paid-checker', {
        body: { tokenMints, updateDb: true }
      });
      
      if (error) throw error;
      
      if (data?.results) {
        // Update local positions with DEX status
        setPositions(prev => prev.map(p => {
          const status = data.results.find((r: DexPaidStatus) => r.tokenMint === p.token_mint);
          if (status) {
            return { ...p, dex_paid_status: status };
          }
          return p;
        }));
      }
    } catch (err) {
      console.error('Failed to check DEX paid status:', err);
    }
  };

  // Check DEX status when positions load
  useEffect(() => {
    const holdingPositions = positions.filter(p => p.status === 'holding' && !p.dex_paid_status);
    if (holdingPositions.length > 0) {
      const mints = holdingPositions.map(p => p.token_mint);
      checkDexPaidStatus(mints);
    }
  }, [positions.length]); // Only run when positions count changes
  
  const fetchTokenSymbols = async (mints: string[]): Promise<Record<string, { symbol: string; name: string }>> => {
    const result: Record<string, { symbol: string; name: string }> = {};
    const images: Record<string, string> = {};
    
    try {
      // Use the token-metadata edge function
      const { data, error } = await supabase.functions.invoke('token-metadata', {
        body: { tokenMints: mints }
      });
      
      if (error) throw error;
      
      if (data?.tokens) {
        for (const token of data.tokens) {
          if (token.mint && token.symbol) {
            result[token.mint] = { symbol: token.symbol, name: token.name || token.symbol };
          }
          // Also capture the image if available
          if (token.mint && (token.image || token.logoURI)) {
            images[token.mint] = token.image || token.logoURI;
          }
        }
      }
      
      // Update token images state
      if (Object.keys(images).length > 0) {
        setTokenImages(prev => ({ ...prev, ...images }));
      }
    } catch (err) {
      console.error('Failed to fetch token symbols:', err);
    }
    
    return result;
  };
  
  const fetchCurrentPrices = async (tokenMints: string[]) => {
    if (tokenMints.length === 0) return;
    
    console.log('[FlipIt] fetchCurrentPrices called for', tokenMints.length, 'tokens');
    
    try {
      const { data, error } = await supabase.functions.invoke('flipit-price-monitor', {
        body: { 
          action: 'check',
          slippageBps: slippageBps,
          priorityFeeMode: priorityFeeMode
        }
      });

      if (error) {
        console.error('[FlipIt] fetchCurrentPrices error:', error);
        throw error;
      }

      console.log('[FlipIt] fetchCurrentPrices response:', {
        pricesCount: Object.keys(data?.prices || {}).length,
        bondingCurveCount: Object.keys(data?.bondingCurveData || {}).length,
        bondingCurveData: data?.bondingCurveData
      });

      if (data?.prices) {
        setCurrentPrices(data.prices);
      }
      if (data?.bondingCurveData) {
        setBondingCurveData(prev => ({ ...prev, ...data.bondingCurveData }));
      }
      if (data?.checkedAt) {
        setLastAutoCheck(data.checkedAt);
      }
    } catch (err) {
      console.error('[FlipIt] Failed to fetch prices:', err);
    }
  };

  // Handle emergency sell toggle/save
  const handleEmergencySellUpdate = async (positionId: string, enabled: boolean, priceUsd: number | null) => {
    try {
      const updateData: any = {
        emergency_sell_enabled: enabled,
        emergency_sell_price_usd: priceUsd,
        emergency_sell_status: enabled && priceUsd ? 'watching' : 'pending',
      };

      const { error } = await supabase
        .from('flip_positions')
        .update(updateData)
        .eq('id', positionId);

      if (error) throw error;

      toast.success(enabled ? `Stop-loss set at $${priceUsd?.toFixed(10).replace(/\.?0+$/, '')}` : 'Stop-loss disabled');
      loadPositions({ silent: true });
      
      // Clear editing state
      setEmergencyEditing(prev => {
        const newState = { ...prev };
        delete newState[positionId];
        return newState;
      });
    } catch (err: any) {
      toast.error(err.message || 'Failed to update stop-loss');
    }
  };

  // Handle moonbag toggle/save
  const handleMoonbagUpdate = async (positionId: string, enabled: boolean, percent: number | null) => {
    try {
      const updateData: any = {
        moon_bag_enabled: enabled,
        moon_bag_percent: percent,
        moon_bag_dump_threshold_pct: enabled ? 30 : null, // Default 30% drawdown from peak triggers moonbag sell
      };

      const { error } = await supabase
        .from('flip_positions')
        .update(updateData)
        .eq('id', positionId);

      if (error) throw error;

      toast.success(enabled ? `Moonbag set to ${percent}% of position` : 'Moonbag disabled');
      loadPositions({ silent: true });
      
      // Clear editing state
      setMoonbagEditing(prev => {
        const newState = { ...prev };
        delete newState[positionId];
        return newState;
      });
    } catch (err: any) {
      toast.error(err.message || 'Failed to update moonbag');
    }
  };

  // Delete a flip position from the database
  const handleDeletePosition = async (positionId: string, tokenSymbol: string | null) => {
    try {
      const { error } = await supabase
        .from('flip_positions')
        .delete()
        .eq('id', positionId);

      if (error) throw error;

      toast.success(`Deleted ${tokenSymbol || 'position'}`);
      loadPositions({ silent: true });
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete position');
    }
  };

  const handleFlip = async () => {
    if (!tokenAddress.trim()) {
      toast.error('Enter a token address');
      return;
    }

    if (!selectedWallet) {
      toast.error('Select a source wallet');
      return;
    }

    const parsedAmount = parseFloat(buyAmount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      toast.error('Enter a valid buy amount');
      return;
    }

    setIsFetchingPreflight(true);

    const tokenSymbol = inputToken.symbol;
    const displayedPrice = inputToken.price;

    // SOL amount for preflight - direct passthrough, no conversion needed
    const solAmountForPreflight = parsedAmount;

    try {
      // Call flipit-preflight to get venue-aware executable quote
      toast.info('Checking executable price...', { duration: 2000 });

      const preflightRes = await supabase.functions.invoke('flipit-preflight', {
        body: {
          tokenMint: tokenAddress.trim(),
          solAmount: solAmountForPreflight,
          walletPubkey: wallets.find(w => w.id === selectedWallet)?.pubkey,
          slippageBps: slippageBps
        }
      });

      const preflightData = preflightRes.data;

      if (preflightRes.error || !preflightData?.success) {
        // Preflight failed - fail-closed, don't proceed
        const errMsg = preflightData?.error || preflightRes.error?.message || 'Failed to get executable quote';
        toast.error(`Price check failed: ${errMsg}`);
        setIsFetchingPreflight(false);
        return;
      }

      const executablePrice = preflightData.executablePriceUsd;

      // Calculate deviation from displayed price
      let deviationPct = 0;
      if (displayedPrice && displayedPrice > 0 && executablePrice) {
        deviationPct = ((executablePrice - displayedPrice) / displayedPrice) * 100;
      }

      const DEVIATION_THRESHOLD = 15; // 15% threshold for confirmation

      // If deviation > threshold, show confirmation dialog
      if (Math.abs(deviationPct) > DEVIATION_THRESHOLD && displayedPrice) {
        setIsFetchingPreflight(false);
        setPriceConfirmation({
          show: true,
          displayedPrice,
          executablePrice,
          deviationPct,
          venue: preflightData.venue || 'unknown',
          confidence: preflightData.confidence || 'unknown',
          source: preflightData.source || 'unknown',
          onConfirm: () => executeFlip(executablePrice || displayedPrice, tokenSymbol)
        });
        return;
      }

      // Deviation acceptable - proceed with flip
      setIsFetchingPreflight(false);
      await executeFlip(executablePrice || displayedPrice, tokenSymbol);

    } catch (err: any) {
      console.error('Preflight error:', err);
      toast.error('Failed to check price: ' + (err.message || 'Unknown error'));
      setIsFetchingPreflight(false);
    }
  };
  
  // Execute the actual flip (separated for confirmation dialog flow)
  const executeFlip = async (requestedPrice: number | null, tokenSymbol: string | null) => {
    setIsFlipping(true);
    
    const parsedAmount = parseFloat(buyAmount);
    
    // SOL-only mode: direct passthrough, no USD conversion ever needed
    const amountInSol = parsedAmount;
    
    try {
      // ALWAYS send SOL amount - backend no longer handles USD conversion
      const { data, error } = await supabase.functions.invoke('flipit-execute', {
        body: {
          action: 'buy',
          tokenMint: tokenAddress.trim(),
          walletId: selectedWallet,
          // CRITICAL: Always send SOL amount, never USD
          buyAmountSol: amountInSol,
          // CRITICAL: pass the preflight-verified price for Trade Guard validation
          displayPriceUsd: requestedPrice,
          targetMultiplier: targetMultiplier,
          slippageBps: slippageBps,
          priorityFeeMode: priorityFeeMode
        }
      });

      if (error) throw error;

      if (data?.error) {
        toast.error(data.error);
      } else {
        // Show actual entry price used by the backend (this is the "received" price)
        const receivedPrice = data?.entryPrice;
        const signature = data?.signature;
        
        // Store both prices for UI display
        setLastExecutionPrices({
          requested: requestedPrice,
          received: receivedPrice,
          tokenSymbol: tokenSymbol,
          timestamp: new Date().toISOString()
        });
        
        // Calculate price difference
        let priceDiffText = '';
        if (requestedPrice && receivedPrice) {
          const priceDiff = ((receivedPrice - requestedPrice) / requestedPrice) * 100;
          const diffSign = priceDiff >= 0 ? '+' : '';
          priceDiffText = ` (${diffSign}${priceDiff.toFixed(2)}% vs requested)`;
        }
        
        // Format prices for display (remove trailing zeros)
        const formattedRequested = requestedPrice 
          ? `$${requestedPrice.toFixed(10).replace(/\.?0+$/, '')}`
          : 'N/A';
        const formattedReceived = receivedPrice 
          ? `$${receivedPrice.toFixed(10).replace(/\.?0+$/, '')}`
          : 'N/A';
        
        toast.success(
          `Flip executed! Requested: ${formattedRequested} → Received: ${formattedReceived}${priceDiffText}`,
          { duration: 8000 }
        );
        
        if (signature) {
          toast.info(`TX: ${signature.slice(0, 12)}...`, { duration: 5000 });
        }
        
        setTokenAddress('');
        // Clear input token state
        setInputToken(getEmptyInputToken());
        loadPositions({ silent: true });
        refreshWalletBalance(); // Auto-refresh wallet balance after buy
      }
    } catch (err: any) {
      let msg = err?.message || 'Failed to execute flip';

      // Supabase functions can throw FunctionsHttpError for non-2xx; extract the JSON body.
      try {
        const ctx = err?.context;
        if (ctx && typeof ctx.json === 'function') {
          const payload = await ctx.json();
          if (payload?.error) msg = String(payload.error);
        }
      } catch {
        // ignore
      }

      toast.error(msg);
    } finally {
      setIsFlipping(false);
    }
  };

  const handleSubmitLimitOrder = async () => {
    if (!tokenAddress.trim()) {
      toast.error('Enter a token address');
      return;
    }
    if (!selectedWallet) {
      toast.error('Select a source wallet');
      return;
    }
    const parsedAmount = parseFloat(buyAmount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      toast.error('Enter a valid buy amount');
      return;
    }
    const minPrice = parseFloat(limitPriceMin);
    const maxPrice = parseFloat(limitPriceMax);
    if (isNaN(minPrice) || isNaN(maxPrice) || minPrice <= 0 || maxPrice <= 0) {
      toast.error('Enter valid price range');
      return;
    }
    if (minPrice > maxPrice) {
      toast.error('Min price must be less than max price');
      return;
    }

    const expiryHours = parseInt(limitExpiry) || 168;
    const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000).toISOString();
    const amountSol = parsedAmount; // SOL-only mode, no conversion

    setIsSubmittingLimitOrder(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { error } = await supabase.from('flip_limit_orders').insert({
        user_id: user?.id,
        wallet_id: selectedWallet,
        token_mint: tokenAddress.trim(),
        token_symbol: inputToken.symbol,
        token_name: inputToken.name,
        buy_price_min_usd: minPrice,
        buy_price_max_usd: maxPrice,
        buy_amount_sol: amountSol,
        target_multiplier: targetMultiplier,
        slippage_bps: slippageBps,
        priority_fee_mode: priorityFeeMode,
        status: 'watching',
        expires_at: expiresAt,
        notification_email: notificationEmail || null,
      });

      if (error) throw error;

      toast.success(`Limit order queued! Will buy when price is $${minPrice} - $${maxPrice}`);
      setTokenAddress('');
      setLimitPriceMin('');
      setLimitPriceMax('');
      setInputToken(getEmptyInputToken());
      loadLimitOrders();
    } catch (err: any) {
      toast.error(err.message || 'Failed to create limit order');
    } finally {
      setIsSubmittingLimitOrder(false);
    }
  };

  const handleCancelLimitOrder = async (orderId: string) => {
    try {
      const { error } = await supabase
        .from('flip_limit_orders')
        .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
        .eq('id', orderId);

      if (error) throw error;
      toast.success('Limit order cancelled');
      loadLimitOrders();
    } catch (err: any) {
      toast.error(err.message || 'Failed to cancel order');
    }
  };

  const handleBuyNowLimitOrder = async (order: LimitOrder) => {
    setIsExecutingLimitOrder(order.id);
    try {
      // Execute with 20% slippage for fast dips
      const { data, error } = await supabase.functions.invoke('flipit-execute', {
        body: {
          tokenMint: order.token_mint,
          buyAmountSol: order.buy_amount_sol,
          targetMultiplier: order.target_multiplier,
          slippageBps: 2000, // 20% slippage for fast dips
          priorityFeeMode: 'turbo',
          walletId: selectedWallet,
        }
      });

      if (error) throw error;

      if (data?.success) {
        // Cancel the limit order since we executed it manually
        await supabase
          .from('flip_limit_orders')
          .update({ status: 'executed', executed_at: new Date().toISOString() })
          .eq('id', order.id);

        toast.success(`🚀 BUY NOW executed for ${order.token_symbol || 'token'}!`);
        loadLimitOrders();
        loadPositions({ silent: true });
        refreshWalletBalance(); // Auto-refresh wallet balance after buy
      } else {
        throw new Error(data?.error || 'Failed to execute buy');
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to execute buy now');
    } finally {
      setIsExecutingLimitOrder(null);
    }
  };

  const handleRefreshPrices = async () => {
    setIsMonitoring(true);
    try {
      // Reload positions without flickering the table UI
      const freshPositions = await loadPositions({ silent: true });
      const sourcePositions = freshPositions ?? positionsRef.current;

      const holdingPositions = sourcePositions.filter((p) => p.status === 'holding');
      if (holdingPositions.length === 0) {
        toast.info('Positions reloaded - no active positions to price check');
        return;
      }

      // Use unified monitor with refreshDexStatus to also update socials and DEX status
      const { data, error } = await supabase.functions.invoke('flipit-unified-monitor', {
        body: {
          slippageBps: slippageBps,
          priorityFeeMode: priorityFeeMode,
          refreshDexStatus: true, // Refresh DEX status and socials on manual refresh
        },
      });

      if (error) throw error;

      if (data?.prices) {
        setCurrentPrices(data.prices);
      }
      if (data?.marketData) {
        setMarketData((prev) => ({ ...prev, ...data.marketData }));
      }
      if (data?.bondingCurveData) {
        setBondingCurveData((prev) => ({ ...prev, ...data.bondingCurveData }));
      }
      if (data?.checkedAt) {
        setLastAutoCheck(data.checkedAt);
      }
      
      // Reload positions to get updated DEX status from database
      if (data?.dexStatusRefresh?.updated?.length > 0) {
        await loadPositions({ silent: true });
        toast.success(`Refreshed prices & DEX status for ${data.dexStatusRefresh.updated.length} token(s)`);
      } else if (data?.priceMonitor?.executed?.length > 0) {
        toast.success(`Sold ${data.priceMonitor.executed.length} position(s) at target!`);
        await loadPositions({ silent: true });
      } else {
        toast.success('Refreshed');
      }
      refreshWalletBalance();
    } catch (err: any) {
      toast.error(err.message || 'Failed to refresh');
    } finally {
      setIsMonitoring(false);
    }
  };

  // Sync with Chain - reconcile positions with actual on-chain balances
  const handleSyncWithChain = async (dryRun = false) => {
    setIsSyncingWithChain(true);
    try {
      const { data, error } = await supabase.functions.invoke('flipit-cleanup-phantom-positions', {
        body: { dryRun }
      });

      if (error) throw error;

      setLastSyncResult({
        phantomCount: data?.phantomCount || 0,
        cleanedCount: data?.cleanedCount || 0,
        validCount: data?.validCount || 0,
        timestamp: new Date().toISOString()
      });

      if (dryRun) {
        if (data?.phantomCount > 0) {
          toast.info(
            `Found ${data.phantomCount} phantom position(s) with no on-chain tokens. Click "Sync & Clean" to mark them as sold.`,
            { duration: 8000 }
          );
        } else {
          toast.success('All positions are in sync with on-chain data!');
        }
      } else {
        if (data?.cleanedCount > 0) {
          toast.success(`Cleaned ${data.cleanedCount} phantom position(s). Reloading...`);
          await loadPositions({ silent: false });
        } else if (data?.phantomCount > 0) {
          toast.info(`Found ${data.phantomCount} phantom positions but none were cleaned (check logs)`);
        } else {
          toast.success('All positions in sync - nothing to clean');
        }
      }
    } catch (err: any) {
      console.error('[SyncWithChain] Error:', err);
      toast.error(err.message || 'Failed to sync with chain');
    } finally {
      setIsSyncingWithChain(false);
    }
  };

  // Per-position sell fee state - stores custom priority fee for each position
  const [positionSellFees, setPositionSellFees] = useState<Record<string, string>>({});

  const handleForceSell = async (positionId: string, customPriorityFee?: number) => {
    try {
      const { data, error } = await supabase.functions.invoke('flipit-execute', {
        body: {
          action: 'sell',
          positionId: positionId,
          slippageBps: slippageBps,
          priorityFeeMode: priorityFeeMode,
          customPriorityFee: customPriorityFee // Override with specific SOL amount if provided
        }
      });

      if (error) throw error;

      if (data?.error) {
        toast.error(data.error);
      } else {
        toast.success('Sold!');
        loadPositions({ silent: true });
        refreshWalletBalance(); // Auto-refresh wallet balance after sell
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to sell');
    }
  };

  // Detect if Twitter URL is an X Community vs regular account
  const detectTwitterType = (url: string): 'account' | 'community' | null => {
    if (!url) return null;
    if (url.includes('/i/communities/') || url.includes('/communities/')) {
      return 'community';
    }
    if (url.includes('x.com/') || url.includes('twitter.com/')) {
      return 'account';
    }
    return null;
  };
  
  // Extract X Community ID from URL
  const extractCommunityId = (url: string): string | null => {
    const match = url.match(/\/(?:i\/)?communities\/(\d+)/);
    return match ? match[1] : null;
  };

  // Handle cycling through trust rating: unknown → concern → danger → good → unknown
  const handleCycleTrustRating = async (position: FlipPosition) => {
    const cycle: Array<'unknown' | 'concern' | 'danger' | 'good'> = ['unknown', 'concern', 'danger', 'good'];
    const currentRating = position.dev_trust_rating || 'unknown';
    const currentIndex = cycle.indexOf(currentRating as any);
    const nextRating = cycle[(currentIndex + 1) % cycle.length];
    
    try {
      // Collect all identifiers for the lists
      const tokenMint = position.token_mint;
      const twitterHandle = position.twitter_url ? extractTwitterHandle(position.twitter_url) : null;
      const websiteUrl = position.website_url;
      const telegramUrl = position.telegram_url;
      
      // Detect if Twitter is a community
      const twitterType = position.twitter_url ? detectTwitterType(position.twitter_url) : null;
      const communityId = twitterType === 'community' && position.twitter_url 
        ? extractCommunityId(position.twitter_url) 
        : null;
      
      // Helper to extract twitter handle from URL
      function extractTwitterHandle(url: string): string | null {
        // Skip community URLs
        if (url.includes('/communities/')) return null;
        const match = url.match(/(?:twitter\.com|x\.com)\/([^/?]+)/i);
        return match ? match[1].toLowerCase() : null;
      }
      
      // Get or fetch creator wallet
      let creatorWallet = position.creator_wallet;
      let launchpadInfo: { platform?: string; creatorProfile?: string; creatorId?: string } = {};
      
      if (!creatorWallet) {
        // Fetch creator wallet from solscan-creator-lookup
        try {
          const { data: creatorData } = await supabase.functions.invoke('solscan-creator-lookup', {
            body: { tokenMint }
          });
          if (creatorData?.creatorWallet) {
            creatorWallet = creatorData.creatorWallet;
            console.log('Fetched creator wallet:', creatorWallet);
          }
          if (creatorData?.launchpad) {
            launchpadInfo.platform = creatorData.launchpad;
          }
          if (creatorData?.creatorProfile) {
            launchpadInfo.creatorProfile = creatorData.creatorProfile;
          }
        } catch (err) {
          console.warn('Failed to fetch creator wallet:', err);
        }
      }
      
      // Update position with new rating AND creator wallet
      const updateData: any = { dev_trust_rating: nextRating };
      if (creatorWallet && !position.creator_wallet) {
        updateData.creator_wallet = creatorWallet;
      }
      
      const { error: updateError } = await supabase
        .from('flip_positions')
        .update(updateData)
        .eq('id', position.id);
      
      if (updateError) throw updateError;
      
      // If Twitter is a community, trigger X Community enricher
      if (twitterType === 'community' && position.twitter_url) {
        console.log('Detected X Community, triggering enricher:', position.twitter_url);
        supabase.functions.invoke('x-community-enricher', {
          body: { 
            communityUrl: position.twitter_url,
            linkedTokenMint: tokenMint,
            linkedCreatorWallet: creatorWallet
          }
        }).then(({ data, error }) => {
          if (error) {
            console.warn('X Community enricher failed:', error);
          } else {
            console.log('X Community enricher result:', data);
            if (data?.admins?.length > 0 || data?.moderators?.length > 0) {
              toast.info(`Found ${data.admins?.length || 0} admins and ${data.moderators?.length || 0} mods in community`);
            }
          }
        });
      }
      
      // Upsert launchpad creator profile
      if (creatorWallet && launchpadInfo.platform) {
        const creatorProfileData: any = {
          platform: launchpadInfo.platform,
          creator_wallet: creatorWallet,
          is_blacklisted: nextRating === 'danger' || nextRating === 'concern',
          is_whitelisted: nextRating === 'good',
          risk_notes: `Rated ${nextRating.toUpperCase()} via FlipIt for token ${position.token_symbol || tokenMint.slice(0, 8)}`
        };
        
        if (launchpadInfo.creatorProfile) {
          creatorProfileData.platform_username = launchpadInfo.creatorProfile;
        }
        if (twitterHandle && twitterType === 'account') {
          creatorProfileData.linked_x_account = twitterHandle;
        }
        
        // Check if exists
        const { data: existingCreator } = await supabase
          .from('launchpad_creator_profiles')
          .select('id, tokens_created, linked_token_mints')
          .eq('platform', launchpadInfo.platform)
          .eq('creator_wallet', creatorWallet)
          .maybeSingle();
        
        if (existingCreator) {
          // Update existing
          const linkedMints = (existingCreator.linked_token_mints as string[]) || [];
          if (!linkedMints.includes(tokenMint)) {
            linkedMints.push(tokenMint);
          }
          await supabase
            .from('launchpad_creator_profiles')
            .update({
              ...creatorProfileData,
              tokens_created: (existingCreator.tokens_created || 0) + (linkedMints.length > (existingCreator.linked_token_mints as string[])?.length ? 1 : 0),
              linked_token_mints: linkedMints,
              tokens_rugged: nextRating === 'danger' ? 1 : 0
            })
            .eq('id', existingCreator.id);
        } else {
          // Insert new
          await supabase
            .from('launchpad_creator_profiles')
            .insert({
              ...creatorProfileData,
              tokens_created: 1,
              linked_token_mints: [tokenMint],
              tokens_rugged: nextRating === 'danger' ? 1 : 0,
              tokens_graduated: 0
            });
        }
        console.log('Upserted launchpad creator profile:', launchpadInfo.platform, creatorWallet);
      }
      
      // Remove from all lists first for clean slate
      if (currentRating !== 'unknown') {
        // Remove from blacklist
        await supabase.from('pumpfun_blacklist').delete().eq('identifier', tokenMint);
        if (twitterHandle) await supabase.from('pumpfun_blacklist').delete().eq('identifier', twitterHandle);
        if (creatorWallet) await supabase.from('pumpfun_blacklist').delete().eq('identifier', creatorWallet);
        
        // Remove from whitelist
        await supabase.from('pumpfun_whitelist').delete().eq('identifier', tokenMint);
        if (twitterHandle) await supabase.from('pumpfun_whitelist').delete().eq('identifier', twitterHandle);
        if (creatorWallet) await supabase.from('pumpfun_whitelist').delete().eq('identifier', creatorWallet);
        
        // Remove from neutrallist
        await supabase.from('pumpfun_neutrallist').delete().eq('identifier', tokenMint);
        if (twitterHandle) await supabase.from('pumpfun_neutrallist').delete().eq('identifier', twitterHandle);
        if (creatorWallet) await supabase.from('pumpfun_neutrallist').delete().eq('identifier', creatorWallet);
      }
      
      // Add to appropriate list based on new rating
      if (nextRating === 'concern' || nextRating === 'danger') {
        // Add to Blacklist
        const riskLevel = nextRating === 'danger' ? 'high' : 'medium';
        
        await supabase.from('pumpfun_blacklist').upsert({
          entry_type: 'token_mint',
          identifier: tokenMint,
          risk_level: riskLevel,
          blacklist_reason: `Rated ${nextRating.toUpperCase()} via FlipIt`,
          source: 'flipit_rating',
          tags: ['manually_rated', nextRating],
          linked_twitter: twitterHandle ? [twitterHandle] : [],
          linked_websites: websiteUrl ? [websiteUrl] : [],
          linked_telegram: telegramUrl ? [telegramUrl] : [],
          linked_dev_wallets: creatorWallet ? [creatorWallet] : [],
          linked_x_communities: communityId ? [communityId] : []
        }, { onConflict: 'entry_type,identifier' });
        
        if (twitterHandle) {
          await supabase.from('pumpfun_blacklist').upsert({
            entry_type: 'twitter_account',
            identifier: twitterHandle,
            risk_level: riskLevel,
            blacklist_reason: `Rated ${nextRating.toUpperCase()} via FlipIt`,
            source: 'flipit_rating',
            tags: ['manually_rated', nextRating],
            linked_token_mints: [tokenMint],
            linked_dev_wallets: creatorWallet ? [creatorWallet] : []
          }, { onConflict: 'entry_type,identifier' });
        }
        
        // Add creator wallet to blacklist (CRITICAL for future cross-referencing)
        if (creatorWallet) {
          await supabase.from('pumpfun_blacklist').upsert({
            entry_type: 'dev_wallet',
            identifier: creatorWallet,
            risk_level: riskLevel,
            blacklist_reason: `Developer rated ${nextRating.toUpperCase()} via FlipIt for token ${position.token_symbol || tokenMint.slice(0, 8)}`,
            source: 'flipit_rating',
            tags: ['manually_rated', nextRating, 'dev_wallet'],
            linked_token_mints: [tokenMint],
            linked_twitter: twitterHandle ? [twitterHandle] : [],
            linked_x_communities: communityId ? [communityId] : []
          }, { onConflict: 'entry_type,identifier' });
          
        // Trigger team detection via blacklist-enricher with correct params
          supabase.functions.invoke('blacklist-enricher', {
            body: {
              detect_team: true,
              identifiers: {
                dev_wallets: creatorWallet ? [creatorWallet] : [],
                twitter_accounts: twitterHandle ? [twitterHandle] : [],
                token_mints: [tokenMint],
                x_community_ids: communityId ? [communityId] : []
              },
              risk_level: riskLevel,
              linked_token_mint: tokenMint
            }
          }).catch(err => console.warn('Team detection failed:', err));
        }
      } else if (nextRating === 'good') {
        // Add to Whitelist
        await supabase.from('pumpfun_whitelist').upsert({
          entry_type: 'token_mint',
          identifier: tokenMint,
          trust_level: 'high',
          whitelist_reason: 'Rated GOOD via FlipIt',
          source: 'flipit_rating',
          tags: ['manually_rated', 'trusted'],
          linked_twitter: twitterHandle ? [twitterHandle] : [],
          linked_websites: websiteUrl ? [websiteUrl] : [],
          linked_telegram: telegramUrl ? [telegramUrl] : [],
          linked_dev_wallets: creatorWallet ? [creatorWallet] : [],
          linked_x_communities: communityId ? [communityId] : []
        }, { onConflict: 'entry_type,identifier' });
        
        if (twitterHandle) {
          await supabase.from('pumpfun_whitelist').upsert({
            entry_type: 'twitter_account',
            identifier: twitterHandle,
            trust_level: 'high',
            whitelist_reason: 'Rated GOOD via FlipIt',
            source: 'flipit_rating',
            tags: ['manually_rated', 'trusted'],
            linked_token_mints: [tokenMint],
            linked_dev_wallets: creatorWallet ? [creatorWallet] : []
          }, { onConflict: 'entry_type,identifier' });
        }
        
        // Add creator wallet to whitelist (for trusted devs)
        if (creatorWallet) {
          await supabase.from('pumpfun_whitelist').upsert({
            entry_type: 'dev_wallet',
            identifier: creatorWallet,
            trust_level: 'high',
            whitelist_reason: `Trusted developer - rated GOOD for token ${position.token_symbol || tokenMint.slice(0, 8)}`,
            source: 'flipit_rating',
            tags: ['manually_rated', 'trusted', 'dev_wallet'],
            linked_token_mints: [tokenMint],
            linked_twitter: twitterHandle ? [twitterHandle] : [],
            linked_x_communities: communityId ? [communityId] : []
          }, { onConflict: 'entry_type,identifier' });
        }
      } else if (nextRating === 'unknown') {
        // Add to Neutrallist
        await supabase.from('pumpfun_neutrallist').upsert({
          entry_type: 'token_mint',
          identifier: tokenMint,
          neutrallist_reason: 'Marked UNKNOWN via FlipIt - needs review',
          source: 'flipit_rating',
          tags: ['pending_review'],
          linked_twitter: twitterHandle ? [twitterHandle] : [],
          linked_websites: websiteUrl ? [websiteUrl] : [],
          linked_telegram: telegramUrl ? [telegramUrl] : [],
          linked_dev_wallets: creatorWallet ? [creatorWallet] : []
        }, { onConflict: 'entry_type,identifier' });
      }
      
      // Update local state
      setPositions(prev => prev.map(p => 
        p.id === position.id ? { ...p, dev_trust_rating: nextRating, creator_wallet: creatorWallet || p.creator_wallet } : p
      ));
      
      const ratingEmoji = nextRating === 'good' ? '✅' : nextRating === 'danger' ? '🚨' : nextRating === 'concern' ? '⚠️' : '❓';
      const creatorInfo = creatorWallet ? ` (Dev: ${creatorWallet.slice(0, 6)}...)` : '';
      const communityInfo = communityId ? ' | X Community detected' : '';
      toast.success(`${ratingEmoji} Marked as ${nextRating.toUpperCase()}${creatorInfo}${communityInfo}`);
      
    } catch (err: any) {
      console.error('Failed to update trust rating:', err);
      toast.error(err.message || 'Failed to update rating');
    }
  };

  // Handle toggling the tracking lock - when locked, captures all data to tracking systems
  const handleToggleTrackingLock = async (position: FlipPosition) => {
    const newLockedState = !position.tracking_locked;
    
    try {
      // Update the lock state in DB
      await supabase
        .from('flip_positions')
        .update({ tracking_locked: newLockedState })
        .eq('id', position.id);
      
      // Update local state immediately
      setPositions(prev => prev.map(p => 
        p.id === position.id ? { ...p, tracking_locked: newLockedState } : p
      ));
      
      if (newLockedState) {
        // LOCKED - trigger full data capture
        toast.info('🔒 Capturing data to tracking system...');
        
        const tokenMint = position.token_mint;
        const twitterUrl = position.twitter_url;
        const websiteUrl = position.website_url;
        const telegramUrl = position.telegram_url;
        const rating = position.dev_trust_rating || 'unknown';
        
        // Extract identifiers
        const twitterType = twitterUrl ? detectTwitterType(twitterUrl) : null;
        const communityId = twitterType === 'community' && twitterUrl 
          ? extractCommunityId(twitterUrl) 
          : null;
        
        function extractTwitterHandle(url: string): string | null {
          if (url.includes('/communities/')) return null;
          const match = url.match(/(?:twitter\.com|x\.com)\/([^/?]+)/i);
          return match ? match[1].toLowerCase() : null;
        }
        
        const twitterHandle = twitterType === 'account' && twitterUrl
          ? extractTwitterHandle(twitterUrl)
          : null;
        
        // Get creator wallet if not present
        let creatorWallet = position.creator_wallet;
        let launchpadPlatform: string | null = null;
        
        if (!creatorWallet) {
          try {
            const { data: creatorData } = await supabase.functions.invoke('solscan-creator-lookup', {
              body: { tokenMint }
            });
            if (creatorData?.creatorWallet) {
              creatorWallet = creatorData.creatorWallet;
              
              // Update position with creator wallet
              await supabase
                .from("flip_positions")
                .update({ creator_wallet: creatorWallet })
                .eq("id", position.id);
              
              setPositions(prev => prev.map(p => 
                p.id === position.id ? { ...p, creator_wallet: creatorWallet } : p
              ));
            }
            if (creatorData?.launchpad) {
              launchpadPlatform = creatorData.launchpad;
            }
          } catch (err) {
            console.warn('Failed to fetch creator wallet:', err);
          }
        }
        
        // Add to appropriate list based on current rating
        const riskLevel = rating === 'danger' ? 'high' : rating === 'concern' ? 'medium' : 'low';
        
        if (rating === 'danger' || rating === 'concern') {
          await supabase.from('pumpfun_blacklist').upsert({
            entry_type: 'token_mint',
            identifier: tokenMint,
            risk_level: riskLevel,
            blacklist_reason: `Locked from FlipIt - rated ${rating.toUpperCase()}`,
            source: 'flipit_lock',
            tags: ['locked', rating],
            linked_twitter: twitterHandle ? [twitterHandle] : [],
            linked_websites: websiteUrl ? [websiteUrl] : [],
            linked_telegram: telegramUrl ? [telegramUrl] : [],
            linked_dev_wallets: creatorWallet ? [creatorWallet] : [],
            linked_x_communities: communityId ? [communityId] : []
          }, { onConflict: 'entry_type,identifier' });
          
          if (creatorWallet) {
            await supabase.from('pumpfun_blacklist').upsert({
              entry_type: 'dev_wallet',
              identifier: creatorWallet,
              risk_level: riskLevel,
              blacklist_reason: `Developer of ${position.token_symbol || tokenMint.slice(0, 8)} - locked as ${rating.toUpperCase()}`,
              source: 'flipit_lock',
              tags: ['locked', rating, 'dev_wallet'],
              linked_token_mints: [tokenMint],
              linked_twitter: twitterHandle ? [twitterHandle] : [],
              linked_x_communities: communityId ? [communityId] : []
            }, { onConflict: 'entry_type,identifier' });
          }
        } else if (rating === 'good') {
          await supabase.from('pumpfun_whitelist').upsert({
            entry_type: 'token_mint',
            identifier: tokenMint,
            trust_level: 'high',
            whitelist_reason: 'Locked from FlipIt - rated GOOD',
            source: 'flipit_lock',
            tags: ['locked', 'trusted'],
            linked_twitter: twitterHandle ? [twitterHandle] : [],
            linked_websites: websiteUrl ? [websiteUrl] : [],
            linked_telegram: telegramUrl ? [telegramUrl] : [],
            linked_dev_wallets: creatorWallet ? [creatorWallet] : []
          }, { onConflict: 'entry_type,identifier' });
          
          if (creatorWallet) {
            await supabase.from('pumpfun_whitelist').upsert({
              entry_type: 'dev_wallet',
              identifier: creatorWallet,
              trust_level: 'high',
              whitelist_reason: `Trusted developer of ${position.token_symbol || tokenMint.slice(0, 8)}`,
              source: 'flipit_lock',
              tags: ['locked', 'trusted', 'dev_wallet'],
              linked_token_mints: [tokenMint],
              linked_twitter: twitterHandle ? [twitterHandle] : []
            }, { onConflict: 'entry_type,identifier' });
          }
        } else {
          // unknown - add to neutral
          await supabase.from('pumpfun_neutrallist').upsert({
            entry_type: 'token_mint',
            identifier: tokenMint,
            trust_level: 'unreviewed',
            neutrallist_reason: 'Locked from FlipIt - unrated',
            source: 'flipit_lock',
            tags: ['locked', 'pending_review'],
            linked_twitter: twitterHandle ? [twitterHandle] : [],
            linked_websites: websiteUrl ? [websiteUrl] : [],
            linked_telegram: telegramUrl ? [telegramUrl] : [],
            linked_dev_wallets: creatorWallet ? [creatorWallet] : []
          }, { onConflict: 'entry_type,identifier' });
          
          if (creatorWallet) {
            await supabase.from('pumpfun_neutrallist').upsert({
              entry_type: 'dev_wallet',
              identifier: creatorWallet,
              trust_level: 'unreviewed',
              neutrallist_reason: `Developer of ${position.token_symbol || tokenMint.slice(0, 8)} - unrated`,
              source: 'flipit_lock',
              tags: ['locked', 'pending_review', 'dev_wallet'],
              linked_token_mints: [tokenMint],
              linked_twitter: twitterHandle ? [twitterHandle] : []
            }, { onConflict: 'entry_type,identifier' });
          }
        }
        
        // Trigger X community enricher if applicable
        if (twitterType === 'community' && twitterUrl) {
          supabase.functions.invoke('x-community-enricher', {
            body: { 
              communityUrl: twitterUrl,
              linkedTokenMint: tokenMint,
              linkedCreatorWallet: creatorWallet
            }
          }).catch(err => console.warn('X Community enricher failed:', err));
        }
        
        // Trigger team detection
        if (creatorWallet || twitterHandle || communityId) {
          supabase.functions.invoke('blacklist-enricher', {
            body: {
              detect_team: true,
              identifiers: {
                dev_wallets: creatorWallet ? [creatorWallet] : [],
                twitter_accounts: twitterHandle ? [twitterHandle] : [],
                token_mints: [tokenMint],
                x_community_ids: communityId ? [communityId] : []
              },
              risk_level: riskLevel,
              linked_token_mint: tokenMint
            }
          }).catch(err => console.warn('Team detection failed:', err));
        }
        
        // Update launchpad creator profile if we have the info
        if (creatorWallet && launchpadPlatform) {
          const creatorProfileData: any = {
            platform: launchpadPlatform,
            creator_wallet: creatorWallet,
            is_blacklisted: rating === 'danger' || rating === 'concern',
            is_whitelisted: rating === 'good',
            risk_notes: `Locked as ${rating.toUpperCase()} via FlipIt for token ${position.token_symbol || tokenMint.slice(0, 8)}`
          };
          
          if (twitterHandle) {
            creatorProfileData.linked_x_account = twitterHandle;
          }
          
          const { data: existingCreator } = await supabase
            .from('launchpad_creator_profiles')
            .select('id, tokens_created, linked_token_mints')
            .eq('platform', launchpadPlatform)
            .eq('creator_wallet', creatorWallet)
            .maybeSingle();
          
          if (existingCreator) {
            const linkedMints = (existingCreator.linked_token_mints as string[]) || [];
            if (!linkedMints.includes(tokenMint)) {
              linkedMints.push(tokenMint);
            }
            await supabase
              .from('launchpad_creator_profiles')
              .update({
                ...creatorProfileData,
                tokens_created: (existingCreator.tokens_created || 0) + (linkedMints.length > (existingCreator.linked_token_mints as string[])?.length ? 1 : 0),
                linked_token_mints: linkedMints
              })
              .eq('id', existingCreator.id);
          } else {
            await supabase
              .from('launchpad_creator_profiles')
              .insert({
                ...creatorProfileData,
                tokens_created: 1,
                linked_token_mints: [tokenMint],
                tokens_rugged: rating === 'danger' ? 1 : 0,
                tokens_graduated: 0
              });
          }
        }
        
        const walletInfo = creatorWallet ? ` | Dev: ${creatorWallet.slice(0, 6)}...` : '';
        const listName = rating === 'danger' || rating === 'concern' ? 'blacklist' : rating === 'good' ? 'whitelist' : 'neutrallist';
        toast.success(`🔒 Locked! Added to ${listName}${walletInfo}`);
        
      } else {
        toast.info('🔓 Unlocked - no further tracking for this position');
      }
      
    } catch (err: any) {
      console.error('Failed to toggle tracking lock:', err);
      toast.error(err.message || 'Failed to toggle lock');
    }
  };

  const handleUpdateTarget = async (positionId: string, newMultiplier: number, buyPriceUsd: number) => {
    const newTargetPrice = buyPriceUsd * newMultiplier;
    
    const { error } = await supabase
      .from('flip_positions')
      .update({ 
        target_multiplier: newMultiplier, 
        target_price_usd: newTargetPrice 
      })
      .eq('id', positionId);

    if (error) {
      toast.error('Failed to update target');
      return;
    }

    toast.success(`Target updated to ${newMultiplier}x ($${newTargetPrice.toFixed(8)})`);
  };

  const handleUpdateRebuySettings = async (
    positionId: string, 
    enabled: boolean, 
    rebuyPriceHigh: number | null, 
    rebuyPriceLow: number | null, 
    rebuyAmount: number | null,
    rebuyTargetMultiplier: number | null = 2,
    rebuyLoopEnabled: boolean = false
  ) => {
    const updateData: any = {
      rebuy_enabled: enabled,
      rebuy_price_high_usd: rebuyPriceHigh,
      rebuy_price_low_usd: rebuyPriceLow,
      rebuy_amount_usd: rebuyAmount,
      rebuy_target_multiplier: rebuyTargetMultiplier,
      rebuy_loop_enabled: rebuyLoopEnabled,
      // Keep legacy field for backwards compatibility
      rebuy_price_usd: rebuyPriceLow, 
    };

    // If enabling and position is already sold, set status to watching
    const position = positions.find(p => p.id === positionId);
    if (enabled && position?.status === 'sold' && rebuyPriceHigh && rebuyPriceLow && rebuyAmount) {
      updateData.rebuy_status = 'watching';
    } else if (!enabled) {
      updateData.rebuy_status = null;
    }

    const { error } = await supabase
      .from('flip_positions')
      .update(updateData)
      .eq('id', positionId);

    if (error) {
      toast.error('Failed to update rebuy settings');
      return;
    }

    toast.success(enabled ? 'Rebuy range configured!' : 'Rebuy disabled');
    loadPositions({ silent: true });
    
    // Clear local editing state
    setRebuyEditing(prev => {
      const newState = { ...prev };
      delete newState[positionId];
      return newState;
    });
  };

  const handleCancelRebuy = async (positionId: string) => {
    const { error } = await supabase
      .from('flip_positions')
      .update({ 
        rebuy_status: 'cancelled',
        rebuy_enabled: false 
      })
      .eq('id', positionId);

    if (error) {
      toast.error('Failed to cancel rebuy');
      return;
    }

    toast.success('Rebuy cancelled');
    loadPositions({ silent: true });
  };

  const getRebuyStatusBadge = (status: string | null) => {
    if (!status) return null;
    
    const statusConfig: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: React.ReactNode }> = {
      pending: { variant: 'secondary', icon: <Clock className="w-3 h-3" /> },
      watching: { variant: 'default', icon: <Eye className="w-3 h-3 animate-pulse" /> },
      executed: { variant: 'outline', icon: <RotateCcw className="w-3 h-3 text-green-500" /> },
      cancelled: { variant: 'destructive', icon: <XCircle className="w-3 h-3" /> }
    };

    const config = statusConfig[status] || statusConfig.pending;
    return (
      <Badge variant={config.variant} className="gap-1 text-xs">
        {config.icon}
        {status}
      </Badge>
    );
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: React.ReactNode }> = {
      pending_buy: { variant: 'secondary', icon: <Loader2 className="w-3 h-3 animate-spin" /> },
      holding: { variant: 'default', icon: <Clock className="w-3 h-3" /> },
      pending_sell: { variant: 'secondary', icon: <Loader2 className="w-3 h-3 animate-spin" /> },
      sold: { variant: 'outline', icon: <CheckCircle2 className="w-3 h-3 text-green-500" /> },
      failed: { variant: 'destructive', icon: <XCircle className="w-3 h-3" /> }
    };

    const config = statusConfig[status] || statusConfig.pending_buy;
    return (
      <Badge variant={config.variant} className="gap-1">
        {config.icon}
        {status.replace('_', ' ')}
      </Badge>
    );
  };

  const calculateProgress = (position: FlipPosition) => {
    if (position.status !== 'holding') return 0;

    // Use an on-chain consistent entry price when we have quantity:
    // entryPrice = invested_usd / tokens_received
    const entryPrice =
      typeof position.quantity_tokens === 'number' && position.quantity_tokens > 0 && position.buy_amount_usd > 0
        ? position.buy_amount_usd / position.quantity_tokens
        : position.buy_price_usd;

    if (typeof entryPrice !== 'number' || !Number.isFinite(entryPrice) || entryPrice <= 0) return 0;

    const currentPrice = currentPrices[position.token_mint] ?? entryPrice;
    const targetPrice = entryPrice * position.target_multiplier;

    const progress = ((currentPrice - entryPrice) / (targetPrice - entryPrice)) * 100;
    // Clamp: 0% minimum (no negative progress), 100% max
    return Math.min(Math.max(progress, 0), 100);
  };

  const activePositions = positions.filter(p => ['pending_buy', 'holding', 'pending_sell'].includes(p.status));
  // Check if any active position has rebuy enabled (to conditionally show rebuy columns)
  const hasActiveRebuy = activePositions.some(p => p.rebuy_enabled || Object.keys(rebuyEditing).some(id => rebuyEditing[id]?.enabled && activePositions.some(ap => ap.id === id)));
  // Completed positions section removed for performance - was loading dead tokens

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="bg-gradient-to-r from-orange-500/10 to-red-500/10 border-orange-500/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-2xl">
            <Flame className="h-6 w-6 text-orange-500" />
            FlipIt - Quick Token Flipper
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Source Wallet Section */}
          <div className="mb-6 p-4 rounded-lg border border-border bg-card/50">
            <Label className="flex items-center gap-1 mb-3 text-lg">
              <Key className="h-5 w-5" />
              Source Wallet
            </Label>
            
            {wallets.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-muted-foreground mb-4">No FlipIt wallet configured yet</p>
                <Button 
                  onClick={handleGenerateWallet} 
                  disabled={isGeneratingWallet}
                  className="bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600"
                >
                  {isGeneratingWallet ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4 mr-2" />
                  )}
                  Generate Source Wallet
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Select value={selectedWallet} onValueChange={(val) => {
                    setSelectedWallet(val);
                    localStorage.setItem('flipit-selected-wallet', val);
                  }}>
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Select wallet" />
                    </SelectTrigger>
                    <SelectContent>
                      {wallets.map(w => (
                        <SelectItem key={w.id} value={w.id}>
                          {w.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button 
                    size="icon" 
                    variant="outline" 
                    onClick={handleGenerateWallet}
                    disabled={isGeneratingWallet}
                    title="Generate new wallet"
                  >
                    {isGeneratingWallet ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                
                {(() => {
                  const wallet = wallets.find(w => w.id === selectedWallet);
                  const canShowTokens = Boolean(wallet);

                  return (
                    <div className="space-y-3">
                      {canShowTokens ? (
                        <div className="flex items-center justify-between flex-wrap gap-2 p-3 rounded-md bg-muted/50">
                          <div className="flex items-center gap-2">
                            <code className="text-sm font-mono">{wallet?.pubkey}</code>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6"
                              onClick={() => copyToClipboard(wallet?.pubkey || '', 'Address')}
                              title="Copy wallet address"
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 px-2 text-xs"
                              onClick={() => window.open(`https://solscan.io/account/${wallet?.pubkey}`, '_blank')}
                              title="View on Solscan"
                            >
                              <ArrowUpRight className="h-3 w-3 mr-1" />
                              Solscan
                            </Button>
                          </div>

                          <div className="flex items-center gap-3">
                            <div className="flex items-center gap-3 bg-muted/50 px-3 py-2 rounded-lg">
                              <Wallet className="h-4 w-4 text-primary" />
                              <div className="flex flex-col">
                                <span className="text-xs text-muted-foreground">Balance</span>
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-lg">
                                    {walletBalance !== null ? `${walletBalance.toFixed(5)} SOL` : '...'}
                                  </span>
                                  {walletBalance !== null && !solPriceLoading && (
                                    <span className="text-sm text-green-500 font-medium">
                                      (${(walletBalance * solPrice).toFixed(2)})
                                    </span>
                                  )}
                                </div>
                              </div>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 ml-auto"
                                onClick={refreshWalletBalance}
                                disabled={isRefreshingBalance}
                                title="Refresh balance"
                              >
                                <RefreshCw className={`h-4 w-4 ${isRefreshingBalance ? 'animate-spin' : ''}`} />
                              </Button>
                            </div>

                            <div className="flex flex-col gap-2">
                              <div className="flex items-center gap-2">
                                <Input
                                  type="text"
                                  placeholder="Destination wallet (empty = funder)"
                                  value={withdrawDestination}
                                  onChange={(e) => setWithdrawDestination(e.target.value)}
                                  className="flex-1 h-8 text-sm font-mono"
                                  disabled={isWithdrawing}
                                />
                              </div>
                              <div className="flex items-center gap-2">
                                <Input
                                  type="number"
                                  step="0.001"
                                  min="0"
                                  placeholder="SOL (empty = all)"
                                  value={withdrawAmount}
                                  onChange={(e) => setWithdrawAmount(e.target.value)}
                                  className="w-32 h-8 text-sm"
                                  disabled={isWithdrawing}
                                />
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={handleWithdraw}
                                  disabled={isWithdrawing || !walletBalance || walletBalance < 0.001}
                                >
                                  {isWithdrawing ? (
                                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                  ) : (
                                    <ArrowUpRight className="h-4 w-4 mr-1" />
                                  )}
                                  {withdrawAmount.trim() ? 'Withdraw' : 'Withdraw All'}
                                </Button>
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="p-3 rounded-md bg-muted/50">
                          <p className="text-sm text-muted-foreground">Select a wallet above to view wallet tokens.</p>
                        </div>
                      )}

                      {/* Token Manager Toggle (always visible) */}
                      <Collapsible open={showTokenManager} onOpenChange={setShowTokenManager}>
                        <CollapsibleTrigger asChild>
                          <Button variant="outline" className="w-full justify-between" disabled={!canShowTokens}>
                            <span className="flex items-center gap-2">
                              <Coins className="h-4 w-4" />
                              View Wallet Tokens
                            </span>
                            <ChevronDown
                              className={`h-4 w-4 transition-transform ${showTokenManager ? 'rotate-180' : ''}`}
                            />
                          </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="mt-3">
                          {canShowTokens ? (
                            <WalletTokenManager
                              walletId={selectedWallet}
                              walletPubkey={wallet?.pubkey || ''}
                              useDirectSwap={true}
                              slippageBps={slippageBps}
                              priorityFeeMode={priorityFeeMode}
                              onTokensSold={() => {
                                refreshWalletBalance();
                                loadPositions({ silent: true });
                              }}
                            />
                          ) : (
                            <div className="rounded-md border border-border bg-card/50 p-3 text-sm text-muted-foreground">
                              No wallet selected.
                            </div>
                          )}
                        </CollapsibleContent>
                      </Collapsible>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>

          {/* Settings Panel */}
          <div className="mb-6 p-4 rounded-lg border border-border bg-card/50">
            <Label className="flex items-center gap-1 mb-3 text-lg">
              <Settings className="h-5 w-5" />
              Trading Settings
            </Label>
            
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {/* Slippage */}
              <div className="space-y-2">
                <Label className="flex items-center gap-1 text-sm">
                  <Activity className="h-4 w-4" />
                  Slippage Tolerance
                </Label>
                <Select value={slippageBps.toString()} onValueChange={v => setSlippageBps(Number(v))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="100">1% (Conservative)</SelectItem>
                    <SelectItem value="300">3% (Standard)</SelectItem>
                    <SelectItem value="500">5% (Default)</SelectItem>
                    <SelectItem value="1000">10% (Aggressive)</SelectItem>
                    <SelectItem value="1500">15% (Very Aggressive)</SelectItem>
                    <SelectItem value="2000">20% (High Risk)</SelectItem>
                    <SelectItem value="3000">30% (Maximum)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Priority Fee */}
              <div className="space-y-2">
                <Label className="flex items-center gap-1 text-sm">
                  <Zap className="h-4 w-4" />
                  Priority Fee (Gas)
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-5 w-5 p-0 ml-1 text-muted-foreground hover:text-foreground">
                        <DollarSign className="h-3 w-3" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-64 p-3" align="start">
                      <div className="space-y-2">
                        <p className="text-xs font-medium">Approximate USD Fees</p>
                        <p className="text-[10px] text-muted-foreground">Based on SOL @ ${solPrice?.toFixed(2) || '...'}</p>
                        <div className="space-y-1 text-xs">
                          <div className="flex justify-between"><span>Low:</span><span className="font-mono">{solPrice ? `~${(0.0001 * solPrice * 100).toFixed(1)}¢` : '...'}</span></div>
                          <div className="flex justify-between"><span>Medium:</span><span className="font-mono">{solPrice ? `~${(0.0005 * solPrice * 100).toFixed(1)}¢` : '...'}</span></div>
                          <div className="flex justify-between"><span>High:</span><span className="font-mono">{solPrice ? `~${(0.001 * solPrice * 100).toFixed(1)}¢` : '...'}</span></div>
                          <div className="flex justify-between"><span>Turbo:</span><span className="font-mono">{solPrice ? `~${(0.0075 * solPrice * 100).toFixed(0)}¢` : '...'}</span></div>
                          <div className="flex justify-between"><span>Ultra:</span><span className="font-mono">{solPrice ? `~${(0.009 * solPrice * 100).toFixed(0)}¢` : '...'}</span></div>
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-2">Same fee used for buy & sell</p>
                      </div>
                    </PopoverContent>
                  </Popover>
                </Label>
                <Select value={priorityFeeMode} onValueChange={(v: 'low' | 'medium' | 'high' | 'turbo' | 'ultra') => setPriorityFeeMode(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low (~0.0001 SOL)</SelectItem>
                    <SelectItem value="medium">Medium (~0.0005 SOL)</SelectItem>
                    <SelectItem value="high">High (~0.001 SOL)</SelectItem>
                    <SelectItem value="turbo">Turbo (~0.0075 SOL)</SelectItem>
                    <SelectItem value="ultra">ULTRA (~0.009 SOL)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Limit Order Mode Toggle */}
              <div className="space-y-2">
                <Label className="flex items-center gap-1 text-sm">
                  <Clock className="h-4 w-4" />
                  Limit Order Mode
                </Label>
                <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50 h-10">
                  <Switch 
                    checked={limitOrderMode} 
                    onCheckedChange={setLimitOrderMode}
                  />
                  <span className={`text-sm font-medium ${limitOrderMode ? 'text-amber-500' : 'text-muted-foreground'}`}>
                    {limitOrderMode ? 'Queue Buy Orders' : 'Instant Buy'}
                  </span>
                </div>
              </div>

              {/* Auto-Refresh Control moved to Active Flips header */}
            </div>

            {/* Limit Order Price Range - Only show when limit mode is enabled */}
            {limitOrderMode && (
              <div className="mt-4 p-4 rounded-lg border border-amber-500/30 bg-amber-500/5">
                <Label className="flex items-center gap-2 mb-3 text-amber-500">
                  <Clock className="h-4 w-4" />
                  Limit Order Settings
                </Label>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Min Price (Buy when ≥)</Label>
                    <Input
                      type="text"
                      placeholder="0.000001"
                      value={limitPriceMin}
                      onChange={e => setLimitPriceMin(e.target.value)}
                      className="font-mono"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Max Price (Buy when ≤)</Label>
                    <Input
                      type="text"
                      placeholder="0.00001"
                      value={limitPriceMax}
                      onChange={e => setLimitPriceMax(e.target.value)}
                      className="font-mono"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Order Expiry</Label>
                    <Select value={limitExpiry} onValueChange={setLimitExpiry}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1 Hour</SelectItem>
                        <SelectItem value="3">3 Hours</SelectItem>
                        <SelectItem value="6">6 Hours</SelectItem>
                        <SelectItem value="12">12 Hours</SelectItem>
                        <SelectItem value="24">24 Hours</SelectItem>
                        <SelectItem value="48">48 Hours</SelectItem>
                        <SelectItem value="72">72 Hours</SelectItem>
                        <SelectItem value="168">7 Days (Default)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Notification Email</Label>
                    <Input
                      type="email"
                      placeholder="your@email.com"
                      value={notificationEmail}
                      onChange={e => setNotificationEmail(e.target.value)}
                    />
                  </div>
                </div>
                {inputToken.price !== null && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Current price: <span className="text-amber-500 font-mono">${inputToken.price.toFixed(10).replace(/\.?0+$/, '')}</span>
                    {limitPriceMin && limitPriceMax && inputToken.price >= parseFloat(limitPriceMin) && inputToken.price <= parseFloat(limitPriceMax) && (
                      <span className="text-green-500 ml-2">✓ Currently in range - will execute immediately!</span>
                    )}
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4">
            {/* Row 1: Buy Amount + SOL/USD + Target all on same line */}
            <div className="flex items-end gap-3 flex-wrap">
              {/* Buy Amount - compact */}
              <div className="space-y-1">
                <Label className="flex items-center gap-1 text-sm">
                  <Wallet className="h-3 w-3" />
                  Buy Amount
                </Label>
                <div className="flex gap-1 items-center">
                  <Input
                    type="number"
                    step="0.001"
                    min="0"
                    value={buyAmount}
                    onChange={(e) => setBuyAmount(e.target.value)}
                    placeholder="0.001"
                    className="w-24"
                  />
                  <span className="text-sm font-medium text-muted-foreground px-2">SOL</span>
                </div>
                {solPriceLoading && (
                  <p className="text-xs text-muted-foreground animate-pulse">Loading SOL price...</p>
                )}
                {!solPriceLoading && solPrice > 0 && buyAmount && parseFloat(buyAmount) > 0 && (
                  <p className="text-xs text-muted-foreground">
                    ≈ ${(parseFloat(buyAmount) * solPrice).toFixed(2)} USD
                  </p>
                )}
                {!solPriceLoading && solPrice === 0 && (
                  <p className="text-xs text-destructive">SOL price unavailable</p>
                )}
              </div>

              {/* Target Multiplier - compact, same line */}
              <div className="space-y-1">
                <Label className="flex items-center gap-1 text-sm">
                  <TrendingUp className="h-3 w-3" />
                  Target
                </Label>
                <Select value={targetMultiplier.toString()} onValueChange={v => setTargetMultiplier(Number(v))}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0" className="text-yellow-500 font-semibold">⛔ NO AUTO-SELL</SelectItem>
                    <SelectItem value="1.25">1.25x (+25%)</SelectItem>
                    <SelectItem value="1.30">1.30x (+30%)</SelectItem>
                    <SelectItem value="1.50">1.50x (+50%)</SelectItem>
                    <SelectItem value="1.75">1.75x (+75%)</SelectItem>
                    <SelectItem value="2">2x (+100%)</SelectItem>
                    <SelectItem value="2.5">2.5x (+150%)</SelectItem>
                    <SelectItem value="3">3x (+200%)</SelectItem>
                    <SelectItem value="4">4x (+300%)</SelectItem>
                    <SelectItem value="5">5x (+400%)</SelectItem>
                    <SelectItem value="6">6x (+500%)</SelectItem>
                    <SelectItem value="7">7x (+600%)</SelectItem>
                    <SelectItem value="8">8x (+700%)</SelectItem>
                    <SelectItem value="9">9x (+800%)</SelectItem>
                    <SelectItem value="10">10x (+900%)</SelectItem>
                    <SelectItem value="15">15x (+1400%)</SelectItem>
                    <SelectItem value="20">20x (+1900%)</SelectItem>
                    <SelectItem value="25">25x (+2400%)</SelectItem>
                    <SelectItem value="50">50x (+4900%)</SelectItem>
                    <SelectItem value="100">100x (+9900%)</SelectItem>
                    <SelectItem value="200">200x</SelectItem>
                    <SelectItem value="300">300x</SelectItem>
                    <SelectItem value="400">400x</SelectItem>
                    <SelectItem value="500">500x</SelectItem>
                    <SelectItem value="600">600x</SelectItem>
                    <SelectItem value="700">700x</SelectItem>
                    <SelectItem value="800">800x</SelectItem>
                    <SelectItem value="900">900x</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Row 2: Token Input with Paste + Clear buttons */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <span className="flex items-center gap-2">
                  TOKEN
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-5 px-2 text-xs"
                    onClick={async () => {
                      try {
                        const text = await navigator.clipboard.readText();
                        if (text) {
                          setTokenAddress(text.trim());
                          toast.success('Pasted from clipboard');
                        }
                      } catch (err) {
                        toast.error('Failed to read clipboard');
                      }
                    }}
                  >
                    <ClipboardPaste className="h-3 w-3 mr-1" />
                    Paste
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-5 px-2 text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      setTokenAddress('');
                      setInputToken(getEmptyInputToken());
                      holderQuality.reset();
                      toast.info('Cleared');
                    }}
                  >
                    <XCircle className="h-3 w-3 mr-1" />
                    Clear
                  </Button>
                  {inputToken.symbol && (
                    <span className="font-bold text-primary">
                      {inputToken.symbol}{inputToken.name ? ` (${inputToken.name})` : ''}
                    </span>
                  )}
                </span>
                {isLoadingInputToken && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" /> Fetching...
                  </span>
                )}
              </Label>
              <Input
                placeholder="Paste token address..."
                value={tokenAddress}
                onChange={e => setTokenAddress(e.target.value)}
              />
              {/* Price info below input - left aligned */}
              <div className="flex items-center gap-2 flex-wrap">
                {!isLoadingInputToken && inputToken.price !== null && (
                  <span className="text-sm font-bold text-green-400">
                    ${inputToken.price.toFixed(10).replace(/\.?0+$/, '')}
                    {inputToken.source && (
                      <span className="text-xs text-muted-foreground ml-1">
                        ({inputToken.source})
                      </span>
                    )}
                  </span>
                )}
                {inputToken.price !== null && buyAmount && (
                  <>
                    <span className="text-xs text-muted-foreground">
                      Entry: ~{(() => {
                        const amt = parseFloat(buyAmount);
                        if (isNaN(amt) || amt <= 0 || !solPrice) return '—';
                        const usdAmount = amt * solPrice; // SOL-only: always convert SOL → USD for display
                        const tokens = usdAmount / inputToken.price!;
                        return `${tokens.toLocaleString(undefined, { maximumFractionDigits: 0 })} tokens`;
                      })()}
                      {inputToken.lastFetched && (
                        <span className="ml-2 text-muted-foreground/70">
                          • {new Date(inputToken.lastFetched).toLocaleTimeString()}
                        </span>
                      )}
                    </span>
                    {/* Padre.gg link under Entry */}
                    {tokenAddress.trim().length >= 32 && (
                      <a
                        href={`https://trade.padre.gg/trade/solana/${tokenAddress.trim()}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center hover:opacity-80 transition-opacity ml-2"
                        title="Open in Padre Terminal"
                      >
                        <img src="https://trade.padre.gg/logo.svg" alt="Padre" className="h-4 w-auto" />
                      </a>
                    )}
                  </>
                )}
              </div>
              
              {/* Token Preview Card */}
              {tokenAddress.trim().length >= 32 && inputToken.mint && (
                <TokenPreviewCard
                  mint={tokenAddress.trim()}
                  symbol={inputToken.symbol}
                  name={inputToken.name}
                  image={inputToken.image}
                  price={inputToken.price}
                  marketCap={inputToken.marketCap}
                  liquidity={inputToken.liquidity}
                  holders={inputToken.holders}
                  dexStatus={inputToken.dexStatus}
                  twitterUrl={inputToken.twitterUrl}
                  websiteUrl={inputToken.websiteUrl}
                  telegramUrl={inputToken.telegramUrl}
                  isLoading={isLoadingInputToken}
                />
              )}
              
              {/* Blacklist/Whitelist Warning Banner */}
              {blacklistWarning.level && tokenAddress.trim().length >= 32 && (
                <div className={`p-3 rounded-lg border flex items-center gap-3 ${
                  blacklistWarning.level === 'high' 
                    ? 'bg-red-500/20 border-red-500 text-red-200' 
                    : blacklistWarning.level === 'medium'
                    ? 'bg-orange-500/20 border-orange-500 text-orange-200'
                    : blacklistWarning.level === 'trusted'
                    ? 'bg-green-500/20 border-green-500 text-green-200'
                    : 'bg-yellow-500/20 border-yellow-500 text-yellow-200'
                }`}>
                  {blacklistWarning.level === 'high' ? (
                    <AlertTriangle className="h-5 w-5 text-red-400 flex-shrink-0" />
                  ) : blacklistWarning.level === 'medium' ? (
                    <AlertTriangle className="h-5 w-5 text-orange-400 flex-shrink-0" />
                  ) : blacklistWarning.level === 'trusted' ? (
                    <CheckCircle2 className="h-5 w-5 text-green-400 flex-shrink-0" />
                  ) : (
                    <Eye className="h-5 w-5 text-yellow-400 flex-shrink-0" />
                  )}
                  <div className="flex-1">
                    <div className="font-semibold text-sm">
                      {blacklistWarning.level === 'high' ? '🚨 DANGER: Blacklisted' 
                        : blacklistWarning.level === 'medium' ? '⚠️ CONCERN: Flagged'
                        : blacklistWarning.level === 'trusted' ? '✅ TRUSTED: Whitelisted'
                        : '❓ Under Review'}
                      {blacklistWarning.source === 'creator_wallet' && ' (Dev Wallet)'}
                      {blacklistWarning.source === 'twitter' && ' (Twitter)'}
                    </div>
                    <div className="text-xs opacity-80">
                      {blacklistWarning.reason}
                    </div>
                  </div>
                  {inputToken.creatorWallet && (
                    <div className="text-xs opacity-60 font-mono">
                      Dev: {inputToken.creatorWallet.slice(0, 6)}...{inputToken.creatorWallet.slice(-4)}
                    </div>
                  )}
                </div>
              )}
              
              {/* Momentum Indicator only */}
              {tokenAddress.trim().length >= 32 && (
                <MomentumIndicator 
                  tokenMint={tokenAddress.trim()} 
                  onRefresh={() => {
                    fetchInputTokenData(tokenAddress.trim(), true);
                    holderQuality.checkQuality(tokenAddress.trim());
                  }}
                />
              )}
            </div>

            {/* Holder Quality - just above FLIP IT button */}
            {tokenAddress.trim().length >= 32 && (
              <div className="flex items-center">
                <HolderQualityIndicator 
                  quality={holderQuality.quality}
                  isLoading={holderQuality.isLoading}
                  summary={holderQuality.summary}
                  totalHolders={holderQuality.totalHolders}
                  realBuyersCount={holderQuality.realBuyersCount}
                  dustPercent={holderQuality.dustPercent}
                  whaleCount={holderQuality.whaleCount}
                  tierBreakdown={holderQuality.tierBreakdown}
                  error={holderQuality.error}
                />
              </div>
            )}
          </div>

          <div className="flex gap-2 mt-4">
            {limitOrderMode ? (
              <Button
                onClick={handleSubmitLimitOrder}
                disabled={isSubmittingLimitOrder || !tokenAddress.trim() || !selectedWallet || !limitPriceMin || !limitPriceMax}
                className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600"
              >
                {isSubmittingLimitOrder ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Clock className="h-4 w-4 mr-2" />
                )}
                QUEUE LIMIT ORDER
              </Button>
            ) : (
              <Button
                onClick={handleFlip}
                disabled={isFlipping || !tokenAddress.trim() || !selectedWallet}
                className="bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600"
              >
                {isFlipping ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Flame className="h-4 w-4 mr-2" />
                )}
                FLIP IT
              </Button>
            )}

          </div>
          
          {/* Last Execution Price Comparison - shows requested vs received */}
          {lastExecutionPrices && (
            <div className="mt-4 p-3 rounded-lg border border-primary/30 bg-primary/5">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">Last Trade: {lastExecutionPrices.tokenSymbol || 'Token'}</span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs"
                  onClick={() => setLastExecutionPrices(null)}
                >
                  <XCircle className="h-3 w-3" />
                </Button>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-4 text-sm">
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">Requested Price</div>
                  <div className="font-mono font-bold text-foreground">
                    {lastExecutionPrices.requested 
                      ? `$${lastExecutionPrices.requested.toFixed(10).replace(/\.?0+$/, '')}`
                      : 'N/A'}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">Received Price (Entry)</div>
                  <div className="font-mono font-bold text-foreground">
                    {lastExecutionPrices.received 
                      ? `$${lastExecutionPrices.received.toFixed(10).replace(/\.?0+$/, '')}`
                      : 'N/A'}
                  </div>
                </div>
              </div>
              {lastExecutionPrices.requested && lastExecutionPrices.received && (
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Difference:</span>
                  {(() => {
                    const diff = ((lastExecutionPrices.received - lastExecutionPrices.requested) / lastExecutionPrices.requested) * 100;
                    const isPositive = diff >= 0;
                    return (
                      <Badge variant={Math.abs(diff) > 5 ? 'destructive' : 'secondary'} className="text-xs">
                        {isPositive ? '+' : ''}{diff.toFixed(2)}%
                        {Math.abs(diff) > 5 && ' ⚠️ Significant slippage'}
                      </Badge>
                    );
                  })()}
                  <span className="text-xs text-muted-foreground ml-auto">
                    {lastExecutionPrices.timestamp && new Date(lastExecutionPrices.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="text-sm text-muted-foreground">Active Positions</div>
            <div className="text-2xl font-bold">{activePositions.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Pending Limit Orders */}
      {limitOrders.filter(o => o.status === 'watching').length > 0 && (
        <Card className="border-amber-500/30">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-amber-500">
              <Clock className="h-5 w-5" />
              Pending Limit Orders ({limitOrders.filter(o => o.status === 'watching').length})
            </CardTitle>
            <div className="flex items-center gap-2 text-sm">
              <div className="flex items-center gap-1">
                <Switch 
                  checked={limitOrderMonitorEnabled} 
                  onCheckedChange={setLimitOrderMonitorEnabled}
                />
                <span className="text-muted-foreground">Monitor</span>
              </div>
              {limitOrderMonitorEnabled && (
                <div className="flex items-center gap-2 px-2 py-1 rounded bg-amber-500/20 border border-amber-500/30">
                  {isLimitOrderMonitoring ? (
                    <Loader2 className="h-3 w-3 animate-spin text-amber-500" />
                  ) : (
                    <Eye className="h-3 w-3 text-amber-500 animate-pulse" />
                  )}
                  <span className="text-xs text-amber-500 font-medium">
                    {isLimitOrderMonitoring ? 'Checking...' : `Next check in ${limitOrderCountdown}s`}
                  </span>
                </div>
              )}
              {lastLimitOrderCheck && (
                <span className="text-xs text-muted-foreground">
                  Last: {new Date(lastLimitOrderCheck).toLocaleTimeString()}
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Token</TableHead>
                  <TableHead>Price Range</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {limitOrders.filter(o => o.status === 'watching').map(order => (
                  <TableRow key={order.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-bold">{order.token_symbol || 'Unknown'}</span>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-5 w-5"
                          onClick={() => copyToClipboard(order.token_mint, 'Token address')}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                      {order.token_name && (
                        <div className="text-xs text-muted-foreground">{order.token_name}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="font-mono text-sm">
                        <span className="text-green-500">${order.buy_price_min_usd.toFixed(10).replace(/\.?0+$/, '')}</span>
                        <span className="text-muted-foreground mx-1">→</span>
                        <span className="text-amber-500">${order.buy_price_max_usd.toFixed(10).replace(/\.?0+$/, '')}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="font-mono">{order.buy_amount_sol.toFixed(4)} SOL</span>
                      {solPrice && (
                        <div className="text-xs text-muted-foreground">
                          ≈ ${(order.buy_amount_sol * solPrice).toFixed(2)}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{order.target_multiplier}x</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {(() => {
                          const expiresAt = new Date(order.expires_at);
                          const now = new Date();
                          const hoursLeft = Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60)));
                          const daysLeft = Math.floor(hoursLeft / 24);
                          
                          if (daysLeft > 0) {
                            return <span className="text-muted-foreground">{daysLeft}d {hoursLeft % 24}h left</span>;
                          } else if (hoursLeft > 0) {
                            return <span className="text-amber-500">{hoursLeft}h left</span>;
                          } else {
                            return <span className="text-destructive">Expiring soon</span>;
                          }
                        })()}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(order.expires_at).toLocaleString()}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleBuyNowLimitOrder(order)}
                          disabled={isExecutingLimitOrder === order.id || !selectedWallet}
                          className="bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600"
                        >
                          {isExecutingLimitOrder === order.id ? (
                            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                          ) : (
                            <Rocket className="h-4 w-4 mr-1" />
                          )}
                          BUY NOW
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleCancelLimitOrder(order.id)}
                          disabled={isExecutingLimitOrder === order.id}
                        >
                          <XCircle className="h-4 w-4 mr-1" />
                          Cancel
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Active Positions */}
      {activePositions.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              Active Flips ({activePositions.length})
              {/* Auto-Refresh Toggle - inline */}
              <div className="flex items-center gap-2 ml-2 px-2 py-1 rounded bg-muted/50">
                <Switch 
                  checked={autoRefreshEnabled} 
                  onCheckedChange={setAutoRefreshEnabled}
                  className="scale-75"
                />
                {autoRefreshEnabled && positions.filter(p => p.status === 'holding').length > 0 ? (
                  <div className="flex items-center gap-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                    <span className="text-xs font-medium text-green-500">
                      {countdown}s
                    </span>
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    {autoRefreshEnabled ? 'Waiting...' : 'Auto'}
                  </span>
                )}
                {/* Check Socials button */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs gap-1"
                  onClick={async () => {
                    setIsManualRefreshing(true);
                    try {
                      await handleRefreshPrices();
                    } finally {
                      setIsManualRefreshing(false);
                    }
                  }}
                  disabled={isManualRefreshing}
                  title="Refresh positions and fetch DEX/social data"
                >
                  <RefreshCw className={`h-3 w-3 ${isManualRefreshing ? 'animate-spin' : ''}`} />
                  Check Socials
                </Button>
              </div>
              {positions.filter(p => p.status === 'holding' && p.emergency_sell_status === 'watching').length > 0 && (
                <Badge variant="destructive" className="gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  {positions.filter(p => p.status === 'holding' && p.emergency_sell_status === 'watching').length} Stop-Loss Active
                </Badge>
              )}
            </CardTitle>
            {/* Emergency Sell Monitor Status */}
            {positions.filter(p => p.status === 'holding' && p.emergency_sell_status === 'watching').length > 0 && (
              <div className="flex items-center gap-2 text-sm">
                <div className="flex items-center gap-1">
                  <Switch 
                    checked={emergencyMonitorEnabled} 
                    onCheckedChange={setEmergencyMonitorEnabled}
                  />
                  <span className="text-muted-foreground">Emergency Monitor</span>
                </div>
                {emergencyMonitorEnabled && (
                  <div className="flex items-center gap-2 px-2 py-1 rounded bg-destructive/20 border border-destructive/30">
                    {isEmergencyMonitoring ? (
                      <Loader2 className="h-3 w-3 animate-spin text-destructive" />
                    ) : (
                      <AlertTriangle className="h-3 w-3 text-destructive animate-pulse" />
                    )}
                    <span className="text-xs text-destructive font-medium">
                      {isEmergencyMonitoring ? 'Checking...' : `Next check in ${emergencyCountdown}s`}
                    </span>
                  </div>
                )}
                {lastEmergencyCheck && (
                  <span className="text-xs text-muted-foreground">
                    Last: {new Date(lastEmergencyCheck).toLocaleTimeString()}
                  </span>
                )}
              </div>
            )}
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="px-2 py-1 w-12">Socials</TableHead>
                  <TableHead className="px-2 py-1">Token</TableHead>
                  <TableHead className="px-2 py-1">Invested</TableHead>
                  <TableHead className="px-2 py-1">Current Value</TableHead>
                  <TableHead className="px-2 py-1">Target Value</TableHead>
                  <TableHead className="px-2 py-1">Progress</TableHead>
                  <TableHead className="px-2 py-1">Action</TableHead>
                  <TableHead className="px-2 py-1 text-center">Rating</TableHead>
                  <TableHead className="px-2 py-1 text-center">🌙 MOONBAG</TableHead>
                  <TableHead className="px-2 py-1">MB %</TableHead>
                  <TableHead className="px-2 py-1 text-center">STOP-LOSS</TableHead>
                  <TableHead className="px-2 py-1">SL Price</TableHead>
                  {hasActiveRebuy && (
                    <>
                      <TableHead className="px-2 py-1 text-center">REBUY</TableHead>
                      <TableHead className="px-2 py-1">Rebuy Low</TableHead>
                      <TableHead className="px-2 py-1">Rebuy High</TableHead>
                      <TableHead className="px-2 py-1">Rebuy Amt</TableHead>
                      <TableHead className="px-2 py-1">Rebuy Target</TableHead>
                    </>
                  )}
                  <TableHead className="px-2 py-1">Status</TableHead>
                  <TableHead className="px-2 py-1 w-8"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activePositions.map(position => {
                  const progress = calculateProgress(position);
                  const currentPrice = currentPrices[position.token_mint];

                  // Quantity is sometimes not persisted; derive it from buy_amount_usd / buy_price_usd when needed.
                  // NOTE: For correct on-chain math, we prefer the persisted quantity_tokens from the buy signature.
                  const effectiveQuantityTokens =
                    position.quantity_tokens ??
                    (position.buy_price_usd ? position.buy_amount_usd / position.buy_price_usd : null);

                  const hasQuantity =
                    typeof effectiveQuantityTokens === 'number' &&
                    Number.isFinite(effectiveQuantityTokens) &&
                    effectiveQuantityTokens > 0;

                  // Use the recorded buy_price_usd which is the actual price at the time of purchase.
                  // Do NOT recalculate from invested/tokens as that introduces rounding errors.
                  const effectiveEntryPrice = position.buy_price_usd;

                  const hasCurrentPrice =
                    typeof currentPrice === 'number' && Number.isFinite(currentPrice) && currentPrice > 0;

                  // SANITY CHECK: Detect wildly incorrect prices from wrong DexScreener matches
                  // If price changed by more than 10000x from buy price, it's likely a wrong token match
                  const priceRatio = hasCurrentPrice && effectiveEntryPrice > 0 
                    ? currentPrice / effectiveEntryPrice 
                    : 1;
                  const isPriceSane = priceRatio < 10000 && priceRatio > 0.00001; // Allow 10000x up or down
                  const usableCurrentPrice = hasCurrentPrice && isPriceSane ? currentPrice : null;

                  const currentValue = hasQuantity && usableCurrentPrice
                    ? effectiveQuantityTokens * usableCurrentPrice
                    : null;

                  // PnL based on PRICE CHANGE (not buy_amount_usd which may be inconsistent with stored price)
                  // PnL$ = tokens × (current_price - entry_price)
                  // PnL% = (current_price - entry_price) / entry_price × 100
                  const pnlUsd = hasQuantity && usableCurrentPrice && effectiveEntryPrice > 0
                    ? effectiveQuantityTokens * (usableCurrentPrice - effectiveEntryPrice)
                    : null;

                  const pnlPercent = usableCurrentPrice && effectiveEntryPrice > 0
                    ? ((usableCurrentPrice - effectiveEntryPrice) / effectiveEntryPrice) * 100
                    : null;

                  // Target value
                  const targetValue = position.buy_amount_usd * position.target_multiplier;
                  const targetProfit = position.buy_amount_usd * (position.target_multiplier - 1);

                  // Check if this position was created from a rebuy (parent position has rebuy_position_id pointing here)
                  const parentRebuyPosition = positions.find(p => p.rebuy_position_id === position.id);
                  const isFromRebuy = !!parentRebuyPosition;

                    return (
                      <TableRow key={position.id}>
                        {/* Socials Column - Stacked Icons */}
                        <TableCell className="px-2 py-1">
                          <div className="flex flex-col items-center gap-0.5">
                            {/* Token Image */}
                            {(position.token_image || tokenImages[position.token_mint]) ? (
                              <img 
                                src={position.token_image || tokenImages[position.token_mint]} 
                                alt={position.token_symbol || 'Token'} 
                                className="w-5 h-5 rounded-full object-cover"
                                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                              />
                            ) : (
                              <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center">
                                <Coins className="h-3 w-3 text-muted-foreground/50" />
                              </div>
                            )}
                            {/* Twitter/X Icon - detect platform from URL */}
                            {position.twitter_url ? (() => {
                              const platformInfo = detectSocialPlatform(position.twitter_url);
                              return (
                                <a 
                                  href={position.twitter_url} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="hover:opacity-80 transition-opacity"
                                  title={platformInfo.label}
                                >
                                  <SocialIcon platform={platformInfo.platform} className="h-3 w-3" />
                                </a>
                              );
                            })() : (
                              <SocialIcon platform="twitter" className="h-3 w-3 opacity-30" />
                            )}
                            {/* Website Icon - detect platform (TikTok, Instagram, etc.) */}
                            {position.website_url ? (() => {
                              const platformInfo = detectSocialPlatform(position.website_url);
                              return (
                                <a 
                                  href={position.website_url} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="hover:opacity-80 transition-opacity"
                                  title={platformInfo.label}
                                >
                                  <SocialIcon platform={platformInfo.platform} className="h-3 w-3" />
                                </a>
                              );
                            })() : (
                              <Globe className="h-3 w-3 text-muted-foreground/30" />
                            )}
                            {/* Telegram Icon - detect platform from URL */}
                            {position.telegram_url ? (() => {
                              const platformInfo = detectSocialPlatform(position.telegram_url);
                              return (
                                <a 
                                  href={position.telegram_url} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="hover:opacity-80 transition-opacity"
                                  title={platformInfo.label}
                                >
                                  <SocialIcon platform={platformInfo.platform} className="h-3 w-3" />
                                </a>
                              );
                            })() : (
                              <Send className="h-3 w-3 text-muted-foreground/30" />
                            )}
                          </div>
                        </TableCell>
                      <TableCell className="px-2 py-1">
                        <div>
                          <div className="flex items-center gap-1 flex-wrap">
                            <a
                              href={`https://dexscreener.com/solana/${position.token_mint}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-mono text-xs hover:text-primary cursor-pointer flex items-center gap-1"
                              title={`View on DexScreener: ${position.token_mint}`}
                            >
                              {position.token_symbol || position.token_mint.slice(0, 8) + '...'}
                              <ArrowUpRight className="h-3 w-3 opacity-50" />
                            </a>
                            {/* Volume/Price Surge Indicators */}
                            {(() => {
                              const md = marketData[position.token_mint];
                              if (!md) return null;
                              
                              // Volume surge: 5m volume > 2x hourly average
                              const hasVolumeSurge = md.volumeSurgeRatio && md.volumeSurgeRatio > 2;
                              const hasVolumeSpike = md.volumeSurgeRatio && md.volumeSurgeRatio > 5;
                              
                              // Price momentum: significant 5m or 1h change
                              const priceUp5m = (md.priceChange5m || 0) > 5; // >5% up in 5m
                              const priceDown5m = (md.priceChange5m || 0) < -5; // >5% down in 5m
                              const priceUp1h = (md.priceChange1h || 0) > 15; // >15% up in 1h
                              const priceDown1h = (md.priceChange1h || 0) < -15; // >15% down in 1h
                              
                              // Determine if high volume is bullish or bearish based on price action
                              const isPriceDumping = priceDown5m || priceDown1h || (md.priceChange5m || 0) < -2;
                              const isPricePumping = priceUp5m || priceUp1h || (md.priceChange5m || 0) > 2;
                              
                              // Context-aware volume labels
                              const getVolumeLabel = (ratio: number, isSpikeLevel: boolean) => {
                                if (isPriceDumping) {
                                  return isSpikeLevel ? 'Sell Pressure!' : 'Sell Volume';
                                } else if (isPricePumping) {
                                  return isSpikeLevel ? 'Buy Surge!' : 'Buy Volume';
                                }
                                return isSpikeLevel ? 'Volume Spike!' : 'High Volume';
                              };
                              
                              return (
                                <>
                                  {/* Volume Spike Indicator - context aware */}
                                  {hasVolumeSpike && (
                                    <span 
                                      className={`inline-flex items-center gap-0.5 px-1 py-0 text-[9px] font-bold rounded animate-pulse ${
                                        isPriceDumping 
                                          ? 'text-red-400 bg-red-500/20 border border-red-500/40' 
                                          : isPricePumping
                                            ? 'text-green-400 bg-green-500/20 border border-green-500/40'
                                            : 'text-yellow-400 bg-yellow-500/20 border border-yellow-500/40'
                                      }`}
                                      title={`${getVolumeLabel(md.volumeSurgeRatio!, true)} ${md.volumeSurgeRatio?.toFixed(1)}x avg (5m: $${(md.volume5m || 0).toLocaleString()})`}
                                    >
                                      <BarChart3 className="h-2 w-2" />
                                      {md.volumeSurgeRatio?.toFixed(0)}x
                                    </span>
                                  )}
                                  {hasVolumeSurge && !hasVolumeSpike && (
                                    <span 
                                      className={`inline-flex items-center gap-0.5 px-1 py-0 text-[9px] font-medium rounded ${
                                        isPriceDumping 
                                          ? 'text-red-400 bg-red-500/20 border border-red-500/40' 
                                          : isPricePumping
                                            ? 'text-green-400 bg-green-500/20 border border-green-500/40'
                                            : 'text-blue-400 bg-blue-500/20 border border-blue-500/40'
                                      }`}
                                      title={`${getVolumeLabel(md.volumeSurgeRatio!, false)}: ${md.volumeSurgeRatio?.toFixed(1)}x avg (5m: $${(md.volume5m || 0).toLocaleString()})`}
                                    >
                                      <BarChart3 className="h-2 w-2" />
                                    </span>
                                  )}
                                  {/* Price Movement Indicator */}
                                  {priceUp5m && (
                                    <span 
                                      className="inline-flex items-center gap-0.5 text-green-500"
                                      title={`+${md.priceChange5m?.toFixed(1)}% (5m)`}
                                    >
                                      <TrendingUp className="h-3 w-3" />
                                    </span>
                                  )}
                                  {priceDown5m && (
                                    <span 
                                      className="inline-flex items-center gap-0.5 text-red-500"
                                      title={`${md.priceChange5m?.toFixed(1)}% (5m)`}
                                    >
                                      <TrendingDown className="h-3 w-3" />
                                    </span>
                                  )}
                                  {!priceUp5m && !priceDown5m && priceUp1h && (
                                    <span 
                                      className="inline-flex items-center gap-0.5 text-green-400/70"
                                      title={`+${md.priceChange1h?.toFixed(1)}% (1h)`}
                                    >
                                      <TrendingUp className="h-2.5 w-2.5" />
                                    </span>
                                  )}
                                  {!priceUp5m && !priceDown5m && priceDown1h && (
                                    <span 
                                      className="inline-flex items-center gap-0.5 text-red-400/70"
                                      title={`${md.priceChange1h?.toFixed(1)}% (1h)`}
                                    >
                                      <TrendingDown className="h-2.5 w-2.5" />
                                    </span>
                                  )}
                                </>
                              );
                            })()}
                            {isFromRebuy && (
                              <Badge variant="secondary" className="text-[9px] px-1 py-0 gap-0.5">
                                <RotateCcw className="h-2 w-2" />
                                REBUY
                              </Badge>
                            )}
                            {/* DEX Paid Status Badges */}
                            {(position.dex_paid_status?.hasDexPaid || position.dex_paid_status?.hasPaidProfile) && (
                              <Badge className="text-[9px] px-1 py-0 gap-0.5 bg-blue-900 hover:bg-blue-800 text-white">
                                DEX
                              </Badge>
                            )}
                            {position.dex_paid_status?.activeBoosts > 0 && (
                              <Badge className="text-[9px] px-1 py-0 gap-0.5 bg-orange-500 hover:bg-orange-600">
                                <Rocket className="h-2 w-2" />
                                x{position.dex_paid_status.activeBoosts}
                              </Badge>
                            )}
                            {(position.dex_paid_status?.hasAds || position.dex_paid_status?.hasActiveAds) && (
                              <Badge className="text-[9px] px-1 py-0 gap-0.5 bg-purple-600 hover:bg-purple-700">
                                <Megaphone className="h-2 w-2" />
                                ADS
                              </Badge>
                            )}
                            {position.dex_paid_status?.hasCTO && (
                              <Badge className="text-[9px] px-1 py-0 gap-0.5 bg-yellow-700 hover:bg-yellow-600 text-white">
                                CTO
                              </Badge>
                            )}
                          </div>
                          <button
                            onClick={() => copyToClipboard(position.token_mint, 'Token address')}
                            className="text-[10px] text-muted-foreground hover:text-primary flex items-center gap-1"
                          >
                            {position.token_mint.slice(0, 6)}...{position.token_mint.slice(-4)}
                            <Copy className="h-2 w-2 opacity-50" />
                          </button>
                          <div className="text-[10px] text-muted-foreground">
                            ${typeof effectiveEntryPrice === 'number' && Number.isFinite(effectiveEntryPrice)
                              ? effectiveEntryPrice.toFixed(8)
                              : '-'}
                          </div>
                          <a
                            href={`https://trade.padre.gg/trade/solana/${position.token_mint}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block hover:opacity-80 transition-opacity"
                            title="Terminal"
                          >
                            <img src="https://trade.padre.gg/logo.svg" alt="Padre Terminal" className="w-full h-auto max-h-6" />
                          </a>
                        </div>
                      </TableCell>
                      <TableCell className="px-2 py-1">
                        <div className="font-medium text-xs">${position.buy_amount_usd?.toFixed(2) || '-'}</div>
                        {effectiveQuantityTokens !== null && (
                          <div className="text-[10px] text-muted-foreground">
                            {effectiveQuantityTokens.toLocaleString(undefined, { maximumFractionDigits: 2 })} tokens
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="px-2 py-1">
                        {hasCurrentPrice ? (
                          <div>
                            {currentValue !== null ? (
                              <div>
                                <span
                                  className={`text-xs ${
                                    pnlUsd !== null && pnlUsd >= 0
                                      ? 'text-green-500 font-medium'
                                      : 'text-red-500 font-medium'
                                  }`}
                                >
                                  ${currentValue.toFixed(2)}
                                </span>
                                {pnlUsd !== null && (
                                  <div className={`text-[10px] ${pnlUsd >= 0 ? 'text-green-500' : 'text-red-500'}`}> 
                                    {pnlUsd >= 0 ? '+' : ''}${pnlUsd.toFixed(2)} ({pnlPercent?.toFixed(1)}%)
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-muted-foreground text-xs">-</span>
                            )}
                            <div className="flex items-center gap-1">
                              <span className="text-[10px] text-muted-foreground">
                                {`Price: $${currentPrice.toFixed(8)}`}
                              </span>
                              {bondingCurveData[position.token_mint] !== undefined && 
                               bondingCurveData[position.token_mint] < 100 && 
                               position.is_on_curve !== false ? (
                                <span 
                                  className="inline-flex items-center justify-center w-8 h-4 text-[9px] font-bold text-orange-400 bg-orange-500/20 border border-orange-500/40 rounded-full"
                                  title={`${bondingCurveData[position.token_mint].toFixed(0)}% on bonding curve`}
                                >
                                  {bondingCurveData[position.token_mint].toFixed(0)}%
                                </span>
                              ) : position.is_on_curve === false ? (
                                <span title="Token has graduated from bonding curve">
                                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                                </span>
                              ) : null}
                            </div>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-xs">-</span>
                        )}
                      </TableCell>
                      <TableCell className="px-2 py-1">
                        <div className="flex items-center gap-1">
                          <div>
                            {position.target_multiplier === 0 ? (
                              <>
                                <span className="font-medium text-xs text-orange-400">Auto-sell disabled</span>
                                <div className="text-muted-foreground text-[10px]">
                                  Manual sell only
                                </div>
                              </>
                            ) : (
                              <>
                                <span className="font-medium text-xs">${targetValue.toFixed(2)}</span>
                                <span className="text-muted-foreground text-[10px] ml-1">({position.target_multiplier}x)</span>
                                <div className="text-green-500 text-[10px]">
                                  +${targetProfit.toFixed(2)} profit
                                </div>
                                {position.target_price_usd && (
                                  <div className="text-[10px] text-muted-foreground">
                                    Target: ${position.target_price_usd.toFixed(8)}
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                          {position.status === 'holding' && position.buy_price_usd && (
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-5 w-5">
                                  <Pencil className="h-2.5 w-2.5" />
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-56 p-2" align="start">
                                <div className="space-y-1 max-h-64 overflow-y-auto">
                                  <p className="text-xs text-muted-foreground mb-2">Change target:</p>
                                  <Button
                                    variant={position.target_multiplier === 0 ? "default" : "ghost"}
                                    size="sm"
                                    className="w-full justify-between text-orange-400"
                                    onClick={() => handleUpdateTarget(position.id, 0, position.buy_price_usd!)}
                                  >
                                    <span>Disabled</span>
                                    <span className="text-muted-foreground text-xs">No auto-sell</span>
                                  </Button>
                                  <Separator className="my-1" />
                                  {[1.25, 1.30, 1.50, 1.75, 2, 2.5, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20, 25, 30, 35, 40, 45, 50, 75, 100, 200, 300, 400, 500, 600, 700, 800, 900].map(mult => (
                                    <Button
                                      key={mult}
                                      variant={position.target_multiplier === mult ? "default" : "ghost"}
                                      size="sm"
                                      className="w-full justify-between"
                                      onClick={() => handleUpdateTarget(position.id, mult, position.buy_price_usd!)}
                                    >
                                      <span>{mult}x</span>
                                      <span className="text-green-500 text-xs">+${(position.buy_amount_usd * (mult - 1)).toFixed(2)}</span>
                                    </Button>
                                  ))}
                                </div>
                              </PopoverContent>
                            </Popover>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="px-2 py-1 w-24">
                        <Progress 
                          value={progress} 
                          className={`h-1.5 ${progress >= 100 ? 'bg-green-500' : progress === 0 && pnlPercent !== null && pnlPercent < 0 ? 'bg-red-500' : ''}`}
                        />
                        <span className={`text-[10px] ${progress === 0 && pnlPercent !== null && pnlPercent < 0 ? 'text-red-500' : 'text-muted-foreground'}`}>
                          {progress.toFixed(0)}%
                        </span>
                      </TableCell>
                      {/* Sell Now Action - between Progress and Stop-Loss */}
                      <TableCell className="px-2 py-1">
                        {position.status === 'holding' && (
                          <div className="flex flex-col gap-1">
                            <Button
                              size="sm"
                              variant="destructive"
                              className="h-6 px-2 py-0.5 text-xs"
                              onClick={() => {
                                const ticker = position.token_symbol || position.token_mint.slice(0, 8);
                                const selectedFee = positionSellFees[position.id] || '0.0005';
                                if (window.confirm(`Sell ${ticker} now?\n\nPriority Fee: ${selectedFee} SOL\n\nThis will immediately sell your entire position.`)) {
                                  handleForceSell(position.id, parseFloat(selectedFee));
                                }
                              }}
                            >
                              Sell Now
                            </Button>
                            <Select
                              value={positionSellFees[position.id] || '0.0005'}
                              onValueChange={(value) => setPositionSellFees(prev => ({ ...prev, [position.id]: value }))}
                            >
                              <SelectTrigger className="h-5 text-[9px] px-1 w-20">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="0.0001">0.0001 SOL</SelectItem>
                                <SelectItem value="0.0005">0.0005 SOL</SelectItem>
                                <SelectItem value="0.001">0.001 SOL</SelectItem>
                                <SelectItem value="0.0015">0.0015 SOL</SelectItem>
                                <SelectItem value="0.002">0.002 SOL</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                      </TableCell>
                      {/* Dev Trust Rating - 4 cycle button */}
                      <TableCell className="px-2 py-1">
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            className={`h-6 px-2 text-[10px] font-bold transition-colors ${
                              position.dev_trust_rating === 'good' 
                                ? 'bg-green-500 hover:bg-green-600 text-white' 
                                : position.dev_trust_rating === 'danger' 
                                  ? 'bg-red-600 hover:bg-red-700 text-white' 
                                  : position.dev_trust_rating === 'concern' 
                                    ? 'bg-orange-500 hover:bg-orange-600 text-white' 
                                    : 'bg-yellow-500 hover:bg-yellow-600 text-black'
                            }`}
                            onClick={() => handleCycleTrustRating(position)}
                            title="Click to cycle: UNKNOWN → CONCERN → DANGER → GOOD"
                          >
                            {(position.dev_trust_rating || 'unknown').toUpperCase()}
                          </Button>
                          <Button
                            size="sm"
                            variant={position.tracking_locked ? "default" : "outline"}
                            className={`h-6 w-6 p-0 ${position.tracking_locked ? 'bg-purple-600 hover:bg-purple-700' : ''}`}
                            onClick={() => handleToggleTrackingLock(position)}
                            title={position.tracking_locked ? "Locked - data captured to tracking system" : "Click to lock and capture data"}
                          >
                            {position.tracking_locked ? <Lock className="h-3 w-3" /> : <LockOpen className="h-3 w-3" />}
                          </Button>
                        </div>
                      </TableCell>
                      {/* Moonbag Toggle */}
                      <TableCell className="px-2 py-1 text-center">
                        {position.status === 'holding' && (
                          <Switch
                            checked={
                              moonbagEditing[position.id]?.enabled ?? 
                              (position.moon_bag_enabled || false)
                            }
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setMoonbagEditing(prev => ({
                                  ...prev,
                                  [position.id]: { enabled: true, percent: '10' }
                                }));
                              } else {
                                handleMoonbagUpdate(position.id, false, null);
                              }
                            }}
                          />
                        )}
                        {position.moon_bag_quantity_tokens && (
                          <Badge variant="secondary" className="text-[9px] px-1 py-0 mt-1 gap-0.5 bg-purple-500/20 text-purple-400">
                            🌙 ACTIVE
                          </Badge>
                        )}
                      </TableCell>
                      {/* Moonbag Percent Input */}
                      <TableCell className="px-2 py-1">
                        {position.status === 'holding' && (
                          <div className="flex flex-col gap-0.5">
                            {moonbagEditing[position.id]?.enabled || position.moon_bag_enabled ? (
                              <div className="flex items-center gap-1">
                                <Input
                                  type="number"
                                  min="1"
                                  max="50"
                                  className="h-6 w-14 text-[10px] font-mono"
                                  placeholder="10"
                                  value={
                                    moonbagEditing[position.id]?.percent ?? 
                                    (position.moon_bag_percent?.toString() || '10')
                                  }
                                  onChange={(e) => {
                                    setMoonbagEditing(prev => ({
                                      ...prev,
                                      [position.id]: { 
                                        enabled: true, 
                                        percent: e.target.value 
                                      }
                                    }));
                                  }}
                                />
                                <span className="text-[10px] text-muted-foreground">%</span>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-6 px-1.5"
                                  onClick={() => {
                                    const pctVal = parseFloat(moonbagEditing[position.id]?.percent || position.moon_bag_percent?.toString() || '10');
                                    if (pctVal > 0 && pctVal <= 50) {
                                      handleMoonbagUpdate(position.id, true, pctVal);
                                    } else {
                                      toast.error('Moonbag must be 1-50%');
                                    }
                                  }}
                                >
                                  <CheckCircle2 className="h-2.5 w-2.5" />
                                </Button>
                              </div>
                            ) : (
                              <span className="text-[10px] text-muted-foreground">-</span>
                            )}
                          </div>
                        )}
                      </TableCell>
                      {/* Stop-Loss Toggle */}
                      <TableCell className="px-2 py-1 text-center">
                        {position.status === 'holding' && (
                          <Switch
                            checked={
                              emergencyEditing[position.id]?.enabled ?? 
                              (position.emergency_sell_status === 'watching')
                            }
                            onCheckedChange={(checked) => {
                              if (checked) {
                                const entryPrice = position.buy_price_usd || 0;
                                const defaultPrice = entryPrice * 1.05;
                                setEmergencyEditing(prev => ({
                                  ...prev,
                                  [position.id]: { enabled: true, price: defaultPrice.toFixed(10).replace(/\.?0+$/, '') }
                                }));
                              } else {
                                handleEmergencySellUpdate(position.id, false, null);
                              }
                            }}
                          />
                        )}
                      </TableCell>
                      {/* Stop-Loss Price */}
                      <TableCell className="px-2 py-1">
                        {position.status === 'holding' && (
                          <div className="flex flex-col gap-0.5">
                            {emergencyEditing[position.id]?.enabled || position.emergency_sell_status === 'watching' ? (
                              <div className="flex items-center gap-1">
                                <span className="text-[10px] text-muted-foreground">$</span>
                                <Input
                                  type="text"
                                  className="h-6 w-20 text-[10px] font-mono"
                                  placeholder="0.0000001"
                                  value={
                                    emergencyEditing[position.id]?.price ?? 
                                    (position.emergency_sell_price_usd?.toString() || '')
                                  }
                                  onChange={(e) => {
                                    setEmergencyEditing(prev => ({
                                      ...prev,
                                      [position.id]: { 
                                        enabled: true, 
                                        price: e.target.value 
                                      }
                                    }));
                                  }}
                                />
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-6 px-1.5"
                                  onClick={() => {
                                    const priceVal = parseFloat(emergencyEditing[position.id]?.price || position.emergency_sell_price_usd?.toString() || '0');
                                    if (priceVal > 0) {
                                      handleEmergencySellUpdate(position.id, true, priceVal);
                                    } else {
                                      toast.error('Enter a valid stop-loss price');
                                    }
                                  }}
                                >
                                  <CheckCircle2 className="h-2.5 w-2.5" />
                                </Button>
                              </div>
                            ) : (
                              <span className="text-[10px] text-muted-foreground">-</span>
                            )}
                            {position.emergency_sell_status === 'watching' && !emergencyEditing[position.id] && (
                              <Badge variant="destructive" className="text-[9px] px-1 py-0 w-fit">
                                <AlertTriangle className="h-2 w-2 mr-0.5" />
                                WATCHING
                              </Badge>
                            )}
                          </div>
                        )}
                      </TableCell>
                      
                      {/* Rebuy Columns - only show if any position has rebuy */}
                      {hasActiveRebuy && (
                        <>
                      {/* Rebuy Toggle */}
                      <TableCell className="px-2 py-1 text-center">
                        {position.status === 'holding' && (
                          <Switch
                            checked={
                              rebuyEditing[position.id]?.enabled ?? 
                              (position.rebuy_enabled || false)
                            }
                            onCheckedChange={(checked) => {
                              if (checked) {
                                const entryPrice = position.buy_price_usd || 0;
                                const defaultPriceHigh = entryPrice * 1.10;
                                const defaultPriceLow = entryPrice * 0.90;
                                const defaultAmount = position.buy_amount_usd || 10;
                                setRebuyEditing(prev => ({
                                  ...prev,
                                  [position.id]: { 
                                    enabled: true, 
                                    priceHigh: defaultPriceHigh.toFixed(10).replace(/\.?0+$/, ''),
                                    priceLow: defaultPriceLow.toFixed(10).replace(/\.?0+$/, ''),
                                    amount: defaultAmount.toFixed(2),
                                    targetMultiplier: position.rebuy_target_multiplier || 2,
                                    loopEnabled: position.rebuy_loop_enabled || false
                                  }
                                }));
                              } else {
                                handleUpdateRebuySettings(position.id, false, null, null, null);
                              }
                            }}
                          />
                        )}
                      </TableCell>
                      
                      {/* Rebuy Low Price */}
                      <TableCell className="px-2 py-1">
                        {position.status === 'holding' && (
                          <div className="flex flex-col">
                            {(rebuyEditing[position.id]?.enabled || position.rebuy_enabled) ? (
                              <div className="flex items-center gap-1">
                                <span className="text-[10px] text-muted-foreground">$</span>
                                <Input
                                  type="text"
                                  className="h-6 w-16 text-[10px] font-mono"
                                  placeholder="Low"
                                  value={
                                    rebuyEditing[position.id]?.priceLow ?? 
                                    (position.rebuy_price_low_usd?.toString() || '')
                                  }
                                  onChange={(e) => {
                                    setRebuyEditing(prev => ({
                                      ...prev,
                                      [position.id]: { 
                                        enabled: true, 
                                        priceLow: e.target.value,
                                        priceHigh: prev[position.id]?.priceHigh || position.rebuy_price_high_usd?.toString() || '',
                                        amount: prev[position.id]?.amount || position.rebuy_amount_usd?.toString() || position.buy_amount_usd?.toFixed(2) || '10',
                                        targetMultiplier: prev[position.id]?.targetMultiplier || position.rebuy_target_multiplier || 2,
                                        loopEnabled: prev[position.id]?.loopEnabled ?? position.rebuy_loop_enabled ?? false
                                      }
                                    }));
                                  }}
                                />
                              </div>
                            ) : (
                              <span className="text-[10px] text-muted-foreground">-</span>
                            )}
                          </div>
                        )}
                      </TableCell>
                      
                      {/* Rebuy High Price Input */}
                      <TableCell>
                        {position.status === 'holding' && (
                          <div className="flex flex-col gap-1">
                            {(rebuyEditing[position.id]?.enabled || position.rebuy_enabled) ? (
                              <div className="flex items-center gap-1">
                                <span className="text-xs text-muted-foreground">$</span>
                                <Input
                                  type="text"
                                  className="h-7 w-24 text-xs font-mono"
                                  placeholder="High"
                                  value={
                                    rebuyEditing[position.id]?.priceHigh ?? 
                                    (position.rebuy_price_high_usd?.toString() || '')
                                  }
                                  onChange={(e) => {
                                    setRebuyEditing(prev => ({
                                      ...prev,
                                      [position.id]: { 
                                        enabled: true, 
                                        priceHigh: e.target.value,
                                        priceLow: prev[position.id]?.priceLow || position.rebuy_price_low_usd?.toString() || '',
                                        amount: prev[position.id]?.amount || position.rebuy_amount_usd?.toString() || position.buy_amount_usd?.toFixed(2) || '10',
                                        targetMultiplier: prev[position.id]?.targetMultiplier || position.rebuy_target_multiplier || 2,
                                        loopEnabled: prev[position.id]?.loopEnabled ?? position.rebuy_loop_enabled ?? false
                                      }
                                    }));
                                  }}
                                />
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">-</span>
                            )}
                          </div>
                        )}
                      </TableCell>
                      
                      {/* Rebuy Amount Input + Save */}
                      <TableCell>
                        {position.status === 'holding' && (
                          <div className="flex flex-col gap-1">
                            {(rebuyEditing[position.id]?.enabled || position.rebuy_enabled) ? (
                              <div className="flex items-center gap-1">
                                <span className="text-xs text-muted-foreground">$</span>
                                <Input
                                  type="text"
                                  className="h-7 w-16 text-xs font-mono"
                                  placeholder="10"
                                  value={
                                    rebuyEditing[position.id]?.amount ?? 
                                    (position.rebuy_amount_usd?.toString() || '')
                                  }
                                  onChange={(e) => {
                                    setRebuyEditing(prev => ({
                                      ...prev,
                                      [position.id]: { 
                                        enabled: true, 
                                        priceHigh: prev[position.id]?.priceHigh || position.rebuy_price_high_usd?.toString() || '',
                                        priceLow: prev[position.id]?.priceLow || position.rebuy_price_low_usd?.toString() || '',
                                        amount: e.target.value,
                                        targetMultiplier: prev[position.id]?.targetMultiplier || position.rebuy_target_multiplier || 2,
                                        loopEnabled: prev[position.id]?.loopEnabled ?? position.rebuy_loop_enabled ?? false
                                      }
                                    }));
                                  }}
                                />
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 px-2"
                                  onClick={() => {
                                    const priceHighVal = parseFloat(rebuyEditing[position.id]?.priceHigh || position.rebuy_price_high_usd?.toString() || '0');
                                    const priceLowVal = parseFloat(rebuyEditing[position.id]?.priceLow || position.rebuy_price_low_usd?.toString() || '0');
                                    const amountVal = parseFloat(rebuyEditing[position.id]?.amount || position.rebuy_amount_usd?.toString() || '0');
                                    const targetVal = rebuyEditing[position.id]?.targetMultiplier || position.rebuy_target_multiplier || 2;
                                    const loopVal = rebuyEditing[position.id]?.loopEnabled ?? position.rebuy_loop_enabled ?? false;
                                    if (priceHighVal > 0 && priceLowVal > 0 && amountVal > 0) {
                                      handleUpdateRebuySettings(position.id, true, priceHighVal, priceLowVal, amountVal, targetVal, loopVal);
                                    } else {
                                      toast.error('Enter valid rebuy price range and amount');
                                    }
                                  }}
                                >
                                  <CheckCircle2 className="h-3 w-3" />
                                </Button>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">-</span>
                            )}
                            {position.rebuy_enabled && !rebuyEditing[position.id] && (
                              <Badge variant="secondary" className="text-[10px] w-fit">
                                <RotateCcw className="h-2 w-2 mr-1" />
                                READY
                              </Badge>
                            )}
                          </div>
                        )}
                      </TableCell>
                      
                      {/* Rebuy Target Selector + Loop */}
                      <TableCell>
                        {position.status === 'holding' && (rebuyEditing[position.id]?.enabled || position.rebuy_enabled) && (
                          <div className="flex items-center gap-2">
                            <Select
                              value={(() => {
                                const raw = rebuyEditing[position.id]?.targetMultiplier ?? position.rebuy_target_multiplier ?? 2;
                                // Normalize to match SelectItem values exactly
                                const num = Number(raw);
                                if (num === 1.25) return "1.25";
                                if (num === 1.3) return "1.30";
                                if (num === 1.5) return "1.50";
                                if (num === 1.75) return "1.75";
                                if (num === 2) return "2";
                                if (num === 2.5) return "2.5";
                                if (num === 3) return "3";
                                if (num === 4) return "4";
                                if (num === 5) return "5";
                                if (num === 6) return "6";
                                if (num === 7) return "7";
                                if (num === 8) return "8";
                                if (num === 9) return "9";
                                if (num === 10) return "10";
                                if (num === 15) return "15";
                                if (num === 20) return "20";
                                if (num === 25) return "25";
                                return "2"; // Default fallback
                              })()}
                              onValueChange={(value) => {
                                setRebuyEditing(prev => ({
                                  ...prev,
                                  [position.id]: {
                                    enabled: true,
                                    priceHigh: prev[position.id]?.priceHigh || position.rebuy_price_high_usd?.toString() || '',
                                    priceLow: prev[position.id]?.priceLow || position.rebuy_price_low_usd?.toString() || '',
                                    amount: prev[position.id]?.amount || position.rebuy_amount_usd?.toString() || position.buy_amount_usd?.toFixed(2) || '10',
                                    targetMultiplier: parseFloat(value),
                                    loopEnabled: prev[position.id]?.loopEnabled ?? position.rebuy_loop_enabled ?? false
                                  }
                                }));
                              }}
                            >
                              <SelectTrigger className="h-7 w-20 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent className="max-h-64 overflow-y-auto">
                                <SelectItem value="1.25">1.25x</SelectItem>
                                <SelectItem value="1.30">1.30x</SelectItem>
                                <SelectItem value="1.50">1.50x</SelectItem>
                                <SelectItem value="1.75">1.75x</SelectItem>
                                <SelectItem value="2">2x</SelectItem>
                                <SelectItem value="2.5">2.5x</SelectItem>
                                <SelectItem value="3">3x</SelectItem>
                                <SelectItem value="4">4x</SelectItem>
                                <SelectItem value="5">5x</SelectItem>
                                <SelectItem value="6">6x</SelectItem>
                                <SelectItem value="7">7x</SelectItem>
                                <SelectItem value="8">8x</SelectItem>
                                <SelectItem value="9">9x</SelectItem>
                                <SelectItem value="10">10x</SelectItem>
                                <SelectItem value="15">15x</SelectItem>
                                <SelectItem value="20">20x</SelectItem>
                                <SelectItem value="25">25x</SelectItem>
                                <SelectItem value="50">50x</SelectItem>
                                <SelectItem value="100">100x</SelectItem>
                                <SelectItem value="200">200x</SelectItem>
                                <SelectItem value="300">300x</SelectItem>
                                <SelectItem value="400">400x</SelectItem>
                                <SelectItem value="500">500x</SelectItem>
                                <SelectItem value="600">600x</SelectItem>
                                <SelectItem value="700">700x</SelectItem>
                                <SelectItem value="800">800x</SelectItem>
                                <SelectItem value="900">900x</SelectItem>
                              </SelectContent>
                            </Select>
                            {/* Loop Mode Toggle */}
                            <div className="flex items-center gap-1">
                              <Switch
                                checked={rebuyEditing[position.id]?.loopEnabled ?? position.rebuy_loop_enabled ?? false}
                                onCheckedChange={(checked) => {
                                  setRebuyEditing(prev => ({
                                    ...prev,
                                    [position.id]: {
                                      enabled: true,
                                      priceHigh: prev[position.id]?.priceHigh || position.rebuy_price_high_usd?.toString() || '',
                                      priceLow: prev[position.id]?.priceLow || position.rebuy_price_low_usd?.toString() || '',
                                      amount: prev[position.id]?.amount || position.rebuy_amount_usd?.toString() || position.buy_amount_usd?.toFixed(2) || '10',
                                      targetMultiplier: prev[position.id]?.targetMultiplier || position.rebuy_target_multiplier || 2,
                                      loopEnabled: checked
                                    }
                                  }));
                                }}
                              />
                              <span className="text-[9px] text-muted-foreground">♻️</span>
                            </div>
                            {(rebuyEditing[position.id]?.loopEnabled || position.rebuy_loop_enabled) && (
                              <Badge variant="secondary" className="text-[9px] px-1 py-0 gap-0.5">
                                ♻️ LOOP
                              </Badge>
                            )}
                          </div>
                        )}
                      </TableCell>
                        </>
                      )}
                      
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          {position.is_test_position && (
                            <Badge variant="outline" className="bg-purple-500/10 text-purple-500 border-purple-500/30 text-[9px] px-1 py-0 gap-0.5">
                              <FlaskConical className="h-2.5 w-2.5" />
                              TEST
                            </Badge>
                          )}
                          {getStatusBadge(position.status)}
                        </div>
                      </TableCell>
                      
                      {/* Delete Column */}
                      <TableCell className="px-2 py-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                          onClick={() => handleDeletePosition(position.id, position.token_symbol)}
                          title="Delete entry from database"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            
            {/* Chain Sync Section */}
            <div className="mt-4 pt-4 border-t border-border/50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => handleSyncWithChain(true)}
                  disabled={isSyncingWithChain}
                >
                  {isSyncingWithChain ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                  Check Sync
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  className="gap-2"
                  onClick={() => {
                    if (window.confirm(
                      'This will mark positions as "sold" if their tokens are no longer in the wallet on-chain.\n\n' +
                      'Use this after manual sells in Phantom or when the system failed to track a sale.\n\n' +
                      'Continue?'
                    )) {
                      handleSyncWithChain(false);
                    }
                  }}
                  disabled={isSyncingWithChain}
                >
                  {isSyncingWithChain ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Activity className="h-3.5 w-3.5" />
                  )}
                  Sync & Clean
                </Button>
              </div>
              {lastSyncResult && (
                <div className="text-xs text-muted-foreground flex items-center gap-2">
                  <span>
                    Last sync: {lastSyncResult.validCount} valid, {lastSyncResult.phantomCount} phantom
                    {lastSyncResult.cleanedCount > 0 && `, ${lastSyncResult.cleanedCount} cleaned`}
                  </span>
                  <span className="text-[10px]">
                    ({new Date(lastSyncResult.timestamp).toLocaleTimeString()})
                  </span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Completed Flips Section - Collapsed by default, no live price fetching */}
      {positions.filter(p => p.status === 'sold').length > 0 && (
        <Collapsible className="mb-6">
          <CollapsibleTrigger asChild>
            <Button variant="outline" className="w-full justify-between mb-2">
              <span className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                Completed Flips ({positions.filter(p => p.status === 'sold').length})
              </span>
              <ChevronDown className="h-4 w-4" />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <Card className="border-green-500/20">
              <CardContent className="p-3">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead compact>Token</TableHead>
                      <TableHead compact>Invested</TableHead>
                      <TableHead compact>Sold For</TableHead>
                      <TableHead compact>P/L</TableHead>
                      <TableHead compact>Sold At</TableHead>
                      <TableHead compact>Rating</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {positions
                      .filter(p => p.status === 'sold')
                      .sort((a, b) => new Date(b.sell_executed_at || b.created_at).getTime() - new Date(a.sell_executed_at || a.created_at).getTime())
                      .slice(0, 50)
                      .map(position => {
                        const soldFor = (position.sell_price_usd || 0) * (position.quantity_tokens || 0);
                        const profitLoss = position.profit_usd || (soldFor - position.buy_amount_usd);
                        const isProfit = profitLoss >= 0;
                        
                        return (
                          <TableRow key={position.id} className="hover:bg-muted/30">
                            {/* Token */}
                            <TableCell compact>
                              <div className="flex items-center gap-2">
                                {position.token_image && (
                                  <img 
                                    src={position.token_image} 
                                    alt="" 
                                    className="h-5 w-5 rounded-full"
                                    onError={(e) => (e.currentTarget.style.display = 'none')}
                                  />
                                )}
                                <div className="flex flex-col">
                                  <span className="font-medium text-xs">{position.token_symbol || 'Unknown'}</span>
                                  <code className="text-[9px] text-muted-foreground font-mono">
                                    {position.token_mint.slice(0, 6)}...
                                  </code>
                                </div>
                              </div>
                            </TableCell>
                            
                            {/* Invested */}
                            <TableCell compact>
                              <span className="font-mono text-xs">${position.buy_amount_usd.toFixed(2)}</span>
                            </TableCell>
                            
                            {/* Sold For */}
                            <TableCell compact>
                              <span className="font-mono text-xs">${soldFor.toFixed(2)}</span>
                            </TableCell>
                            
                            {/* P/L */}
                            <TableCell compact>
                              <span className={`font-mono text-xs font-medium ${isProfit ? 'text-green-500' : 'text-red-500'}`}>
                                {isProfit ? '+' : ''}{profitLoss.toFixed(2)}
                              </span>
                            </TableCell>
                            
                            {/* Sold At */}
                            <TableCell compact>
                              <span className="text-[10px] text-muted-foreground">
                                {position.sell_executed_at 
                                  ? new Date(position.sell_executed_at).toLocaleString('en-US', { 
                                      month: 'short', 
                                      day: 'numeric',
                                      hour: 'numeric', 
                                      minute: '2-digit',
                                      hour12: true 
                                    })
                                  : '-'
                                }
                              </span>
                            </TableCell>
                            
                            {/* Rating Button */}
                            <TableCell compact>
                              <Button
                                size="sm"
                                className={`h-5 px-1.5 text-[9px] font-bold transition-colors ${
                                  position.dev_trust_rating === 'unknown' || !position.dev_trust_rating
                                    ? 'bg-yellow-500 hover:bg-yellow-600 text-black'
                                    : position.dev_trust_rating === 'concern'
                                    ? 'bg-orange-500 hover:bg-orange-600 text-white'
                                    : position.dev_trust_rating === 'danger'
                                    ? 'bg-red-600 hover:bg-red-700 text-white'
                                    : 'bg-green-500 hover:bg-green-600 text-white'
                                }`}
                                onClick={() => handleCycleTrustRating(position)}
                              >
                                {(position.dev_trust_rating || 'unknown').toUpperCase()}
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Telegram Notification Settings */}
      <div className="mb-6">
        <FlipItNotificationSettings />
      </div>

      {/* Tweet Templates Section - moved below Active Flips */}
      <Collapsible className="mb-6">
        <CollapsibleTrigger asChild>
          <Button variant="outline" className="w-full justify-between mb-2">
            <span className="flex items-center gap-2">
              <SocialIcon platform="twitter" className="h-4 w-4" />
              Tweet Templates
            </span>
            <ChevronDown className="h-4 w-4" />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <TweetTemplateEditor />
        </CollapsibleContent>
      </Collapsible>

      {/* Fee Calculator Widget - moved under Active Flips */}
      {buyAmount && parseFloat(buyAmount) > 0 && solPrice && (
        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="fee-calculator" className="border rounded-lg">
            <AccordionTrigger className="px-4 py-3 hover:no-underline">
              <span className="flex items-center gap-2 text-sm font-medium">
                <DollarSign className="h-4 w-4" />
                Fee Calculator
              </span>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4">
              <FlipItFeeCalculator
                buyAmountSol={parseFloat(buyAmount) || 0}
                solPrice={solPrice}
                priorityFeeMode={priorityFeeMode}
                slippageBps={slippageBps}
                targetMultiplier={targetMultiplier}
              />
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      )}

      {/* Completed Positions section removed for performance */}

      {/* Private Key Export Modal */}
      <Dialog open={showKeysModal} onOpenChange={handleCloseKeysModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              Export Private Key
            </DialogTitle>
            <DialogDescription>
              Export your wallet's private key to import into Phantom or another wallet.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Security Warning */}
            <div className="flex items-start gap-3 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
              <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-semibold text-destructive">Security Warning</p>
                <p className="text-muted-foreground mt-1">
                  Never share your private key with anyone. Anyone with this key has full control over your wallet and funds.
                </p>
              </div>
            </div>

            {/* Wallet Address */}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Wallet Address</Label>
              <code className="block text-sm font-mono p-2 bg-muted rounded break-all">
                {wallets.find(w => w.id === selectedWallet)?.pubkey}
              </code>
            </div>

            {/* Private Key */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Private Key (Base58)</Label>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-xs"
                  onClick={() => setShowPrivateKey(!showPrivateKey)}
                >
                  {showPrivateKey ? (
                    <>
                      <EyeOff className="h-3 w-3 mr-1" />
                      Hide
                    </>
                  ) : (
                    <>
                      <Eye className="h-3 w-3 mr-1" />
                      Show
                    </>
                  )}
                </Button>
              </div>
              <div className="relative">
                <code className="block text-sm font-mono p-2 bg-muted rounded break-all min-h-[60px]">
                  {showPrivateKey ? decryptedPrivateKey : '••••••••••••••••••••••••••••••••••••••••••••'}
                </code>
                {decryptedPrivateKey && (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="absolute top-2 right-2 h-7"
                    onClick={() => {
                      copyToClipboard(decryptedPrivateKey, 'Private Key');
                    }}
                  >
                    <Copy className="h-3 w-3 mr-1" />
                    Copy
                  </Button>
                )}
              </div>
            </div>

            {/* Phantom Import Instructions */}
            <div className="space-y-2 p-3 rounded-lg bg-muted/50 border">
              <p className="text-sm font-medium">Import to Phantom:</p>
              <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                <li>Open Phantom wallet extension</li>
                <li>Click the menu icon → Add/Connect Wallet</li>
                <li>Select "Import Private Key"</li>
                <li>Paste your private key and click Import</li>
              </ol>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleCloseKeysModal}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Price Confirmation Dialog - Phase 3: UI confirmation for price deviation */}
      <Dialog open={priceConfirmation.show} onOpenChange={(open) => !open && setPriceConfirmation(prev => ({ ...prev, show: false, onConfirm: null }))}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-500">
              <AlertTriangle className="h-5 w-5" />
              Price Changed Significantly
            </DialogTitle>
            <DialogDescription>
              The executable price differs from what was displayed. Review before proceeding.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 rounded-lg bg-muted">
                <p className="text-xs text-muted-foreground">Displayed Price</p>
                <p className="text-lg font-mono font-semibold">
                  ${priceConfirmation.displayedPrice?.toFixed(10).replace(/\.?0+$/, '') || 'N/A'}
                </p>
              </div>
              <div className="p-3 rounded-lg bg-muted border-2 border-amber-500/50">
                <p className="text-xs text-muted-foreground">Executable Price</p>
                <p className="text-lg font-mono font-semibold">
                  ${priceConfirmation.executablePrice?.toFixed(10).replace(/\.?0+$/, '') || 'N/A'}
                </p>
              </div>
            </div>
            
            <div className={`text-center text-lg font-bold ${priceConfirmation.deviationPct > 0 ? 'text-red-500' : 'text-green-500'}`}>
              {priceConfirmation.deviationPct > 0 ? '+' : ''}{priceConfirmation.deviationPct.toFixed(2)}% deviation
            </div>
            
            <div className="text-xs text-muted-foreground space-y-1">
              <p>Venue: <span className="font-mono">{priceConfirmation.venue}</span></p>
              <p>Source: <span className="font-mono">{priceConfirmation.source}</span></p>
              <p>Confidence: <Badge variant={priceConfirmation.confidence === 'high' ? 'default' : 'secondary'}>{priceConfirmation.confidence}</Badge></p>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setPriceConfirmation(prev => ({ ...prev, show: false, onConfirm: null }))}>
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={() => {
                setPriceConfirmation(prev => ({ ...prev, show: false }));
                priceConfirmation.onConfirm?.();
              }}
            >
              Continue Anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
