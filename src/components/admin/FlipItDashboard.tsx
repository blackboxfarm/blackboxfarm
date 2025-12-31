import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Flame, RefreshCw, TrendingUp, DollarSign, Wallet, Clock, CheckCircle2, XCircle, Loader2, Plus, Copy, ArrowUpRight, Key, Settings, Zap, Activity, Radio, Pencil, ChevronDown, Coins, Eye, EyeOff, RotateCcw, AlertTriangle, Twitter, Trash2, Globe, Send, Rocket, Megaphone, Users, Shield, ClipboardPaste } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useSolPrice } from '@/hooks/useSolPrice';
import { FlipItFeeCalculator } from './flipit/FlipItFeeCalculator';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { WalletTokenManager } from '@/components/blackbox/WalletTokenManager';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import TweetTemplateEditor from './TweetTemplateEditor';
import { usePreviewSuperAdmin } from '@/hooks/usePreviewSuperAdmin';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';

interface DexPaidStatus {
  tokenMint: string;
  activeBoosts: number;
  hasPaidProfile: boolean;
  hasActiveAds: boolean;
  hasCTO: boolean;
  orders: Array<{
    type: string;
    status: string;
    paymentTimestamp?: number;
  }>;
  checkedAt: string;
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
  // DEX paid status
  dex_paid_status: DexPaidStatus | null;
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
  lastFetched: string | null;
  source: 'token-metadata' | 'raydium-quote' | 'dexscreener' | null;
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
  const [buyAmountMode, setBuyAmountMode] = useState<'usd' | 'sol'>('sol');
  const [targetMultiplier, setTargetMultiplier] = useState(2);
  const [isLoading, setIsLoading] = useState(false);
  const [isFlipping, setIsFlipping] = useState(false);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [currentPrices, setCurrentPrices] = useState<Record<string, number>>({});
  const [bondingCurveData, setBondingCurveData] = useState<Record<string, number>>({});
  const [tokenImages, setTokenImages] = useState<Record<string, string>>({});
  const [isGeneratingWallet, setIsGeneratingWallet] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [isRefreshingBalance, setIsRefreshingBalance] = useState(false);
  
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
    lastFetched: null,
    source: null
  });
  const [isLoadingInputToken, setIsLoadingInputToken] = useState(false);
  const inputFetchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // SOL price for USD conversion
  const { price: solPrice, isLoading: solPriceLoading } = useSolPrice();
  
  // Settings
  const [slippageBps, setSlippageBps] = useState(500); // 5% default
  const [priorityFeeMode, setPriorityFeeMode] = useState<'low' | 'medium' | 'high' | 'turbo' | 'ultra'>('medium');
  const [autoMonitorEnabled, setAutoMonitorEnabled] = useState(true);
  const [lastAutoCheck, setLastAutoCheck] = useState<string | null>(null);
  
  // Auto-refresh state
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);
  const [countdown, setCountdown] = useState(15);
  const countdownRef = useRef(15);
  
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

  useEffect(() => {
    // RLS is enforced by Supabase using your auth session.
    // "Preview admin" only affects UI gating; it does NOT create an auth session.
    if (authLoading) return;

    // Preview admins can proceed even without Supabase auth session
    if (!isAuthenticated && !isPreviewAdmin) {
      setWallets([]);
      setSelectedWallet('');
      setPositions([]);
      return;
    }

    loadWallets();
    loadPositions();
    loadLimitOrders();
  }, [isPreviewAdmin, isAuthenticated, authLoading]);

  // Real-time subscription to flip_positions changes
  useEffect(() => {
    const channel = supabase
      .channel('flip-positions-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'flip_positions' },
        (payload) => {
          console.log('Position changed:', payload);
          loadPositions(); // Reload when CRON updates positions
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Define handlers BEFORE useEffect hooks that reference them
  const handleAutoRefresh = useCallback(async () => {
    const holdingPositions = positions.filter(p => p.status === 'holding');
    if (holdingPositions.length === 0) return;

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
      
      // Auto-refresh wallet balance on every price check
      if (selectedWallet) {
        const wallet = wallets.find(w => w.id === selectedWallet);
        if (wallet) {
          try {
            const { data: balanceData, error: balErr } = await supabase.functions.invoke('get-wallet-balance', {
              body: { walletAddress: wallet.pubkey }
            });
            if (!balErr && !balanceData.error) {
              setWalletBalance(balanceData.balance);
            }
          } catch (balanceErr) {
            console.error('Balance refresh during price check failed:', balanceErr);
          }
        }
      }
    } catch (err) {
      console.error('Auto-refresh failed:', err);
    }
  }, [positions, slippageBps, priorityFeeMode, selectedWallet, wallets]);

  const handleRebuyCheck = useCallback(async () => {
    const watchingPositions = positions.filter(p => p.rebuy_status === 'watching');
    if (watchingPositions.length === 0 || isRebuyMonitoring) return;

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
        loadPositions();
      }
    } catch (err) {
      console.error('Rebuy check failed:', err);
    } finally {
      setIsRebuyMonitoring(false);
    }
  }, [positions, slippageBps, priorityFeeMode, targetMultiplier, isRebuyMonitoring]);

  const handleEmergencyCheck = useCallback(async () => {
    const watchingPositions = positions.filter(p => p.status === 'holding' && p.emergency_sell_status === 'watching');
    if (watchingPositions.length === 0 || isEmergencyMonitoring) return;

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
      if (data?.bondingCurveData) {
        setBondingCurveData(prev => ({ ...prev, ...data.bondingCurveData }));
      }
      if (data?.executed?.length > 0) {
        toast.error(`🚨 EMERGENCY SELL: ${data.executed.length} position(s) sold at stop-loss!`, {
          duration: 10000,
        });
        loadPositions();
      }
    } catch (err) {
      console.error('Emergency check failed:', err);
    } finally {
      setIsEmergencyMonitoring(false);
    }
  }, [positions, isEmergencyMonitoring]);

  // Auto-refresh polling (every 15 seconds)
  useEffect(() => {
    if (!autoRefreshEnabled) return;

    const hasHoldings = positions.some((p) => p.status === 'holding');
    if (!hasHoldings) return;

    setCountdown(15);
    countdownRef.current = 15;

    const id = setInterval(() => {
      void handleAutoRefresh();
    }, 15000);

    return () => {
      clearInterval(id);
    };
  }, [autoRefreshEnabled, positions, handleAutoRefresh]);

  // Rebuy monitoring poll (every 15 seconds)
  useEffect(() => {
    if (!rebuyMonitorEnabled) return;

    const hasWatching = positions.some((p) => p.rebuy_status === 'watching');
    if (!hasWatching) return;

    setRebuyCountdown(15);
    rebuyCountdownRef.current = 15;

    const id = setInterval(() => {
      void handleRebuyCheck();
    }, 15000);

    return () => {
      clearInterval(id);
    };
  }, [rebuyMonitorEnabled, positions, handleRebuyCheck]);

  // Emergency sell monitoring poll (every 5 seconds)
  useEffect(() => {
    if (!emergencyMonitorEnabled) return;

    const hasWatching = positions.some(
      (p) => p.status === 'holding' && p.emergency_sell_status === 'watching'
    );
    if (!hasWatching) return;

    setEmergencyCountdown(5);
    emergencyCountdownRef.current = 5;

    const id = setInterval(() => {
      void handleEmergencyCheck();
    }, 5000);

    return () => {
      clearInterval(id);
    };
  }, [emergencyMonitorEnabled, positions, handleEmergencyCheck]);

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
        loadPositions();
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

  // Unified token data fetch function - single source of truth
  const fetchInputTokenData = useCallback(async (tokenMint: string, forceRefresh = false): Promise<boolean> => {
    const mint = tokenMint.trim();
    if (!mint || mint.length < 32) {
      setInputToken(prev => ({ ...prev, mint: '', symbol: null, name: null, price: null, image: null, lastFetched: null, source: null }));
      return false;
    }

    // Skip if same mint and not forcing refresh and has recent data
    if (!forceRefresh && inputToken.mint === mint && inputToken.lastFetched) {
      const lastFetchTime = new Date(inputToken.lastFetched).getTime();
      const now = Date.now();
      if (now - lastFetchTime < 30000) { // 30 second cache
        return true;
      }
    }

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
        
        setInputToken({
          mint: mint,
          symbol: meta.symbol || null,
          name: meta.name || null,
          price: priceInfo?.priceUsd ?? null,
          image: meta.image || meta.logoURI || null,
          lastFetched: new Date().toISOString(),
          source: 'token-metadata'
        });

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
            mint: mint,
            symbol: null,
            name: null,
            price: priceData.priceUSD,
            image: null,
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

  // Debounced auto-fetch when token address changes
  useEffect(() => {
    if (inputFetchTimeoutRef.current) {
      clearTimeout(inputFetchTimeoutRef.current);
    }
    
    const mint = tokenAddress.trim();
    if (!mint || mint.length < 32) {
      setInputToken(prev => ({ ...prev, mint: '', symbol: null, name: null, price: null, image: null, lastFetched: null, source: null }));
      return;
    }

    // Debounce: wait 500ms after user stops typing
    inputFetchTimeoutRef.current = setTimeout(() => {
      fetchInputTokenData(mint, false);
    }, 500);

    return () => {
      if (inputFetchTimeoutRef.current) {
        clearTimeout(inputFetchTimeoutRef.current);
      }
    };
  }, [tokenAddress, fetchInputTokenData]);

  // Manual refresh button handler
  const handleCheckPrice = () => {
    if (!tokenAddress.trim() || tokenAddress.trim().length < 32) {
      toast.error('Enter a valid token address');
      return;
    }
    fetchInputTokenData(tokenAddress.trim(), true); // Force refresh
  };

  const loadWallets = async () => {
    try {
      // In preview mode, directly query the database
      if (isPreviewAdmin) {
        const { data: walletsData, error: dbError } = await supabase
          .from('super_admin_wallets')
          .select('id, label, pubkey, wallet_type, is_active')
          .eq('wallet_type', 'flipit')
          .eq('is_active', true)
          .order('created_at', { ascending: false });

        if (dbError) {
          console.error('Failed to load wallets from DB:', dbError);
          toast.error(dbError.message || 'Failed to load wallets');
          return;
        }

        const flipitWallets = (walletsData || []) as SuperAdminWallet[];
        setWallets(flipitWallets);
        if (flipitWallets.length > 0 && !selectedWallet) {
          setSelectedWallet(flipitWallets[0].id);
        }
        return;
      }

      // Normal authenticated flow
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      const { data: response, error } = await supabase.functions.invoke('super-admin-wallet-generator', {
        method: 'GET',
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
      });

      if (error) {
        toast.error('Failed to load wallets');
        return;
      }

      const allWallets = (response as any)?.data as SuperAdminWallet[] | undefined;
      const flipitWallets = (allWallets || []).filter((w: any) => w.wallet_type === 'flipit' && w.is_active);

      setWallets(flipitWallets);
      if (flipitWallets.length > 0 && !selectedWallet) {
        setSelectedWallet(flipitWallets[0].id);
      }
    } catch (err) {
      console.error('Error loading wallets:', err);
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

    setIsWithdrawing(true);
    try {
      const { data, error } = await supabase.functions.invoke('flipit-wallet-withdrawal', {
        body: { walletId: selectedWallet }
      });

      if (error) throw error;

      if (data?.error) {
        toast.error(data.error);
      } else {
        toast.success(`Withdrawn ${data.amountSol.toFixed(4)} SOL! TX: ${data.signature.slice(0, 8)}...`);
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

  const loadPositions = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('flip_positions')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      toast.error('Failed to load positions');
      setIsLoading(false);
      return;
    }

    let loadedPositions = (data || []) as unknown as FlipPosition[];
    
    // Collect all unique mints to fetch metadata (for symbols and images)
    const allUniqueMints = [...new Set(loadedPositions.map(p => p.token_mint))];
    
    // Fetch token metadata for all positions (to get images and missing symbols)
    if (allUniqueMints.length > 0) {
      const symbolsMap = await fetchTokenSymbols(allUniqueMints);
      
      // Update positions missing symbols
      loadedPositions = loadedPositions.map(p => {
        if (!p.token_symbol && symbolsMap[p.token_mint]) {
          return { ...p, token_symbol: symbolsMap[p.token_mint].symbol, token_name: symbolsMap[p.token_mint].name };
        }
        return p;
      });
      
      // Update the database with the symbols for positions missing them (fire and forget)
      const positionsMissingSymbols = loadedPositions.filter(p => !p.token_symbol);
      for (const mint of [...new Set(positionsMissingSymbols.map(p => p.token_mint))]) {
        if (symbolsMap[mint]) {
          supabase
            .from('flip_positions')
            .update({ token_symbol: symbolsMap[mint].symbol, token_name: symbolsMap[mint].name })
            .eq('token_mint', mint)
            .then(() => {});
        }
      }
    }
    
    setPositions(loadedPositions);
    setIsLoading(false);
    
    // Fetch current prices for active positions
    const holdingPositions = loadedPositions.filter(p => p.status === 'holding');
    if (holdingPositions.length > 0) {
      fetchCurrentPrices(holdingPositions.map(p => p.token_mint));
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
      console.error('Failed to fetch prices:', err);
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
      loadPositions();
      
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

  // Delete a flip position from the database
  const handleDeletePosition = async (positionId: string, tokenSymbol: string | null) => {
    try {
      const { error } = await supabase
        .from('flip_positions')
        .delete()
        .eq('id', positionId);

      if (error) throw error;

      toast.success(`Deleted ${tokenSymbol || 'position'}`);
      loadPositions();
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

    // Convert to USD if in SOL mode
    const buyAmountUsd = buyAmountMode === 'sol' && solPrice 
      ? parsedAmount * solPrice 
      : parsedAmount;

    setIsFlipping(true);
    try {
      const { data, error } = await supabase.functions.invoke('flipit-execute', {
        body: {
          action: 'buy',
          tokenMint: tokenAddress.trim(),
          walletId: selectedWallet,
          buyAmountUsd: buyAmountUsd,
          targetMultiplier: targetMultiplier,
          slippageBps: slippageBps,
          priorityFeeMode: priorityFeeMode
        }
      });

      if (error) throw error;

      if (data?.error) {
        toast.error(data.error);
      } else {
        toast.success(`Flip initiated! ${data?.signature ? 'TX: ' + data.signature.slice(0, 8) + '...' : ''}`);
        setTokenAddress('');
        // Clear input token state
        setInputToken({
          mint: '',
          symbol: null,
          name: null,
          price: null,
          image: null,
          lastFetched: null,
          source: null
        });
        loadPositions();
        refreshWalletBalance(); // Auto-refresh wallet balance after buy
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to execute flip');
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
    const amountSol = buyAmountMode === 'sol' ? parsedAmount : (solPrice ? parsedAmount / solPrice : parsedAmount);

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
      setInputToken({ mint: '', symbol: null, name: null, price: null, image: null, lastFetched: null, source: null });
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
        loadPositions();
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
    const holdingPositions = positions.filter(p => p.status === 'holding');
    if (holdingPositions.length === 0) {
      toast.info('No active positions to monitor');
      return;
    }

    setIsMonitoring(true);
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
      if (data?.executed?.length > 0) {
        toast.success(`Sold ${data.executed.length} position(s) at target!`);
        loadPositions();
        refreshWalletBalance(); // Auto-refresh wallet balance after sales
      } else {
        toast.success('Prices refreshed');
        refreshWalletBalance(); // Also refresh balance on price check
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to refresh prices');
    } finally {
      setIsMonitoring(false);
    }
  };

  const handleForceSell = async (positionId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('flipit-execute', {
        body: {
          action: 'sell',
          positionId: positionId,
          slippageBps: slippageBps,
          priorityFeeMode: priorityFeeMode
        }
      });

      if (error) throw error;

      if (data?.error) {
        toast.error(data.error);
      } else {
        toast.success('Sold!');
        loadPositions();
        refreshWalletBalance(); // Auto-refresh wallet balance after sell
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to sell');
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
    loadPositions();
    
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
    loadPositions();
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
    if (!position.buy_price_usd || position.status !== 'holding') return 0;
    const currentPrice = currentPrices[position.token_mint] || position.buy_price_usd;
    const targetPrice = position.buy_price_usd * position.target_multiplier;
    const progress = ((currentPrice - position.buy_price_usd) / (targetPrice - position.buy_price_usd)) * 100;
    // Clamp: 0% minimum (no negative progress), 100% max
    return Math.min(Math.max(progress, 0), 100);
  };

  const activePositions = positions.filter(p => ['pending_buy', 'holding', 'pending_sell'].includes(p.status));
  const completedPositions = positions.filter(p => ['sold', 'failed'].includes(p.status));

  const totalProfit = completedPositions
    .filter(p => p.profit_usd !== null)
    .reduce((sum, p) => sum + (p.profit_usd || 0), 0);

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
                  <Select value={selectedWallet} onValueChange={setSelectedWallet}>
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
                            <a
                              className="inline-flex"
                              href={`https://solscan.io/account/${wallet?.pubkey}`}
                              target="_blank"
                              rel="noreferrer"
                              title="View on Solscan"
                            >
                              <Button size="icon" variant="ghost" className="h-6 w-6">
                                <ArrowUpRight className="h-3 w-3" />
                              </Button>
                            </a>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 px-2 text-xs"
                              onClick={handleShowPrivateKey}
                              disabled={isDecrypting}
                              title="Export private key for Phantom"
                            >
                              {isDecrypting ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <>
                                  <Key className="h-3 w-3 mr-1" />
                                  KEYS
                                </>
                              )}
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
                              Withdraw All
                            </Button>
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
                                loadPositions();
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

              {/* Auto-Refresh Control */}
              <div className="space-y-2">
                <Label className="flex items-center gap-1 text-sm">
                  <Radio className="h-4 w-4" />
                  Auto-Refresh Prices
                </Label>
                <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50 h-10">
                  <Switch 
                    checked={autoRefreshEnabled} 
                    onCheckedChange={setAutoRefreshEnabled}
                  />
                  {autoRefreshEnabled && positions.filter(p => p.status === 'holding').length > 0 ? (
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                      <span className="text-sm font-medium text-green-500">
                        Refreshing in {countdown}s
                      </span>
                    </div>
                  ) : (
                    <span className="text-sm text-muted-foreground">
                      {autoRefreshEnabled ? 'Waiting for positions...' : 'Paused'}
                    </span>
                  )}
                  {lastAutoCheck && (
                    <span className="text-xs text-muted-foreground ml-auto">
                      Last: {new Date(lastAutoCheck).toLocaleTimeString()}
                    </span>
                  )}
                </div>
              </div>
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

          {/* Tweet Templates Section */}
          <Collapsible className="mb-6">
            <CollapsibleTrigger asChild>
              <Button variant="outline" className="w-full justify-between mb-2">
                <span className="flex items-center gap-2">
                  <Twitter className="h-4 w-4" />
                  Tweet Templates
                </span>
                <ChevronDown className="h-4 w-4" />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <TweetTemplateEditor />
            </CollapsibleContent>
          </Collapsible>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

            {/* Token Input */}
            <div className="space-y-2">
              <Label className="flex items-center justify-between flex-wrap gap-2">
                <span className="flex items-center gap-2">
                  Token Address
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
              </Label>
              <div className="flex gap-2">
                <Input
                  placeholder="Paste token address..."
                  value={tokenAddress}
                  onChange={e => setTokenAddress(e.target.value)}
                  className="flex-1"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleCheckPrice}
                  disabled={isLoadingInputToken || !tokenAddress.trim()}
                  className="shrink-0"
                  title="Refresh token data"
                >
                  {isLoadingInputToken ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                </Button>
              </div>
              {inputToken.price !== null && buyAmount && (
                <p className="text-xs text-muted-foreground">
                  Entry: ~{(() => {
                    const amt = parseFloat(buyAmount);
                    if (isNaN(amt) || amt <= 0) return '—';
                    const usdAmount = buyAmountMode === 'sol' && solPrice ? amt * solPrice : amt;
                    const tokens = usdAmount / inputToken.price!;
                    return `${tokens.toLocaleString(undefined, { maximumFractionDigits: 0 })} tokens`;
                  })()}
                  {inputToken.lastFetched && (
                    <span className="ml-2 text-muted-foreground/70">
                      • {new Date(inputToken.lastFetched).toLocaleTimeString()}
                    </span>
                  )}
                </p>
              )}
            </div>

            {/* Amount */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1">
                {buyAmountMode === 'usd' ? <DollarSign className="h-4 w-4" /> : <Wallet className="h-4 w-4" />}
                Buy Amount
              </Label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  step="0.001"
                  min="0"
                  value={buyAmount}
                  onChange={(e) => setBuyAmount(e.target.value)}
                  placeholder={buyAmountMode === 'usd' ? '0.00' : '0.001'}
                  className="flex-1"
                />
                <Select value={buyAmountMode} onValueChange={(v: 'usd' | 'sol') => setBuyAmountMode(v)}>
                  <SelectTrigger className="w-20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sol">SOL</SelectItem>
                    <SelectItem value="usd">USD</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {solPrice && buyAmount && (
                <p className="text-xs text-muted-foreground">
                  {buyAmountMode === 'usd' 
                    ? `≈ ${(parseFloat(buyAmount) / solPrice).toFixed(4)} SOL`
                    : `≈ $${(parseFloat(buyAmount) * solPrice).toFixed(2)} USD`
                  }
                </p>
              )}
            </div>

            {/* Target Multiplier */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1">
                <TrendingUp className="h-4 w-4" />
                Target
              </Label>
              <Select value={targetMultiplier.toString()} onValueChange={v => setTargetMultiplier(Number(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
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
                </SelectContent>
              </Select>
            </div>
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

            <Button variant="outline" onClick={handleRefreshPrices} disabled={isMonitoring}>
              {isMonitoring ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Refresh Prices
            </Button>

            <Button variant="ghost" onClick={loadPositions} disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Reload
            </Button>
          </div>
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
        <Card>
          <CardContent className="pt-4">
            <div className="text-sm text-muted-foreground">Completed Flips</div>
            <div className="text-2xl font-bold">{completedPositions.filter(p => p.status === 'sold').length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-sm text-muted-foreground">Total P&L</div>
            <div className={`text-2xl font-bold ${totalProfit >= 0 ? 'text-green-500' : 'text-red-500'}`}>
              {totalProfit >= 0 ? '+' : ''}${totalProfit.toFixed(2)}
            </div>
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
                  <TableHead className="px-2 py-1 text-center">STOP-LOSS</TableHead>
                  <TableHead className="px-2 py-1">SL Price</TableHead>
                  <TableHead className="px-2 py-1 text-center">REBUY</TableHead>
                  <TableHead className="px-2 py-1">Rebuy Low</TableHead>
                  <TableHead className="px-2 py-1">Rebuy High</TableHead>
                  <TableHead className="px-2 py-1">Rebuy Amt</TableHead>
                  <TableHead className="px-2 py-1">Rebuy Target</TableHead>
                  <TableHead className="px-2 py-1">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activePositions.map(position => {
                  const progress = calculateProgress(position);
                  const currentPrice = currentPrices[position.token_mint];
                  const pnlPercent = position.buy_price_usd && currentPrice
                    ? ((currentPrice - position.buy_price_usd) / position.buy_price_usd) * 100
                    : null;

                  // Quantity is sometimes not persisted; derive it from buy_amount_usd / buy_price_usd when needed.
                  const effectiveQuantityTokens =
                    position.quantity_tokens ??
                    (position.buy_price_usd ? position.buy_amount_usd / position.buy_price_usd : null);

                  const currentValue = effectiveQuantityTokens !== null && currentPrice
                    ? effectiveQuantityTokens * currentPrice
                    : null;

                  const pnlUsd = currentValue !== null
                    ? currentValue - position.buy_amount_usd
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
                            {/* Twitter/X Icon */}
                            {position.twitter_url ? (
                              <a 
                                href={position.twitter_url} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-primary hover:text-primary/80 transition-colors"
                                title="View on X/Twitter"
                              >
                                <Twitter className="h-3 w-3" />
                              </a>
                            ) : (
                              <Twitter className="h-3 w-3 text-muted-foreground/30" />
                            )}
                            {/* Website Icon */}
                            {position.website_url ? (
                              <a 
                                href={position.website_url} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-primary hover:text-primary/80 transition-colors"
                                title="Visit Website"
                              >
                                <Globe className="h-3 w-3" />
                              </a>
                            ) : (
                              <Globe className="h-3 w-3 text-muted-foreground/30" />
                            )}
                            {/* Telegram Icon */}
                            {position.telegram_url ? (
                              <a 
                                href={position.telegram_url} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-primary hover:text-primary/80 transition-colors"
                                title="Join Telegram"
                              >
                                <Send className="h-3 w-3" />
                              </a>
                            ) : (
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
                            {isFromRebuy && (
                              <Badge variant="secondary" className="text-[9px] px-1 py-0 gap-0.5">
                                <RotateCcw className="h-2 w-2" />
                                REBUY
                              </Badge>
                            )}
                            {/* DEX Paid Status Badges */}
                            {position.dex_paid_status?.hasPaidProfile && (
                              <Badge className="text-[9px] px-1 py-0 gap-0.5 bg-green-600 hover:bg-green-700">
                                <Shield className="h-2 w-2" />
                                DEX PAID
                              </Badge>
                            )}
                            {position.dex_paid_status?.activeBoosts > 0 && (
                              <Badge className="text-[9px] px-1 py-0 gap-0.5 bg-orange-500 hover:bg-orange-600">
                                <Rocket className="h-2 w-2" />
                                x{position.dex_paid_status.activeBoosts}
                              </Badge>
                            )}
                            {position.dex_paid_status?.hasActiveAds && (
                              <Badge className="text-[9px] px-1 py-0 gap-0.5 bg-purple-600 hover:bg-purple-700">
                                <Megaphone className="h-2 w-2" />
                                ADS
                              </Badge>
                            )}
                            {position.dex_paid_status?.hasCTO && (
                              <Badge className="text-[9px] px-1 py-0 gap-0.5 bg-blue-600 hover:bg-blue-700">
                                <Users className="h-2 w-2" />
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
                            Entry: ${position.buy_price_usd?.toFixed(8) || '-'}
                          </div>
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
                        {currentPrice ? (
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
                              {bondingCurveData[position.token_mint] !== undefined && (
                                <span 
                                  className="inline-flex items-center justify-center w-8 h-4 text-[9px] font-bold text-orange-400 bg-orange-500/20 border border-orange-500/40 rounded-full"
                                  title={`${bondingCurveData[position.token_mint].toFixed(0)}% on bonding curve`}
                                >
                                  {bondingCurveData[position.token_mint].toFixed(0)}%
                                </span>
                              )}
                            </div>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-xs">-</span>
                        )}
                      </TableCell>
                      <TableCell className="px-2 py-1">
                        <div className="flex items-center gap-1">
                          <div>
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
                                  {[1.25, 1.30, 1.50, 1.75, 2, 2.5, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20, 25, 30, 35, 40, 45, 50, 75, 100].map(mult => (
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
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => {
                              const ticker = position.token_symbol || position.token_mint.slice(0, 8);
                              if (window.confirm(`Sell ${ticker} now?\n\nThis will immediately sell your entire position.`)) {
                                handleForceSell(position.id);
                              }
                            }}
                          >
                            Sell Now
                          </Button>
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
                      
                      <TableCell>{getStatusBadge(position.status)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Fee Calculator Widget - moved under Active Flips */}
      {buyAmount && parseFloat(buyAmount) > 0 && solPrice && (
        <FlipItFeeCalculator
          buyAmountSol={buyAmountMode === 'sol' ? parseFloat(buyAmount) : parseFloat(buyAmount) / solPrice}
          solPrice={solPrice}
          priorityFeeMode={priorityFeeMode}
          slippageBps={slippageBps}
          targetMultiplier={targetMultiplier}
        />
      )}

      {/* Completed Positions with Rebuy */}
      {completedPositions.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Completed Flips (Last 50)</CardTitle>
            {/* Rebuy Monitor Status */}
            {positions.filter(p => p.rebuy_status === 'watching').length > 0 && (
              <div className="flex items-center gap-2 text-sm">
                <div className="flex items-center gap-1">
                  <Switch 
                    checked={rebuyMonitorEnabled} 
                    onCheckedChange={setRebuyMonitorEnabled}
                  />
                  <span className="text-muted-foreground">Rebuy Monitor</span>
                </div>
                {rebuyMonitorEnabled && (
                  <div className="flex items-center gap-2 px-2 py-1 rounded bg-muted/50">
                    {isRebuyMonitoring ? (
                      <Loader2 className="h-3 w-3 animate-spin text-primary" />
                    ) : (
                      <Eye className="h-3 w-3 text-primary animate-pulse" />
                    )}
                    <span className="text-xs">
                      {isRebuyMonitoring ? 'Checking...' : `Next check in ${rebuyCountdown}s`}
                    </span>
                  </div>
                )}
                {lastRebuyCheck && (
                  <span className="text-xs text-muted-foreground">
                    Last: {new Date(lastRebuyCheck).toLocaleTimeString()}
                  </span>
                )}
              </div>
            )}
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Token</TableHead>
                  <TableHead>Entry</TableHead>
                  <TableHead>Exit</TableHead>
                  <TableHead>P&L</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>REBUY</TableHead>
                  <TableHead>Rebuy Low</TableHead>
                  <TableHead>Rebuy High</TableHead>
                  <TableHead>Rebuy Amount</TableHead>
                  <TableHead>Rebuy Target</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {completedPositions.slice(0, 50).map(position => {
                  const editState = rebuyEditing[position.id] || {
                    enabled: position.rebuy_enabled || false,
                    priceHigh: position.rebuy_price_high_usd?.toString() || '',
                    priceLow: position.rebuy_price_low_usd?.toString() || '',
                    amount: position.rebuy_amount_usd?.toString() || '',
                    targetMultiplier: position.rebuy_target_multiplier || 2,
                    loopEnabled: position.rebuy_loop_enabled || false
                  };
                  
                  const isWatching = position.rebuy_status === 'watching';
                  const isExecuted = position.rebuy_status === 'executed';
                  const isCancelled = position.rebuy_status === 'cancelled';
                  
                  return (
                    <TableRow key={position.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {tokenImages[position.token_mint] && (
                            <img 
                              src={tokenImages[position.token_mint]} 
                              alt={position.token_symbol || 'Token'} 
                              className="w-6 h-6 rounded-full object-cover flex-shrink-0"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                            />
                          )}
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
                              {/* DEX Paid Status Badges */}
                              {position.dex_paid_status?.hasPaidProfile && (
                                <Badge className="text-[9px] px-1 py-0 gap-0.5 bg-green-600 hover:bg-green-700">
                                  <Shield className="h-2 w-2" />
                                  DEX
                                </Badge>
                              )}
                              {position.dex_paid_status?.activeBoosts > 0 && (
                                <Badge className="text-[9px] px-1 py-0 gap-0.5 bg-orange-500 hover:bg-orange-600">
                                  <Rocket className="h-2 w-2" />
                                  x{position.dex_paid_status.activeBoosts}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">${position.buy_price_usd?.toFixed(8) || '-'}</TableCell>
                      <TableCell className="text-xs">${position.sell_price_usd?.toFixed(8) || '-'}</TableCell>
                      <TableCell>
                        {position.profit_usd !== null ? (
                          <span className={position.profit_usd >= 0 ? 'text-green-500' : 'text-red-500'}>
                            {position.profit_usd >= 0 ? '+' : ''}${position.profit_usd.toFixed(2)}
                          </span>
                        ) : '-'}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          {getStatusBadge(position.status)}
                          {position.rebuy_status && getRebuyStatusBadge(position.rebuy_status)}
                          {isExecuted && position.rebuy_position_id && (
                            <Badge 
                              variant="outline" 
                              className="text-[9px] px-1 py-0 gap-0.5 text-green-600 border-green-600/30 cursor-pointer hover:bg-green-500/10"
                              onClick={() => {
                                // Find and highlight the new position
                                const newPosition = positions.find(p => p.id === position.rebuy_position_id);
                                if (newPosition) {
                                  toast.info(`New position: ${newPosition.token_symbol || newPosition.token_mint.slice(0, 8)}... - Status: ${newPosition.status}`);
                                }
                              }}
                            >
                              <CheckCircle2 className="h-2 w-2" />
                              → New Flip
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      
                      {/* Rebuy Enabled Toggle */}
                      <TableCell>
                        <Switch
                          checked={editState.enabled}
                          disabled={isExecuted || isWatching}
                          onCheckedChange={(checked) => {
                            setRebuyEditing(prev => ({
                              ...prev,
                              [position.id]: { ...editState, enabled: checked }
                            }));
                          }}
                        />
                      </TableCell>
                      
                      {/* Rebuy Low Price Input */}
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-muted-foreground">$</span>
                          <Input
                            type="number"
                            step="0.00000001"
                            className="w-24 h-7 text-xs"
                            placeholder={position.sell_price_usd ? (position.sell_price_usd * 0.9).toFixed(8) : '0.0001'}
                            value={editState.priceLow}
                            disabled={isExecuted || isWatching}
                            onChange={(e) => {
                              setRebuyEditing(prev => ({
                                ...prev,
                                [position.id]: { ...editState, priceLow: e.target.value }
                              }));
                            }}
                          />
                        </div>
                        {position.sell_price_usd && editState.priceLow && (
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {((1 - parseFloat(editState.priceLow) / position.sell_price_usd) * 100).toFixed(1)}% drop
                          </div>
                        )}
                      </TableCell>
                      
                      {/* Rebuy High Price Input */}
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-muted-foreground">$</span>
                          <Input
                            type="number"
                            step="0.00000001"
                            className="w-24 h-7 text-xs"
                            placeholder={position.sell_price_usd ? (position.sell_price_usd * 1.1).toFixed(8) : '0.0001'}
                            value={editState.priceHigh}
                            disabled={isExecuted || isWatching}
                            onChange={(e) => {
                              setRebuyEditing(prev => ({
                                ...prev,
                                [position.id]: { ...editState, priceHigh: e.target.value }
                              }));
                            }}
                          />
                        </div>
                        {position.sell_price_usd && editState.priceHigh && (
                          <div className="text-xs text-muted-foreground mt-0.5">
                            +{((parseFloat(editState.priceHigh) / position.sell_price_usd - 1) * 100).toFixed(1)}%
                          </div>
                        )}
                      </TableCell>
                      
                      {/* Rebuy Amount Input */}
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-muted-foreground">$</span>
                          <Input
                            type="number"
                            step="0.01"
                            className="w-20 h-7 text-xs"
                            placeholder={position.buy_amount_usd?.toString() || '10'}
                            value={editState.amount}
                            disabled={isExecuted || isWatching}
                            onChange={(e) => {
                              setRebuyEditing(prev => ({
                                ...prev,
                                [position.id]: { ...editState, amount: e.target.value }
                              }));
                            }}
                          />
                        </div>
                        {solPrice && editState.amount && (
                          <div className="text-xs text-muted-foreground mt-0.5">
                            ≈ {(parseFloat(editState.amount) / solPrice).toFixed(4)} SOL
                          </div>
                        )}
                      </TableCell>
                      
                      {/* Rebuy Target Selector */}
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Select
                            value={(() => {
                              const num = Number(editState.targetMultiplier);
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
                              return "2";
                            })()}
                            disabled={isExecuted || isWatching}
                            onValueChange={(value) => {
                              setRebuyEditing(prev => ({
                                ...prev,
                                [position.id]: { ...editState, targetMultiplier: parseFloat(value) }
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
                            </SelectContent>
                          </Select>
                          {/* Loop Mode Toggle */}
                          <div className="flex items-center gap-1">
                            <Switch
                              checked={editState.loopEnabled}
                              disabled={isExecuted || isWatching}
                              onCheckedChange={(checked) => {
                                setRebuyEditing(prev => ({
                                  ...prev,
                                  [position.id]: { ...editState, loopEnabled: checked }
                                }));
                              }}
                            />
                            <span className="text-[9px] text-muted-foreground">♻️</span>
                          </div>
                          {editState.loopEnabled && (
                            <Badge variant="secondary" className="text-[9px] px-1 py-0 gap-0.5">
                              ♻️ LOOP
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      
                      {/* Actions */}
                      <TableCell>
                        <div className="flex gap-1">
                          {position.status === 'sold' && !isWatching && !isExecuted && (
                            <Button
                              size="sm"
                              variant={editState.enabled ? "default" : "outline"}
                              className="h-7 text-xs"
                              disabled={!editState.priceLow || !editState.priceHigh || !editState.amount}
                              onClick={() => handleUpdateRebuySettings(
                                position.id,
                                editState.enabled,
                                parseFloat(editState.priceHigh) || null,
                                parseFloat(editState.priceLow) || null,
                                parseFloat(editState.amount) || null,
                                editState.targetMultiplier,
                                editState.loopEnabled
                              )}
                            >
                              {editState.enabled ? (
                                <>
                                  <Eye className="h-3 w-3 mr-1" />
                                  Start Watching
                                </>
                              ) : 'Save'}
                            </Button>
                          )}
                          
                          {isWatching && (
                            <Button
                              size="sm"
                              variant="destructive"
                              className="h-7 text-xs"
                              onClick={() => handleCancelRebuy(position.id)}
                            >
                              <XCircle className="h-3 w-3 mr-1" />
                              Cancel
                            </Button>
                          )}
                          
                          {isExecuted && position.rebuy_position_id && (
                            <Badge variant="outline" className="text-xs text-green-500">
                              <RotateCcw className="h-3 w-3 mr-1" />
                              Rebought
                            </Badge>
                          )}
                          
                          {position.status === 'sold' && !position.sell_signature && !isWatching && (
                            <Button
                              size="sm"
                              variant="destructive"
                              className="h-7 text-xs"
                              onClick={() => handleForceSell(position.id)}
                            >
                              Retry
                            </Button>
                          )}
                          
                          {/* Delete button */}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                            onClick={() => handleDeletePosition(position.id, position.token_symbol)}
                            title="Delete entry"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

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
    </div>
  );
}
