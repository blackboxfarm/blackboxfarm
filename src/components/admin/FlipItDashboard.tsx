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
import { Flame, RefreshCw, TrendingUp, DollarSign, Wallet, Clock, CheckCircle2, XCircle, Loader2, Plus, Copy, ArrowUpRight, Key, Settings, Zap, Activity, Radio, Pencil, ChevronDown, Coins, Eye, EyeOff, RotateCcw, AlertTriangle } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useSolPrice } from '@/hooks/useSolPrice';
import { FlipItFeeCalculator } from './flipit/FlipItFeeCalculator';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { WalletTokenManager } from '@/components/blackbox/WalletTokenManager';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface FlipPosition {
  id: string;
  token_mint: string;
  token_symbol: string | null;
  token_name: string | null;
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
  rebuy_amount_usd: number | null;
  rebuy_status: string | null;
  rebuy_executed_at: string | null;
  rebuy_position_id: string | null;
  // Emergency sell fields
  emergency_sell_enabled: boolean | null;
  emergency_sell_price_usd: number | null;
  emergency_sell_status: string | null;
  emergency_sell_executed_at: string | null;
}

interface SuperAdminWallet {
  id: string;
  label: string;
  pubkey: string;
  wallet_type?: string;
}

export function FlipItDashboard() {
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
  
  // Input token price state (for live preview before adding)
  const [inputTokenPrice, setInputTokenPrice] = useState<number | null>(null);
  const [isLoadingInputPrice, setIsLoadingInputPrice] = useState(false);
  const inputPriceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // SOL price for USD conversion
  const { price: solPrice, isLoading: solPriceLoading } = useSolPrice();
  
  // Settings
  const [slippageBps, setSlippageBps] = useState(500); // 5% default
  const [priorityFeeMode, setPriorityFeeMode] = useState<'low' | 'medium' | 'high' | 'turbo' | 'ultra'>('medium');
  const [autoMonitorEnabled, setAutoMonitorEnabled] = useState(true);
  const [lastAutoCheck, setLastAutoCheck] = useState<string | null>(null);
  
  // Auto-refresh state
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);
  const [countdown, setCountdown] = useState(60);
  const countdownRef = useRef(60);
  
  // Rebuy monitoring state
  const [rebuyMonitorEnabled, setRebuyMonitorEnabled] = useState(true);
  const [rebuyCountdown, setRebuyCountdown] = useState(15);
  const rebuyCountdownRef = useRef(15);
  const [lastRebuyCheck, setLastRebuyCheck] = useState<string | null>(null);
  const [isRebuyMonitoring, setIsRebuyMonitoring] = useState(false);
  
  // Rebuy settings for editing individual positions
  const [rebuyEditing, setRebuyEditing] = useState<Record<string, { enabled: boolean; price: string; amount: string }>>({});

  // Emergency sell monitoring state
  const [emergencyMonitorEnabled, setEmergencyMonitorEnabled] = useState(true);
  const [emergencyCountdown, setEmergencyCountdown] = useState(5);
  const emergencyCountdownRef = useRef(5);
  const [lastEmergencyCheck, setLastEmergencyCheck] = useState<string | null>(null);
  const [isEmergencyMonitoring, setIsEmergencyMonitoring] = useState(false);
  const [emergencyEditing, setEmergencyEditing] = useState<Record<string, { enabled: boolean; price: string }>>({});

  useEffect(() => {
    loadWallets();
    loadPositions();
  }, []);

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

  // Auto-refresh polling with countdown
  useEffect(() => {
    if (!autoRefreshEnabled) {
      setCountdown(60);
      return;
    }

    const activeHoldings = positions.filter(p => p.status === 'holding');
    if (activeHoldings.length === 0) {
      setCountdown(60);
      return;
    }

    // Countdown timer
    const countdownInterval = setInterval(() => {
      countdownRef.current -= 1;
      setCountdown(countdownRef.current);
      
      if (countdownRef.current <= 0) {
        countdownRef.current = 60;
        setCountdown(60);
        // Trigger price refresh
        handleAutoRefresh();
      }
    }, 1000);

    return () => {
      clearInterval(countdownInterval);
    };
  }, [autoRefreshEnabled, positions]);

  const handleAutoRefresh = useCallback(async () => {
    const holdingPositions = positions.filter(p => p.status === 'holding');
    if (holdingPositions.length === 0 || isMonitoring) return;

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
      if (data?.checkedAt) {
        setLastAutoCheck(data.checkedAt);
      }
      if (data?.executed?.length > 0) {
        toast.success(`Auto-sold ${data.executed.length} position(s) at target!`);
        loadPositions();
      }
    } catch (err) {
      console.error('Auto-refresh failed:', err);
    } finally {
      setIsMonitoring(false);
    }
  }, [positions, slippageBps, priorityFeeMode, isMonitoring]);

  // Rebuy monitoring poll (every 15 seconds)
  useEffect(() => {
    if (!rebuyMonitorEnabled) {
      setRebuyCountdown(15);
      return;
    }

    // Check if there are any watching rebuy positions
    const watchingPositions = positions.filter(p => p.rebuy_status === 'watching');
    if (watchingPositions.length === 0) {
      setRebuyCountdown(15);
      return;
    }

    // Countdown timer
    const rebuyInterval = setInterval(() => {
      rebuyCountdownRef.current -= 1;
      setRebuyCountdown(rebuyCountdownRef.current);
      
      if (rebuyCountdownRef.current <= 0) {
        rebuyCountdownRef.current = 15;
        setRebuyCountdown(15);
        // Trigger rebuy check
        handleRebuyCheck();
      }
    }, 1000);

    return () => {
      clearInterval(rebuyInterval);
    };
  }, [rebuyMonitorEnabled, positions]);

  // Emergency sell monitoring poll (every 5 seconds)
  useEffect(() => {
    if (!emergencyMonitorEnabled) {
      setEmergencyCountdown(5);
      return;
    }

    // Check if there are any watching emergency sell positions
    const watchingPositions = positions.filter(p => p.status === 'holding' && p.emergency_sell_status === 'watching');
    if (watchingPositions.length === 0) {
      setEmergencyCountdown(5);
      return;
    }

    // Countdown timer
    const emergencyInterval = setInterval(() => {
      emergencyCountdownRef.current -= 1;
      setEmergencyCountdown(emergencyCountdownRef.current);
      
      if (emergencyCountdownRef.current <= 0) {
        emergencyCountdownRef.current = 5;
        setEmergencyCountdown(5);
        // Trigger emergency check
        handleEmergencyCheck();
      }
    }, 1000);

    return () => {
      clearInterval(emergencyInterval);
    };
  }, [emergencyMonitorEnabled, positions]);

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

  useEffect(() => {
    if (selectedWallet) {
      refreshWalletBalance();
    }
  }, [selectedWallet]);

  // Debounced price fetch for token input
  useEffect(() => {
    // Clear previous timeout
    if (inputPriceTimeoutRef.current) {
      clearTimeout(inputPriceTimeoutRef.current);
    }
    
    // Reset price if input is cleared
    if (!tokenAddress.trim() || tokenAddress.trim().length < 32) {
      setInputTokenPrice(null);
      setIsLoadingInputPrice(false);
      return;
    }

    // Debounce: wait 500ms after user stops typing
    setIsLoadingInputPrice(true);
    inputPriceTimeoutRef.current = setTimeout(async () => {
      try {
        // Use fetch with query param since priceMint needs to be in URL
        const response = await fetch(
          `https://apxauapuusmgwbbzjgfl.supabase.co/functions/v1/raydium-quote?priceMint=${encodeURIComponent(tokenAddress.trim())}`,
          {
            method: 'GET',
            headers: {
              'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFweGF1YXB1dXNtZ3diYnpqZ2ZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ1OTEzMDUsImV4cCI6MjA3MDE2NzMwNX0.w8IrKq4YVStF3TkdEcs5mCSeJsxjkaVq2NFkypYOXHU'
            }
          }
        );
        
        if (!response.ok) throw new Error('Price fetch failed');
        
        const data = await response.json();
        
        if (data?.priceUSD !== undefined) {
          setInputTokenPrice(data.priceUSD);
        } else {
          setInputTokenPrice(null);
        }
      } catch (err) {
        console.error('Failed to fetch input token price:', err);
        setInputTokenPrice(null);
      } finally {
        setIsLoadingInputPrice(false);
      }
    }, 500);

    return () => {
      if (inputPriceTimeoutRef.current) {
        clearTimeout(inputPriceTimeoutRef.current);
      }
    };
  }, [tokenAddress]);

  // State for token name/symbol from price check
  const [inputTokenName, setInputTokenName] = useState<string | null>(null);
  const [inputTokenSymbol, setInputTokenSymbol] = useState<string | null>(null);

  // Manual price check function
  const handleCheckPrice = async () => {
    if (!tokenAddress.trim() || tokenAddress.trim().length < 32) {
      toast.error('Enter a valid token address');
      return;
    }
    
    setIsLoadingInputPrice(true);
    setInputTokenName(null);
    setInputTokenSymbol(null);
    
    try {
      // Fetch price and metadata in parallel
      const [priceRes, metaRes] = await Promise.all([
        fetch(
          `https://apxauapuusmgwbbzjgfl.supabase.co/functions/v1/raydium-quote?priceMint=${encodeURIComponent(tokenAddress.trim())}`,
          {
            method: 'GET',
            headers: {
              'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFweGF1YXB1dXNtZ3diYnpqZ2ZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ1OTEzMDUsImV4cCI6MjA3MDE2NzMwNX0.w8IrKq4YVStF3TkdEcs5mCSeJsxjkaVq2NFkypYOXHU'
            }
          }
        ),
        supabase.functions.invoke('token-metadata', {
          body: { tokenMint: tokenAddress.trim() }
        })
      ]);
      
      // Handle price
      if (priceRes.ok) {
        const priceData = await priceRes.json();
        if (priceData?.priceUSD !== undefined) {
          setInputTokenPrice(priceData.priceUSD);
        } else {
          setInputTokenPrice(null);
        }
      }
      
      // Handle metadata
      if (metaRes.data?.metadata) {
        const meta = metaRes.data.metadata;
        setInputTokenSymbol(meta.symbol || null);
        setInputTokenName(meta.name || null);
        
        const symbol = meta.symbol || 'Token';
        const price = metaRes.data?.priceInfo?.priceUsd;
        if (price) {
          setInputTokenPrice(price);
          toast.success(`${symbol}: $${price.toFixed(10).replace(/\.?0+$/, '')}`);
        } else {
          toast.info(`${symbol} loaded`);
        }
      } else {
        toast.error('No metadata found');
      }
    } catch (err) {
      console.error('Failed to fetch price:', err);
      toast.error('Failed to fetch price');
      setInputTokenPrice(null);
    } finally {
      setIsLoadingInputPrice(false);
    }
  };

  const loadWallets = async () => {
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

    let loadedPositions = (data || []) as FlipPosition[];
    
    // Fetch token symbols for positions missing them
    const positionsMissingSymbols = loadedPositions.filter(p => !p.token_symbol);
    if (positionsMissingSymbols.length > 0) {
      const uniqueMints = [...new Set(positionsMissingSymbols.map(p => p.token_mint))];
      const symbolsMap = await fetchTokenSymbols(uniqueMints);
      
      // Update positions with fetched symbols
      loadedPositions = loadedPositions.map(p => {
        if (!p.token_symbol && symbolsMap[p.token_mint]) {
          return { ...p, token_symbol: symbolsMap[p.token_mint].symbol, token_name: symbolsMap[p.token_mint].name };
        }
        return p;
      });
      
      // Update the database with the symbols (fire and forget)
      for (const mint of uniqueMints) {
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
  
  const fetchTokenSymbols = async (mints: string[]): Promise<Record<string, { symbol: string; name: string }>> => {
    const result: Record<string, { symbol: string; name: string }> = {};
    
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
        }
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
        loadPositions();
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to execute flip');
    } finally {
      setIsFlipping(false);
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
      if (data?.checkedAt) {
        setLastAutoCheck(data.checkedAt);
      }
      if (data?.executed?.length > 0) {
        toast.success(`Sold ${data.executed.length} position(s) at target!`);
        loadPositions();
      } else {
        toast.success('Prices refreshed');
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

  const handleUpdateRebuySettings = async (positionId: string, enabled: boolean, rebuyPrice: number | null, rebuyAmount: number | null) => {
    const updateData: any = {
      rebuy_enabled: enabled,
      rebuy_price_usd: rebuyPrice,
      rebuy_amount_usd: rebuyAmount,
    };

    // If enabling and position is already sold, set status to watching
    const position = positions.find(p => p.id === positionId);
    if (enabled && position?.status === 'sold' && rebuyPrice && rebuyAmount) {
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

    toast.success(enabled ? 'Rebuy watching enabled!' : 'Rebuy disabled');
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
    return Math.min(Math.max(progress, -50), 100);
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
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

            {/* Token Input */}
            <div className="space-y-2">
              <Label className="flex items-center justify-between flex-wrap gap-2">
                <span className="flex items-center gap-2">
                  Token Address
                  {inputTokenSymbol && (
                    <span className="font-bold text-primary">
                      {inputTokenSymbol}{inputTokenName ? ` (${inputTokenName})` : ''}
                    </span>
                  )}
                </span>
                {isLoadingInputPrice && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" /> Fetching...
                  </span>
                )}
                {!isLoadingInputPrice && inputTokenPrice !== null && (
                  <span className="text-sm font-bold text-green-400">
                    ${inputTokenPrice.toFixed(10).replace(/\.?0+$/, '')}
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
                  disabled={isLoadingInputPrice || !tokenAddress.trim()}
                  className="shrink-0"
                >
                  {isLoadingInputPrice ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                </Button>
              </div>
              {inputTokenPrice !== null && buyAmount && (
                <p className="text-xs text-muted-foreground">
                  Entry: ~{(() => {
                    const amt = parseFloat(buyAmount);
                    if (isNaN(amt) || amt <= 0) return '—';
                    const usdAmount = buyAmountMode === 'sol' && solPrice ? amt * solPrice : amt;
                    const tokens = usdAmount / inputTokenPrice;
                    return `${tokens.toLocaleString(undefined, { maximumFractionDigits: 0 })} tokens`;
                  })()}
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
                  <SelectItem value="1.5">1.5x (+50%)</SelectItem>
                  <SelectItem value="2">2x (+100%)</SelectItem>
                  <SelectItem value="3">3x (+200%)</SelectItem>
                  <SelectItem value="5">5x (+400%)</SelectItem>
                  <SelectItem value="10">10x (+900%)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex gap-2 mt-4">
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
                  <TableHead>Token</TableHead>
                  <TableHead>Invested</TableHead>
                  <TableHead>Current Value</TableHead>
                  <TableHead>Target Value</TableHead>
                  <TableHead>Progress</TableHead>
                  <TableHead className="text-center">STOP-LOSS</TableHead>
                  <TableHead>SL Price</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Action</TableHead>
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

                  return (
                    <TableRow key={position.id}>
                      <TableCell>
                        <button
                          onClick={() => copyToClipboard(position.token_mint, 'Token address')}
                          className="font-mono text-xs hover:text-primary cursor-pointer flex items-center gap-1"
                          title={position.token_mint}
                        >
                          {position.token_symbol || position.token_mint.slice(0, 8) + '...'}
                          <Copy className="h-3 w-3 opacity-50" />
                        </button>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          Entry: ${position.buy_price_usd?.toFixed(8) || '-'}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">${position.buy_amount_usd?.toFixed(2) || '-'}</div>
                        {effectiveQuantityTokens !== null && (
                          <div className="text-xs text-muted-foreground">
                            {effectiveQuantityTokens.toLocaleString(undefined, { maximumFractionDigits: 2 })} tokens
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {currentPrice ? (
                          <div>
                            {currentValue !== null ? (
                              <div>
                                <span
                                  className={
                                    pnlUsd !== null && pnlUsd >= 0
                                      ? 'text-green-500 font-medium'
                                      : 'text-red-500 font-medium'
                                  }
                                >
                                  ${currentValue.toFixed(2)}
                                </span>
                                {pnlUsd !== null && (
                                  <div className={`text-xs ${pnlUsd >= 0 ? 'text-green-500' : 'text-red-500'}`}> 
                                    {pnlUsd >= 0 ? '+' : ''}${pnlUsd.toFixed(2)} ({pnlPercent?.toFixed(1)}%)
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {`Price: $${currentPrice.toFixed(8)}`}
                            </div>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <div>
                            <span className="font-medium">${targetValue.toFixed(2)}</span>
                            <span className="text-muted-foreground ml-1">({position.target_multiplier}x)</span>
                            <div className="text-green-500 text-xs">
                              +${targetProfit.toFixed(2)} profit
                            </div>
                            {position.target_price_usd && (
                              <div className="text-xs text-muted-foreground">
                                Target: ${position.target_price_usd.toFixed(8)}
                              </div>
                            )}
                          </div>
                          {position.status === 'holding' && position.buy_price_usd && (
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-6 w-6">
                                  <Pencil className="h-3 w-3" />
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-56 p-2" align="start">
                                <div className="space-y-1">
                                  <p className="text-xs text-muted-foreground mb-2">Change target:</p>
                                  {[1.5, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(mult => (
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
                      <TableCell className="w-32">
                        <Progress 
                          value={Math.max(0, progress)} 
                          className={`h-2 ${progress >= 100 ? 'bg-green-500' : progress < 0 ? 'bg-red-500' : ''}`}
                        />
                        <span className="text-xs text-muted-foreground">{progress.toFixed(0)}%</span>
                      </TableCell>
                      {/* Stop-Loss Toggle */}
                      <TableCell className="text-center">
                        {position.status === 'holding' && (
                          <Switch
                            checked={
                              emergencyEditing[position.id]?.enabled ?? 
                              (position.emergency_sell_status === 'watching')
                            }
                            onCheckedChange={(checked) => {
                              if (checked) {
                                // Enable: default stop-loss at 5% below entry price (95% of entry)
                                const entryPrice = position.buy_price_usd || 0;
                                const defaultPrice = entryPrice * 0.95; // 5% below entry
                                setEmergencyEditing(prev => ({
                                  ...prev,
                                  [position.id]: { enabled: true, price: defaultPrice.toFixed(10).replace(/\.?0+$/, '') }
                                }));
                              } else {
                                // Disable: save immediately
                                handleEmergencySellUpdate(position.id, false, null);
                              }
                            }}
                          />
                        )}
                      </TableCell>
                      {/* Stop-Loss Price */}
                      <TableCell>
                        {position.status === 'holding' && (
                          <div className="flex flex-col gap-1">
                            {emergencyEditing[position.id]?.enabled || position.emergency_sell_status === 'watching' ? (
                              <div className="flex items-center gap-1">
                                <span className="text-xs text-muted-foreground">$</span>
                                <Input
                                  type="text"
                                  className="h-7 w-28 text-xs font-mono"
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
                                  className="h-7 px-2"
                                  onClick={() => {
                                    const priceVal = parseFloat(emergencyEditing[position.id]?.price || position.emergency_sell_price_usd?.toString() || '0');
                                    if (priceVal > 0) {
                                      handleEmergencySellUpdate(position.id, true, priceVal);
                                    } else {
                                      toast.error('Enter a valid stop-loss price');
                                    }
                                  }}
                                >
                                  <CheckCircle2 className="h-3 w-3" />
                                </Button>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">-</span>
                            )}
                            {position.emergency_sell_status === 'watching' && !emergencyEditing[position.id] && (
                              <Badge variant="destructive" className="text-[10px] w-fit">
                                <AlertTriangle className="h-2 w-2 mr-1" />
                                WATCHING
                              </Badge>
                            )}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>{getStatusBadge(position.status)}</TableCell>
                      <TableCell>
                        {position.status === 'holding' && (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleForceSell(position.id)}
                          >
                            Sell Now
                          </Button>
                        )}
                      </TableCell>
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
                  <TableHead>Rebuy Price</TableHead>
                  <TableHead>Rebuy Amount</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {completedPositions.slice(0, 50).map(position => {
                  const editState = rebuyEditing[position.id] || {
                    enabled: position.rebuy_enabled || false,
                    price: position.rebuy_price_usd?.toString() || '',
                    amount: position.rebuy_amount_usd?.toString() || ''
                  };
                  
                  const isWatching = position.rebuy_status === 'watching';
                  const isExecuted = position.rebuy_status === 'executed';
                  const isCancelled = position.rebuy_status === 'cancelled';
                  
                  return (
                    <TableRow key={position.id}>
                      <TableCell>
                        <button
                          onClick={() => copyToClipboard(position.token_mint, 'Token address')}
                          className="font-mono text-xs hover:text-primary cursor-pointer flex items-center gap-1"
                          title={position.token_mint}
                        >
                          {position.token_symbol || position.token_mint.slice(0, 8) + '...'}
                          <Copy className="h-3 w-3 opacity-50" />
                        </button>
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
                      
                      {/* Rebuy Price Input */}
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-muted-foreground">$</span>
                          <Input
                            type="number"
                            step="0.00000001"
                            className="w-24 h-7 text-xs"
                            placeholder={position.sell_price_usd ? (position.sell_price_usd * 0.7).toFixed(8) : '0.0001'}
                            value={editState.price}
                            disabled={isExecuted || isWatching}
                            onChange={(e) => {
                              setRebuyEditing(prev => ({
                                ...prev,
                                [position.id]: { ...editState, price: e.target.value }
                              }));
                            }}
                          />
                        </div>
                        {position.sell_price_usd && editState.price && (
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {((1 - parseFloat(editState.price) / position.sell_price_usd) * 100).toFixed(1)}% drop
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
                      
                      {/* Actions */}
                      <TableCell>
                        <div className="flex gap-1">
                          {position.status === 'sold' && !isWatching && !isExecuted && (
                            <Button
                              size="sm"
                              variant={editState.enabled ? "default" : "outline"}
                              className="h-7 text-xs"
                              disabled={!editState.price || !editState.amount}
                              onClick={() => handleUpdateRebuySettings(
                                position.id,
                                editState.enabled,
                                parseFloat(editState.price) || null,
                                parseFloat(editState.amount) || null
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
