import React from "react";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import { useLocalSecrets } from "@/hooks/useLocalSecrets";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useWalletPool } from "@/hooks/useWalletPool";
import CoinScanner from "./CoinScanner";

// Supabase Functions fallback (direct URL) — uses public anon key
const SB_PROJECT_URL = "https://apxauapuusmgwbbzjgfl.supabase.co";
const SB_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFweGF1YXB1dXNtZ3diYnpqZ2ZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ1OTEzMDUsImV4cCI6MjA3MDE2NzMwNX0.w8IrKq4YVStF3TkdEcs5mCSeJsxjkaVq2NFkypYOXHU";
export type RunnerConfig = {
  tokenMint: string;
  tradeSizeUsd: number;
  intervalSec: number;

  // Anchor/plateau logic
  anchorWindowSec: number; // rolling window for anchor low (seconds)
  dipPct: number; // dip below anchor low to buy (e.g., 1.2 => 1.2%)
  takeProfitPct: number; // legacy TP target (used for UI; trailing uses trailArmPct)
  stopLossPct: number; // hard stop per lot
  cooldownSec: number; // cooldown after a sell
  dailyCapUsd: number; // maximum buys per day
  slippageBps: number; // for future on-chain
  quoteAsset: 'SOL' | 'USDC';

  // Trailing/exit
  trailArmPct: number; // arm trailing after this profit
  trailingDropPct: number; // sell when price falls this % from peak after arming
  slowdownConfirmTicks: number; // consecutive non-increasing ticks required to confirm slowdown

  // Adaptive trails (ROC-based)
  adaptiveTrails?: boolean;
  rocWindowSec?: number; // window for ROC calculation
  upSensitivityBpsPerPct?: number; // add to TP per +1% ROC (in bps)
  maxUpBiasBps?: number; // cap for TP bias (bps)
  downSensitivityBpsPerPct?: number; // add to Dip per −1% ROC (in bps)
  maxDownBiasBps?: number; // cap for Dip bias (bps)

  // Position management
  separateLots: boolean; // allow multiple concurrent lots
  maxConcurrentLots: number; // e.g., 2
  bigDipFloorDropPct: number; // open Lot #2 if price <= entry1 − this %
  bigDipHoldMinutes: number; // require staying below floor for this many minutes
  secondLotTradeSizeUsd?: number; // optional override for lot #2 size

  // Execution
  confirmPolicy: 'confirmed' | 'processed' | 'none';
  feeOverrideMicroLamports?: number; // 0/empty = auto
};

function format(n: number, d = 4) {
  return Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: d }) : "-";
}

async function fetchJupPriceUSD(mint: string): Promise<number | null> {
  // 1) DexScreener (client-friendly)
  try {
    const r = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${encodeURIComponent(mint)}`, { cache: 'no-store' });
    if (r.ok) {
      const j = await r.json();
      const p = Number(j?.pairs?.[0]?.priceUsd);
      if (Number.isFinite(p) && p > 0) return p;
    }
  } catch {}
  // 2) Our edge proxy (works even when browser can't reach price sources)
  try {
    const r2 = await fetch(`${SB_PROJECT_URL}/functions/v1/raydium-quote?priceMint=${encodeURIComponent(mint)}`, {
      headers: { apikey: SB_ANON_KEY, Authorization: `Bearer ${SB_ANON_KEY}` },
      cache: 'no-store',
    });
    if (r2.ok) {
      const j2 = await r2.json();
      const p2 = Number(j2?.priceUSD);
      if (Number.isFinite(p2) && p2 > 0) return p2;
    }
  } catch {}
  // 3) Jupiter fallback (best-effort)
  try {
    const r3 = await fetch(`https://price.jup.ag/v6/price?ids=${encodeURIComponent(mint)}&vsToken=USDC`, { cache: 'no-store' });
    if (r3.ok) {
      const j3 = await r3.json();
      const p3 = Number(j3?.data?.[mint]?.price);
      if (Number.isFinite(p3) && p3 > 0) return p3;
    }
  } catch {}
  return null;
}

const WSOL_MINT = "So11111111111111111111111111111111111111112";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

async function fetchSolUsd(): Promise<number | null> {
  const tryEdge = async (id: string) => {
    try {
      const r = await fetch(`${SB_PROJECT_URL}/functions/v1/raydium-quote?priceMint=${encodeURIComponent(id)}`, {
        headers: { apikey: SB_ANON_KEY, Authorization: `Bearer ${SB_ANON_KEY}` },
        cache: 'no-store',
      });
      if (r.ok) {
        const j = await r.json();
        const p = Number(j?.priceUSD);
        if (Number.isFinite(p) && p > 0) return p;
      }
    } catch {}
    return null;
  };

  // Prefer WSOL mint to avoid symbol ambiguity
  const p1 = await tryEdge(WSOL_MINT);
  if (p1) return p1;

  const p2 = await tryEdge('SOL');
  if (p2) return p2;

  const p3 = await tryEdge('wSOL');
  if (p3) return p3;

  // Jupiter direct (best-effort)
  try {
    const r = await fetch('https://price.jup.ag/v6/price?ids=SOL', { cache: 'no-store' });
    if (r.ok) {
      const j = await r.json();
      const p = Number(j?.data?.SOL?.price ?? j?.data?.wSOL?.price ?? j?.SOL?.price);
      if (Number.isFinite(p) && p > 0) return p;
    }
  } catch {}
  try {
    const r = await fetch(`https://price.jup.ag/v6/price?ids=${encodeURIComponent(WSOL_MINT)}`, { cache: 'no-store' });
    if (r.ok) {
      const j = await r.json();
      const p = Number(j?.data?.[WSOL_MINT]?.price);
      if (Number.isFinite(p) && p > 0) return p;
    }
  } catch {}
  return null;
}

function useInterval(callback: () => void, delay: number | null) {
  const savedRef = React.useRef(callback);
  React.useEffect(() => {
    savedRef.current = callback;
  }, [callback]);
  React.useEffect(() => {
    if (delay === null) return;
    const id = setInterval(() => savedRef.current(), delay);
    return () => clearInterval(id);
  }, [delay]);
}

const todayKey = () => new Date().toISOString().slice(0, 10);

export default function LiveRunner() {
  const { ready, secrets } = useLocalSecrets();

  const [cfg, setCfg] = React.useState<RunnerConfig>({
    tokenMint: "FTggXu7nYowpXjScSw7BZjtZDXywLNjK88CGhydDGgMS",
    tradeSizeUsd: 20,
    intervalSec: 3,
    anchorWindowSec: 60,
    dipPct: 1.0,
    takeProfitPct: 10,
    stopLossPct: 35,
    cooldownSec: 15,
    dailyCapUsd: 300,
    slippageBps: 1500,
    quoteAsset: 'SOL',
    trailArmPct: 5,
    trailingDropPct: 3,
    slowdownConfirmTicks: 2,
    // Adaptive defaults
    adaptiveTrails: true,
    rocWindowSec: 30,
    upSensitivityBpsPerPct: 50,
    maxUpBiasBps: 300,
    downSensitivityBpsPerPct: 0,
    maxDownBiasBps: 300,
    // Position mgmt
    separateLots: true,
    maxConcurrentLots: 2,
    bigDipFloorDropPct: 25,
    bigDipHoldMinutes: 6,
    secondLotTradeSizeUsd: 20,
    // Execution
    confirmPolicy: 'processed',
    feeOverrideMicroLamports: 0,
  });

  const [running, setRunning] = React.useState(false);
  const [status, setStatus] = React.useState<string>("idle");
  const [price, setPrice] = React.useState<number | null>(null);
  const [manualPrice, setManualPrice] = React.useState<string>("");
  type Lot = { id: string; entry: number; high: number; qtyRaw: number; qtyUi: number; entryTs: number; ownerPubkey: string; ownerSecret: string };
  const [positions, setPositions] = React.useState<Lot[]>([]);
  const [trailingHigh, setTrailingHigh] = React.useState<number | null>(null);
  const [lastSellTs, setLastSellTs] = React.useState<number | null>(null);
  const [daily, setDaily] = React.useState<{ key: string; buyUsd: number }>({ key: todayKey(), buyUsd: 0 });

  type Trade = { id: string; time: number; side: 'buy'|'sell'; status: 'pending'|'confirmed'|'error'; signatures?: string[]; error?: string };
  const [trades, setTrades] = React.useState<Trade[]>([]);
  const [executing, setExecuting] = React.useState(false);
  const [wallet, setWallet] = React.useState<{ address: string; sol: number } | null>(null);
  const [walletLoading, setWalletLoading] = React.useState(false);
  const [allTokens, setAllTokens] = React.useState<Array<{ mint: string; symbol?: string; name?: string; decimals: number; uiAmount: number; price?: number }>>([]);

  const [holding, setHolding] = React.useState<{ mint: string; amountRaw: string; decimals: number; uiAmount: number } | null>(null);
  const [activity, setActivity] = React.useState<{ time: number; text: string }[]>([]);
  const [coinScannerEnabled, setCoinScannerEnabled] = React.useState(true); // Enable by default
  const [autoScanning, setAutoScanning] = React.useState(false);
  const [tokenInfo, setTokenInfo] = React.useState<{ name?: string; symbol?: string; price?: number } | null>(null);
  
  // New state for enhanced features
  const [volatilityAssessment, setVolatilityAssessment] = React.useState<{ score: number; message: string } | null>(null);
  const [startMode, setStartMode] = React.useState<'buying' | 'selling'>('buying');
  const [sessionStartTime, setSessionStartTime] = React.useState<number | null>(null);
  const [exitConditions, setExitConditions] = React.useState<{ timeBasedExit: boolean; minProfitForTimeExit: number }>({ 
    timeBasedExit: false, 
    minProfitForTimeExit: 1 
  });
  
  // Emergency Hard Set Limit Sell state
  const [emergencyHardSell, setEmergencyHardSell] = React.useState<{
    enabled: boolean;
    limitPrice: string;
    isActive: boolean;
  }>({
    enabled: false,
    limitPrice: "",
    isActive: false
  });
  
  const log = React.useCallback((text: string) => {
    const tokenTicker = tokenInfo?.symbol || cfg.tokenMint.slice(0, 4) + '…' + cfg.tokenMint.slice(-4);
    setActivity((a) => [{ time: Date.now(), text: text.replace(/\$TOKEN/g, tokenTicker) }, ...a].slice(0, 50));
  }, [tokenInfo?.symbol, cfg.tokenMint]);

  // Fetch historical price data for spike detection
  const fetchHistoricalPrices = React.useCallback(async (mint: string): Promise<Array<{ timestamp: number; price: number }>> => {
    try {
      // Try to get 1-hour historical data from DexScreener
      const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`, { cache: 'no-store' });
      if (response.ok) {
        const data = await response.json();
        const pair = data?.pairs?.[0];
        
        if (pair?.priceChange?.h1) {
          const currentPrice = Number(pair.priceUsd);
          const h1Change = Number(pair.priceChange.h1);
          
          // Estimate historical prices (simplified approach)
          const historical: Array<{ timestamp: number; price: number }> = [];
          const now = Date.now();
          
          for (let i = 0; i < 60; i++) {
            const timeAgo = now - (i * 60000); // 1 minute intervals
            const estimatedPrice = currentPrice * (1 - (h1Change / 100) * (i / 60));
            historical.push({ timestamp: timeAgo, price: estimatedPrice });
          }
          
          return historical.reverse(); // Oldest first
        }
      }
    } catch (error) {
      log(`⚠️ Could not fetch historical data: ${error}`);
    }
    return [];
  }, [log]);

  // Enhanced volatility assessment with spike detection
  const assessTokenVolatility = React.useCallback(async (mint: string): Promise<{ score: number; message: string; spikeWarning?: boolean }> => {
    try {
      log("📊 Assessing token volatility and spike patterns...");
      
      // Get historical data first
      const historicalData = await fetchHistoricalPrices(mint);
      
      // Collect real-time price data for 1 minute (every 2 seconds)
      const prices: number[] = [];
      const startTime = Date.now();
      
      while (Date.now() - startTime < 60000) {
        const currentPrice = await fetchJupPriceUSD(mint);
        if (currentPrice) prices.push(currentPrice);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
      if (prices.length < 5) {
        return { score: 0, message: "Insufficient price data for assessment" };
      }
      
      // Calculate volatility metrics
      const minPrice = Math.min(...prices);
      const maxPrice = Math.max(...prices);
      const avgPrice = prices.reduce((a, b) => a + b) / prices.length;
      const volatilityPct = ((maxPrice - minPrice) / avgPrice) * 100;
      
      // Calculate trend direction
      const firstHalf = prices.slice(0, Math.floor(prices.length / 2));
      const secondHalf = prices.slice(Math.floor(prices.length / 2));
      const firstAvg = firstHalf.reduce((a, b) => a + b) / firstHalf.length;
      const secondAvg = secondHalf.reduce((a, b) => a + b) / secondHalf.length;
      const trendPct = ((secondAvg - firstAvg) / firstAvg) * 100;
      
      // Spike detection using historical data
      let spikeWarning = false;
      if (historicalData.length > 30) {
        const currentPrice = prices[prices.length - 1];
        const historicalAvg = historicalData.slice(-30).reduce((sum, item) => sum + item.price, 0) / 30;
        const spikeThreshold = 15; // 15% above historical average
        
        if (currentPrice > historicalAvg * (1 + spikeThreshold / 100)) {
          spikeWarning = true;
          log(`🚨 SPIKE WARNING: Current price ${currentPrice.toFixed(6)} is ${((currentPrice/historicalAvg - 1) * 100).toFixed(1)}% above recent average`);
        }
      }
      
      let score = 50; // Base score
      let message = "";
      
      // Adjust score based on spike warning
      if (spikeWarning) {
        score -= 40;
        message = "⚠️ Token appears to be on a spike - RISKY entry point";
      } else if (volatilityPct > 3) {
        score += 30;
        message = `High volatility (${volatilityPct.toFixed(1)}%) - Good for trading`;
      } else if (volatilityPct > 1.5) {
        score += 15;
        message = `Medium volatility (${volatilityPct.toFixed(1)}%) - Moderate trading potential`;
      } else {
        score -= 20;
        message = `Low volatility (${volatilityPct.toFixed(1)}%) - Limited movement detected`;
      }
      
      if (Math.abs(trendPct) > 2) {
        score += 10;
        message += `, ${trendPct > 0 ? 'upward' : 'downward'} trend (${Math.abs(trendPct).toFixed(1)}%)`;
      }
      
      log(`📊 Assessment complete: ${message}`);
      return { 
        score: Math.max(0, Math.min(100, score)), 
        message,
        spikeWarning 
      };
    } catch (error) {
      log(`❌ Volatility assessment failed: ${error}`);
      return { score: 50, message: "Assessment failed, using default parameters" };
    }
  }, [log, fetchHistoricalPrices]);

  // Check wallet holdings to determine start mode
  const checkWalletHoldings = React.useCallback(async (): Promise<'buying' | 'selling'> => {
    try {
      // Check if we have holdings of the target token
      if (holding && holding.mint === cfg.tokenMint && holding.uiAmount > 0) {
        log(`💰 Found existing holdings: ${holding.uiAmount.toFixed(6)} tokens - Starting in SELLING mode`);
        return 'selling';
      }
      
      // Check positions array for existing lots
      const existingLots = positions.filter(lot => lot.qtyUi > 0);
      if (existingLots.length > 0) {
        log(`📈 Found ${existingLots.length} existing position(s) - Starting in SELLING mode`);
        return 'selling';
      }
      
      log(`🛒 No existing holdings found - Starting in BUYING mode`);
      return 'buying';
    } catch (error) {
      log(`⚠️ Error checking holdings, defaulting to BUYING mode: ${error}`);
      return 'buying';
    }
  }, [holding, positions, cfg.tokenMint, log]);

  // Auto-adjust trading parameters based on token characteristics
  const adjustParametersForToken = React.useCallback((token: any) => {
    // Calculate volatility indicators
    const priceChange24h = Math.abs(parseFloat(token.priceChange24h || "0"));
    const volume24h = parseFloat(token.volume24h || "0");
    const marketCap = parseFloat(token.marketCap || "0");
    const liquidity = parseFloat(token.liquidity || "0");
    
    // Volatility-based adjustments
    let dipPct = 1.0;
    let takeProfitPct = 10;
    
    if (priceChange24h > 30) {
      // High volatility - increase thresholds
      dipPct = 2.5;
      takeProfitPct = 15;
      log(`📊 High volatility detected (${priceChange24h.toFixed(1)}%), using dip: ${dipPct}%, profit: ${takeProfitPct}%`);
    } else if (priceChange24h > 15) {
      // Medium volatility
      dipPct = 1.5;
      takeProfitPct = 12;
      log(`📊 Medium volatility detected (${priceChange24h.toFixed(1)}%), using dip: ${dipPct}%, profit: ${takeProfitPct}%`);
    } else if (priceChange24h < 5) {
      // Low volatility - tighter thresholds
      dipPct = 0.8;
      takeProfitPct = 8;
      log(`📊 Low volatility detected (${priceChange24h.toFixed(1)}%), using dip: ${dipPct}%, profit: ${takeProfitPct}%`);
    }

    // Liquidity-based adjustments (lower liquidity = higher slippage tolerance)
    let slippageBps = 1500;
    if (liquidity < 50000) {
      slippageBps = 2500;
      log(`💧 Low liquidity detected ($${(liquidity/1000).toFixed(0)}K), increased slippage to ${slippageBps} bps`);
    } else if (liquidity > 500000) {
      slippageBps = 1000;
      log(`💧 High liquidity detected ($${(liquidity/1000).toFixed(0)}K), reduced slippage to ${slippageBps} bps`);
    }

    return { dipPct, takeProfitPct, slippageBps };
  }, [log]);

  // Enhanced auto-scan with spike detection for all candidates
  const scanAndSelectBestToken = React.useCallback(async (): Promise<boolean> => {
    try {
      // Check if we have existing holdings - don't switch tokens if we do
      if (holding && holding.uiAmount > 0) {
        log(`⚠️ Cannot switch tokens while holding ${holding.uiAmount.toFixed(6)} tokens. Wait for sale to complete.`);
        return false;
      }

      // Check if we have open positions - don't switch tokens if we do
      if (positions.length > 0) {
        log(`⚠️ Cannot switch tokens while ${positions.length} position(s) are open. Wait for positions to close.`);
        return false;
      }

      setAutoScanning(true);
      log("🔍 Auto-scanning for best token with spike analysis...");
      
      const { data, error } = await supabase.functions.invoke('coin-scanner', {
        body: { minScore: 70, limit: 20 } // Get more candidates for spike filtering
      });
      
      if (error) {
        log(`❌ Scan failed: ${error.message}`);
        return false;
      }
      
      if (data?.success && data?.qualifiedTokens?.length > 0) {
        log(`📊 Found ${data.qualifiedTokens.length} qualified tokens, analyzing for spike risks...`);
        
        // Analyze each token for spikes using DexScreener data
        const safeTokens = [];
        
        for (const token of data.qualifiedTokens.slice(0, 10)) { // Check top 10
          try {
            // Get current price data for spike detection
            const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${token.mint}`, { cache: 'no-store' });
            if (response.ok) {
              const dexData = await response.json();
              const pair = dexData?.pairs?.[0];
              
              if (pair) {
                const currentPrice = Number(pair.priceUsd);
                const h1Change = Number(pair.priceChange?.h1 || 0);
                const h6Change = Number(pair.priceChange?.h6 || 0);
                const h24Change = Number(pair.priceChange?.h24 || 0);
                
                // Enhanced spike detection criteria
                let spikeRisk = false;
                let riskReason = "";
                
                // Check for recent sharp upward moves that indicate spike peaks
                if (h1Change > 20) {
                  spikeRisk = true;
                  riskReason = `1h spike +${h1Change.toFixed(1)}%`;
                } else if (h6Change > 35 && h1Change > 5) {
                  spikeRisk = true;
                  riskReason = `6h spike +${h6Change.toFixed(1)}% (still rising)`;
                } else if (h24Change > 50 && h6Change > 15) {
                  spikeRisk = true;
                  riskReason = `24h spike +${h24Change.toFixed(1)}% (recent acceleration)`;
                }
                
                if (!spikeRisk) {
                  safeTokens.push({
                    ...token,
                    currentPrice,
                    priceChanges: { h1: h1Change, h6: h6Change, h24: h24Change },
                    spikeAnalysis: `Safe: h1:${h1Change.toFixed(1)}% h6:${h6Change.toFixed(1)}% h24:${h24Change.toFixed(1)}%`
                  });
                  log(`✅ ${token.symbol}: Safe entry - ${token.symbol} (score: ${token.totalScore?.toFixed(0) || 'N/A'})`);
                } else {
                  log(`🚨 ${token.symbol}: SPIKE RISK - ${riskReason} - SKIPPED`);
                }
              }
            }
            
            // Rate limiting
            await new Promise(resolve => setTimeout(resolve, 200));
          } catch (err) {
            log(`⚠️ Could not analyze ${token.symbol} for spikes: ${err}`);
            // Include token anyway if we can't analyze (better than blocking all)
            safeTokens.push(token);
          }
        }
        
        if (safeTokens.length === 0) {
          log(`❌ No safe tokens found - all candidates show spike risks`);
          return false;
        }
        
        // Select best safe token (already sorted by score)
        const bestSafeToken = safeTokens[0];
        
        // Don't switch if it's the same token we already have
        if (bestSafeToken.mint === cfg.tokenMint) {
          log(`✅ Best safe token is current token ${bestSafeToken.symbol} - no switch needed`);
          return true;
        }
        
        log(`🎯 Selected best SAFE token: ${bestSafeToken.symbol} (score: ${bestSafeToken.totalScore?.toFixed(0) || 'N/A'}) - ${bestSafeToken.spikeAnalysis || 'spike-safe'}`);
        
        // Auto-adjust parameters based on token characteristics
        const adjustedParams = adjustParametersForToken(bestSafeToken);
        
        setCfg(prev => ({ 
          ...prev, 
          tokenMint: bestSafeToken.mint,
          dipPct: adjustedParams.dipPct,
          takeProfitPct: adjustedParams.takeProfitPct,
          slippageBps: adjustedParams.slippageBps
        }));
        
        // Update token info
        setTokenInfo({
          name: bestSafeToken.name,
          symbol: bestSafeToken.symbol,
          price: bestSafeToken.currentPrice || bestSafeToken.currentPrice
        });
        
        log(`🔄 Switched to ${bestSafeToken.symbol} with spike-safe entry and optimized parameters`);
        return true;
      } else {
        log("❌ No qualified tokens found in scan");
        return false;
      }
    } catch (err) {
      log(`❌ Scan error: ${err}`);
      return false;
    } finally {
      setAutoScanning(false);
    }
  }, [log, adjustParametersForToken, holding, positions, cfg.tokenMint]);

  // Fetch token info when mint changes
  React.useEffect(() => {
    const fetchTokenInfo = async () => {
      try {
        // Try DexScreener first for token metadata
        const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${cfg.tokenMint}`, { cache: 'no-store' });
        if (response.ok) {
          const data = await response.json();
          const pair = data?.pairs?.[0];
          if (pair) {
            setTokenInfo({
              name: pair.baseToken?.name || 'Unknown Token',
              symbol: pair.baseToken?.symbol || cfg.tokenMint.slice(0, 6),
              price: Number(pair.priceUsd) || null
            });
            return;
          }
        }
      } catch {}
      
      // Fallback to truncated mint as symbol
      setTokenInfo({
        name: 'Unknown Token',
        symbol: cfg.tokenMint.slice(0, 6),
        price: null
      });
    };
    
    fetchTokenInfo();
  }, [cfg.tokenMint]);

  // Handle token suggestions from coin scanner
  const handleTokenSuggestion = React.useCallback((token: any) => {
    const currentScore = 75; // Placeholder - would calculate current token's score
    if (token.totalScore > currentScore + 10) {
      log(`Scanner suggests better token: ${token.symbol} (score: ${token.totalScore.toFixed(0)})`);
      if (confirm(`Switch to ${token.symbol} (${token.name})? Scanner score: ${token.totalScore.toFixed(0)} vs current: ${currentScore}`)) {
        setCfg(prev => ({ ...prev, tokenMint: token.mint }));
        setTokenInfo({
          name: token.name,
          symbol: token.symbol,
          price: token.currentPrice
        });
        log(`Switched to ${token.symbol} (${token.mint})`);
      }
    }
  }, [log]);
  const prevPriceRef = React.useRef<number | null>(null);
  const decelCountRef = React.useRef<number>(0);
  const priceWindowRef = React.useRef<{ t: number; p: number }[]>([]);
  const bigDipTimerRef = React.useRef<number | null>(null);
  const buyArmRef = React.useRef<{ min: number; armedAt: number } | null>(null);
  const bounceConfirmPct = 0.2; // +0.2% bounce confirm for entries
  const [rocPct, setRocPct] = React.useState<number | null>(null);
  // reset daily counters when date changes
  React.useEffect(() => {
    const key = todayKey();
    setDaily((d) => (d.key === key ? d : { key, buyUsd: 0 }));
  }, [running]);

  const { wallets: poolWallets } = useWalletPool();
  const rrRef = React.useRef<number>(0);
  const [funded, setFunded] = React.useState<{ secret: string; pubkey: string; sol: number }[]>([]);
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!poolWallets.length) { if (!cancelled) setFunded([]); return; }
      const results = await Promise.all(poolWallets.map(async (w) => {
        try {
          const r = await fetch(`${SB_PROJECT_URL}/functions/v1/trader-wallet`, {
            headers: {
              apikey: SB_ANON_KEY,
              Authorization: `Bearer ${SB_ANON_KEY}`,
              ...(secrets?.functionToken ? { 'x-function-token': secrets.functionToken } : {}),
              'x-owner-secret': w.secretBase58,
            },
          });
          if (!r.ok) return null;
          const j = await r.json();
          const sol = Number(j?.solBalance ?? 0);
          return { secret: w.secretBase58, pubkey: w.pubkey, sol };
        } catch { return null; }
      }));
      const items = results.filter((x): x is { secret: string; pubkey: string; sol: number } => !!x).filter((x) => x.sol > 0.0005);
      if (!cancelled) setFunded(items);
    })();
    return () => { cancelled = true; };
  }, [poolWallets.map((w) => w.pubkey).join(','), secrets?.functionToken]);
  const pickNextOwner = React.useCallback(() => {
    // Prefer the locally set Secrets wallet
    if (secrets?.tradingPrivateKey) {
      return { secret: secrets.tradingPrivateKey, pubkey: wallet?.address ?? '', sol: wallet?.sol ?? 0 };
    }
    if (!funded.length) return null;
    const idx = rrRef.current % funded.length;
    rrRef.current = (rrRef.current + 1) % funded.length;
    return funded[idx];
  }, [funded, secrets?.tradingPrivateKey, wallet?.address, wallet?.sol]);

  const loadWallet = React.useCallback(async (ownerSecret?: string) => {
    setWalletLoading(true);
    try {
      const res = await fetch(`${SB_PROJECT_URL}/functions/v1/trader-wallet`, {
        headers: {
          apikey: SB_ANON_KEY,
          Authorization: `Bearer ${SB_ANON_KEY}`,
          ...(secrets?.functionToken ? { 'x-function-token': secrets.functionToken } : {}),
          ...(ownerSecret ? { 'x-owner-secret': ownerSecret } : {}),
        },
      });
      if (res.ok) {
        const j = await res.json();
        const addr = j?.publicKey as string | undefined;
        const sol = Number(j?.solBalance);
        if (addr && Number.isFinite(sol)) setWallet({ address: addr, sol });
        
        else if (addr) setWallet({ address: addr, sol: NaN });
      }
    } catch {}
    finally {
      setWalletLoading(false);
    }
  }, [secrets?.functionToken]);


  React.useEffect(() => {
    void loadWallet(secrets?.tradingPrivateKey);
  }, [loadWallet, secrets?.tradingPrivateKey]);

  const loadHoldings = React.useCallback(async (ownerSecret?: string) => {
    if (!cfg.tokenMint) return;
    try {
      const res = await fetch(`${SB_PROJECT_URL}/functions/v1/trader-wallet?tokenMint=${encodeURIComponent(cfg.tokenMint)}` , {
        headers: {
          apikey: SB_ANON_KEY,
          Authorization: `Bearer ${SB_ANON_KEY}`,
          ...(secrets?.functionToken ? { 'x-function-token': secrets.functionToken } : {}),
          ...(ownerSecret ? { 'x-owner-secret': ownerSecret } : {}),
        },
      });
      if (res.ok) {
        const j = await res.json();
        const dec = Number(j?.tokenDecimals);
        const raw = String(j?.tokenBalanceRaw ?? "0");
        const ui = Number(j?.tokenUiAmount ?? (Number(raw) / Math.pow(10, Number.isFinite(dec) ? dec : 0)));
        if (j?.tokenMint) {
          setHolding({ mint: j.tokenMint, amountRaw: raw, decimals: Number.isFinite(dec) ? dec : 0, uiAmount: Number.isFinite(ui) ? ui : 0 });
        } else {
          setHolding(null);
        }
      }
    } catch {}
  }, [cfg.tokenMint, secrets?.functionToken]);

  React.useEffect(() => {
    void loadHoldings(secrets?.tradingPrivateKey);
  }, [loadHoldings, secrets?.tradingPrivateKey]);

  const effectivePrice = React.useMemo(() => {
    const m = Number(manualPrice);
    if (Number.isFinite(m) && m > 0) return m;
    return price;
  }, [manualPrice, price]);

  // Load all tokens in wallet
  const loadAllTokens = React.useCallback(async (ownerSecret?: string) => {
    if (!wallet?.address) return;
    
    try {
      const tokens: Array<{ mint: string; symbol?: string; name?: string; decimals: number; uiAmount: number; price?: number }> = [];
      
      // Add SOL
      if (wallet.sol > 0) {
        tokens.push({
          mint: 'So11111111111111111111111111111111111111112',
          symbol: 'SOL',
          name: 'Solana',
          decimals: 9,
          uiAmount: wallet.sol,
          price: 250 // Rough SOL price estimate
        });
      }
      
      // Check USDC
      try {
        const usdcRes = await fetch(`${SB_PROJECT_URL}/functions/v1/trader-wallet?tokenMint=${encodeURIComponent('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v')}`, {
          headers: {
            apikey: SB_ANON_KEY,
            Authorization: `Bearer ${SB_ANON_KEY}`,
            ...(secrets?.functionToken ? { 'x-function-token': secrets.functionToken } : {}),
            ...(ownerSecret ? { 'x-owner-secret': ownerSecret } : {}),
          },
        });
        if (usdcRes.ok) {
          const usdcData = await usdcRes.json();
          if (usdcData.tokenUiAmount > 0) {
            tokens.push({
              mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
              symbol: 'USDC',
              name: 'USD Coin',
              decimals: usdcData.tokenDecimals || 6,
              uiAmount: usdcData.tokenUiAmount,
              price: 1 // USDC is $1
            });
          }
        }
      } catch {}
      
      // Check current tracking token if it's different
      if (cfg.tokenMint && 
          cfg.tokenMint !== 'So11111111111111111111111111111111111111112' && 
          cfg.tokenMint !== 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v') {
        try {
          const tokenRes = await fetch(`${SB_PROJECT_URL}/functions/v1/trader-wallet?tokenMint=${encodeURIComponent(cfg.tokenMint)}`, {
            headers: {
              apikey: SB_ANON_KEY,
              Authorization: `Bearer ${SB_ANON_KEY}`,
              ...(secrets?.functionToken ? { 'x-function-token': secrets.functionToken } : {}),
              ...(ownerSecret ? { 'x-owner-secret': ownerSecret } : {}),
            },
          });
          if (tokenRes.ok) {
            const tokenData = await tokenRes.json();
            if (tokenData.tokenUiAmount > 0) {
              tokens.push({
                mint: cfg.tokenMint,
                symbol: tokenInfo?.symbol || `${cfg.tokenMint.slice(0,4)}…${cfg.tokenMint.slice(-4)}`,
                name: tokenInfo?.name,
                decimals: tokenData.tokenDecimals || 9,
                uiAmount: tokenData.tokenUiAmount,
                price: effectivePrice
              });
            }
          }
        } catch {}
      }
      
      setAllTokens(tokens);
    } catch (error) {
      console.error('Failed to load all tokens:', error);
    }
  }, [wallet?.address, cfg.tokenMint, tokenInfo, effectivePrice, secrets?.functionToken]);

  // Load all tokens when wallet changes
  React.useEffect(() => {
    if (wallet?.address) {
      void loadAllTokens(secrets?.tradingPrivateKey);
    }
  }, [wallet?.address, loadAllTokens, secrets?.tradingPrivateKey]);

  const canBuy = React.useMemo(() => {
    if (!effectivePrice) return false;
    if (daily.buyUsd + cfg.tradeSizeUsd > cfg.dailyCapUsd) return false;
    if (lastSellTs && Date.now() - lastSellTs < cfg.cooldownSec * 1000) return false;
    const allowed = cfg.separateLots ? (cfg.maxConcurrentLots ?? 1) : 1;
    return positions.length < allowed;
  }, [effectivePrice, daily, cfg, lastSellTs, positions.length]);

  const execSwap = React.useCallback(async (side: 'buy' | 'sell', opts?: { sellAmountRaw?: number; sellQtyUi?: number; buyUsd?: number; ownerSecret?: string }) => {
    if (executing) return { ok: false } as const;
    setExecuting(true);
    const id = crypto.randomUUID();
    const newTrade: Trade = { id, time: Date.now(), side, status: 'pending' };
    setTrades((t) => [newTrade, ...t].slice(0, 25));

    const ownerHeaders = opts?.ownerSecret ? { 'x-owner-secret': opts.ownerSecret } : {};
    const getRawBalance = async (): Promise<{ raw: number; decimals: number } | null> => {
      try {
        const res = await fetch(`${SB_PROJECT_URL}/functions/v1/trader-wallet?tokenMint=${encodeURIComponent(cfg.tokenMint)}` , {
          headers: { apikey: SB_ANON_KEY, Authorization: `Bearer ${SB_ANON_KEY}`, ...(secrets?.functionToken ? { 'x-function-token': secrets.functionToken } : {}), ...ownerHeaders },
        });
        if (res.ok) {
          const j = await res.json();
          return { raw: Number(j?.tokenBalanceRaw ?? 0), decimals: Number(j?.tokenDecimals ?? 0) };
        }
      } catch {}
      return null;
    };

    try {
      // Pre-trade status + advisory
      if (side === 'sell') {
        const pNow = (effectivePrice ?? price) ?? null;
        const qty = opts?.sellQtyUi ?? holding?.uiAmount ?? null;
        const entry = positions[0]?.entry ?? null; // first lot (for rough ROI in log)
        if (pNow && qty) {
          const roi = entry ? ((pNow / entry) - 1) * 100 : NaN;
          const pnlUsd = entry ? qty * (pNow - entry) : NaN;
          setStatus(`Selling — qty ${format(qty, 4)} @ $${format(pNow, 6)}${Number.isFinite(roi) ? ` • ROI ${format(roi, 2)}%` : ''}${Number.isFinite(pnlUsd) ? ` • PnL $${format(pnlUsd, 2)}` : ''}`);
          log(`Selling… ${format(qty, 4)} tokens at $${format(pNow, 6)}${Number.isFinite(roi) ? ` (ROI ${format(roi, 2)}%)` : ''}`);
        } else {
          setStatus('Selling… submitting swap');
          log('Selling… submitting swap');
        }
      } else {
        const pNow = (effectivePrice ?? price) ?? null;
        const usd = Number(opts?.buyUsd ?? cfg.tradeSizeUsd);
        if (pNow) setStatus(`Buying — target ~$${format(pNow, 6)} for ~$${format(usd, 2)}`);
      }

      let preBal: { raw: number; decimals: number } | null = null;
      if (side === 'buy') preBal = await getRawBalance();

      let body: any;
      if (cfg.quoteAsset === 'USDC') {
        if (side === 'buy') {
          const usd = Math.round(Number(opts?.buyUsd ?? cfg.tradeSizeUsd));
          body = { side: 'buy', tokenMint: cfg.tokenMint, usdcAmount: usd, slippageBps: cfg.slippageBps };
        } else {
          if (opts?.sellAmountRaw && opts.sellAmountRaw > 0) {
            body = { side: 'sell', tokenMint: cfg.tokenMint, amount: Math.floor(opts.sellAmountRaw), slippageBps: cfg.slippageBps };
          } else {
            body = { side: 'sell', tokenMint: cfg.tokenMint, sellAll: true, slippageBps: cfg.slippageBps };
          }
        }
      } else {
        if (side === 'buy') {
          const solUsd = await fetchSolUsd();
          if (!solUsd || !Number.isFinite(solUsd) || solUsd <= 0) throw new Error('Failed to fetch SOL price');
          const buyUsd = Number(opts?.buyUsd ?? cfg.tradeSizeUsd);
          const lamports = Math.floor((buyUsd / solUsd) * 1_000_000_000 * 0.98);
          if (!Number.isFinite(lamports) || lamports <= 0) throw new Error('Computed lamports invalid');
          body = { inputMint: WSOL_MINT, outputMint: cfg.tokenMint, amount: lamports, slippageBps: cfg.slippageBps, wrapSol: true } as any;
        } else {
          if (opts?.sellAmountRaw && opts.sellAmountRaw > 0) {
            body = { inputMint: cfg.tokenMint, outputMint: WSOL_MINT, amount: Math.floor(opts.sellAmountRaw), slippageBps: cfg.slippageBps, unwrapSol: true } as any;
          } else {
            // sell all
            let raw = 0;
            try {
              const res = await fetch(`${SB_PROJECT_URL}/functions/v1/trader-wallet?tokenMint=${encodeURIComponent(cfg.tokenMint)}`, {
                headers: { apikey: SB_ANON_KEY, Authorization: `Bearer ${SB_ANON_KEY}`, ...(secrets?.functionToken ? { 'x-function-token': secrets.functionToken } : {}), ...ownerHeaders },
              });
              if (res.ok) {
                const j = await res.json();
                raw = Number(j?.tokenBalanceRaw ?? 0);
              }
            } catch {}
            if (!Number.isFinite(raw) || raw <= 0) throw new Error('No token balance to sell');
            body = { inputMint: cfg.tokenMint, outputMint: WSOL_MINT, amount: Math.floor(raw), slippageBps: cfg.slippageBps, unwrapSol: true } as any;
          }
        }
      }

      // Fast mode + fee override
      (body as any).confirmPolicy = cfg.confirmPolicy;
      if (cfg.feeOverrideMicroLamports && cfg.feeOverrideMicroLamports > 0) {
        (body as any).computeUnitPriceMicroLamports = cfg.feeOverrideMicroLamports;
      }

      try {
        const timeoutMs = 15000;
        const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('invoke timeout')), timeoutMs));
        const invoke = supabase.functions
          .invoke('raydium-swap', { body, headers: { ...(secrets?.functionToken ? { 'x-function-token': secrets.functionToken } : {}), ...(opts?.ownerSecret ? { 'x-owner-secret': opts.ownerSecret } : {}) } })
          .then(({ data, error }) => { if (error) throw error; return data as any; });
        const data: any = await Promise.race([invoke, timeout]);
        const sigs: string[] = data?.signatures ?? [];
        setTrades((arr) => arr.map((x) => (x.id === id ? { ...x, status: 'confirmed', signatures: sigs } : x)));
        toast({ title: `${side.toUpperCase()} executed`, description: sigs[0] ? `Confirmed tx: ${sigs[0].slice(0, 8)}…` : 'Success' });
        await loadWallet(opts?.ownerSecret);
        await loadHoldings(opts?.ownerSecret);
        const freshPrice = await fetchJupPriceUSD(cfg.tokenMint);
        if (freshPrice !== null) setPrice(freshPrice);

        let qtyDeltaRaw = 0;
        let qtyDeltaUi = 0;
        if (side === 'buy') {
          const post = await getRawBalance();
          if (preBal && post) {
            qtyDeltaRaw = Math.max(0, post.raw - preBal.raw);
            const dec = post.decimals || holding?.decimals || 0;
            qtyDeltaUi = qtyDeltaRaw / Math.pow(10, dec);
          }
        }
        // Post-trade PnL summary for sells
        if (side === 'sell') {
          const p = (freshPrice ?? effectivePrice ?? price) ?? null;
          const qty = opts?.sellQtyUi ?? holding?.uiAmount ?? null;
          if (p && qty) {
            toast({ title: 'Sell summary', description: `~${format(qty, 4)} @ $${format(p, 6)}` });
          }
        }
        return { ok: true, qtyRawDelta: qtyDeltaRaw, qtyUiDelta: qtyDeltaUi } as const;
      } catch (firstErr: any) {
        log((firstErr?.message || String(firstErr)).includes('timeout') ? 'Swap invoke timed out — using direct endpoint…' : `Swap invoke failed: ${firstErr?.message || String(firstErr)} — trying direct endpoint…`);
        try {
          const res = await fetch(`${SB_PROJECT_URL}/functions/v1/raydium-swap`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', apikey: SB_ANON_KEY, Authorization: `Bearer ${SB_ANON_KEY}`, ...(secrets?.functionToken ? { 'x-function-token': secrets.functionToken } : {}), ...(opts?.ownerSecret ? { 'x-owner-secret': opts.ownerSecret } : {}) },
            body: JSON.stringify(body),
          });
          if (!res.ok) {
            const text = await res.text();
            throw new Error(`HTTP ${res.status}: ${text}`);
          }
          const data = await res.json();
          const sigs: string[] = data?.signatures ?? [];
          setTrades((arr) => arr.map((x) => (x.id === id ? { ...x, status: 'confirmed', signatures: sigs } : x)));
          toast({ title: `${side.toUpperCase()} executed`, description: sigs[0] ? `Confirmed tx: ${sigs[0].slice(0, 8)}…` : 'Success' });
          await loadWallet(opts?.ownerSecret);
          await loadHoldings(opts?.ownerSecret);
          const freshPrice = await fetchJupPriceUSD(cfg.tokenMint);
          if (freshPrice !== null) setPrice(freshPrice);
          let qtyDeltaRaw = 0;
          let qtyDeltaUi = 0;
          if (side === 'buy') {
            const post = await getRawBalance();
            if (preBal && post) {
              qtyDeltaRaw = Math.max(0, post.raw - preBal.raw);
              const dec = post.decimals || holding?.decimals || 0;
              qtyDeltaUi = qtyDeltaRaw / Math.pow(10, dec);
            }
          }
          if (side === 'sell') {
            const p = (freshPrice ?? effectivePrice ?? price) ?? null;
            const qty = opts?.sellQtyUi ?? holding?.uiAmount ?? null;
            if (p && qty) {
              toast({ title: 'Sell summary', description: `~${format(qty, 4)} @ $${format(p, 6)}` });
            }
          }
          return { ok: true, qtyRawDelta: qtyDeltaRaw, qtyUiDelta: qtyDeltaUi } as const;
        } catch (e2: any) {
          const msg = e2?.message ?? String(e2);
          setTrades((arr) => arr.map((x) => (x.id === id ? { ...x, status: 'error', error: msg } : x)));
          toast({ title: 'Swap failed', description: msg });
          return { ok: false } as const;
        }
      }
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      setTrades((arr) => arr.map((x) => (x.id === id ? { ...x, status: 'error', error: msg } : x)));
      toast({ title: 'Swap failed', description: msg });
      return { ok: false } as const;
    } finally {
      setExecuting(false);
    }
  }, [executing, cfg.tokenMint, cfg.tradeSizeUsd, cfg.slippageBps, cfg.quoteAsset, cfg.confirmPolicy, cfg.feeOverrideMicroLamports, supabase, loadWallet, loadHoldings, holding?.decimals, secrets?.functionToken, effectivePrice, price]);

  const convertUsdcToSol = React.useCallback(async () => {
    if (executing) return;
    setExecuting(true);
    try {
      // Get USDC balance (raw) via wallet function
      let raw = 0;
      try {
        const res = await fetch(`${SB_PROJECT_URL}/functions/v1/trader-wallet?tokenMint=${encodeURIComponent(USDC_MINT)}` , {
          headers: {
            apikey: SB_ANON_KEY,
            Authorization: `Bearer ${SB_ANON_KEY}`,
            ...(secrets?.functionToken ? { 'x-function-token': secrets.functionToken } : {}),
          },
        });
        if (res.ok) {
          const j = await res.json();
          raw = Number(j?.tokenBalanceRaw ?? 0);
        }
      } catch {}
      if (!Number.isFinite(raw) || raw <= 0) {
        toast({ title: 'No USDC to convert', description: 'USDC balance is zero.' });
        return;
      }

      const body = { inputMint: USDC_MINT, outputMint: WSOL_MINT, amount: Math.floor(raw), slippageBps: cfg.slippageBps, unwrapSol: true } as const;

      try {
        const { data, error } = await supabase.functions.invoke('raydium-swap', {
          body,
          headers: secrets?.functionToken ? { 'x-function-token': secrets.functionToken } : undefined,
        });
        if (error) throw error;
        const sigs: string[] = data?.signatures ?? [];
        toast({ title: 'Converted USDC to SOL', description: sigs[0] ? `Tx: ${sigs[0].slice(0,8)}…` : 'Success' });
      } catch (firstErr: any) {
        const res = await fetch(`${SB_PROJECT_URL}/functions/v1/raydium-swap`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: SB_ANON_KEY,
            Authorization: `Bearer ${SB_ANON_KEY}`,
            ...(secrets?.functionToken ? { 'x-function-token': secrets.functionToken } : {}),
          },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const t = await res.text();
          throw new Error(`HTTP ${res.status}: ${t}`);
        }
        const data = await res.json();
        const sigs: string[] = data?.signatures ?? [];
        toast({ title: 'Converted USDC to SOL', description: sigs[0] ? `Tx: ${sigs[0].slice(0,8)}…` : 'Success' });
      }

      await loadWallet();
    } catch (e: any) {
      toast({ title: 'Conversion failed', description: e?.message ?? String(e) });
    } finally {
      setExecuting(false);
    }
  }, [executing, cfg.slippageBps, supabase, secrets?.functionToken, loadWallet]);

  const handlePrepare = React.useCallback(async () => {
    if (executing) return;
    setExecuting(true);
    try {
      const body: any = { action: 'prepare', tokenMint: cfg.tokenMint, preCreateWSOL: true, confirmPolicy: cfg.confirmPolicy };
      try {
        const { data, error } = await supabase.functions.invoke('raydium-swap', {
          body,
          headers: secrets?.functionToken ? { 'x-function-token': secrets.functionToken } : undefined,
        });
        if (error) throw error;
        const sigs: string[] = data?.signatures ?? [];
        toast({ title: 'Prepared accounts', description: sigs[0] ? `Tx: ${sigs[0].slice(0,8)}…` : 'No tx needed' });
      } catch {
        const res = await fetch(`${SB_PROJECT_URL}/functions/v1/raydium-swap`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: SB_ANON_KEY,
            Authorization: `Bearer ${SB_ANON_KEY}`,
            ...(secrets?.functionToken ? { 'x-function-token': secrets.functionToken } : {}),
          },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const t = await res.text();
          throw new Error(`HTTP ${res.status}: ${t}`);
        }
        const data = await res.json();
        const sigs: string[] = data?.signatures ?? [];
        toast({ title: 'Prepared accounts', description: sigs[0] ? `Tx: ${sigs[0].slice(0,8)}…` : 'No tx needed' });
      }
    } catch (e: any) {
      toast({ title: 'Prepare failed', description: e?.message ?? String(e) });
    } finally {
      setExecuting(false);
    }
  }, [executing, cfg.tokenMint, cfg.confirmPolicy, supabase, secrets?.functionToken]);

  const tick = React.useCallback(async () => {
    if (executing) { setStatus('executing…'); return; }

    // refresh price when manual not set
    if (!manualPrice) {
      const p = await fetchJupPriceUSD(cfg.tokenMint);
      setPrice(p);
    }

    const pNow = effectivePrice;
    if (!pNow || !Number.isFinite(pNow)) return;


    // Emergency Hard Sell monitoring (only when not actively trading)
    if (emergencyHardSell.isActive && !running && emergencyHardSell.limitPrice) {
      const limitPrice = parseFloat(emergencyHardSell.limitPrice);
      if (pNow <= limitPrice && (holding?.uiAmount || 0) > 0) {
        log(`🚨 EMERGENCY HARD SELL TRIGGERED! Price $${format(pNow, 6)} reached limit $${format(limitPrice, 6)}`);
        setEmergencyHardSell(prev => ({ ...prev, isActive: false }));
        // Execute sell for all holdings
        const sellRes = await execSwap('sell', { sellQtyUi: holding?.uiAmount, ownerSecret: secrets?.tradingPrivateKey });
        if (sellRes.ok) {
          log(`✅ Emergency sell completed successfully`);
        } else {
          log(`❌ Emergency sell failed`);
        }
        return;
      }
    }

    // Maintain price window for both ROC and Anchor
    const nowTs = Date.now();
    const maxWin = Math.max(Number(cfg.rocWindowSec ?? 30), Number(cfg.anchorWindowSec ?? 120));
    const arr = priceWindowRef.current;
    arr.push({ t: nowTs, p: pNow });
    while (arr.length > 0 && nowTs - arr[0].t > maxWin * 1000) arr.shift();

    // ROC over configured window
    let windowRoc: number | null = null;
    {
      const winSec = Number(cfg.rocWindowSec ?? 30);
      const baseIdx = arr.findIndex((x) => nowTs - x.t <= winSec * 1000);
      const start = baseIdx >= 0 ? arr[baseIdx] : arr[0];
      if (start && start.p > 0) windowRoc = ((pNow - start.p) / start.p) * 100;
    }
    setRocPct(windowRoc);

    // Adaptive dip bias (optional)
    const downSens = Number(cfg.downSensitivityBpsPerPct ?? 0);
    const downCap = Number(cfg.maxDownBiasBps ?? 0);
    const dipBiasBps = cfg.adaptiveTrails && windowRoc !== null && windowRoc < 0 ? Math.min(downCap, -windowRoc * downSens) : 0;
    const effDipPct = cfg.dipPct + dipBiasBps / 100;

    // Compute Anchor Low over anchorWindowSec
    const anchorCut = nowTs - Number(cfg.anchorWindowSec ?? 120) * 1000;
    const anchorSlice = arr.filter((x) => x.t >= anchorCut);
    const anchorLow = anchorSlice.reduce((m, x) => (m == null || x.p < m ? x.p : m), null as number | null) ?? pNow;
    const anchorSlicePrev = anchorSlice.length > 1 ? anchorSlice.slice(0, -1) : anchorSlice;
    const prevAnchorLow = anchorSlicePrev.reduce((m, x) => (m == null || x.p < m ? x.p : m), null as number | null) ?? anchorLow;

    // Slowdown count
    const prev = prevPriceRef.current;
    if (prev !== null) {
      if (pNow <= prev) decelCountRef.current += 1; else decelCountRef.current = 0;
    }
    prevPriceRef.current = pNow;

    // Update trailing high (for display only)
    setTrailingHigh((prev) => (prev === null ? pNow : Math.max(prev, pNow)));

    // SELL checks per-lot (prioritize SL over trailing)
    if (positions.length > 0) {
      // Determine which lot to sell, if any
      let sellIdx: number | null = null;
      let sellReason: 'SL' | 'TRAIL' | 'TIME' | null = null;

      positions.forEach((lot, idx) => {
        if (sellIdx !== null) return; // already picked
        const sl = lot.entry * (1 - cfg.stopLossPct / 100);
        const armed = pNow >= lot.entry * (1 + Number(cfg.trailArmPct ?? 5) / 100);
        const lotHigh = Math.max(lot.high, pNow);
        
        // Stop loss check
        if (pNow <= sl) { sellIdx = idx; sellReason = 'SL'; return; }
        
        // Trailing stop check
        if (armed) {
          const slowed = decelCountRef.current >= cfg.slowdownConfirmTicks;
          if (slowed && pNow <= lotHigh * (1 - cfg.trailingDropPct / 100)) { sellIdx = idx; sellReason = 'TRAIL'; return; }
        }
        
        // Time-based exit check (only if profitable and enabled)
        if (exitConditions.timeBasedExit && sessionStartTime) {
          const sessionMinutes = (nowTs - sessionStartTime) / 60000;
          const profitPct = ((pNow / lot.entry) - 1) * 100;
          
          // Exit after 30 minutes if above minimum profit threshold
          if (sessionMinutes > 30 && profitPct >= exitConditions.minProfitForTimeExit) {
            sellIdx = idx; 
            sellReason = 'TIME'; 
            return;
          }
        }
      });

      // Update highs
      setPositions((prevLots) => prevLots.map((l) => ({ ...l, high: Math.max(l.high, pNow) })));

      if (sellIdx !== null && sellReason) {
        const lot = positions[sellIdx]!;
        setStatus(`SELL ${sellReason} @ $${format(pNow, 6)} (peak $${format(Math.max(lot.high, pNow), 6)})`);
        const res = await execSwap('sell', { sellAmountRaw: lot.qtyRaw, sellQtyUi: lot.qtyUi, ownerSecret: lot.ownerSecret });
        if (res.ok) {
          setPositions((lots) => lots.filter((_, i) => i !== sellIdx));
          setLastSellTs(Date.now());
          const nextBuy = prevAnchorLow * (1 - effDipPct / 100);
          log(`Sold lot#${sellIdx + 1} at $${format(pNow, 6)} (${sellReason}). Watching dip to $${format(nextBuy, 6)}.`);
        }
        return;
      }
    }

    // BIG DIP second-lot logic
    if (cfg.separateLots && positions.length === 1) {
      const first = positions[0]!;
      const floor = first.entry * (1 - cfg.bigDipFloorDropPct / 100);
      if (pNow <= floor) {
        if (bigDipTimerRef.current == null) bigDipTimerRef.current = nowTs;
        const heldMs = nowTs - (bigDipTimerRef.current ?? nowTs);
        if (heldMs >= Number(cfg.bigDipHoldMinutes ?? 6) * 60_000) {
          if (canBuy) {
            const buyUsd = Number(cfg.secondLotTradeSizeUsd ?? cfg.tradeSizeUsd);
            setStatus(`BUY (big dip) @ $${format(pNow, 6)} (−${cfg.bigDipFloorDropPct}%)`);
            const owner = pickNextOwner();
            if (!owner) { toast({ title: 'No funded wallets', description: 'Fund at least one pool wallet.' }); return; }
            const res = await execSwap('buy', { buyUsd, ownerSecret: owner.secret });
            if (res.ok) {
              const qtyUi = Number(res.qtyUiDelta ?? 0);
              const qtyRaw = Number(res.qtyRawDelta ?? 0);
              if (qtyRaw > 0 && qtyUi > 0) {
                setPositions((lots) => [...lots, { id: crypto.randomUUID(), entry: pNow, high: pNow, qtyRaw, qtyUi, entryTs: nowTs, ownerPubkey: owner.pubkey, ownerSecret: owner.secret }]);
                setDaily((d) => ({ ...d, buyUsd: d.buyUsd + buyUsd }));
                const tpPrice = pNow * (1 + cfg.takeProfitPct / 100);
                log(`Bought (Lot #${positions.length + 1}) $${format(buyUsd, 2)} at $${format(pNow, 6)} — tracking TP $${format(tpPrice, 6)}`);
              }
            }
            bigDipTimerRef.current = null;
            return;
          }
        }
      } else {
        bigDipTimerRef.current = null;
      }
    }

    // ENTRY: Anchor dip with previous-window low + bounce confirm
    const allowed = cfg.separateLots ? (cfg.maxConcurrentLots ?? 1) : 1;
    if (positions.length < allowed && canBuy) {
      const target = prevAnchorLow * (1 - effDipPct / 100);

      // Arm when piercing the target; track lowest seen while armed
      if (pNow <= target) {
        if (buyArmRef.current) {
          if (pNow < buyArmRef.current.min) buyArmRef.current = { ...buyArmRef.current, min: pNow };
        } else {
          buyArmRef.current = { min: pNow, armedAt: nowTs };
          log(`Entry armed at ~$${format(target, 6)} — waiting for +${bounceConfirmPct}% bounce`);
        }
      }

      // Bounce confirm
      if (buyArmRef.current) {
        const min = buyArmRef.current.min;
        const bounceTrigger = min * (1 + bounceConfirmPct / 100);
        if (pNow >= bounceTrigger) {
          setStatus(`BUY (bounce) @ $${format(pNow, 6)} (min $${format(min, 6)})`);
          const owner = pickNextOwner();
          if (!owner) { toast({ title: 'No funded wallets', description: 'Fund at least one pool wallet.' }); return; }
          const res = await execSwap('buy', { ownerSecret: owner.secret });
          if (res.ok) {
            const qtyUi = Number(res.qtyUiDelta ?? 0);
            const qtyRaw = Number(res.qtyRawDelta ?? 0);
            if (qtyRaw > 0 && qtyUi > 0) {
              setPositions((lots) => [...lots, { id: crypto.randomUUID(), entry: pNow, high: pNow, qtyRaw, qtyUi, entryTs: nowTs, ownerPubkey: owner.pubkey, ownerSecret: owner.secret }]);
              setDaily((d) => ({ ...d, buyUsd: d.buyUsd + cfg.tradeSizeUsd }));
              const tpPrice = pNow * (1 + cfg.takeProfitPct / 100);
              log(`Bought (bounce) $${format(cfg.tradeSizeUsd, 2)} at $${format(pNow, 6)} — tracking TP $${format(tpPrice, 6)}`);
            }
          }
          buyArmRef.current = null;
          return;
        }
      }
    }

    // Otherwise, holding/watching
    if (positions.length > 0) {
      const desc = positions
        .map((l, i) => {
          const sl = l.entry * (1 - cfg.stopLossPct / 100);
          const armed = pNow >= l.entry * (1 + Number(cfg.trailArmPct ?? 5) / 100);
          const high = Math.max(l.high, pNow);
          const trailTrig = high * (1 - cfg.trailingDropPct / 100);
          return `#${i + 1} @ $${format(l.entry, 6)}${armed ? ` • sell trigger ~$${format(trailTrig, 6)} (after slowdown)` : ` • arm at +${cfg.trailArmPct}%` } • SL ~$${format(sl, 6)}`;
        })
        .join('  ');
      setStatus(`Holding — ${desc}`);
    } else {
      const target = prevAnchorLow * (1 - effDipPct / 100);
      const bounceInfo = buyArmRef.current ? ` • bounce≥ ~$${format(buyArmRef.current.min * (1 + bounceConfirmPct / 100), 6)}` : '';
      setStatus(`Watching — price $${format(pNow, 6)} • anchorLow $${format(prevAnchorLow, 6)} • targetBuy ~$${format(target, 6)}${bounceInfo}`);
    }
  }, [executing, manualPrice, cfg, effectivePrice, positions, canBuy, execSwap, pickNextOwner, exitConditions, sessionStartTime]);

  useInterval(() => {
    if (running) void tick();
  }, running ? cfg.intervalSec * 1000 : null);

  const start = async () => {
    if (!ready) {
      toast({ title: "Secrets required", description: "Set Secrets (RPC + Private Key) to enable future on-chain execution." });
    }
    
    setSessionStartTime(Date.now());
    setStatus("initializing");
    log("🚀 Starting trading bot...");
    
    // 1. Check wallet holdings to determine start mode
    log("🔍 Checking wallet holdings...");
    const detectedMode = await checkWalletHoldings();
    setStartMode(detectedMode);
    
    // 2. Assess token volatility and check for spikes (1 minute)
    log("📊 Assessing token volatility and spike patterns...");
    const assessment = await assessTokenVolatility(cfg.tokenMint);
    setVolatilityAssessment(assessment);
    
    // 2a. Enhanced spike detection - block trading if dangerous spike detected
    if (assessment.spikeWarning) {
      setStatus("⚠️ SPIKE DETECTED - Entry blocked");
      setRunning(false);
      toast({ 
        title: "🚨 Spike Warning - Trading Blocked", 
        description: "Token appears to be at peak of a spike. Wait for price to settle before starting.",
        variant: "destructive" 
      });
      log(`🚨 Trading blocked: ${assessment.message}`);
      return;
    }
    
    // 3. If we're in buying mode and scanner is enabled, scan for better tokens
    if (detectedMode === 'buying' && coinScannerEnabled) {
      log("🔍 Auto-scanning for qualified tokens...");
      const scanSuccess = await scanAndSelectBestToken();
      
      if (scanSuccess) {
        log("✅ Auto-selected best token, starting trading");
      } else {
        log("⚠️ Starting with current token (scan failed)");
      }
    }
    
    log(`🎯 Start Mode: ${detectedMode.toUpperCase()} | Volatility: ${assessment.message}`);
    setRunning(true);
    // Disable Emergency Hard Sell when regular trading starts
    if (emergencyHardSell.isActive) {
      setEmergencyHardSell(prev => ({ ...prev, isActive: false }));
      log("🔄 Emergency Hard Sell disabled (regular trading started)");
    }
    setStatus(`${detectedMode} mode - monitoring`);
    // Immediately fetch fresh price and announce dip target
    (async () => {
      const p = await fetchJupPriceUSD(cfg.tokenMint);
      if (p !== null) {
        setPrice(p);
        setTrailingHigh((prev) => (prev === null ? p : Math.max(prev, p)));
        const windowRoc = rocPct ?? null;
        const dipBiasBps = cfg.adaptiveTrails && windowRoc !== null && windowRoc < 0 ? Math.min(cfg.maxDownBiasBps ?? 0, -windowRoc * (cfg.downSensitivityBpsPerPct ?? 0)) : 0;
        const effDip = cfg.dipPct + dipBiasBps / 100;
        const nextBuy = p * (1 - effDip / 100);
        log(`Watching — current $${format(p, 6)}. Will buy on dip to ~$${format(nextBuy, 6)} (−${format(effDip, 2)}%).`);
      }
      // Prime balances on start
      await Promise.all([loadWallet(secrets?.tradingPrivateKey), loadHoldings(secrets?.tradingPrivateKey)]);
      // Adopt existing holdings on restart
      try {
        if (positions.length === 0 && holding?.uiAmount && holding.uiAmount > 0 && (p ?? null)) {
          const saved = localStorage.getItem(`posEntry:${cfg.tokenMint}`);
          const entry = saved ? Number(saved) : p!;
          if (Number.isFinite(entry) && entry > 0) {
            const qtyRaw = Number(holding.amountRaw ?? 0);
            const qtyUi = Number(holding.uiAmount ?? 0);
            setPositions([{ id: crypto.randomUUID(), entry, high: p!, qtyRaw, qtyUi, entryTs: Date.now(), ownerPubkey: wallet?.address ?? '', ownerSecret: secrets?.tradingPrivateKey ?? '' }]);
            log(`Adopted existing holding ~${format(qtyUi, 4)} @ ~$${format(entry, 6)} — trailing armed at +${cfg.trailArmPct}%`);
          }
        }
      } catch {}
      // Kick the first tick after priming
      void tick();
    })();
  };
  const stop = () => {
    setRunning(false);
    setStatus("stopped");
  };

  return (
    <Card className="max-w-4xl mx-auto mt-8">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Live Strategy Runner (Raydium)</CardTitle>
          {tokenInfo && (
            <div className="text-right">
              <div className="font-semibold">{tokenInfo.symbol}</div>
              <div className="text-sm text-muted-foreground">{tokenInfo.name}</div>
              <div className="text-sm font-medium">
                ${tokenInfo.price ? format(tokenInfo.price, 6) : (effectivePrice ? format(effectivePrice, 6) : '—')}
              </div>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-4">
            <div className="grid md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Token Mint</Label>
                <Input value={cfg.tokenMint} onChange={(e) => setCfg({ ...cfg, tokenMint: e.target.value.trim() })} />
              </div>
              <div className="space-y-2">
                <Label>Trade Size (USD)</Label>
                <Input type="number" value={cfg.tradeSizeUsd} onChange={(e) => setCfg({ ...cfg, tradeSizeUsd: Number(e.target.value) })} />
              </div>
              <div className="space-y-2">
                <Label>Interval (s)</Label>
                <Input type="number" value={cfg.intervalSec} onChange={(e) => setCfg({ ...cfg, intervalSec: Number(e.target.value) })} />
              </div>
            </div>

            <div className="grid md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label>Dip %</Label>
                <Input type="number" value={cfg.dipPct} onChange={(e) => setCfg({ ...cfg, dipPct: Number(e.target.value) })} />
              </div>
              <div className="space-y-2">
                <Label>Take Profit %</Label>
                <Input type="number" value={cfg.takeProfitPct} onChange={(e) => setCfg({ ...cfg, takeProfitPct: Number(e.target.value) })} />
              </div>
              <div className="space-y-2">
                <Label>Stop Loss %</Label>
                <Input type="number" value={cfg.stopLossPct} onChange={(e) => setCfg({ ...cfg, stopLossPct: Number(e.target.value) })} />
              </div>
              <div className="space-y-2">
                <Label>Cooldown (s)</Label>
                <Input type="number" value={cfg.cooldownSec} onChange={(e) => setCfg({ ...cfg, cooldownSec: Number(e.target.value) })} />
              </div>
            </div>

            <div className="grid md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label>Daily Cap (USD)</Label>
                <Input type="number" value={cfg.dailyCapUsd} onChange={(e) => setCfg({ ...cfg, dailyCapUsd: Number(e.target.value) })} />
              </div>
              <div className="space-y-2">
                <Label>Slippage (bps)</Label>
                <Input type="number" value={cfg.slippageBps} onChange={(e) => setCfg({ ...cfg, slippageBps: Number(e.target.value) })} />
              </div>
              <div className="space-y-2">
                <Label>Manual Price Override (USD)</Label>
                <Input placeholder="leave empty to auto" value={manualPrice} onChange={(e) => setManualPrice(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Quote Asset</Label>
                <Select value={cfg.quoteAsset} onValueChange={(v) => setCfg({ ...cfg, quoteAsset: v as 'SOL' | 'USDC' })}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SOL">SOL</SelectItem>
                  <SelectItem value="USDC">USDC</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label>Spike Trail Drop %</Label>
                <Input type="number" value={cfg.trailingDropPct} onChange={(e) => setCfg({ ...cfg, trailingDropPct: Number(e.target.value) })} />
              </div>
              <div className="space-y-2">
                <Label>Slowdown confirm ticks</Label>
                <Input type="number" value={cfg.slowdownConfirmTicks} onChange={(e) => setCfg({ ...cfg, slowdownConfirmTicks: Number(e.target.value) })} />
              </div>
              <div className="space-y-2">
                <Label>Fast Mode</Label>
                <Select value={cfg.confirmPolicy} onValueChange={(v) => setCfg({ ...cfg, confirmPolicy: v as any })}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="confirmed">Confirmed (safer)</SelectItem>
                    <SelectItem value="processed">Processed (faster)</SelectItem>
                    <SelectItem value="none">Send-only (fastest)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Priority fee override (microLamports)</Label>
                <Input type="number" placeholder="auto" value={Number(cfg.feeOverrideMicroLamports ?? 0)} onChange={(e) => setCfg({ ...cfg, feeOverrideMicroLamports: Number(e.target.value) })} />
              </div>
            </div>

            <div className="grid md:grid-cols-6 gap-4">
              <div className="space-y-2">
                <Label>Adaptive Trails</Label>
                <div className="flex items-center gap-2">
                  <Switch checked={!!cfg.adaptiveTrails} onCheckedChange={(v) => setCfg({ ...cfg, adaptiveTrails: v })} />
                  <span className="text-xs text-muted-foreground">{cfg.adaptiveTrails ? 'On' : 'Off'}</span>
                </div>
              </div>
              <div className="space-y-2">
                <Label>ROC window (s)</Label>
                <Input type="number" value={Number(cfg.rocWindowSec ?? 30)} onChange={(e) => setCfg({ ...cfg, rocWindowSec: Number(e.target.value) })} />
              </div>
              <div className="space-y-2">
                <Label>Up sensitivity (bps per +1%)</Label>
                <Input type="number" value={Number(cfg.upSensitivityBpsPerPct ?? 0)} onChange={(e) => setCfg({ ...cfg, upSensitivityBpsPerPct: Number(e.target.value) })} />
              </div>
              <div className="space-y-2">
                <Label>Up cap (bps)</Label>
                <Input type="number" value={Number(cfg.maxUpBiasBps ?? 0)} onChange={(e) => setCfg({ ...cfg, maxUpBiasBps: Number(e.target.value) })} />
              </div>
              <div className="space-y-2">
                <Label>Down sensitivity (bps per −1%)</Label>
                <Input type="number" value={Number(cfg.downSensitivityBpsPerPct ?? 0)} onChange={(e) => setCfg({ ...cfg, downSensitivityBpsPerPct: Number(e.target.value) })} />
              </div>
              <div className="space-y-2">
                <Label>Down cap (bps)</Label>
                <Input type="number" value={Number(cfg.maxDownBiasBps ?? 0)} onChange={(e) => setCfg({ ...cfg, maxDownBiasBps: Number(e.target.value) })} />
              </div>
            </div>

            {/* Enhanced Exit Conditions */}
            <div className="rounded-lg border p-3 space-y-3">
              <h3 className="font-medium">Exit Conditions</h3>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Switch 
                    checked={exitConditions.timeBasedExit} 
                    onCheckedChange={(v) => setExitConditions({...exitConditions, timeBasedExit: v})} 
                  />
                  <span className="text-sm">Time-based exit (only if profitable)</span>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Min profit for time exit (%)</Label>
                  <Input 
                    type="number" 
                    step="0.1" 
                    className="w-20" 
                    value={exitConditions.minProfitForTimeExit} 
                    onChange={(e) => setExitConditions({...exitConditions, minProfitForTimeExit: Number(e.target.value)})} 
                  />
                </div>
              </div>
            </div>

            {/* Emergency Hard Set Limit Sell */}
            <div className="rounded-lg border p-3 space-y-3 bg-destructive/5">
              <h3 className="font-medium text-destructive">Emergency Hard Set Limit Sell</h3>
              <div className="text-xs text-muted-foreground mb-2">
                Auto-sell all tokens when price drops to limit (only works when NOT actively trading)
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Switch 
                    checked={emergencyHardSell.enabled} 
                    onCheckedChange={(v) => setEmergencyHardSell({...emergencyHardSell, enabled: v, isActive: false})} 
                    disabled={running}
                  />
                  <span className="text-sm">Enable Emergency Sell</span>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Limit Price (9 decimals)</Label>
                  <Input 
                    type="number" 
                    step="0.000000001" 
                    className="w-32" 
                    value={emergencyHardSell.limitPrice} 
                    onChange={(e) => setEmergencyHardSell({...emergencyHardSell, limitPrice: e.target.value})} 
                    disabled={running || !emergencyHardSell.enabled}
                    placeholder="0.000000000"
                  />
                </div>
                <Button 
                  variant="destructive" 
                  size="sm"
                  onClick={() => {
                    if (!emergencyHardSell.limitPrice || parseFloat(emergencyHardSell.limitPrice) <= 0) {
                      toast({ title: "Invalid Price", description: "Please enter a valid limit price" });
                      return;
                    }
                    setEmergencyHardSell({...emergencyHardSell, isActive: true});
                    log(`🚨 Emergency Hard Sell ACTIVATED at $${format(parseFloat(emergencyHardSell.limitPrice), 9)}`);
                    toast({ title: "Emergency Sell Activated", description: `Will sell all tokens if price drops to $${emergencyHardSell.limitPrice}` });
                  }}
                  disabled={running || !emergencyHardSell.enabled || !emergencyHardSell.limitPrice || emergencyHardSell.isActive}
                >
                  {emergencyHardSell.isActive ? "Hard Sell Active" : "Activate Hard Sell"}
                </Button>
              </div>
              {emergencyHardSell.isActive && (
                <div className="text-xs text-destructive font-medium">
                  🚨 Emergency sell active: Will auto-sell at ${format(parseFloat(emergencyHardSell.limitPrice || "0"), 9)}
                </div>
              )}
              {running && (
                <div className="text-xs text-muted-foreground">
                  ⚠️ Emergency sell disabled during active trading
                </div>
              )}
            </div>

            <div className="rounded-lg border p-3 text-sm space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-medium">Status:</span>
                <span className={status === 'watching' ? 'text-green-600' : status === 'stopped' ? 'text-red-600' : 'text-yellow-600'}>
                  {status} {tokenInfo?.symbol && `• ${tokenInfo.symbol}`}
                </span>
              </div>
              {volatilityAssessment && (
                <div className="flex items-center justify-between">
                  <span className="font-medium">Volatility:</span>
                  <span className="text-blue-600">{volatilityAssessment.score}/100</span>
                </div>
              )}
              {sessionStartTime && (
                <div className="flex items-center justify-between">
                  <span className="font-medium">Runtime:</span>
                  <span className="text-muted-foreground">{Math.floor((Date.now() - sessionStartTime) / 60000)}m</span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="font-medium">Price:</span>
                <span>${format(effectivePrice ?? NaN, 6)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-medium">Positions:</span>
                <span>{positions.length > 0 ? positions.map((l, i) => `#${i+1}@$${format(l.entry, 6)}`).join(' ') : 'none'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-medium">Daily buys:</span>
                <span>${format(daily.buyUsd, 2)} / ${format(cfg.dailyCapUsd, 2)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-medium">ROC:</span>
                <span>{rocPct !== null ? `${format(rocPct, 2)}%` : '—'}</span>
              </div>
            </div>
            {!ready && (
              <p className="text-xs text-muted-foreground">Note: Secrets not set — on-chain execution remains disabled; this panel simulates signals only.</p>
            )}
          </div>

          <aside className="space-y-2">
            <div className="rounded-lg border p-3 text-sm">
              <div className="font-medium mb-2">Trading wallet</div>
              {wallet ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate" title={wallet.address}>
                      {wallet.address.slice(0, 4)}…{wallet.address.slice(-4)}
                    </span>
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="secondary" onClick={() => navigator.clipboard.writeText(wallet.address)}>Copy</Button>
                      <a className="underline text-sm" href={`https://solscan.io/account/${wallet.address}`} target="_blank" rel="noreferrer noopener">View</a>
                    </div>
                  </div>
                  {/* Show all tokens */}
                  <div className="space-y-2">
                    {allTokens.length > 0 ? (
                      allTokens.map((token) => (
                        <div key={token.mint} className="flex items-center justify-between text-sm">
                          <span className="font-medium">{token.symbol}</span>
                          <div className="text-right">
                            <div>{token.uiAmount.toFixed(token.symbol === 'SOL' ? 4 : token.symbol === 'USDC' ? 2 : 6)}</div>
                            {token.price && (
                              <div className="text-xs text-muted-foreground">
                                ${(token.uiAmount * token.price).toFixed(2)}
                              </div>
                            )}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div>Balance: {Number.isFinite(wallet.sol) ? `${wallet.sol.toFixed(4)} SOL` : '—'}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" onClick={async () => {
                      await loadWallet();
                      await loadAllTokens();
                    }} disabled={walletLoading}>
                      {walletLoading ? 'Refreshing…' : 'Refresh'}
                    </Button>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" onClick={() => void convertUsdcToSol()} disabled={executing}>Convert USDC→SOL</Button>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="secondary" onClick={() => void handlePrepare()} disabled={executing}>Prepare</Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Not loaded</span>
                  <Button size="sm" variant="outline" onClick={() => void loadWallet()} disabled={walletLoading}>
                    {walletLoading ? 'Refreshing…' : 'Load'}
                  </Button>
                </div>
              )}
            </div>

            <div className="rounded-lg border p-3 text-sm">
              <div className="font-medium mb-2">Holdings {tokenInfo?.symbol && `(${tokenInfo.symbol})`}</div>
              {holding ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Token</span>
                    <span title={cfg.tokenMint}>
                      {tokenInfo?.symbol || `${cfg.tokenMint.slice(0,4)}…${cfg.tokenMint.slice(-4)}`}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Amount</span>
                    <span>{holding.uiAmount.toFixed(6)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Value</span>
                    <span>{Number.isFinite(effectivePrice ?? NaN) ? `$${(holding.uiAmount * (effectivePrice || 0)).toFixed(2)}` : '—'}</span>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => void loadHoldings()}>Refresh</Button>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">No balance</span>
                  <Button size="sm" variant="outline" onClick={() => void loadHoldings()}>Load</Button>
                </div>
              )}
            </div>

            <div className="rounded-lg border p-3 text-sm">
              <div className="font-medium mb-2">Activity {tokenInfo?.symbol && `(${tokenInfo.symbol})`}</div>
              <ul className="space-y-1 max-h-48 overflow-auto">
                {activity.map((a, idx) => (
                  <li key={idx} className="text-muted-foreground">
                    {new Date(a.time).toLocaleTimeString()} • {a.text}
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-lg border p-3 text-sm">
              <div className="font-medium mb-2">Recent trades {tokenInfo?.symbol && `(${tokenInfo.symbol})`}</div>
              <ul className="space-y-1 max-h-72 overflow-auto">
                {trades.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">
                      {new Date(t.time).toLocaleTimeString()} • {t.side.toUpperCase()} {tokenInfo?.symbol || 'TOKEN'} • {t.status}
                    </span>
                    {t.signatures?.[0] && (
                      <a
                        className="underline"
                        href={`https://solscan.io/tx/${t.signatures[0]}`}
                        target="_blank"
                        rel="noreferrer noopener"
                      >
                        View tx
                      </a>
                    )}
                    {t.error && <span className="text-destructive">{t.error}</span>}
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        </div>
      </CardContent>
      <CardFooter className="flex flex-wrap gap-2">
        {running ? (
          <Button variant="secondary" onClick={stop} disabled={executing}>Stop</Button>
        ) : (
          <Button onClick={start} disabled={executing || autoScanning}>
            {autoScanning ? "Scanning..." : "Start"}
          </Button>
        )}
          <Button onClick={async () => {
            const owner = pickNextOwner();
            if (!owner) { toast({ title: 'No funded wallets', description: 'Fund at least one pool wallet.' }); return; }
            const res = await execSwap('buy', { ownerSecret: owner.secret });
            if (res.ok) {
              const pNow = effectivePrice ?? price ?? null;
              const qtyUi = Number(res.qtyUiDelta ?? 0);
              const qtyRaw = Number(res.qtyRawDelta ?? 0);
              if (pNow && qtyRaw > 0 && qtyUi > 0) {
                setPositions((lots) => [...lots, { id: crypto.randomUUID(), entry: pNow, high: pNow, qtyRaw, qtyUi, entryTs: Date.now(), ownerPubkey: owner.pubkey, ownerSecret: owner.secret }]);
                setDaily((d) => ({ ...d, buyUsd: d.buyUsd + cfg.tradeSizeUsd }));
                const tpPrice = pNow * (1 + cfg.takeProfitPct / 100);
                log(`Bought (manual) $${format(cfg.tradeSizeUsd, 2)} at $${format(pNow, 6)} — tracking TP $${format(tpPrice, 6)} • owner ${owner.pubkey ? owner.pubkey.slice(0,4)+'…'+owner.pubkey.slice(-4) : '—'}`);
              }
            }
          }} disabled={executing}>Buy now</Button>
          <Button variant="outline" onClick={async () => {
            if (positions.length === 0) { toast({ title: 'No positions', description: 'Nothing to sell.' }); return; }
            const lot = positions[0]!;
            const res = await execSwap('sell', { sellAmountRaw: lot.qtyRaw, sellQtyUi: lot.qtyUi, ownerSecret: lot.ownerSecret });
            if (res.ok) {
              setPositions((lots) => lots.slice(1));
              setLastSellTs(Date.now());
            }
          }} disabled={executing}>Sell now</Button>
          <Button
            variant="secondary"
            onClick={() => {
              setTrailingHigh(null);
              setPositions([]);
              setLastSellTs(null);
              setStatus("reset");
              buyArmRef.current = null;
              try { localStorage.removeItem(`posEntry:${cfg.tokenMint}`); } catch {}
            }}
          >
            Reset state
          </Button>
          <Button
            variant="outline"
            onClick={() => setCoinScannerEnabled(!coinScannerEnabled)}
          >
            {coinScannerEnabled ? 'Hide' : 'Show'} Scanner
          </Button>
        </CardFooter>

        {/* Coin Scanner */}
        {coinScannerEnabled && (
          <div className="p-4 border-t">
            <CoinScanner
              currentToken={cfg.tokenMint}
              onTokenSuggestion={handleTokenSuggestion}
              autoScanEnabled={running}
              scanInterval={300000} // 5 minutes
            />
          </div>
        )}
      </Card>
  );
}
