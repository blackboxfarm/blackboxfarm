import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Download, RefreshCw, Flag, AlertTriangle, Shield, TrendingUp, Diamond, Brain, Droplets, CheckCircle, Users, Wallet, DollarSign, BarChart3, Info, Search, Percent, ExternalLink, ChevronDown, ChevronUp, Eye, EyeOff, XCircle, Share2, MessageCircle, Send } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Progress } from '@/components/ui/progress';
import { useTokenMetadata } from '@/hooks/useTokenMetadata';
import { AdBanner } from '@/components/AdBanner';
import { TokenMetadataDisplay } from '@/components/token/TokenMetadataDisplay';
import { PremiumFeatureGate } from '@/components/premium/PremiumFeatureGate';
import { HolderMovementFeed } from '@/components/premium/HolderMovementFeed';
import { WhaleWarningSystem } from '@/components/premium/WhaleWarningSystem';
import { RetentionAnalysis } from '@/components/premium/RetentionAnalysis';
import { TokenHealthDashboard } from '@/components/premium/TokenHealthDashboard';
import { useAuth } from '@/hooks/useAuth';
import { useTokenDataCollection } from '@/hooks/useTokenDataCollection';

interface TokenHolder {
  owner: string;
  balance: number;
  usdValue: number;
  balanceRaw: string;
  percentageOfSupply: number;
  isLiquidityPool: boolean;
  lpDetectionReason: string;
  lpConfidence: number;
  detectedPlatform: string;
  accountOwnerProgram?: string;
  isDustWallet: boolean;
  isSmallWallet: boolean;
  isMediumWallet: boolean;
  isLargeWallet: boolean;
  isBossWallet: boolean;
  isKingpinWallet: boolean;
  isSuperBossWallet: boolean;
  isBabyWhaleWallet: boolean;
  isTrueWhaleWallet: boolean;
  tokenAccount: string;
  rank: number;
}

interface PotentialDevWallet {
  address: string;
  balance: number;
  usdValue: number;
  percentageOfSupply: number;
  confidence: number;
  reason: string;
}

interface FirstBuyer {
  wallet: string;
  firstBoughtAt: number;
  initialTokens: number;
  signature: string;
  purchaseRank: number;
  currentBalance: number;
  currentUsdValue: number;
  currentPercentageOfSupply: number;
  tokensSold: number;
  percentageSold: number;
  hasSold: boolean;
  pnl: number;
  pnlPercentage: number;
  isLiquidityPool: boolean;
  isDevWallet: boolean;
}

interface InsiderWallet {
  wallet: string;
  percentage: number;
  insiderType?: string;
}

interface WalletCluster {
  id: string;
  wallets: string[];
  totalPercentage: number;
  clusterType: string;
}

interface InsidersGraphData {
  hasInsiders: boolean;
  insiderCount: number;
  totalInsiderPercentage: number;
  clusters: WalletCluster[];
  topInsiders: InsiderWallet[];
  bundledWallets: string[];
  bundledPercentage: number;
  warnings: string[];
  fetchTimeMs: number;
  error?: string;
}

interface SimpleTier {
  count: number;
  percentage: number;
  avgValue: number;
  totalValue: number;
}

interface SimpleTiers {
  dust: SimpleTier;
  retail: SimpleTier;
  serious: SimpleTier;
  whales: SimpleTier;
}

interface DistributionStats {
  top5Percentage: number;
  top10Percentage: number;
  top20Percentage: number;
  top5Wallets: number;
  top10Wallets: number;
  top20Wallets: number;
}

interface CirculatingSupply {
  tokens: number;
  percentage: number;
  usdValue: number;
}

interface HealthScore {
  score: number;
  grade: string;
}

interface HoldersReport {
  tokenMint: string;
  totalHolders: number;
  liquidityPoolsDetected: number;
  lpBalance: number;
  lpPercentageOfSupply: number;
  nonLpHolders: number;
  nonLpBalance: number;
  realWallets: number;
  bossWallets: number;
  kingpinWallets: number;
  superBossWallets: number;
  babyWhaleWallets: number;
  trueWhaleWallets: number;
  largeWallets: number;
  mediumWallets: number;
  smallWallets: number;
  dustWallets: number;
  totalBalance: number;
  tokenPriceUSD: number;
  priceSource?: string;
  priceDiscoveryFailed?: boolean;
  holders: TokenHolder[];
  liquidityPools: TokenHolder[];
  potentialDevWallet?: PotentialDevWallet;
  firstBuyers?: FirstBuyer[];
  firstBuyersError?: string;
  firstBuyersDebug?: {
    endpoint: string;
    method?: string;
    buyersFound?: number;
    totalTransactionsSearched?: number;
  };
  launchpadInfo?: {
    name: string;
    detected: boolean;
    confidence: 'high' | 'medium' | 'low';
  };
  socials?: {
    twitter?: string;
    telegram?: string;
    website?: string;
  };
  dexStatus?: {
    hasDexPaid: boolean;
    hasCTO: boolean;
    activeBoosts: number;
    hasAds: boolean;
  };
  creatorInfo?: {
    wallet?: string;
    balance?: number;
    balanceUsd?: number;
    bondingCurveProgress?: number;
    xAccount?: string;
    feeSplit?: { wallet1?: string; wallet2?: string; splitPercent?: number };
  };
  insidersGraph?: InsidersGraphData;
  // NEW: Simplified tiers
  simpleTiers?: SimpleTiers;
  // NEW: Distribution stats
  distributionStats?: DistributionStats;
  // NEW: Circulating supply
  circulatingSupply?: CirculatingSupply;
  // NEW: Risk flags
  riskFlags?: string[];
  // NEW: Health score
  healthScore?: HealthScore;
  summary: string;
}
interface BaglessHoldersReportProps {
  initialToken?: string;
}

export function BaglessHoldersReport({ initialToken }: BaglessHoldersReportProps) {
  const [tokenMint, setTokenMint] = useState(initialToken || '');
  const [tokenPrice, setTokenPrice] = useState('');
  const [useAutoPricing, setUseAutoPricing] = useState(true);
  const [isFetchingPrice, setIsFetchingPrice] = useState(false);
  const [discoveredPrice, setDiscoveredPrice] = useState<number | null>(null);
  const [priceSource, setPriceSource] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [report, setReport] = useState<HoldersReport | null>(null);
  const [walletTwitterHandles, setWalletTwitterHandles] = useState<Map<string, string>>(new Map());
  const [isLoadingTwitter, setIsLoadingTwitter] = useState(false);
  const [kolWallets, setKolWallets] = useState<any[]>([]);
  const [kolMatches, setKolMatches] = useState<any[]>([]);
  const [filteredHolders, setFilteredHolders] = useState<TokenHolder[]>([]);
  const [tokenAge, setTokenAge] = useState<number | undefined>(undefined); // Age in hours
  const [showDustOnly, setShowDustOnly] = useState(false);
  const [showSmallOnly, setShowSmallOnly] = useState(false);
  const [showMediumOnly, setShowMediumOnly] = useState(false);
  const [showLargeOnly, setShowLargeOnly] = useState(false);
  const [showRealOnly, setShowRealOnly] = useState(false);
  const [showBossOnly, setShowBossOnly] = useState(false);
  const [showKingpinOnly, setShowKingpinOnly] = useState(false);
  const [showSuperBossOnly, setShowSuperBossOnly] = useState(false);
  const [showBabyWhaleOnly, setShowBabyWhaleOnly] = useState(false);
  const [showTrueWhaleOnly, setShowTrueWhaleOnly] = useState(false);
  const [showLPOnly, setShowLPOnly] = useState(false);
  const [excludeLPs, setExcludeLPs] = useState(false);
  const [walletFlags, setWalletFlags] = useState<{[address: string]: { flag: 'dev' | 'team' | 'suspicious'; timestamp: number }}>({});
  const [flagModalOpen, setFlagModalOpen] = useState(false);
  const [selectedWallet, setSelectedWallet] = useState<string | null>(null);
  // NEW: Toggle states for accordion views
  const [holderViewMode, setHolderViewMode] = useState<'simple' | 'granular'>('simple');
  const [sedimentViewMode, setSedimentViewMode] = useState<'simple' | 'granular'>('simple');
  const [feedbackGiven, setFeedbackGiven] = useState<'up' | 'down' | null>(null);
  const { toast } = useToast();
  const { tokenData, fetchTokenMetadata } = useTokenMetadata();
  const { user } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);
  
  // Background data collection - builds historical data for premium features
  useTokenDataCollection(
    report?.tokenMint || null,
    report?.holders,
    report?.tokenPriceUSD
  );

  // Load wallet flags from localStorage when tokenMint changes
  useEffect(() => {
    if (tokenMint.trim()) {
      const stored = localStorage.getItem(`wallet-flags-${tokenMint.trim()}`);
      if (stored) {
        try {
          setWalletFlags(JSON.parse(stored));
        } catch (e) {
          console.error('Failed to load wallet flags:', e);
        }
      } else {
        setWalletFlags({});
      }
    }
  }, [tokenMint]);

  // Save wallet flags to localStorage when they change
  useEffect(() => {
    if (tokenMint.trim() && Object.keys(walletFlags).length > 0) {
      localStorage.setItem(`wallet-flags-${tokenMint.trim()}`, JSON.stringify(walletFlags));
    }
  }, [walletFlags, tokenMint]);

  // Sync tokenMint state when initialToken prop changes (handles URL param after mount)
  useEffect(() => {
    if (initialToken && initialToken.trim()) {
      const normalized = (() => {
        let m = initialToken.trim();
        if (m.length > 44 && m.endsWith('pump')) m = m.slice(0, -4);
        if (m.length > 44) m = m.slice(0, 44);
        return m;
      })();
      if (tokenMint.trim() !== normalized) {
        setTokenMint(normalized);
      }
    }
  }, [initialToken]);

  // Fetch token metadata when tokenMint changes
  useEffect(() => {
    const raw = tokenMint.trim();
    if (!raw) return;
    let normalized = raw;
    if (normalized.length > 44 && normalized.endsWith('pump')) normalized = normalized.slice(0, -4);
    if (normalized.length > 44) normalized = normalized.slice(0, 44);
    if (normalized !== tokenMint) {
      setTokenMint(normalized);
      return;
    }
    fetchTokenMetadata(normalized);
  }, [tokenMint, fetchTokenMetadata]);

  // Auto-generate report when token metadata is successfully fetched
  useEffect(() => {
    if (tokenData && !report && !isLoading && tokenMint.trim()) {
      // Small delay to ensure metadata is fully processed
      const timer = setTimeout(() => {
        generateReport();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [tokenData]);


  useEffect(() => {
    if (report) {
      let filtered = report.holders;
      
      // Filter to only show wallets above $1 USD
      filtered = filtered.filter(h => (h.usdValue || 0) >= 1);
      
      // Apply LP filtering first
      if (excludeLPs) {
        filtered = filtered.filter(h => !h.isLiquidityPool);
      } else if (showLPOnly) {
        filtered = filtered.filter(h => h.isLiquidityPool);
      }
      
      // Apply category filtering (only if not showing LP only)
      if (!showLPOnly) {
        if (showDustOnly) {
          filtered = filtered.filter(h => h.usdValue < 1);
        } else if (showSmallOnly) {
          filtered = filtered.filter(h => h.usdValue >= 1 && h.usdValue < 5);
        } else if (showMediumOnly) {
          filtered = filtered.filter(h => h.usdValue >= 1 && h.usdValue < 4);
        } else if (showLargeOnly) {
          filtered = filtered.filter(h => h.usdValue >= 5 && h.usdValue < 49);
        } else if (showRealOnly) {
          filtered = filtered.filter(h => h.usdValue >= 50 && h.usdValue < 199);
        } else if (showBossOnly) {
          filtered = filtered.filter(h => h.usdValue >= 200 && h.usdValue < 500);
        } else if (showKingpinOnly) {
          filtered = filtered.filter(h => h.usdValue >= 500 && h.usdValue < 1000);
        } else if (showSuperBossOnly) {
          filtered = filtered.filter(h => h.usdValue >= 1000 && h.usdValue < 2000);
        } else if (showBabyWhaleOnly) {
          filtered = filtered.filter(h => h.usdValue >= 2000 && h.usdValue < 5000);
        } else if (showTrueWhaleOnly) {
          filtered = filtered.filter(h => h.usdValue >= 5000);
        }
      }
      
      setFilteredHolders(filtered);
    }
  }, [report, showDustOnly, showSmallOnly, showMediumOnly, showLargeOnly, showRealOnly, showBossOnly, showKingpinOnly, showSuperBossOnly, showBabyWhaleOnly, showTrueWhaleOnly, showLPOnly, excludeLPs]);

  const fetchTwitterHandles = async (reportData: HoldersReport) => {
    const startTime = performance.now();
    console.log('⏱️ [PERF] Starting Twitter SNS lookup...');
    setIsLoadingTwitter(true);
    try {
      // Get top 10 holders with USD values
      const walletsToLookup = reportData.holders
        .filter(h => (h.usdValue || 0) >= 100)
        .slice(0, 200)
        .map(holder => ({
          address: holder.owner,
          usdValue: holder.usdValue
        }));
      console.log(`⏱️ [PERF] Prepared ${walletsToLookup.length} wallets for lookup`);

      const lookupStart = performance.now();
      const { data, error } = await supabase.functions.invoke('wallet-sns-lookup', {
        body: { wallets: walletsToLookup }
      });
      const lookupTime = performance.now() - lookupStart;
      console.log(`⏱️ [PERF] SNS lookup completed in ${lookupTime.toFixed(0)}ms`);

      if (error) {
        console.error("Error fetching Twitter handles:", error);
        return;
      }

      // Build map of wallet address -> Twitter handle
      const twitterMap = new Map<string, string>();
      data.results?.forEach((result: any) => {
        if (result.twitter && result.source !== 'skipped_threshold') {
          twitterMap.set(result.address, result.twitter);
        }
      });

      setWalletTwitterHandles(twitterMap);
      
      const totalTime = performance.now() - startTime;
      console.log(`✅ [PERF] Twitter lookup TOTAL: ${totalTime.toFixed(0)}ms | Found: ${twitterMap.size} handles`);
      
      // Toast removed - UI feedback is sufficient
    } catch (error: any) {
      const totalTime = performance.now() - startTime;
      console.error(`❌ [PERF] Twitter lookup FAILED after ${totalTime.toFixed(0)}ms:`, error);
    } finally {
      setIsLoadingTwitter(false);
    }
  };

  const fetchKOLWallets = async (reportData: HoldersReport) => {
    const startTime = performance.now();
    console.log('⏱️ [PERF] Starting KOL wallet fetch...');
    try {
      const { data, error } = await supabase
        .from('kol_wallets')
        .select('wallet_address,twitter_handle,sns_name,last_verified_at,is_active')
        .eq('is_active', true);
      const fetchTime = performance.now() - startTime;
      console.log(`⏱️ [PERF] KOL fetch completed in ${fetchTime.toFixed(0)}ms`);

      if (error) {
        console.error('Error fetching KOL wallets:', error);
        return;
      }

      setKolWallets(data || []);
      if (reportData?.holders?.length) {
        const holderSet = new Set(reportData.holders.map(h => h.owner));
        const matches = (data || []).filter((k: any) => holderSet.has(k.wallet_address));
        setKolMatches(matches);
        const totalTime = performance.now() - startTime;
        console.log(`✅ [PERF] KOL matching TOTAL: ${totalTime.toFixed(0)}ms | Matches: ${matches.length}`);
      }
    } catch (err) {
      const totalTime = performance.now() - startTime;
      console.error(`❌ [PERF] KOL fetch FAILED after ${totalTime.toFixed(0)}ms:`, err);
    }
  };

  const fetchTokenPrice = async () => {
    if (!tokenMint.trim()) return;
    
    const startTime = performance.now();
    console.log('⏱️ [PERF] Starting price discovery...');
    setIsFetchingPrice(true);
    setDiscoveredPrice(null);
    setPriceSource('');
    
    try {
      const { data, error } = await supabase.functions.invoke('bagless-holders-report', {
        body: {
          tokenMint: tokenMint.trim(),
          manualPrice: 0 // Force price discovery
        }
      });
      const fetchTime = performance.now() - startTime;
      console.log(`⏱️ [PERF] Price discovery completed in ${fetchTime.toFixed(0)}ms`);

      if (error) {
        const ctx = (error as any)?.context?.body;
        let message = (error as any)?.message || 'Price discovery failed';
        if (ctx) {
          try {
            const parsed = JSON.parse(ctx);
            message = parsed?.details || parsed?.error || message;
          } catch {}
        }
        throw new Error(message);
      }
      
      if (data.tokenPriceUSD > 0) {
        setDiscoveredPrice(data.tokenPriceUSD);
        setPriceSource(data.priceSource || 'API');
        const totalTime = performance.now() - startTime;
        console.log(`✅ [PERF] Price discovery SUCCESS: ${totalTime.toFixed(0)}ms | Price: $${data.tokenPriceUSD}`);
        // Toast removed - UI feedback is sufficient
      } else {
        throw new Error('Price discovery failed');
      }
    } catch (error) {
      const totalTime = performance.now() - startTime;
      console.error(`❌ [PERF] Price discovery FAILED after ${totalTime.toFixed(0)}ms:`, error);
      const msg = error instanceof Error ? error.message : 'Could not fetch token price automatically. Please enter manually.';
      // Toast removed - UI feedback is sufficient
    } finally {
      setIsFetchingPrice(false);
    }
  };

  const generateReport = async () => {
    if (!tokenMint) {
      toast({
        title: "Missing Information",
        description: "Please provide token mint address",
        variant: "destructive"
      });
      return;
    }

    const reportStartTime = performance.now();
    console.log('🚀 [PERF] ========== STARTING FULL REPORT GENERATION ==========');
    setIsLoading(true);
    setReport(null);
    
    try {
      console.log('⏱️ [PERF] Generating holders report...');
      const priceToUse = useAutoPricing ? 0 : parseFloat(tokenPrice) || 0;
      
      if (useAutoPricing) {
        setIsFetchingPrice(true);
      }
      
      const edgeFunctionStart = performance.now();
      const { data, error } = await supabase.functions.invoke('bagless-holders-report', {
        body: {
          tokenMint: tokenMint.trim(),
          manualPrice: priceToUse
        }
      });
      const edgeFunctionTime = performance.now() - edgeFunctionStart;
      console.log(`⏱️ [PERF] Edge function completed in ${edgeFunctionTime.toFixed(0)}ms`);

      if (error) {
        console.error('Report generation error:', error);
        let message = (error as any)?.message || 'Report generation failed';
        const ctx = (error as any)?.context?.body;
        if (ctx) {
          try {
            const parsed = JSON.parse(ctx);
            message = parsed?.details || parsed?.error || message;
          } catch {}
        }
        throw new Error(message);
      }

      console.log('⏱️ [PERF] Report data received, processing...');
      setReport(data);
      
      // Calculate token age from first buyer timestamp (if available)
      if (data.firstBuyers && data.firstBuyers.length > 0) {
        const oldestBuyerTimestamp = Math.min(...data.firstBuyers.map((b: FirstBuyer) => b.firstBoughtAt));
        const ageInHours = (Date.now() / 1000 - oldestBuyerTimestamp) / 3600;
        setTokenAge(ageInHours);
        console.log(`Token age: ${ageInHours.toFixed(1)} hours`);
      }
      
      // Update discovered price info if auto pricing was used
      if (useAutoPricing) {
        setDiscoveredPrice(data.tokenPriceUSD);
        setPriceSource(data.priceSource || 'Multiple APIs');
      }
      
      const reportProcessTime = performance.now() - reportStartTime;
      console.log(`✅ [PERF] Report processing complete: ${reportProcessTime.toFixed(0)}ms`);
      
      // Note: Snapshot capture now handled by useTokenDataCollection hook
      
      // Fetch Twitter handles for top holders (async - won't block)
      console.log('⏱️ [PERF] Starting parallel data fetches (KOL only - Twitter SNS BYPASSED)...');
      const parallelStart = performance.now();
      await Promise.all([
        // fetchTwitterHandles(data), // BYPASSED
        fetchKOLWallets(data)
      ]);
      const parallelTime = performance.now() - parallelStart;
      console.log(`✅ [PERF] Parallel fetches complete: ${parallelTime.toFixed(0)}ms`);
      
      const totalReportTime = performance.now() - reportStartTime;
      console.log(`🏁 [PERF] ========== FULL REPORT COMPLETE: ${totalReportTime.toFixed(0)}ms (${(totalReportTime / 1000).toFixed(2)}s) ==========`);
      
      const priceInfo = data.tokenPriceUSD > 0 ? 
        ` (Price: $${data.tokenPriceUSD.toFixed(8)}${data.priceSource ? ` from ${data.priceSource}` : ''})` : 
        ' (Price: Failed to fetch)';
      
      // Toast removed - UI feedback is sufficient
    } catch (error) {
      const totalReportTime = performance.now() - reportStartTime;
      console.error(`❌ [PERF] Report generation FAILED after ${totalReportTime.toFixed(0)}ms:`, error);
      toast({
        title: "Report Generation Failed",
        description: error instanceof Error ? error.message : "Failed to generate holders report",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
      setIsFetchingPrice(false);
    }
  };

  const exportToCSV = () => {
    if (!report) return;
    
    const csvContent = [
      ['Rank', 'Wallet Address', 'Token Balance', 'USD Value', 'Wallet Type', 'Token Account'].join(','),
      ...filteredHolders.map(holder => [
        holder.rank,
        holder.owner,
        holder.balance,
        (holder.usdValue || 0).toFixed(4),
        holder.isLiquidityPool ? `LP (${holder.detectedPlatform || 'Unknown'})` : holder.isDustWallet ? 'Dust' : holder.isSmallWallet ? 'Small' : holder.isMediumWallet ? 'Medium' : holder.isLargeWallet ? 'Large' : holder.isBossWallet ? 'Boss' : holder.isKingpinWallet ? 'Kingpin' : holder.isSuperBossWallet ? 'Super Boss' : holder.isBabyWhaleWallet ? 'Baby Whale' : holder.isTrueWhaleWallet ? 'True Whale' : 'Real',
        holder.tokenAccount
      ].join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `token-holders-report-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const formatBalance = (balance: number) => {
    return balance.toLocaleString(undefined, { maximumFractionDigits: 6 });
  };

  const truncateAddress = (address: string) => {
    return `${address.slice(0, 8)}...${address.slice(-8)}`;
  };

  // Calculate top 10 holder stats (excluding LP and dev)
  const calculateTop10Stats = () => {
    if (!report) return { top10: [], cumulativePercentage: 0, top10Percentage: 0 };
    const devWallet = report.potentialDevWallet?.address;
    const nonLPHolders = report.holders.filter(h => !h.isLiquidityPool && h.owner !== devWallet);
    const top10 = nonLPHolders.slice(0, 10);
    const cumulativePercentage = top10.reduce((sum, h) => sum + h.percentageOfSupply, 0);
    return { top10, cumulativePercentage, top10Percentage: cumulativePercentage };
  };

  // Calculate 24h holder change - simplified approach using recent report data
  const calculate24hHolderChange = (): number => {
    // For now, return 0 as we don't have historical snapshot data in state
    // The edge function would need to be called separately for real data
    // This is a placeholder that could be enhanced later
    return 0;
  };

  // Calculate LP vs Unlocked Supply
  const calculateLPAnalysis = () => {
    if (!report) return { 
      unlockedSupply: 0, 
      unlockedPercentage: 0, 
      lpPercentage: 0, 
      lpCount: 0, 
      lpWallets: [], 
      hasHighConfidenceLP: false, 
      hasLowConfidenceLP: false, 
      suspiciousZeroLP: false, 
      confidence: 50 
    };
    
    const lpWallets = report.holders.filter(h => h.isLiquidityPool);
    const totalLPTokens = lpWallets.reduce((sum, w) => sum + w.balance, 0);
    const lpPercentage = (totalLPTokens / report.totalBalance) * 100;
    const unlockedSupply = report.totalBalance - totalLPTokens;
    
    // Detect suspicious LP detection
    const hasHighConfidenceLP = lpWallets.some(w => (w.lpConfidence || 0) >= 90);
    const hasLowConfidenceLP = lpWallets.some(w => (w.lpConfidence || 0) < 70);
    const top10Stats = calculateTop10Stats();
    const suspiciousZeroLP = lpPercentage === 0 && top10Stats && top10Stats.cumulativePercentage > 30;
    
    return {
      lpCount: lpWallets.length,
      lpPercentage,
      unlockedSupply,
      unlockedPercentage: 100 - lpPercentage,
      lpWallets,
      hasHighConfidenceLP,
      hasLowConfidenceLP,
      suspiciousZeroLP
    };
  };

  // Calculate Stability Score
  const calculateStabilityScore = () => {
    if (!report) return null;
    
    const nonLPHolders = report.holders.filter(h => !h.isLiquidityPool);
    const whalePercentage = nonLPHolders
      .filter(h => h.percentageOfSupply >= 1)
      .reduce((sum, h) => sum + h.percentageOfSupply, 0);
    
    const top10Stats = calculateTop10Stats();
    const lpAnalysis = calculateLPAnalysis();
    
    // Whale concentration score (40 points max)
    const whaleScore = Math.max(0, Math.min(40, 40 - (whalePercentage * 1.33)));
    
    // Top 10 distribution score (30 points max)
    const top10Percentage = top10Stats.cumulativePercentage;
    let distributionScore = 30;
    if (top10Percentage > 40) {
      distributionScore = Math.max(0, 30 - ((top10Percentage - 40) * 0.75));
    } else if (top10Percentage > 20) {
      distributionScore = 15 + ((40 - top10Percentage) * 0.75);
    } else {
      distributionScore = 25 + ((20 - top10Percentage) * 0.25);
    }
    
    // LP percentage score (20 points max) - ideal range 5-15%
    const lpPct = lpAnalysis.lpPercentage;
    let lpScore = 0;
    if (lpPct >= 5 && lpPct <= 15) {
      lpScore = 18 + ((15 - Math.abs(lpPct - 10)) * 0.2);
    } else if ((lpPct >= 2 && lpPct < 5) || (lpPct > 15 && lpPct <= 25)) {
      lpScore = 10 + (8 * (1 - Math.abs(lpPct - 10) / 15));
    } else {
      lpScore = Math.max(0, 10 - (Math.abs(lpPct - 10) / 3));
    }
    
    // Holder count score (10 points max)
    let holderScore = 0;
    if (report.totalHolders > 1000) holderScore = 10;
    else if (report.totalHolders > 500) holderScore = 7 + ((report.totalHolders - 500) / 500) * 3;
    else if (report.totalHolders > 100) holderScore = 4 + ((report.totalHolders - 100) / 400) * 3;
    else holderScore = (report.totalHolders / 100) * 4;
    
    const totalScore = Math.round(whaleScore + distributionScore + lpScore + holderScore);
    
    // Determine risk level based on whale concentration
    let riskLevel: 'low' | 'medium' | 'high';
    let emoji: string;
    let label: string;
    
    if (whalePercentage < 10) {
      riskLevel = 'low';
      emoji = '🟢';
      label = 'Community-owned';
    } else if (whalePercentage < 30) {
      riskLevel = 'medium';
      emoji = '🟡';
      label = 'Neutral';
    } else {
      riskLevel = 'high';
      emoji = '🔴';
      label = 'High Risk';
    }
    
    return {
      score: totalScore,
      riskLevel,
      emoji,
      label,
      whalePercentage,
      breakdown: {
        whaleScore: Math.round(whaleScore),
        distributionScore: Math.round(distributionScore),
        lpScore: Math.round(lpScore),
        holderCountScore: Math.round(holderScore)
      }
    };
  };

  // Detect suspicious patterns
  const detectSuspiciousPatterns = () => {
    if (!report) return [];
    const alerts: Array<{ type: 'critical' | 'warning' | 'info'; message: string; flagged?: boolean }> = [];
    const nonLPHolders = report.holders.filter(h => !h.isLiquidityPool);
    
    // Dev wallet detection
    if (report.potentialDevWallet) {
      const devFlag = walletFlags[report.potentialDevWallet.address];
      alerts.push({
        type: devFlag?.flag === 'dev' ? 'info' : 'warning',
        message: `Potential Dev: ${truncateAddress(report.potentialDevWallet.address)} holds ${report.potentialDevWallet.percentageOfSupply.toFixed(1)}% - ${report.potentialDevWallet.reason}`,
        flagged: devFlag?.flag === 'dev'
      });
    }
    
    // Single wallet >10%
    const largeHolders = nonLPHolders.filter(h => h.percentageOfSupply > 10);
    largeHolders.forEach(h => {
      alerts.push({
        type: 'warning',
        message: `Wallet ${truncateAddress(h.owner)} holds ${h.percentageOfSupply.toFixed(1)}% of supply`
      });
    });
    
    // Top 3 combined
    const top3 = nonLPHolders.slice(0, 3);
    const top3Percentage = top3.reduce((sum, h) => sum + h.percentageOfSupply, 0);
    if (top3Percentage > 50) {
      alerts.push({
        type: 'critical',
        message: `Top 3 wallets control ${top3Percentage.toFixed(1)}% of supply`
      });
    }
    
    // Flagged wallets
    Object.entries(walletFlags).forEach(([address, data]) => {
      const holder = report.holders.find(h => h.owner === address);
      if (holder && !holder.isLiquidityPool && address !== report.potentialDevWallet?.address) {
        const label = data.flag === 'dev' ? 'Dev wallet' : 
                     data.flag === 'team' ? 'Team wallet' : 'Suspicious wallet';
        alerts.push({
          type: 'info',
          message: `${label} holds ${holder.percentageOfSupply.toFixed(1)}% of supply`,
          flagged: true
        });
      }
    });
    
    return alerts;
  };

  const handleFlagWallet = (address: string) => {
    setSelectedWallet(address);
    setFlagModalOpen(true);
  };

  const setWalletFlag = (flag: 'dev' | 'team' | 'suspicious' | null) => {
    if (!selectedWallet) return;
    
    if (flag === null) {
      const newFlags = { ...walletFlags };
      delete newFlags[selectedWallet];
      setWalletFlags(newFlags);
    } else {
      setWalletFlags({
        ...walletFlags,
        [selectedWallet]: { flag, timestamp: Date.now() }
      });
    }
    
    setFlagModalOpen(false);
    setSelectedWallet(null);
    
    toast({
      title: flag ? "Wallet Flagged" : "Flag Removed",
      description: flag ? `Wallet marked as ${flag}` : "Wallet flag cleared"
    });
  };

  const getFlagBadge = (address: string) => {
    const flag = walletFlags[address];
    if (!flag) return null;
    
    const badgeConfig = {
      dev: { label: 'Dev', className: 'bg-red-500/20 text-red-700 dark:text-red-300 border-red-500/30' },
      team: { label: 'Team', className: 'bg-blue-500/20 text-blue-700 dark:text-blue-300 border-blue-500/30' },
      suspicious: { label: 'Sus', className: 'bg-orange-500/20 text-orange-700 dark:text-orange-300 border-orange-500/30' }
    };
    
    const config = badgeConfig[flag.flag];
    return (
      <Badge variant="outline" className={`text-xs ${config.className}`}>
        <Flag className="h-3 w-3 mr-1" />
        {config.label}
      </Badge>
    );
  };

  return (
    <div className="space-y-3 md:space-y-6">
      <Card>
        <CardHeader className="p-3 md:p-6 pb-2 md:pb-4">
          <CardTitle className="text-base md:text-xl">Token Holders Report</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 md:space-y-4 p-3 md:p-6 pt-2 md:pt-0">
          <div>
            <Label htmlFor="tokenMint" className="text-sm">Token Mint Address</Label>
            <Input
              id="tokenMint"
              value={tokenMint}
              onChange={(e) => setTokenMint(e.target.value)}
              placeholder="Token mint address"
              className="mt-1 text-sm"
            />
          </div>
          
          {/* Removed "Generating Holders Report" notification */}

          <div className="flex gap-2">
            <Button 
              onClick={generateReport} 
              disabled={isLoading || isFetchingPrice}
              className="flex-1 text-sm h-10"
            >
              {isLoading || isFetchingPrice ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  <span className="hidden sm:inline">{isFetchingPrice ? 'Fetching Price...' : 'Generating Report...'}</span>
                  <span className="sm:hidden">{isFetchingPrice ? 'Fetching...' : 'Generating...'}</span>
                </>
              ) : (
                <>
                  <span className="hidden sm:inline">Generate Holders Report</span>
                  <span className="sm:hidden">Generate Report</span>
                </>
              )}
            </Button>
            
            {useAutoPricing && (
              <Button 
                variant="outline"
                onClick={fetchTokenPrice}
                disabled={!tokenMint.trim() || isFetchingPrice}
                size="icon"
              >
                <RefreshCw className={`h-4 w-4 ${isFetchingPrice ? 'animate-spin' : ''}`} />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Ad Banner under Generate Button */}
      <AdBanner size="mobile" position={1} />

      {/* Token Metadata - show as soon as metadata is fetched (before report) */}
      {tokenData && (
        <div className="mb-4 md:mb-6">
          <TokenMetadataDisplay 
            metadata={tokenData.metadata}
            priceInfo={tokenData.priceInfo}
            onChainData={tokenData.onChainData}
            pools={tokenData.pools}
            tokenAge={tokenAge}
            twitterUrl={report?.socials?.twitter}
            telegramUrl={report?.socials?.telegram}
            websiteUrl={report?.socials?.website}
            dexStatus={report?.dexStatus}
            creatorInfo={report?.creatorInfo}
          />
        </div>
      )}

      {/* Bundle Analysis Section - RugCheck Insiders */}
      {report?.insidersGraph?.hasInsiders && (
        <Card className={`border-2 ${
          report.insidersGraph.bundledPercentage > 10 
            ? 'border-red-500/50 bg-red-500/5' 
            : report.insidersGraph.warnings.length > 0 
              ? 'border-yellow-500/50 bg-yellow-500/5'
              : 'border-blue-500/30 bg-blue-500/5'
        }`}>
          <CardHeader className="p-3 md:p-6 pb-2 md:pb-3">
            <CardTitle className="flex items-center gap-2 text-base md:text-lg">
              <Users className="h-5 w-5" />
              Bundle / Insider Analysis
              {report.insidersGraph.bundledPercentage > 10 && (
                <Badge variant="destructive" className="text-xs">
                  ⚠️ High Risk
                </Badge>
              )}
              <a
                href={`https://rugcheck.xyz/tokens/${report.tokenMint}`}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto text-xs text-muted-foreground hover:text-primary flex items-center gap-1"
              >
                <span className="hidden sm:inline">View on RugCheck</span>
                <ExternalLink className="h-3 w-3" />
              </a>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 md:p-6 pt-0 md:pt-0 space-y-3">
            {/* Warnings */}
            {report.insidersGraph.warnings.length > 0 && (
              <div className="space-y-1">
                {report.insidersGraph.warnings.map((warning, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-xs text-yellow-600 dark:text-yellow-400">
                    <AlertTriangle className="h-3 w-3 flex-shrink-0" />
                    {warning}
                  </div>
                ))}
              </div>
            )}

            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
              <div className="p-2 bg-muted/50 rounded-lg text-center">
                <p className="text-xs text-muted-foreground">Insider Wallets</p>
                <p className="text-lg md:text-xl font-bold">{report.insidersGraph.insiderCount}</p>
              </div>
              <div className="p-2 bg-muted/50 rounded-lg text-center">
                <p className="text-xs text-muted-foreground">Insider Holdings</p>
                <p className="text-lg md:text-xl font-bold">{report.insidersGraph.totalInsiderPercentage.toFixed(1)}%</p>
              </div>
              <div className={`p-2 rounded-lg text-center ${
                report.insidersGraph.bundledPercentage > 10 ? 'bg-red-500/20' : 'bg-muted/50'
              }`}>
                <p className="text-xs text-muted-foreground">Bundled</p>
                <p className={`text-lg md:text-xl font-bold ${
                  report.insidersGraph.bundledPercentage > 10 ? 'text-red-600 dark:text-red-400' : ''
                }`}>{report.insidersGraph.bundledPercentage.toFixed(1)}%</p>
              </div>
              <div className="p-2 bg-muted/50 rounded-lg text-center">
                <p className="text-xs text-muted-foreground">Clusters</p>
                <p className="text-lg md:text-xl font-bold">{report.insidersGraph.clusters.length}</p>
              </div>
            </div>

            {/* Top Insiders List */}
            {report.insidersGraph.topInsiders.length > 0 && (
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="insiders" className="border-none">
                  <AccordionTrigger className="text-xs py-2 hover:no-underline">
                    <span className="flex items-center gap-2">
                      <Eye className="h-3 w-3" />
                      Top {Math.min(10, report.insidersGraph.topInsiders.length)} Insider Wallets
                    </span>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-1 pt-1">
                      {report.insidersGraph.topInsiders.slice(0, 10).map((insider, idx) => (
                        <div key={idx} className="flex items-center justify-between text-xs p-1.5 bg-muted/30 rounded">
                          <a
                            href={`https://solscan.io/account/${insider.wallet}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-mono text-primary hover:underline"
                          >
                            {insider.wallet.slice(0, 6)}...{insider.wallet.slice(-4)}
                          </a>
                          <div className="flex items-center gap-2">
                            {insider.insiderType && insider.insiderType !== 'insider' && (
                              <Badge variant="outline" className="text-[10px] px-1 py-0">
                                {insider.insiderType}
                              </Badge>
                            )}
                            <span className={`font-medium ${
                              insider.percentage > 5 ? 'text-red-600 dark:text-red-400' : ''
                            }`}>
                              {insider.percentage.toFixed(2)}%
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            )}

            {/* Bundled Wallets */}
            {report.insidersGraph.bundledWallets.length > 0 && (
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="bundled" className="border-none">
                  <AccordionTrigger className="text-xs py-2 hover:no-underline">
                    <span className="flex items-center gap-2 text-red-600 dark:text-red-400">
                      <AlertTriangle className="h-3 w-3" />
                      {report.insidersGraph.bundledWallets.length} Bundled Wallets Detected
                    </span>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-1 pt-1">
                      {report.insidersGraph.bundledWallets.slice(0, 20).map((wallet, idx) => (
                        <a
                          key={idx}
                          href={`https://solscan.io/account/${wallet}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block text-xs font-mono text-primary hover:underline p-1 bg-red-500/10 rounded"
                        >
                          {wallet.slice(0, 8)}...{wallet.slice(-6)}
                        </a>
                      ))}
                      {report.insidersGraph.bundledWallets.length > 20 && (
                        <p className="text-xs text-muted-foreground">
                          +{report.insidersGraph.bundledWallets.length - 20} more
                        </p>
                      )}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            )}
          </CardContent>
        </Card>
      )}


      {report && (
        <>
          {/* Token Health Dashboard - Hidden */}
          <div className="hidden">
            {(() => {
              const lpAnalysis = calculateLPAnalysis();
              const top10Stats = calculateTop10Stats();
              
              return (
                <TokenHealthDashboard 
                  lpPercentage={lpAnalysis.lpPercentage}
                  top10Concentration={top10Stats.top10Percentage}
                  lpDetectionConfidence={lpAnalysis.confidence}
                />
              );
            })()}
          </div>

          {/* Real-Time Whale Movements - Hidden */}
          {tokenMint && (
            <div className="hidden">
              <WhaleWarningSystem tokenMint={tokenMint} />
              <HolderMovementFeed tokenMint={tokenMint} hideWhenEmpty={true} tokenAge={tokenAge} />
            </div>
          )}

          <Card>
            <CardHeader className="p-3 md:p-6 pb-2 md:pb-4">
              <CardTitle className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                <span className="text-base md:text-xl">Report Summary</span>
                <Button 
                  onClick={exportToCSV}
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-2 text-xs h-8 self-end sm:self-auto"
                >
                  <Download className="h-3 w-3" />
                  <span className="hidden xs:inline">Export CSV</span>
                  <span className="xs:hidden">CSV</span>
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 md:p-6 pt-2 md:pt-0">
              {/* Launchpad banner removed - redundant info */}

              
              {/* Ad Banner #2 - After Token Metadata */}
              <div className="block md:hidden">
                <AdBanner size="mobile" position={2} />
              </div>
              <div className="hidden md:block">
                <AdBanner size="leaderboard" position={2} />
              </div>
              
              {/* Token price removed - redundant info */}
              
              {report.priceDiscoveryFailed && (
                <div className="mb-3 md:mb-4 p-2 md:p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                  <div className="text-xs md:text-sm text-yellow-700 dark:text-yellow-300">
                    ⚠️ Price discovery failed - USD values may be inaccurate
                  </div>
                </div>
              )}
              
              {/* LP Detection Summary - Hidden */}
              {(() => {
                const lpAnalysis = calculateLPAnalysis();
                
                return (
                  <div className={`hidden mb-3 md:mb-4 p-2 md:p-3 rounded-lg border ${
                    lpAnalysis.suspiciousZeroLP 
                      ? 'bg-yellow-500/10 border-yellow-500/30' 
                      : lpAnalysis.lpCount > 0 
                        ? 'bg-blue-500/10 border-blue-500/20'
                        : 'bg-muted/50 border-border'
                  }`}>
                    <div className="text-xs md:text-sm font-medium mb-1 md:mb-2 flex items-center justify-between">
                      <span className={
                        lpAnalysis.suspiciousZeroLP 
                          ? 'text-yellow-700 dark:text-yellow-300'
                          : lpAnalysis.lpCount > 0
                            ? 'text-blue-700 dark:text-blue-300'
                            : 'text-muted-foreground'
                      }>
                        🔍 LP Detection Results
                      </span>
                      {lpAnalysis.lpCount > 0 && (
                        <Badge variant="outline" className="text-xs">
                          {lpAnalysis.hasHighConfidenceLP ? '✅ High Confidence' : lpAnalysis.hasLowConfidenceLP ? '⚠️ Low Confidence' : 'Detected'}
                        </Badge>
                      )}
                    </div>
                    <div className={`text-xs ${
                      lpAnalysis.suspiciousZeroLP
                        ? 'text-yellow-600 dark:text-yellow-400'
                        : lpAnalysis.lpCount > 0
                          ? 'text-blue-600 dark:text-blue-400'
                          : 'text-muted-foreground'
                    }`}>
                      {lpAnalysis.lpCount > 0 ? (
                        <>
                          Detected {lpAnalysis.lpCount} liquidity pool wallet{lpAnalysis.lpCount > 1 ? 's' : ''} 
                          ({lpAnalysis.lpPercentage.toFixed(1)}% of total supply)
                          {lpAnalysis.lpWallets.length > 0 && (
                            <span className="block mt-1">
                              Platforms: {lpAnalysis.lpWallets.map((w: any) => w.detectedPlatform || 'Unknown').join(', ')}
                            </span>
                          )}
                        </>
                      ) : lpAnalysis.suspiciousZeroLP ? (
                        <>
                          ⚠️ No LPs detected, but high wallet concentration detected ({calculateTop10Stats()?.cumulativePercentage.toFixed(1)}% in top 10).
                          <span className="block mt-1">LP detection may have failed or token uses an unrecognized platform. Manual review recommended.</span>
                        </>
                      ) : (
                        'No liquidity pools detected (0.0% of supply)'
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* Stability Score Card - Hidden per user request */}
              {false && (() => {
                const stabilityData = calculateStabilityScore();
                if (!stabilityData) return null;
                
                const { score, emoji, label, riskLevel, whalePercentage, breakdown } = stabilityData;
                const top10Stats = calculateTop10Stats();
                const lpAnalysis = calculateLPAnalysis();
                
                const getBgColor = () => {
                  if (riskLevel === 'low') return 'bg-green-500/10 border-green-500/30';
                  if (riskLevel === 'medium') return 'bg-yellow-500/10 border-yellow-500/30';
                  return 'bg-red-500/10 border-red-500/30';
                };
                
                const getTextColor = () => {
                  if (riskLevel === 'low') return 'text-green-700 dark:text-green-300';
                  if (riskLevel === 'medium') return 'text-yellow-700 dark:text-yellow-300';
                  return 'text-red-700 dark:text-red-300';
                };
                
                const getStars = (value: number, max: number) => {
                  const percentage = (value / max) * 100;
                  if (percentage >= 90) return '⭐⭐⭐⭐⭐';
                  if (percentage >= 75) return '⭐⭐⭐⭐';
                  if (percentage >= 50) return '⭐⭐⭐';
                  if (percentage >= 25) return '⭐⭐';
                  return '⭐';
                };
                
                return (
                  <Card className={`mb-3 md:mb-6 border-2 ${getBgColor()}`}>
                    <CardHeader className="p-3 md:p-6 pb-2 md:pb-3">
                      <div className="flex items-center gap-2 md:gap-3">
                        <div className="text-2xl md:text-4xl">{emoji}</div>
                        <div className="flex-1 min-w-0">
                          <CardTitle className={`text-base md:text-xl ${getTextColor()}`}>
                            {label}
                          </CardTitle>
                          <p className="text-xs md:text-sm text-muted-foreground mt-1">
                            Token Distribution Analysis
                          </p>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="p-3 md:p-6 pt-0 md:pt-0">
                      <div className="space-y-4">
                        {/* Score Display */}
                        <div className="text-center py-4">
                          <div className="flex items-center justify-center gap-2 mb-3">
                            <TrendingUp className="w-5 h-5 text-primary" />
                            <span className="text-sm font-medium text-muted-foreground">
                              Stability Score
                            </span>
                          </div>
                          <div className="text-5xl font-bold text-primary mb-2">
                            {score}
                          </div>
                          <div className="text-muted-foreground text-sm">out of 100</div>
                          <div className="max-w-xs mx-auto mt-4">
                            <Progress value={score} className="h-3" />
                          </div>
                        </div>
                        
                        {/* Score Breakdown */}
                        <div className="border-t pt-4">
                          <h4 className="text-sm font-semibold mb-3">Score Breakdown</h4>
                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between items-center">
                              <span className="text-muted-foreground">
                                Whale concentration: {whalePercentage.toFixed(1)}%
                              </span>
                              <span className="font-medium">
                                {getStars(breakdown.whaleScore, 40)} ({breakdown.whaleScore}/40)
                              </span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-muted-foreground">
                                Top 10 holders: {top10Stats.cumulativePercentage.toFixed(1)}%
                              </span>
                              <span className="font-medium">
                                {getStars(breakdown.distributionScore, 30)} ({breakdown.distributionScore}/30)
                              </span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-muted-foreground">
                                LP percentage: {lpAnalysis.lpPercentage.toFixed(1)}%
                              </span>
                              <span className="font-medium">
                                {getStars(breakdown.lpScore, 20)} ({breakdown.lpScore}/20)
                              </span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-muted-foreground">
                                Holder count: {report.totalHolders.toLocaleString()}
                              </span>
                              <span className="font-medium">
                                {getStars(breakdown.holderCountScore, 10)} ({breakdown.holderCountScore}/10)
                              </span>
                            </div>
                          </div>
                        </div>
                        
                        {/* Distribution Quality Summary */}
                        <div className="border-t pt-4">
                          <div className={`text-sm font-medium ${getTextColor()}`}>
                            Distribution quality: {
                              score >= 70 ? 'Excellent' :
                              score >= 50 ? 'Good' :
                              score >= 30 ? 'Fair' :
                              'Poor'
                            }
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            {score >= 70 && 'Strong community ownership with minimal concentration risk.'}
                            {score >= 50 && score < 70 && 'Moderate distribution with some whale presence.'}
                            {score >= 30 && score < 50 && 'Uneven distribution may pose risks.'}
                            {score < 30 && 'High concentration risk - proceed with caution.'}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })()}

              {/* Action Buttons Row */}
              <div className="mb-4 grid grid-cols-3 gap-2">
                <Button variant="outline" asChild className="text-xs md:text-sm h-auto py-2 whitespace-normal">
                  <Link to="/holders-marketing" className="text-center leading-tight">
                    <span className="hidden md:inline">Why You Need This Before Every Buy</span>
                    <span className="md:hidden whitespace-pre-wrap">Why You Need This{'\n'}Before Every Buy</span>
                  </Link>
                </Button>
                
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="gap-2 text-xs md:text-sm">
                      <Share2 className="h-4 w-4" />
                      Share
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="center">
                    <DropdownMenuItem onClick={() => {
                      const ticker = tokenData?.metadata?.symbol || 'this token';
                      const text = `Check out the Whales vs the Dust for $${ticker} 🐋💨`;
                      const url = window.location.href;
                      window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, '_blank');
                    }}>
                      <span className="w-5 h-5 bg-foreground rounded-full flex items-center justify-center mr-2">
                        <span className="text-background text-xs font-bold">𝕏</span>
                      </span>
                      Share on X
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => {
                      const ticker = tokenData?.metadata?.symbol || 'this token';
                      const text = `🐋 **Whales vs Dust** 🐋\n\nCheck out the holder analysis for $${ticker}!\n\n🔗 ${window.location.href}`;
                      navigator.clipboard.writeText(text);
                      toast({ title: "Copied!", description: "Discord message copied to clipboard" });
                    }}>
                      <MessageCircle className="h-4 w-4 mr-2" />
                      Copy for Discord
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => {
                      const ticker = tokenData?.metadata?.symbol || 'this token';
                      const text = `🐋 Check out the Whales vs the Dust for $${ticker}`;
                      const url = window.location.href;
                      window.open(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`, '_blank');
                    }}>
                      <Send className="h-4 w-4 mr-2" />
                      Share on Telegram
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                <Button variant="outline" asChild className="text-xs md:text-sm h-auto py-2 whitespace-normal">
                  <Link to="/adverts" className="text-center leading-tight">
                    <span className="hidden md:inline">Get Seen! 👀 Eyes Here!</span>
                    <span className="md:hidden whitespace-pre-wrap">Get Seen!{'\n'}👀 Eyes Here!</span>
                  </Link>
                </Button>
              </div>

              {/* === HOLDER HEALTHSCORE === */}
              {report.healthScore && (
                <div className="mb-4 p-4 rounded-lg border-2" style={{
                  borderColor: report.healthScore.grade === 'A' ? 'hsl(var(--chart-2))' :
                               report.healthScore.grade === 'B' ? 'hsl(var(--chart-3))' :
                               report.healthScore.grade === 'C' ? 'hsl(var(--chart-4))' :
                               report.healthScore.grade === 'D' ? 'hsl(var(--chart-5))' : 'hsl(var(--destructive))',
                  backgroundColor: report.healthScore.grade === 'A' ? 'hsl(var(--chart-2) / 0.1)' :
                                   report.healthScore.grade === 'B' ? 'hsl(var(--chart-3) / 0.1)' :
                                   report.healthScore.grade === 'C' ? 'hsl(var(--chart-4) / 0.1)' :
                                   report.healthScore.grade === 'D' ? 'hsl(var(--chart-5) / 0.1)' : 'hsl(var(--destructive) / 0.1)'
                }}>
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-semibold flex items-center gap-2">
                        <Shield className="h-4 w-4" />
                        Holder Healthscore
                      </h3>
                      <p className="text-xs text-muted-foreground mt-1">
                        Based on distribution, concentration & bundling
                      </p>
                    </div>
                    <div className="text-center">
                      <div className={`text-4xl font-bold ${
                        report.healthScore.grade === 'A' ? 'text-green-500' :
                        report.healthScore.grade === 'B' ? 'text-blue-500' :
                        report.healthScore.grade === 'C' ? 'text-yellow-500' :
                        report.healthScore.grade === 'D' ? 'text-orange-500' : 'text-red-500'
                      }`}>
                        {report.healthScore.grade}
                      </div>
                      <div className="text-xs text-muted-foreground">{report.healthScore.score}/100</div>
                    </div>
                  </div>
                </div>
              )}

              {/* === RISK SNAPSHOT === */}
              {report.riskFlags && report.riskFlags.length > 0 && (
                <div className="mb-4 p-3 rounded-lg border border-orange-500/30 bg-orange-500/5">
                  <h3 className="text-sm font-semibold flex items-center gap-2 mb-2">
                    <AlertTriangle className="h-4 w-4 text-orange-500" />
                    Risk Snapshot
                  </h3>
                  <div className="space-y-1">
                    {report.riskFlags.map((flag, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-xs text-orange-700 dark:text-orange-300">
                        <Flag className="h-3 w-3 flex-shrink-0" />
                        {flag}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* === DISTRIBUTION INTEGRITY === */}
              {report.distributionStats && (
                <div className="mb-4 p-3 rounded-lg border bg-muted/20">
                  <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
                    <BarChart3 className="h-4 w-4" />
                    Distribution Integrity
                  </h3>
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    <div className="text-center p-2 rounded bg-muted/30">
                      <div className="text-lg font-bold">{report.distributionStats.top5Percentage.toFixed(1)}%</div>
                      <div className="text-[10px] text-muted-foreground">Top 5 Hold</div>
                    </div>
                    <div className="text-center p-2 rounded bg-muted/30">
                      <div className="text-lg font-bold">{report.distributionStats.top10Percentage.toFixed(1)}%</div>
                      <div className="text-[10px] text-muted-foreground">Top 10 Hold</div>
                    </div>
                    <div className="text-center p-2 rounded bg-muted/30">
                      <div className="text-lg font-bold">{report.distributionStats.top20Percentage.toFixed(1)}%</div>
                      <div className="text-[10px] text-muted-foreground">Top 20 Hold</div>
                    </div>
                  </div>
                  {report.circulatingSupply && (
                    <div className="flex items-center justify-between text-xs border-t pt-2">
                      <span className="text-muted-foreground">Circulating (excl. LP):</span>
                      <span className="font-medium">{report.circulatingSupply.percentage.toFixed(1)}% (${report.circulatingSupply.usdValue.toLocaleString(undefined, { maximumFractionDigits: 0 })})</span>
                    </div>
                  )}
                </div>
              )}

              {/* === FUNCTIONAL HOLDERS - Toggle View === */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-base font-semibold flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Functional Holders
                  </h3>
                  <div className="flex items-center gap-1 text-xs">
                    <Button 
                      variant={holderViewMode === 'simple' ? 'default' : 'outline'} 
                      size="sm" 
                      className="h-6 px-2 text-xs"
                      onClick={() => setHolderViewMode('simple')}
                    >
                      Simple
                    </Button>
                    <Button 
                      variant={holderViewMode === 'granular' ? 'default' : 'outline'} 
                      size="sm" 
                      className="h-6 px-2 text-xs"
                      onClick={() => setHolderViewMode('granular')}
                    >
                      Granular
                    </Button>
                  </div>
                </div>

                {/* Simple View - 4 Tiers */}
                {holderViewMode === 'simple' && report.simpleTiers && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div className="text-center p-3 rounded-lg bg-slate-500/10 border border-slate-500/20">
                      <div className="text-2xl font-bold text-slate-500">{report.simpleTiers.dust.count}</div>
                      <div className="text-xs font-medium">Dust</div>
                      <div className="text-[10px] text-muted-foreground">&lt;$1</div>
                      <div className="text-[10px] text-muted-foreground">{report.simpleTiers.dust.percentage.toFixed(1)}%</div>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                      <div className="text-2xl font-bold text-blue-500">{report.simpleTiers.retail.count}</div>
                      <div className="text-xs font-medium">Retail</div>
                      <div className="text-[10px] text-muted-foreground">$1-$199</div>
                      <div className="text-[10px] text-muted-foreground">{report.simpleTiers.retail.percentage.toFixed(1)}%</div>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-orange-500/10 border border-orange-500/20">
                      <div className="text-2xl font-bold text-orange-500">{report.simpleTiers.serious.count}</div>
                      <div className="text-xs font-medium">Serious</div>
                      <div className="text-[10px] text-muted-foreground">$200-$1K</div>
                      <div className="text-[10px] text-muted-foreground">{report.simpleTiers.serious.percentage.toFixed(1)}%</div>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                      <div className="text-2xl font-bold text-red-500">{report.simpleTiers.whales.count}</div>
                      <div className="text-xs font-medium">Whales</div>
                      <div className="text-[10px] text-muted-foreground">&gt;$1K</div>
                      <div className="text-[10px] text-muted-foreground">{report.simpleTiers.whales.percentage.toFixed(1)}%</div>
                    </div>
                  </div>
                )}

                {/* Granular View - All Tiers */}
                {holderViewMode === 'granular' && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                    <div className="text-center p-2 rounded-lg bg-muted/30">
                      <div className="text-lg md:text-2xl font-bold text-yellow-500">{report.liquidityPoolsDetected || 0}</div>
                      <div className="text-xs text-muted-foreground">LP Detected</div>
                    </div>
                    <div className="text-center p-2 rounded-lg bg-muted/30">
                      <div className="text-lg md:text-2xl font-bold text-red-500">{report.trueWhaleWallets || 0}</div>
                      <div className="text-xs text-muted-foreground">True Whale (≥$5K)</div>
                    </div>
                    <div className="text-center p-2 rounded-lg bg-muted/30">
                      <div className="text-lg md:text-2xl font-bold text-purple-500">{report.babyWhaleWallets || 0}</div>
                      <div className="text-xs text-muted-foreground">Baby Whale ($2K-$5K)</div>
                    </div>
                    <div className="text-center p-2 rounded-lg bg-muted/30">
                      <div className="text-lg md:text-2xl font-bold text-indigo-500">{report.superBossWallets || 0}</div>
                      <div className="text-xs text-muted-foreground">Super Boss ($1K-$2K)</div>
                    </div>
                    <div className="text-center p-2 rounded-lg bg-muted/30">
                      <div className="text-lg md:text-2xl font-bold text-cyan-500">{report.kingpinWallets || 0}</div>
                      <div className="text-xs text-muted-foreground">Kingpin ($500-$1K)</div>
                    </div>
                    <div className="text-center p-2 rounded-lg bg-muted/30">
                      <div className="text-lg md:text-2xl font-bold text-orange-500">{report.bossWallets}</div>
                      <div className="text-xs text-muted-foreground">Boss ($200-$500)</div>
                    </div>
                    <div className="text-center p-2 rounded-lg bg-muted/30">
                      <div className="text-lg md:text-2xl font-bold text-green-500">{report.realWallets}</div>
                      <div className="text-xs text-muted-foreground">Real ($50-$199)</div>
                    </div>
                    <div className="text-center p-2 rounded-lg bg-muted/30">
                      <div className="text-lg md:text-2xl font-bold text-emerald-500">{report.largeWallets}</div>
                      <div className="text-xs text-muted-foreground">Large ($25-$49)</div>
                    </div>
                    <div className="text-center p-2 rounded-lg bg-muted/30">
                      <div className="text-lg md:text-2xl font-bold text-blue-500">{report.mediumWallets || 0}</div>
                      <div className="text-xs text-muted-foreground">Medium ($12-$25)</div>
                    </div>
                    <div className="text-center p-2 rounded-lg bg-muted/30">
                      <div className="text-lg md:text-2xl font-bold text-gray-500">{report.smallWallets || 0}</div>
                      <div className="text-xs text-muted-foreground">Small ($1-$12)</div>
                    </div>
                    <div className="text-center p-2 rounded-lg bg-muted/30">
                      <div className="text-lg md:text-2xl font-bold text-slate-500">{report.dustWallets || 0}</div>
                      <div className="text-xs text-muted-foreground">Dust (&lt;$1)</div>
                    </div>
                  </div>
                )}
              </div>

              {/* Security Alerts Card - Hidden per user request */}
              {false && (() => {
                const alerts = detectSuspiciousPatterns();
                if (alerts.length === 0) return null;
                
                return (
                  <div className="mb-4 md:mb-6">
                    <Card className="border-2 border-orange-500/30 bg-orange-500/5">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-lg flex items-center gap-2">
                          <AlertTriangle className="h-5 w-5 text-orange-500" />
                          Security Alerts
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        {alerts.map((alert, idx) => (
                          <div
                            key={idx}
                            className={`p-3 rounded-lg text-sm ${
                              alert.type === 'critical' 
                                ? 'bg-red-500/10 border border-red-500/20 text-red-700 dark:text-red-300'
                                : alert.type === 'warning'
                                ? 'bg-orange-500/10 border border-orange-500/20 text-orange-700 dark:text-orange-300'
                                : 'bg-blue-500/10 border border-blue-500/20 text-blue-700 dark:text-blue-300'
                            }`}
                          >
                            {alert.flagged && <Flag className="inline h-3 w-3 mr-1" />}
                            {alert.message}
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  </div>
                );
              })()}

              {/* Top 25 Holders Analysis - HIDDEN */}
              {false && (() => {
                const top10Stats = calculateTop10Stats();
                // ALWAYS use unfiltered holders for Top 25 - filters should only affect the Holders List below
                const devWallet = report.potentialDevWallet?.address;
                const nonLPHolders = report.holders.filter(h => !h.isLiquidityPool && h.owner !== devWallet);
                const top25 = nonLPHolders.slice(0, 25);
                if (top25.length === 0) return null;
                
                const top25Percentage = top25.reduce((sum, h) => sum + h.percentageOfSupply, 0);
                
                return (
                  <div className="mb-4 md:mb-6">
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-lg flex items-center gap-2">
                          <Shield className="h-5 w-5" />
                          Top 25 Holders Analysis
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="mb-4 p-4 bg-primary/10 rounded-lg border border-primary/20">
                          <div className="text-2xl font-bold text-primary">
                            {top25Percentage.toFixed(1)}%
                          </div>
                          <div className="text-sm text-muted-foreground">
                            Top 25 wallets hold {top25Percentage.toFixed(1)}% of total supply
                          </div>
                        </div>
                        
                        <Accordion type="single" collapsible className="w-full">
                          <AccordionItem value="top25-list">
                            <AccordionTrigger className="text-sm font-medium">
                              View Top 25 Holders List
                            </AccordionTrigger>
                            <AccordionContent>
                              <div className="space-y-3 pt-2">
                                <div className="grid grid-cols-12 gap-2 text-xs text-muted-foreground px-2">
                                  <div className="col-span-1">#</div>
                                  <div className="col-span-6">Wallet Address</div>
                                  <div className="col-span-2 text-right">Tokens</div>
                                  <div className="col-span-2 text-right">USD</div>
                                  <div className="col-span-1 text-right">%</div>
                                </div>
                                {top25.map((holder, idx) => (
                                  <div key={holder.owner} className="grid grid-cols-12 gap-2 items-center px-2 py-2 rounded-md border">
                                    <div className="col-span-1 text-xs text-muted-foreground">{idx + 1}</div>
                                    <div className="col-span-6 font-mono break-all">
                                      <a
                                        href={`https://solscan.io/account/${holder.owner}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-primary hover:underline"
                                        title={`View ${holder.owner} on Solscan`}
                                      >
                                        {holder.owner}
                                      </a>
                                    </div>
                                    <div className="col-span-2 text-right text-sm">
                                      {holder.balance.toLocaleString(undefined, { maximumFractionDigits: 6 })}
                                    </div>
                                    <div className="col-span-2 text-right text-sm">
                                      ${(holder.usdValue || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </div>
                                    <div className="col-span-1 text-right text-sm font-semibold">
                                      {holder.percentageOfSupply.toFixed(2)}%
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </AccordionContent>
                          </AccordionItem>
                        </Accordion>
                      </CardContent>
                    </Card>
                  </div>
                );
              })()}

              {/* LP vs Unlocked Supply Analysis */}
              {/* Liquidity vs Unlocked Supply - Hidden */}
              {report.liquidityPoolsDetected > 0 && (() => {
                const { unlockedSupply, unlockedPercentage, lpPercentage } = calculateLPAnalysis();
                
                return (
                  <div className="hidden mb-4 md:mb-6">
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-lg">Liquidity vs Unlocked Supply</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-2 gap-4 mb-4">
                          <div className="text-center p-3 bg-blue-500/10 rounded-lg border border-blue-500/20">
                            <div className="text-xl font-bold text-blue-700 dark:text-blue-300">
                              {lpPercentage.toFixed(1)}%
                            </div>
                            <div className="text-xs text-muted-foreground">In Liquidity Pools</div>
                            <div className="text-xs text-muted-foreground mt-1">
                              {formatBalance(report.lpBalance)} tokens
                            </div>
                          </div>
                          <div className="text-center p-3 bg-green-500/10 rounded-lg border border-green-500/20">
                            <div className="text-xl font-bold text-green-700 dark:text-green-300">
                              {unlockedPercentage.toFixed(1)}%
                            </div>
                            <div className="text-xs text-muted-foreground">Unlocked Supply</div>
                            <div className="text-xs text-muted-foreground mt-1">
                              {formatBalance(unlockedSupply)} tokens
                            </div>
                          </div>
                        </div>
                        
                        <div className="w-full bg-muted/30 rounded-full h-8 relative overflow-hidden">
                          <div
                            className="absolute inset-y-0 left-0 bg-blue-500/70 flex items-center justify-center text-xs font-semibold text-white"
                            style={{ width: `${lpPercentage}%` }}
                          >
                            {lpPercentage > 10 && `LP ${lpPercentage.toFixed(1)}%`}
                          </div>
                          <div
                            className="absolute inset-y-0 bg-green-500/70 flex items-center justify-center text-xs font-semibold text-white"
                            style={{ left: `${lpPercentage}%`, width: `${unlockedPercentage}%` }}
                          >
                            {unlockedPercentage > 10 && `Unlocked ${unlockedPercentage.toFixed(1)}%`}
                          </div>
                        </div>
                        
                        <div className="mt-3 text-xs text-muted-foreground text-center">
                          Ratio: {(unlockedSupply / report.lpBalance).toFixed(2)}:1 (Unlocked:LP)
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                );
              })()}

              {/* First 25 Historical Buyers with PNL Tracking - HIDDEN */}
              {false && report.firstBuyers && report.firstBuyers.length > 0 && (
                <div className="mb-4 md:mb-6">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-lg">First 25 Historical Buyers 🥇</CardTitle>
                      <p className="text-xs text-muted-foreground">
                        Chronological first 25 token purchases with sell tracking & PNL
                      </p>
                    </CardHeader>
                    <CardContent>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b">
                              <th className="text-left p-2">#</th>
                              <th className="text-left p-2">Wallet</th>
                              <th className="text-right p-2">First Bought</th>
                              <th className="text-right p-2">Bought</th>
                              <th className="text-right p-2">Sold</th>
                              <th className="text-right p-2">Current</th>
                              <th className="text-right p-2">% Supply</th>
                              <th className="text-right p-2">PNL</th>
                              <th className="text-center p-2">Social</th>
                            </tr>
                          </thead>
                          <tbody>
                            {report.firstBuyers.map((buyer: any) => {
                              const formatDate = (timestamp: number) => {
                                const date = new Date(timestamp * 1000);
                                return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                              };
                              
                              return (
                                <tr key={buyer.wallet} className="border-b hover:bg-muted/20">
                                  <td className="p-2 font-mono">
                                    <div className="flex items-center gap-1">
                                      {buyer.purchaseRank === 1 && <span title="First ever buyer!">🥇</span>}
                                      {buyer.isDevWallet && (
                                        <span className="px-1.5 py-0.5 bg-purple-500/20 text-purple-600 dark:text-purple-400 rounded text-[10px] font-bold">
                                          DEV
                                        </span>
                                      )}
                                      {buyer.isLiquidityPool && (
                                        <span className="px-1.5 py-0.5 bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 rounded text-[10px] font-bold">
                                          LP
                                        </span>
                                      )}
                                      <span>#{buyer.purchaseRank}</span>
                                    </div>
                                  </td>
                                  <td className="p-2">
                                    <a 
                                      href={`https://solscan.io/account/${buyer.wallet}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="font-mono text-primary hover:underline text-xs"
                                    >
                                      {buyer.wallet.slice(0, 4)}...{buyer.wallet.slice(-4)}
                                    </a>
                                  </td>
                                  <td className="p-2 text-right text-muted-foreground text-[10px]">
                                    {formatDate(buyer.firstBoughtAt)}
                                  </td>
                                  <td className="p-2 text-right font-mono text-[11px]">
                                    {Math.floor(buyer.initialTokens).toLocaleString()}
                                  </td>
                                  <td className="p-2 text-right">
                                    {buyer.hasSold ? (
                                      <div className="flex flex-col items-end">
                                        <span className="font-mono text-red-600 dark:text-red-400 text-[11px]">
                                          {Math.floor(buyer.tokensSold).toLocaleString()}
                                        </span>
                                        <span className="text-[9px] text-muted-foreground">
                                          ({buyer.percentageSold.toFixed(0)}%)
                                        </span>
                                      </div>
                                    ) : (
                                      <span className="text-gray-400 text-xs">—</span>
                                    )}
                                  </td>
                                  <td className="p-2 text-right font-mono text-[11px]">
                                    {Math.floor(buyer.currentBalance).toLocaleString()}
                                  </td>
                                  <td className="p-2 text-right text-[11px]">
                                    {buyer.currentPercentageOfSupply.toFixed(2)}%
                                  </td>
                                  <td className="p-2 text-right">
                                    <div className="flex flex-col items-end">
                                      <span 
                                        className={`font-semibold text-[11px] ${
                                          buyer.pnl >= 0 
                                            ? 'text-green-600 dark:text-green-400' 
                                            : 'text-red-600 dark:text-red-400'
                                        }`}
                                      >
                                        {buyer.pnl >= 0 ? '+' : ''}${Math.abs(buyer.pnl).toFixed(0)}
                                      </span>
                                      <span 
                                        className={`text-[9px] ${
                                          buyer.pnlPercentage >= 0 
                                            ? 'text-green-600 dark:text-green-400' 
                                            : 'text-red-600 dark:text-red-400'
                                        }`}
                                      >
                                        ({buyer.pnlPercentage >= 0 ? '+' : ''}{buyer.pnlPercentage.toFixed(0)}%)
                                      </span>
                                    </div>
                                  </td>
                                  <td className="p-2 text-center">
                                    {isLoadingTwitter ? (
                                      <div className="h-3 w-3 animate-pulse bg-gray-300 dark:bg-gray-600 rounded mx-auto"></div>
                                    ) : walletTwitterHandles.has(buyer.wallet) ? (
                                      <a
                                        href={`https://twitter.com/${walletTwitterHandles.get(buyer.wallet)}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-blue-600 dark:text-blue-400 hover:underline text-[10px]"
                                        title="Twitter verified via SNS"
                                      >
                                        @{walletTwitterHandles.get(buyer.wallet)}
                                      </a>
                                    ) : (
                                      <span className="text-gray-400 text-xs">—</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      <div className="mt-3 text-xs text-muted-foreground space-y-1">
                        <p>🥇 #1 = First ever token buyer • 🟣 DEV = Detected developer wallet • 🟡 LP = Liquidity pool</p>
                        <p>💡 PNL is estimated based on current token price vs. assumed initial purchase price</p>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* Fallback when no historical buyers */}
              {report && (!report.firstBuyers || report.firstBuyers.length === 0) && (
                <div className="mb-4 md:mb-6">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-lg">First 25 Historical Buyers 🥇</CardTitle>
                      <p className="text-xs text-muted-foreground">
                        {report.firstBuyersError || 'No historical buyer data available'}
                      </p>
                      {report.firstBuyersDebug && (
                        <details className="mt-2 text-xs text-muted-foreground">
                          <summary className="cursor-pointer hover:text-foreground">Debug Info</summary>
                          <pre className="mt-2 p-2 bg-muted rounded text-[10px] overflow-x-auto">
                            {JSON.stringify(report.firstBuyersDebug, null, 2)}
                          </pre>
                        </details>
                      )}
                    </CardHeader>
                  </Card>
                </div>
              )}

              {/* KOL Table - HIDDEN */}
              <div className="mb-4 md:mb-6 hidden">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">KOL Wallets</CardTitle>
                    <p className="text-xs text-muted-foreground">Known KOL wallets detected among current holders</p>
                  </CardHeader>
                  <CardContent>
                    {kolMatches.length > 0 ? (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b">
                              <th className="text-left p-2">Wallet</th>
                              <th className="text-left p-2">Twitter</th>
                              <th className="text-left p-2">SNS</th>
                            </tr>
                          </thead>
                          <tbody>
                            {kolMatches.map((k: any) => (
                              <tr key={k.wallet_address} className="border-b hover:bg-muted/20">
                                <td className="p-2 font-mono">
                                  <a href={`https://solscan.io/account/${k.wallet_address}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                                    {k.wallet_address.slice(0,4)}...{k.wallet_address.slice(-4)}
                                  </a>
                                </td>
                                <td className="p-2">
                                  {k.twitter_handle ? (
                                    <a href={`https://twitter.com/${k.twitter_handle}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">
                                      @{k.twitter_handle}
                                    </a>
                                  ) : <span className="text-gray-400 text-xs">—</span>}
                                </td>
                                <td className="p-2">{k.sns_name || <span className="text-gray-400 text-xs">—</span>}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">No KOL matches among current holders.</p>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Sediment Layer Chart */}
              <div className="mb-4 md:mb-6">
                <div className="flex items-center justify-between mb-3 md:mb-4">
                  <h3 className="text-base md:text-lg font-semibold">Distribution Integrity (Sediment Layers)</h3>
                  <div className="flex items-center gap-1 text-xs">
                    <Button 
                      variant={sedimentViewMode === 'simple' ? 'default' : 'outline'} 
                      size="sm" 
                      className="h-6 px-2 text-xs"
                      onClick={() => setSedimentViewMode('simple')}
                    >
                      Simple
                    </Button>
                    <Button 
                      variant={sedimentViewMode === 'granular' ? 'default' : 'outline'} 
                      size="sm" 
                      className="h-6 px-2 text-xs"
                      onClick={() => setSedimentViewMode('granular')}
                    >
                      Granular
                    </Button>
                  </div>
                </div>

                {/* Simple Sediment View - 4 Layers */}
                {sedimentViewMode === 'simple' && report.simpleTiers && (
                  <div className="mb-4">
                    <div className="bg-muted/30 rounded-lg p-4 h-48 flex flex-col justify-end relative">
                      {/* Simple 4-layer visualization */}
                      {(() => {
                        const lpBalance = report.liquidityPools?.reduce((sum, lp) => sum + lp.balance, 0) || 0;
                        const lpPct = report.totalBalance > 0 ? (lpBalance / report.totalBalance) * 100 : 0;
                        const dustPct = report.simpleTiers.dust.percentage;
                        const retailPct = report.simpleTiers.retail.percentage;
                        const seriousPct = report.simpleTiers.serious.percentage;
                        const whalesPct = report.simpleTiers.whales.percentage;
                        const total = lpPct + dustPct + retailPct + seriousPct + whalesPct;
                        
                        const layers = [
                          { name: 'LP', pct: lpPct, color: 'bg-yellow-600', count: report.liquidityPoolsDetected || 0 },
                          { name: 'Whales', pct: whalesPct, color: 'bg-red-500', count: report.simpleTiers.whales.count },
                          { name: 'Serious', pct: seriousPct, color: 'bg-orange-500', count: report.simpleTiers.serious.count },
                          { name: 'Retail', pct: retailPct, color: 'bg-blue-500', count: report.simpleTiers.retail.count },
                          { name: 'Dust', pct: dustPct, color: 'bg-slate-500', count: report.simpleTiers.dust.count },
                        ];
                        
                        return [...layers].reverse().map((layer, idx) => {
                          const normalizedPct = total > 0 ? (layer.pct / total) * 100 : 0;
                          const height = Math.max(normalizedPct * 1.8, layer.pct > 0 ? 12 : 0);
                          return (
                            <div
                              key={layer.name}
                              className={`${layer.color} border border-white/20 flex items-center justify-center text-white text-xs font-medium`}
                              style={{ height: `${height}px`, minHeight: layer.pct > 0 ? '12px' : '0' }}
                              title={`${layer.name}: ${layer.count} wallets (${layer.pct.toFixed(1)}%)`}
                            >
                              {normalizedPct > 8 && `${layer.name} (${layer.pct.toFixed(1)}%)`}
                            </div>
                          );
                        });
                      })()}
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground mt-2 px-1">
                      <span>🟡 LP</span>
                      <span>🔴 Whales (&gt;$1K)</span>
                      <span>🟠 Serious ($200-1K)</span>
                      <span>🔵 Retail ($1-199)</span>
                      <span>⚪ Dust (&lt;$1)</span>
                    </div>
                  </div>
                )}
                
                {/* Granular Sediment View - Original Chart */}
                {sedimentViewMode === 'granular' && (
                <div className="mb-4">
                  <div className="flex">
                    {/* Y-axis Market Cap Labels */}
                    <div className="flex flex-col justify-between h-60 md:h-80 pr-1 md:pr-2 py-2 md:py-4 text-xs text-muted-foreground">
                      {(() => {
                        // Calculate total market cap
                        const totalMarketCap = report.totalBalance * report.tokenPriceUSD;
                        
                        // Determine appropriate intervals based on market cap size
                        let interval;
                        let numTicks = 5;
                        
                        if (totalMarketCap < 50000) { // Under $50K
                          interval = 10000; // $10K intervals
                        } else if (totalMarketCap < 250000) { // Under $250K
                          interval = 25000; // $25K intervals
                        } else if (totalMarketCap < 1000000) { // Under $1M
                          interval = 100000; // $100K intervals
                        } else if (totalMarketCap < 5000000) { // Under $5M
                          interval = 500000; // $500K intervals
                        } else if (totalMarketCap < 20000000) { // Under $20M
                          interval = 2000000; // $2M intervals
                        } else {
                          interval = 5000000; // $5M intervals
                        }
                        
                        // Generate tick marks from 0 to totalMarketCap
                        const ticks = [];
                        const maxTick = Math.ceil(totalMarketCap / interval) * interval;
                        
                        for (let i = 0; i <= numTicks; i++) {
                          const value = (maxTick / numTicks) * (numTicks - i);
                          ticks.push(value);
                        }
                        
                        return ticks.map((tick, index) => (
                          <div key={index} className="text-right">
                            {tick >= 1000000 
                              ? `$${(tick / 1000000).toFixed(1)}M` 
                              : `$${(tick / 1000).toFixed(0)}K`
                            }
                          </div>
                        ));
                      })()}
                    </div>
                    
                    {/* Chart Container */}
                    <div className="bg-muted/30 rounded-lg p-2 md:p-4 h-60 md:h-80 flex-1 flex flex-col justify-end relative">
                      {/* Horizontal grid lines */}
                      <div className="absolute inset-4 flex flex-col justify-between pointer-events-none">
                        {Array.from({length: 6}).map((_, i) => (
                          <div key={i} className="border-t border-muted-foreground/20 w-full" />
                        ))}
                      </div>
                      
                      {(() => {
                        // Calculate token balance for each category from holders data
                          const getTokenBalanceForCategory = (categoryFilter: (holder: TokenHolder) => boolean) => {
                            return report.holders
                              .filter(h => !h.isLiquidityPool && categoryFilter(h))
                              .reduce((sum, holder) => sum + holder.balance, 0);
                          };
                        
                        // Calculate LP balance from liquidity pools
                        const lpBalance = report.liquidityPools?.reduce((sum, lp) => sum + lp.balance, 0) || 0;
                        
                        const trueWhaleBalance = getTokenBalanceForCategory(h => h.isTrueWhaleWallet);
                        const babyWhaleBalance = getTokenBalanceForCategory(h => h.isBabyWhaleWallet);
                        const superBossBalance = getTokenBalanceForCategory(h => h.isSuperBossWallet);
                        const kingpinBalance = getTokenBalanceForCategory(h => h.isKingpinWallet);
                        const bossBalance = getTokenBalanceForCategory(h => h.isBossWallet);
                        const realBalance = getTokenBalanceForCategory(h => !h.isDustWallet && !h.isSmallWallet && !h.isMediumWallet && !h.isLargeWallet && !h.isBossWallet && !h.isKingpinWallet && !h.isSuperBossWallet && !h.isBabyWhaleWallet && !h.isTrueWhaleWallet && !h.isLiquidityPool);
                        const largeBalance = getTokenBalanceForCategory(h => h.isLargeWallet);
                        const mediumBalance = getTokenBalanceForCategory(h => h.isMediumWallet);
                        const smallBalance = getTokenBalanceForCategory(h => h.isSmallWallet);
                        const dustBalance = getTokenBalanceForCategory(h => h.isDustWallet);

                        // Include LP balance in total for proper percentage calculations
                        const totalTokenBalance = lpBalance + trueWhaleBalance + babyWhaleBalance + superBossBalance + kingpinBalance + bossBalance + realBalance + largeBalance + mediumBalance + smallBalance + dustBalance;
                        
                        // Layers ordered top to bottom (largest holders at top, smallest at bottom) - REVERSED ORDER
                        // LP is added as the foundational layer (bottom/largest)
                        const layers = [
                          { name: 'Liquidity Pool', count: report.liquidityPoolsDetected || 0, balance: lpBalance, color: 'bg-yellow-600', textColor: 'text-yellow-600' },
                          { name: 'True Whale', count: report.trueWhaleWallets || 0, balance: trueWhaleBalance, color: 'bg-red-500', textColor: 'text-red-500' },
                          { name: 'Baby Whale', count: report.babyWhaleWallets || 0, balance: babyWhaleBalance, color: 'bg-purple-500', textColor: 'text-purple-500' },
                          { name: 'Super Boss', count: report.superBossWallets || 0, balance: superBossBalance, color: 'bg-indigo-500', textColor: 'text-indigo-500' },
                          { name: 'Kingpin', count: report.kingpinWallets || 0, balance: kingpinBalance, color: 'bg-cyan-500', textColor: 'text-cyan-500' },
                          { name: 'Boss', count: report.bossWallets || 0, balance: bossBalance, color: 'bg-orange-500', textColor: 'text-orange-500' },
                          { name: 'Real', count: report.realWallets || 0, balance: realBalance, color: 'bg-green-500', textColor: 'text-green-500' },
                          { name: 'Large', count: report.largeWallets || 0, balance: largeBalance, color: 'bg-emerald-500', textColor: 'text-emerald-500' },
                          { name: 'Medium', count: report.mediumWallets || 0, balance: mediumBalance, color: 'bg-blue-500', textColor: 'text-blue-500' },
                          { name: 'Small', count: report.smallWallets || 0, balance: smallBalance, color: 'bg-gray-500', textColor: 'text-gray-500' },
                          { name: 'Dust', count: report.dustWallets || 0, balance: dustBalance, color: 'bg-slate-500', textColor: 'text-slate-500' }
                        ];

                        return [...layers].reverse().map((layer, index) => {
                          // Calculate percentage based on token balance, not holder count
                          const percentage = totalTokenBalance > 0 ? (layer.balance / totalTokenBalance) * 100 : 0;
                          const minHeight = percentage > 0 ? Math.max(percentage * 2.5, 8) : 0; // Minimum 8px height if any tokens
                          
                          return (
                            <div
                              key={layer.name}
                              className={`${layer.color} border border-white/20 flex items-center justify-center text-white text-xs font-medium transition-all duration-300 hover:opacity-80 relative z-10`}
                              style={{ 
                                height: `${minHeight}px`,
                                minHeight: percentage > 0 ? '8px' : '0px'
                              }}
                              title={`${layer.name}: ${layer.count} wallets (${percentage.toFixed(1)}% of tokens)`}
                            >
                              {percentage > 3 && ( // Only show text if layer is thick enough
                                <span className="text-center px-2">
                                  {layer.count} ({percentage.toFixed(1)}%)
                                </span>
                              )}
                            </div>
                          );
                        });
                      })()}
                    </div>
                  </div>
                </div>
                )}
                
                {/* Legend and Analysis - Side by side */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Layer Legend */}
                  <div>
                    <h4 className="font-medium mb-2">Layer Legend</h4>
                    <div className="space-y-1 text-xs">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-slate-500 rounded"></div>
                        <span>Dust (&lt;$1) - Top Layer</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-gray-500 rounded"></div>
                        <span>Small ($1-$12)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-blue-500 rounded"></div>
                        <span>Medium ($12-$25)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-emerald-500 rounded"></div>
                        <span>Large ($25-$49)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-green-500 rounded"></div>
                        <span>Real ($50-$199)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-orange-500 rounded"></div>
                        <span>Boss ($200-$500)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-cyan-500 rounded"></div>
                        <span>Kingpin ($500-$1K)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-indigo-500 rounded"></div>
                        <span>Super Boss ($1K-$2K)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-purple-500 rounded"></div>
                        <span>Baby Whale ($2K-$5K)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-red-500 rounded"></div>
                        <span>True Whale (≥$5K)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-yellow-600 rounded"></div>
                        <span>Liquidity Pool - Foundation Layer</span>
                      </div>
                    </div>
                    
                    {/* Ad Banner #3 - After Liquidity Pool in Legend */}
                    <div className="block md:hidden mt-4">
                      <AdBanner size="mobile" position={3} />
                    </div>
                    <div className="hidden md:block mt-4">
                      <AdBanner size="rectangle" position={3} />
                    </div>
                  </div>
                  
                  {/* Layer Analysis */}
                  <div>
                    <h4 className="font-medium mb-2">Layer Analysis</h4>
                    <div className="space-y-2 text-sm">
                      <div className="p-2 bg-red-500/10 border border-red-500/20 rounded">
                        <div className="font-medium text-red-700 dark:text-red-300">Surface (Unstable)</div>
                        <div className="text-xs text-muted-foreground">
                          Real + Large
                        </div>
                        <div className="text-xs">
                          {((report.realWallets || 0) + (report.largeWallets || 0))} wallets
                        </div>
                      </div>
                      
                      <div className="p-2 bg-yellow-500/10 border border-yellow-500/20 rounded">
                        <div className="font-medium text-yellow-700 dark:text-yellow-300">Ceiling (Volatile)</div>
                        <div className="text-xs text-muted-foreground">
                          Kingpin + Boss
                        </div>
                        <div className="text-xs">
                          {((report.kingpinWallets || 0) + (report.bossWallets || 0))} wallets
                        </div>
                      </div>
                      
                      <div className="p-2 bg-green-500/10 border border-green-500/20 rounded">
                        <div className="font-medium text-green-700 dark:text-green-300">Floor (Stable)</div>
                        <div className="text-xs text-muted-foreground">
                          True Whale + Super Boss + Baby Whale
                        </div>
                        <div className="text-xs">
                          {((report.trueWhaleWallets || 0) + (report.superBossWallets || 0) + (report.babyWhaleWallets || 0))} wallets
                        </div>
                      </div>
                      
                      <div className="p-2 bg-yellow-500/10 border border-yellow-500/20 rounded">
                        <div className="font-medium text-yellow-700 dark:text-yellow-300">Foundation (LP)</div>
                        <div className="text-xs text-muted-foreground">
                          Liquidity Pool - Price Stability Base
                        </div>
                        <div className="text-xs">
                          {report.liquidityPoolsDetected || 0} pool{(report.liquidityPoolsDetected || 0) !== 1 ? 's' : ''} ({formatBalance(report.lpBalance)} tokens)
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              
            </CardContent>
          </Card>

          {/* Premium Features - Diamond Hands Analysis - Hidden */}
          {tokenMint && (
            <div className="hidden">
              <PremiumFeatureGate
                isAuthenticated={!!user}
                featureName="Diamond Hands Analysis"
                featureDescription="Analyze holder retention, loyalty metrics, and get a comprehensive Diamond Hands Score."
                featureIcon={<Diamond />}
                onSignUpClick={() => setShowAuthModal(true)}
                tokenMint={tokenMint}
              >
                <RetentionAnalysis tokenMint={tokenMint} tokenAge={tokenAge} />
              </PremiumFeatureGate>
            </div>
          )}

          {/* Holders List Card - Hidden */}
          <Card className="hidden">
            <CardHeader className="pb-4">
              <CardTitle className="text-base md:text-lg">
                Holders List ({filteredHolders.length} wallets) - excluding Small and Dust Wallets for a better SnapShot!
              </CardTitle>
            </CardHeader>
            <CardContent>
              {/* Report Summary */}
              <p className="text-xs md:text-sm text-muted-foreground mb-4 md:mb-6">{report.summary}</p>
              
              {/* LP Filter Controls */}
              <div className="flex gap-1 md:gap-2 mb-3 flex-wrap text-xs md:text-sm">
                <Button
                  variant={excludeLPs ? "default" : "outline"}
                  size="sm"
                  className="h-8 px-2 md:px-3 text-xs"
                  onClick={() => {
                    setExcludeLPs(!excludeLPs);
                    setShowLPOnly(false);
                  }}
                >
                  Exclude LPs
                </Button>
                <Button
                  variant={showLPOnly ? "default" : "outline"}
                  size="sm"
                  className="h-8 px-2 md:px-3 text-xs"
                  onClick={() => {
                    setShowLPOnly(!showLPOnly);
                    setExcludeLPs(false);
                  }}
                >
                  Show LPs Only ({report.liquidityPoolsDetected})
                </Button>
              </div>

              <div className="flex gap-1 mb-4 flex-wrap text-xs md:text-sm">
                <Button
                  variant={!showDustOnly && !showSmallOnly && !showMediumOnly && !showLargeOnly && !showRealOnly && !showBossOnly && !showKingpinOnly && !showSuperBossOnly && !showBabyWhaleOnly && !showTrueWhaleOnly && !showLPOnly ? "default" : "outline"}
                  size="sm"
                  className="h-8 px-2 md:px-3 text-xs"
                  onClick={() => {
                    setShowDustOnly(false);
                    setShowSmallOnly(false);
                    setShowMediumOnly(false);
                    setShowLargeOnly(false);
                    setShowRealOnly(false);
                    setShowBossOnly(false);
                    setShowKingpinOnly(false);
                    setShowSuperBossOnly(false);
                    setShowBabyWhaleOnly(false);
                    setShowTrueWhaleOnly(false);
                    setShowLPOnly(false);
                  }}
                >
                  All Categories
                </Button>
                <Button
                  variant={showTrueWhaleOnly ? "default" : "outline"}
                  size="sm"
                  className="h-8 px-2 md:px-3 text-xs"
                  onClick={() => {
                    setShowTrueWhaleOnly(true);
                    setShowBabyWhaleOnly(false);
                    setShowSuperBossOnly(false);
                    setShowKingpinOnly(false);
                    setShowBossOnly(false);
                    setShowRealOnly(false);
                    setShowLargeOnly(false);
                    setShowMediumOnly(false);
                    setShowSmallOnly(false);
                    setShowDustOnly(false);
                  }}
                >
                  <span className="hidden sm:inline">True Whale (≥$5K)</span>
                  <span className="sm:hidden">Whale</span>
                </Button>
                <Button
                  variant={showBabyWhaleOnly ? "default" : "outline"}
                  size="sm"
                  className="h-8 px-2 md:px-3 text-xs"
                  onClick={() => {
                    setShowBabyWhaleOnly(true);
                    setShowTrueWhaleOnly(false);
                    setShowSuperBossOnly(false);
                    setShowKingpinOnly(false);
                    setShowBossOnly(false);
                    setShowRealOnly(false);
                    setShowLargeOnly(false);
                    setShowMediumOnly(false);
                    setShowSmallOnly(false);
                    setShowDustOnly(false);
                  }}
                >
                  <span className="hidden sm:inline">Baby Whale ($2K-$5K)</span>
                  <span className="sm:hidden">Baby Whale</span>
                </Button>
                <Button
                  variant={showSuperBossOnly ? "default" : "outline"}
                  size="sm"
                  className="h-8 px-2 md:px-3 text-xs"
                  onClick={() => {
                    setShowSuperBossOnly(true);
                    setShowBabyWhaleOnly(false);
                    setShowTrueWhaleOnly(false);
                    setShowKingpinOnly(false);
                    setShowBossOnly(false);
                    setShowRealOnly(false);
                    setShowLargeOnly(false);
                    setShowMediumOnly(false);
                    setShowSmallOnly(false);
                    setShowDustOnly(false);
                  }}
                >
                  <span className="hidden sm:inline">Super Boss ($1K-$2K)</span>
                  <span className="sm:hidden">Super Boss</span>
                </Button>
                <Button
                  variant={showKingpinOnly ? "default" : "outline"}
                  size="sm"
                  className="h-8 px-2 md:px-3 text-xs"
                  onClick={() => {
                    setShowKingpinOnly(true);
                    setShowSuperBossOnly(false);
                    setShowBabyWhaleOnly(false);
                    setShowTrueWhaleOnly(false);
                    setShowBossOnly(false);
                    setShowRealOnly(false);
                    setShowLargeOnly(false);
                    setShowMediumOnly(false);
                    setShowSmallOnly(false);
                    setShowDustOnly(false);
                  }}
                >
                  <span className="hidden sm:inline">Kingpin ($500-$1K)</span>
                  <span className="sm:hidden">Kingpin</span>
                </Button>
                <Button
                  variant={showBossOnly ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    setShowBossOnly(true);
                    setShowKingpinOnly(false);
                    setShowSuperBossOnly(false);
                    setShowBabyWhaleOnly(false);
                    setShowTrueWhaleOnly(false);
                    setShowRealOnly(false);
                    setShowLargeOnly(false);
                    setShowMediumOnly(false);
                    setShowSmallOnly(false);
                    setShowDustOnly(false);
                  }}
                >
                  Boss ($200-$500)
                </Button>
                <Button
                  variant={showRealOnly ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    setShowRealOnly(true);
                    setShowBossOnly(false);
                    setShowKingpinOnly(false);
                    setShowSuperBossOnly(false);
                    setShowBabyWhaleOnly(false);
                    setShowTrueWhaleOnly(false);
                    setShowLargeOnly(false);
                    setShowMediumOnly(false);
                    setShowSmallOnly(false);
                    setShowDustOnly(false);
                  }}
                >
                  Real ($50-$199)
                </Button>
                <Button
                  variant={showLargeOnly ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    setShowLargeOnly(true);
                    setShowBossOnly(false);
                    setShowKingpinOnly(false);
                    setShowSuperBossOnly(false);
                    setShowBabyWhaleOnly(false);
                    setShowTrueWhaleOnly(false);
                    setShowRealOnly(false);
                    setShowMediumOnly(false);
                    setShowSmallOnly(false);
                    setShowDustOnly(false);
                  }}
                >
                  Large ($5-$49)
                </Button>
                <Button
                  variant={showMediumOnly ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    setShowMediumOnly(true);
                    setShowBossOnly(false);
                    setShowKingpinOnly(false);
                    setShowSuperBossOnly(false);
                    setShowBabyWhaleOnly(false);
                    setShowTrueWhaleOnly(false);
                    setShowLargeOnly(false);
                    setShowRealOnly(false);
                    setShowSmallOnly(false);
                    setShowDustOnly(false);
                  }}
                >
                  Medium ($1-$4)
                </Button>
              </div>
              {/* Mobile-optimized table display */}
              <div className="max-h-96 overflow-auto">
                {/* Desktop Table */}
                <div className="hidden md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Rank</TableHead>
                        <TableHead className="text-xs">Wallet Address</TableHead>
                        <TableHead className="text-xs">% Supply</TableHead>
                        <TableHead className="text-xs">Balance</TableHead>
                        <TableHead className="text-xs">USD Value</TableHead>
                        <TableHead className="text-xs w-20">Flag</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredHolders.map((holder) => (
                        <TableRow key={holder.owner}>
                          <TableCell className="font-mono text-xs">#{holder.rank}</TableCell>
                          <TableCell className="font-mono text-xs">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => navigator.clipboard.writeText(holder.owner)}
                                className="hover:text-muted-foreground transition-colors cursor-pointer text-left"
                                title="Click to copy full address"
                              >
                                {truncateAddress(holder.owner)}
                              </button>
                              {getFlagBadge(holder.owner)}
                            </div>
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {holder.percentageOfSupply?.toFixed(2)}%
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {Math.floor(holder.balance).toLocaleString()}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            ${(holder.usdValue || 0).toFixed(2)}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleFlagWallet(holder.owner)}
                              className="h-7 w-7 p-0"
                            >
                              <Flag className="h-3 w-3" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Mobile Card List */}
                <div className="md:hidden space-y-2">
                  {filteredHolders.map((holder) => (
                    <div key={holder.owner} className="bg-muted/30 rounded-lg p-3 border">
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-2">
                          <div className="font-mono text-sm font-bold">#{holder.rank}</div>
                          {getFlagBadge(holder.owner)}
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="font-mono text-sm font-bold text-green-600">
                            ${(holder.usdValue || 0).toFixed(2)}
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleFlagWallet(holder.owner)}
                            className="h-7 w-7 p-0"
                          >
                            <Flag className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <button
                          onClick={() => navigator.clipboard.writeText(holder.owner)}
                          className="font-mono text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer text-left w-full"
                          title="Click to copy full address"
                        >
                          {truncateAddress(holder.owner)}
                        </button>
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">
                            {holder.percentageOfSupply?.toFixed(2)}% supply
                          </span>
                          <span className="font-mono">
                            {Math.floor(holder.balance).toLocaleString()} tokens
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
          
          {/* Ad Banner #3 - After Holders List Table */}
          <div className="block md:hidden">
            <AdBanner size="mobile" position={3} />
          </div>
          <div className="hidden md:block">
            <AdBanner size="leaderboard" position={3} />
          </div>
        </>
      )}

      {/* Flag Wallet Modal */}
      <Dialog open={flagModalOpen} onOpenChange={setFlagModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Flag Wallet</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            {selectedWallet && (
              <div className="p-3 bg-muted rounded-lg">
                <div className="text-xs text-muted-foreground mb-1">Wallet Address</div>
                <div className="font-mono text-sm break-all">{selectedWallet}</div>
              </div>
            )}
            
            <div className="space-y-2">
              <Button
                variant="outline"
                className="w-full justify-start border-red-500/30 hover:bg-red-500/10"
                onClick={() => setWalletFlag('dev')}
              >
                <Flag className="h-4 w-4 mr-2 text-red-500" />
                Mark as Dev Wallet
              </Button>
              
              <Button
                variant="outline"
                className="w-full justify-start border-blue-500/30 hover:bg-blue-500/10"
                onClick={() => setWalletFlag('team')}
              >
                <Flag className="h-4 w-4 mr-2 text-blue-500" />
                Mark as Team Wallet
              </Button>
              
              <Button
                variant="outline"
                className="w-full justify-start border-orange-500/30 hover:bg-orange-500/10"
                onClick={() => setWalletFlag('suspicious')}
              >
                <Flag className="h-4 w-4 mr-2 text-orange-500" />
                Mark as Suspicious
              </Button>
              
              {selectedWallet && walletFlags[selectedWallet] && (
                <Button
                  variant="outline"
                  className="w-full justify-start border-muted-foreground/30"
                  onClick={() => setWalletFlag(null)}
                >
                  Clear Flag
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}