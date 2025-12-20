import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, Loader2, FileText, FileSpreadsheet, Database, Search, AlertTriangle, Wallet, GitBranch, ArrowRight, ExternalLink, Eye, Target, Shield, TrendingUp, Zap, Calculator, PieChart } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { WalletScanButtons } from "@/components/mint-monitor/WalletScanButtons";
import { useAuth } from "@/hooks/useAuth";

const TokenAnalysisDownload = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [heliusLoading, setHeliusLoading] = useState(false);
  const [walletTraceLoading, setWalletTraceLoading] = useState(false);
  const [genealogyLoading, setGenealogyLoading] = useState(false);
  const [offspringLoading, setOffspringLoading] = useState(false);
  const [fullGenealogyLoading, setFullGenealogyLoading] = useState(false);
  const [analysisData, setAnalysisData] = useState<any>(null);
  const [offspringData, setOffspringData] = useState<any>(null);
  const [heliusData, setHeliusData] = useState<any>(null);
  const [walletTraceData, setWalletTraceData] = useState<any>(null);
  const [genealogyData, setGenealogyData] = useState<any>(null);
  const [fullGenealogyData, setFullGenealogyData] = useState<any>(null);
  const [moneyFlowData, setMoneyFlowData] = useState<any>(null);
  const [moneyFlowLoading, setMoneyFlowLoading] = useState(false);
  const [walletToTrace, setWalletToTrace] = useState("6rDqAoNhfVhhLynpidBWkSqEzPRkpgzFsMFhmnaCahX8");
  const [tokenToTrace, setTokenToTrace] = useState("62aMztCXSDLqpGHX54HiLC3eYwpw9BYfjw465tQSpump");
  const [showDustWallets, setShowDustWallets] = useState(false);
  const [bondingCurveData, setBondingCurveData] = useState<any>(null);
  const [bondingLoading, setBondingLoading] = useState(false);
  const [calcCurvePercent, setCalcCurvePercent] = useState(54);

  const tokenMint = "DyqgbSyWcwRw17Y3SvAtmP4o73n1nes5PzwAEjvVpump";
  
  // ~$5 worth of SOL (assuming ~$200/SOL)
  const DUST_THRESHOLD_SOL = 0.025;
  
  // Filter wallets with net SOL flow < $5 (dust wallets - likely empty now)
  const dustWallets = useMemo(() => {
    if (!heliusData?.walletActivity) return [];
    return heliusData.walletActivity.filter((w: any) => {
      const netSol = Math.abs(w.netSol || 0);
      const totalSol = Math.abs(w.solReceived || 0) + Math.abs(w.solSent || 0);
      // Wallet had activity with this token but net SOL is dust
      return netSol < DUST_THRESHOLD_SOL && totalSol > 0;
    }).sort((a: any, b: any) => Math.abs(a.netSol || 0) - Math.abs(b.netSol || 0));
  }, [heliusData]);
  
  const downloadDustWalletsCSV = () => {
    if (!dustWallets.length) return;
    const headers = ["wallet", "txCount", "tokensReceived", "tokensSent", "netTokens", "solReceived", "solSent", "netSol"];
    const rows = dustWallets.map((w: any) =>
      headers.map(h => String(w[h] ?? "").replace(/,/g, ";")).join(",")
    );
    const csv = [headers.join(","), ...rows].join("\n");
    downloadFile(`dust_wallets_under_5usd_${tokenMint.slice(0, 8)}.csv`, csv, "text/csv");
  };

  const fetchAnalysis = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("token-mint-watchdog-monitor", {
        body: { action: "full_analysis", tokenMint }
      });

      if (error) throw error;
      setAnalysisData(data);
      toast.success(`Fetched ${data.summary?.totalTrades} trades for analysis`);
    } catch (err: any) {
      toast.error("Failed to fetch: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchHeliusHistory = async () => {
    setHeliusLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("token-mint-watchdog-monitor", {
        body: { action: "helius_full_history", tokenMint }
      });

      if (error) throw error;
      setHeliusData(data);
      toast.success(`Fetched ${data.summary?.totalTransactions} total transactions from Helius`);
    } catch (err: any) {
      toast.error("Failed to fetch Helius data: " + err.message);
    } finally {
      setHeliusLoading(false);
    }
  };

  const traceWallet = async () => {
    if (!walletToTrace.trim()) {
      toast.error("Enter a wallet address to trace");
      return;
    }
    
    setWalletTraceLoading(true);
    try {
      // Get known wallets from helius data if available
      const knownWallets = heliusData?.walletActivity?.map((w: any) => w.wallet) || [];
      
      const { data, error } = await supabase.functions.invoke("token-mint-watchdog-monitor", {
        body: { 
          action: "trace_wallet", 
          walletAddress: walletToTrace.trim(),
          knownWallets 
        }
      });

      if (error) throw error;
      setWalletTraceData(data);
      toast.success(`Traced ${data.summary?.totalTransactions} transactions, found ${data.summary?.overlappingWalletsCount} overlapping wallets`);
    } catch (err: any) {
      toast.error("Failed to trace wallet: " + err.message);
    } finally {
      setWalletTraceLoading(false);
    }
  };

  const traceTokenGenealogy = async () => {
    if (!tokenToTrace.trim()) {
      toast.error("Enter a token mint address");
      return;
    }
    
    setGenealogyLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("token-mint-watchdog-monitor", {
        body: { 
          action: "trace_token_genealogy", 
          tokenMint: tokenToTrace.trim()
        }
      });

      if (error) throw error;
      setGenealogyData(data);
      toast.success(`Found mint wallet: ${data.genealogy?.mintWallet?.slice(0, 8)}...`);
    } catch (err: any) {
      toast.error("Failed to trace genealogy: " + err.message);
    } finally {
    setGenealogyLoading(false);
    }
  };

  const traceOffspringWallets = async () => {
    const mintWallet = genealogyData?.genealogy?.mintWallet;
    if (!mintWallet) {
      toast.error("Run genealogy trace first to find the mint wallet");
      return;
    }
    
    setOffspringLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("token-mint-watchdog-monitor", {
        body: { 
          action: "trace_offspring_wallets", 
          mintWallet
        }
      });

      if (error) throw error;
      setOffspringData(data);
      toast.success(`Found ${data.summary?.totalOffspringWallets} offspring wallets (${data.summary?.totalSolDistributed} SOL distributed)`);
    } catch (err: any) {
      toast.error("Failed to trace offspring: " + err.message);
    } finally {
      setOffspringLoading(false);
    }
  };

  const traceFullGenealogy = async () => {
    if (!tokenToTrace.trim()) {
      toast.error("Enter a token mint address");
      return;
    }
    
    setFullGenealogyLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("token-mint-watchdog-monitor", {
        body: { 
          action: "trace_full_genealogy", 
          tokenMint: tokenToTrace.trim(),
          maxDepth: 10,
          minSolThreshold: 0.5
        }
      });

      if (error) throw error;
      setFullGenealogyData(data);
      
      if (data.summary?.foundKycWallet) {
        toast.success(`Found KYC wallet: ${data.summary.rootCexName}!`);
      } else {
        toast.success(`Traced ${data.summary?.totalWalletsTraced} wallets (depth: ${data.summary?.maxDepthReached})`);
      }
    } catch (err: any) {
      toast.error("Failed to trace full genealogy: " + err.message);
    } finally {
      setFullGenealogyLoading(false);
    }
  };

  // Fetch bonding curve state for a pump.fun token
  const fetchBondingCurve = async () => {
    if (!tokenToTrace.trim()) {
      toast.error("Enter a token mint address");
      return;
    }
    
    setBondingLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("token-mint-watchdog-monitor", {
        body: { 
          action: "get_bonding_curve", 
          tokenMint: tokenToTrace.trim()
        }
      });

      if (error) throw error;
      setBondingCurveData(data);
      
      if (data.curvePercent) {
        toast.success(`Bonding curve at ${data.curvePercent.toFixed(1)}% - ${data.solDeposited?.toFixed(2)} SOL deposited`);
      } else {
        toast.info("Bonding curve data fetched");
      }
    } catch (err: any) {
      toast.error("Failed to fetch bonding curve: " + err.message);
    } finally {
      setBondingLoading(false);
    }
  };

  // Calculate SOL required for a given curve percentage (pump.fun bonding curve math)
  const calculateSolForCurve = (targetPercent: number): { solRequired: number; tokensReceived: number } => {
    // Pump.fun bonding curve constants (approximate)
    const TOTAL_SOL_FOR_100 = 85; // ~85 SOL to graduate
    const TOTAL_TOKENS = 800_000_000; // 800M tokens in curve
    
    // The bonding curve is: price = k * supply^2
    // For simplicity, we use a linear approximation which is close enough
    // More accurate: SOL(%) = TOTAL_SOL * (% / 100)^1.5 (slightly exponential)
    
    // Linear approximation
    const solLinear = (targetPercent / 100) * TOTAL_SOL_FOR_100;
    
    // Slightly exponential (more accurate for pump.fun)
    const solExponential = TOTAL_SOL_FOR_100 * Math.pow(targetPercent / 100, 1.3);
    
    // Average of both for better estimate
    const solRequired = (solLinear + solExponential) / 2;
    
    // Tokens received at this percentage
    const tokensReceived = TOTAL_TOKENS * (targetPercent / 100);
    
    return { solRequired, tokensReceived };
  };

  // FOLLOW THE MONEY - Trace where funds GO (forward, not backward)
  const traceMoneyFlow = async () => {
    if (!tokenToTrace.trim()) {
      toast.error("Enter a token mint address");
      return;
    }
    
    setMoneyFlowLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("token-mint-watchdog-monitor", {
        body: { 
          action: "trace_money_flow", 
          tokenMint: tokenToTrace.trim(),
          maxDepth: 5,
          minSolThreshold: 1.0
        }
      });

      if (error) throw error;
      setMoneyFlowData(data);
      
      const splitters = data.summary?.splitterWalletsFound || 0;
      const cex = data.summary?.cexDepositsFound || 0;
      toast.success(`Found ${splitters} splitter wallets, ${cex} CEX deposits, ${data.summary?.totalSolMoved} SOL moved`);
    } catch (err: any) {
      toast.error("Failed to trace money flow: " + err.message);
    } finally {
      setMoneyFlowLoading(false);
    }
  };

  const downloadMoneyFlowJSON = () => {
    if (!moneyFlowData) return;
    downloadFile(
      `money_flow_${tokenToTrace.slice(0, 8)}.json`,
      JSON.stringify(moneyFlowData, null, 2),
      "application/json"
    );
  };

  const downloadFullGenealogyJSON = () => {
    if (!fullGenealogyData) return;
    downloadFile(
      `full_genealogy_${tokenToTrace.slice(0, 8)}.json`,
      JSON.stringify(fullGenealogyData, null, 2),
      "application/json"
    );
  };

  const downloadGenealogyJSON = () => {
    if (!genealogyData) return;
    downloadFile(
      `token_genealogy_${tokenToTrace.slice(0, 8)}.json`,
      JSON.stringify(genealogyData, null, 2),
      "application/json"
    );
  };

  const downloadOffspringJSON = () => {
    if (!offspringData) return;
    downloadFile(
      `offspring_wallets_${genealogyData?.genealogy?.mintWallet?.slice(0, 8)}.json`,
      JSON.stringify(offspringData, null, 2),
      "application/json"
    );
  };

  const downloadWalletTraceCSV = () => {
    if (!walletTraceData) return;

    // All flows CSV
    const flowHeaders = ["wallet", "solReceived", "solSent", "netSolFlow", "tokensReceived", "tokensSent", "txCount", "isKnownWallet", "firstInteraction", "lastInteraction"];
    const flowRows = walletTraceData.allWalletFlows?.map((f: any) =>
      flowHeaders.map(h => String(f[h] ?? "").replace(/,/g, ";")).join(",")
    ) || [];
    const flowCSV = [flowHeaders.join(","), ...flowRows].join("\n");

    // Transactions CSV
    const txHeaders = ["signature", "timestamp", "type", "source", "description", "fee"];
    const txRows = walletTraceData.allTransactions?.map((t: any) =>
      txHeaders.map(h => String(t[h] ?? "").replace(/,/g, ";")).join(",")
    ) || [];
    const txCSV = [txHeaders.join(","), ...txRows].join("\n");

    downloadFile(`wallet_trace_flows_${walletToTrace.slice(0, 8)}.csv`, flowCSV, "text/csv");
    downloadFile(`wallet_trace_txs_${walletToTrace.slice(0, 8)}.csv`, txCSV, "text/csv");
  };

  const downloadWalletTraceJSON = () => {
    if (!walletTraceData) return;
    downloadFile(
      `wallet_trace_full_${walletToTrace.slice(0, 8)}.json`,
      JSON.stringify(walletTraceData, null, 2),
      "application/json"
    );
  };

  const downloadCSV = () => {
    if (!analysisData?.allWalletStats) return;

    const walletHeaders = ["wallet", "buyCount", "sellCount", "buySol", "sellSol", "pnlSol", "pnlUsd", "netTokens", "isEmpty", "tradeSequence"];
    const walletRows = analysisData.allWalletStats.map((w: any) => 
      walletHeaders.map(h => w[h] ?? "").join(",")
    );
    const walletCSV = [walletHeaders.join(","), ...walletRows].join("\n");

    const tradeHeaders = ["index", "type", "wallet", "amount", "volumeSol", "volumeUsd", "priceUsd", "time"];
    const tradeRows = analysisData.first100Trades?.map((t: any) =>
      tradeHeaders.map(h => t[h] ?? "").join(",")
    ) || [];
    const tradesCSV = [tradeHeaders.join(","), ...tradeRows].join("\n");

    downloadFile(`token_wallet_stats_${tokenMint.slice(0, 8)}.csv`, walletCSV, "text/csv");
    downloadFile(`token_trades_${tokenMint.slice(0, 8)}.csv`, tradesCSV, "text/csv");
  };

  const downloadHeliusCSV = () => {
    if (!heliusData) return;

    // All transactions CSV
    const txHeaders = ["signature", "timestamp", "type", "source", "description", "fee", "feePayer"];
    const txRows = heliusData.allTransactions?.map((t: any) =>
      txHeaders.map(h => String(t[h] ?? "").replace(/,/g, ";")).join(",")
    ) || [];
    const txCSV = [txHeaders.join(","), ...txRows].join("\n");

    // Wallet activity CSV
    const walletHeaders = ["wallet", "txCount", "tokensReceived", "tokensSent", "netTokens", "solReceived", "solSent", "netSol"];
    const walletRows = heliusData.walletActivity?.map((w: any) =>
      walletHeaders.map(h => w[h] ?? "").join(",")
    ) || [];
    const walletCSV = [walletHeaders.join(","), ...walletRows].join("\n");

    downloadFile(`helius_all_transactions_${tokenMint.slice(0, 8)}.csv`, txCSV, "text/csv");
    downloadFile(`helius_wallet_activity_${tokenMint.slice(0, 8)}.csv`, walletCSV, "text/csv");
  };

  const downloadHeliusJSON = () => {
    if (!heliusData) return;
    downloadFile(
      `helius_full_history_${tokenMint.slice(0, 8)}.json`,
      JSON.stringify(heliusData, null, 2),
      "application/json"
    );
  };

  const downloadAnalysisText = () => {
    if (!analysisData) return;

    const s = analysisData.summary;
    const b = analysisData.bundledWalletsAnalysis;

    let text = `TOKEN ANALYSIS REPORT
=====================
Token: ${tokenMint}
Generated: ${new Date().toISOString()}

SUMMARY
-------
Total Trades: ${s.totalTrades}
Unique Wallets: ${s.uniqueWallets}
Total Buy Volume: ${s.totalBuyVolumeSol} SOL
Total Sell Volume: ${s.totalSellVolumeSol} SOL
Net Flow: ${s.netFlowSol} SOL
Empty Wallets: ${s.emptyWalletsCount}
Profitable Wallets: ${s.profitableWalletsCount}

BUNDLED WALLET ANALYSIS
-----------------------
Description: ${b.description}
Early Seller Count: ${b.count}
Total Extracted SOL: ${b.totalExtractedSol}

BUNDLED WALLETS (First 50 Trades - Sellers Only):
`;

    b.wallets?.forEach((w: any, i: number) => {
      text += `
${i + 1}. ${w.wallet}
   Trade Sequence: #${w.tradeSequence}
   Sells: ${w.sellCount}, Buys: ${w.buyCount}
   Sold: ${w.totalSellSol} SOL, Bought: ${w.totalBuySol} SOL
   Profit: ${w.profitSol} SOL
   Net Tokens: ${w.netTokens} (${w.isEmpty ? 'EMPTY' : 'Holding'})
   First Trade: ${w.firstTrade}
   Last Trade: ${w.lastTrade}
`;
    });

    text += `
BIGGEST WINNERS (Top 30)
------------------------
`;
    analysisData.biggestWinners?.forEach((w: any, i: number) => {
      text += `${i + 1}. ${w.wallet} - Profit: ${w.profitSol} SOL (${w.isEarlyTrader ? 'EARLY TRADER' : ''})\n`;
    });

    text += `
BIGGEST LOSERS
--------------
`;
    analysisData.biggestLosers?.forEach((w: any, i: number) => {
      text += `${i + 1}. ${w.wallet} - Loss: ${w.lossSol} SOL\n`;
    });

    text += `
EMPTY WALLETS SUMMARY
---------------------
Count: ${analysisData.emptyWalletsSummary?.count}
Total Profit Extracted: ${analysisData.emptyWalletsSummary?.totalProfitSol} SOL
`;

    text += `
FIRST 100 TRADES
----------------
`;
    analysisData.first100Trades?.forEach((t: any) => {
      text += `#${t.index} ${t.type?.toUpperCase()} | ${t.wallet?.slice(0, 8)}... | ${t.amount?.toFixed(2)} tokens | ${t.volumeSol?.toFixed(4)} SOL | ${t.time}\n`;
    });

    text += `
ALL WALLET STATISTICS
---------------------
`;
    analysisData.allWalletStats?.forEach((w: any) => {
      text += `${w.wallet} | Buys: ${w.buyCount} | Sells: ${w.sellCount} | PnL: ${w.pnlSol} SOL | ${w.isEmpty ? 'EMPTY' : 'HOLDING'}\n`;
    });

    downloadFile(`token_analysis_${tokenMint.slice(0, 8)}.txt`, text, "text/plain");
  };

  const downloadFullJSON = () => {
    if (!analysisData) return;
    downloadFile(
      `token_full_analysis_${tokenMint.slice(0, 8)}.json`,
      JSON.stringify(analysisData, null, 2),
      "application/json"
    );
  };

  const downloadFile = (filename: string, content: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`Downloaded ${filename}`);
  };

  // Bonding curve calculation memo
  const curveCalc = useMemo(() => calculateSolForCurve(calcCurvePercent), [calcCurvePercent]);

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        
        {/* Pump.fun Bonding Curve Calculator */}
        <Card className="border-orange-500/50 bg-gradient-to-br from-orange-500/5 to-yellow-500/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calculator className="h-6 w-6 text-orange-400" />
              Pump.fun Bonding Curve Calculator
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Live Token Check */}
            <div className="p-4 bg-muted rounded-lg space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Check actual bonding curve state for a token:
                </p>
                <Button 
                  onClick={fetchBondingCurve} 
                  disabled={bondingLoading}
                  size="sm"
                  className="bg-orange-500 hover:bg-orange-600"
                >
                  {bondingLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Fetching...
                    </>
                  ) : (
                    <>
                      <PieChart className="h-4 w-4 mr-2" />
                      Fetch Curve State
                    </>
                  )}
                </Button>
              </div>
              <Input 
                placeholder="Enter pump.fun token address..." 
                value={tokenToTrace}
                onChange={(e) => setTokenToTrace(e.target.value)}
                className="font-mono"
              />
              
              {/* Live Token Results */}
              {bondingCurveData && (
                <div className="p-4 bg-background rounded-lg border border-orange-500/30 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{bondingCurveData.name || bondingCurveData.symbol || 'Unknown Token'}</span>
                    {bondingCurveData.graduated ? (
                      <Badge className="bg-green-500">Graduated to Raydium</Badge>
                    ) : (
                      <Badge variant="secondary">On Bonding Curve</Badge>
                    )}
                  </div>
                  
                  {!bondingCurveData.graduated && bondingCurveData.curvePercent !== undefined && (
                    <>
                      <div className="space-y-1">
                        <div className="flex justify-between text-sm">
                          <span>Curve Progress</span>
                          <span className="font-bold text-orange-400">{bondingCurveData.curvePercent?.toFixed(1)}%</span>
                        </div>
                        <div className="w-full bg-muted rounded-full h-4 overflow-hidden">
                          <div 
                            className="bg-gradient-to-r from-orange-400 to-yellow-400 h-full rounded-full transition-all"
                            style={{ width: `${Math.min(bondingCurveData.curvePercent || 0, 100)}%` }}
                          />
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-3 gap-3">
                        <div className="p-2 bg-muted rounded text-center">
                          <div className="text-lg font-bold text-orange-400">{bondingCurveData.solDeposited?.toFixed(2) || '?'}</div>
                          <div className="text-xs text-muted-foreground">SOL Deposited</div>
                        </div>
                        <div className="p-2 bg-muted rounded text-center">
                          <div className="text-lg font-bold text-yellow-400">{(85 - (bondingCurveData.solDeposited || 0)).toFixed(2)}</div>
                          <div className="text-xs text-muted-foreground">SOL to Graduate</div>
                        </div>
                        <div className="p-2 bg-muted rounded text-center">
                          <div className="text-lg font-bold text-green-400">${bondingCurveData.marketCapUsd?.toLocaleString() || '?'}</div>
                          <div className="text-xs text-muted-foreground">Market Cap</div>
                        </div>
                      </div>
                    </>
                  )}
                  
                  {bondingCurveData.graduated && (
                    <div className="text-center text-green-400">
                      Token has graduated! Trading on Raydium now.
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* SOL Calculator */}
            <div className="p-4 bg-muted rounded-lg space-y-4">
              <p className="text-sm text-muted-foreground">
                Calculate how much SOL is needed to reach a specific curve percentage:
              </p>
              
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm">Target Curve %</span>
                  <span className="text-2xl font-bold text-orange-400">{calcCurvePercent}%</span>
                </div>
                <Slider 
                  value={[calcCurvePercent]}
                  onValueChange={(v) => setCalcCurvePercent(v[0])}
                  min={1}
                  max={100}
                  step={1}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>1%</span>
                  <span>50%</span>
                  <span>100% (Graduate)</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mt-4">
                <div className="p-4 bg-background border border-orange-500/30 rounded-lg text-center">
                  <div className="text-3xl font-bold text-orange-400">{curveCalc.solRequired.toFixed(2)}</div>
                  <div className="text-sm text-muted-foreground">SOL Required</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    ~${((curveCalc.solRequired) * 200).toFixed(0)} @ $200/SOL
                  </div>
                </div>
                <div className="p-4 bg-background border border-yellow-500/30 rounded-lg text-center">
                  <div className="text-3xl font-bold text-yellow-400">{(curveCalc.tokensReceived / 1_000_000).toFixed(1)}M</div>
                  <div className="text-sm text-muted-foreground">Tokens Purchased</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    of 800M total supply
                  </div>
                </div>
              </div>

              {/* Quick Reference Table */}
              <div className="mt-4">
                <p className="text-xs text-muted-foreground mb-2">Quick Reference:</p>
                <div className="grid grid-cols-4 gap-2 text-xs">
                  {[25, 50, 75, 100].map(pct => {
                    const calc = calculateSolForCurve(pct);
                    return (
                      <div key={pct} className="p-2 bg-background rounded text-center">
                        <div className="font-bold">{pct}%</div>
                        <div className="text-orange-400">{calc.solRequired.toFixed(1)} SOL</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Token Genealogy Tracer - NEW */}
        <Card className="border-primary/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <GitBranch className="h-6 w-6 text-primary" />
              Token Genealogy Tracer
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground mb-2">
                Enter a token mint address to find the creator wallet and trace back to the original funding source.
              </p>
              <Input 
                placeholder="Enter token mint address..." 
                value={tokenToTrace}
                onChange={(e) => setTokenToTrace(e.target.value)}
                className="font-mono"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <Button onClick={traceTokenGenealogy} disabled={genealogyLoading} variant="outline">
                {genealogyLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Tracing...
                  </>
                ) : (
                  <>
                    <GitBranch className="h-4 w-4 mr-2" />
                    Quick Trace (3 levels)
                  </>
                )}
              </Button>

              <Button onClick={traceFullGenealogy} disabled={fullGenealogyLoading} className="bg-gradient-to-r from-primary to-purple-500 hover:from-primary/90 hover:to-purple-500/90">
                {fullGenealogyLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Deep tracing to KYC...
                  </>
                ) : (
                  <>
                    <Target className="h-4 w-4 mr-2" />
                    Deep Trace to KYC
                  </>
                )}
              </Button>

              <Button onClick={traceMoneyFlow} disabled={moneyFlowLoading} className="bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-500/90 hover:to-red-500/90">
                {moneyFlowLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Following money...
                  </>
                ) : (
                  <>
                    <TrendingUp className="h-4 w-4 mr-2" />
                    Follow the Money →
                  </>
                )}
              </Button>
            </div>

            {/* Money Flow Results - FOLLOW THE MONEY */}
            {moneyFlowData && (
              <div className="space-y-4 pt-4 border-t border-orange-500/30">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-orange-500" />
                    <span className="font-bold text-orange-400">Money Flow Analysis (Forward Trace)</span>
                  </div>
                  <Button size="sm" variant="outline" onClick={downloadMoneyFlowJSON}>
                    <Download className="h-4 w-4 mr-1" />
                    JSON
                  </Button>
                </div>

                {/* Summary Stats */}
                <div className="grid grid-cols-4 gap-3">
                  <div className="p-3 bg-orange-500/10 border border-orange-500/30 rounded text-center">
                    <div className="text-2xl font-bold text-orange-400">{moneyFlowData.summary?.totalWalletsTraced || 0}</div>
                    <div className="text-xs text-muted-foreground">Wallets Traced</div>
                  </div>
                  <div className="p-3 bg-red-500/10 border border-red-500/30 rounded text-center">
                    <div className="text-2xl font-bold text-red-400">{moneyFlowData.summary?.splitterWalletsFound || 0}</div>
                    <div className="text-xs text-muted-foreground">Splitter Wallets</div>
                  </div>
                  <div className="p-3 bg-green-500/10 border border-green-500/30 rounded text-center">
                    <div className="text-2xl font-bold text-green-400">{moneyFlowData.summary?.cexDepositsFound || 0}</div>
                    <div className="text-xs text-muted-foreground">CEX Deposits</div>
                  </div>
                  <div className="p-3 bg-purple-500/10 border border-purple-500/30 rounded text-center">
                    <div className="text-2xl font-bold text-purple-400">{moneyFlowData.summary?.totalSolMoved || 0}</div>
                    <div className="text-xs text-muted-foreground">SOL Moved</div>
                  </div>
                </div>

                {/* Splitter Wallets */}
                {moneyFlowData.splitters?.length > 0 && (
                  <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
                    <div className="font-semibold text-red-400 mb-2 flex items-center gap-2">
                      <Zap className="h-4 w-4" />
                      Splitter Wallets Detected
                    </div>
                    <div className="space-y-2">
                      {moneyFlowData.splitters.map((s: any, i: number) => (
                        <div key={i} className="p-3 bg-background/50 rounded border border-red-500/20">
                          <div className="flex items-center justify-between mb-2">
                            <a 
                              href={`https://solscan.io/account/${s.wallet}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-mono text-xs text-primary hover:underline"
                            >
                              {s.wallet}
                            </a>
                            <Badge variant="destructive" className="text-xs">
                              Depth {s.depth} • Split to {s.splitToWallets} wallets
                            </Badge>
                          </div>
                          <div className="text-xs text-muted-foreground mb-2">
                            Received: <span className="text-orange-400 font-semibold">{s.received} SOL</span>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
                            {s.recipients?.slice(0, 6).map((r: any, j: number) => (
                              <div key={j} className="flex items-center gap-2 text-xs">
                                <ArrowRight className="h-3 w-3 text-orange-400" />
                                <span className="text-orange-400">{r.amount} SOL</span>
                                <span>→</span>
                                <a 
                                  href={`https://solscan.io/account/${r.wallet}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="font-mono text-primary hover:underline truncate"
                                >
                                  {r.wallet.slice(0, 8)}...{r.wallet.slice(-4)}
                                </a>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* CEX Deposits */}
                {moneyFlowData.cexDeposits?.length > 0 && (
                  <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-lg">
                    <div className="font-semibold text-green-400 mb-2 flex items-center gap-2">
                      <Shield className="h-4 w-4" />
                      CEX Deposit Wallets Found
                    </div>
                    <div className="space-y-2">
                      {moneyFlowData.cexDeposits.map((c: any, i: number) => (
                        <div key={i} className="flex items-center justify-between p-2 bg-background/50 rounded">
                          <div>
                            <Badge variant="secondary" className="mr-2">{c.cex}</Badge>
                            <a 
                              href={`https://solscan.io/account/${c.wallet}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-mono text-xs text-primary hover:underline"
                            >
                              {c.wallet.slice(0, 12)}...{c.wallet.slice(-4)}
                            </a>
                          </div>
                          <span className="text-green-400 font-semibold">{c.amountReceived} SOL</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Full Money Flow Tree */}
                <div className="p-4 bg-muted/50 rounded-lg max-h-[400px] overflow-y-auto">
                  <div className="font-semibold mb-3">Complete Money Flow (Forward)</div>
                  <div className="space-y-1">
                    {moneyFlowData.moneyFlow?.map((node: any, i: number) => (
                      <div 
                        key={i} 
                        className={`flex items-center gap-2 p-2 rounded text-xs ${
                          node.isSplitter ? 'bg-red-500/10 border border-red-500/20' :
                          node.isCex ? 'bg-green-500/10 border border-green-500/20' :
                          'bg-background/50'
                        }`}
                        style={{ marginLeft: `${node.depth * 20}px` }}
                      >
                        <span className="text-muted-foreground">D{node.depth}</span>
                        {node.isSplitter && <Badge variant="destructive" className="text-[10px] px-1">SPLIT</Badge>}
                        {node.isCex && <Badge variant="secondary" className="text-[10px] px-1">{node.isCex}</Badge>}
                        <a 
                          href={`https://solscan.io/account/${node.wallet}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-primary hover:underline"
                        >
                          {node.wallet.slice(0, 8)}...{node.wallet.slice(-4)}
                        </a>
                        <span className="text-orange-400">↓{node.amountReceived} SOL</span>
                        {node.totalSent > 0 && (
                          <span className="text-muted-foreground">sent {node.totalSent} SOL to {node.sentToCount}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Full Genealogy Results */}
            {fullGenealogyData && (
              <div className="space-y-4 pt-4 border-t border-primary/30">
                {/* KYC Status Banner */}
                {fullGenealogyData.summary?.foundKycWallet ? (
                  <div className="p-4 bg-green-500/20 border border-green-500/50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <Shield className="h-8 w-8 text-green-500" />
                      <div>
                        <div className="font-bold text-lg text-green-400">KYC Wallet Found!</div>
                        <div className="text-sm">
                          Source: <Badge variant="secondary" className="ml-1">{fullGenealogyData.summary.rootCexName}</Badge>
                        </div>
                        <a 
                          href={`https://solscan.io/account/${fullGenealogyData.summary.rootCexWallet}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-xs text-primary hover:underline"
                        >
                          {fullGenealogyData.summary.rootCexWallet}
                        </a>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 bg-yellow-500/20 border border-yellow-500/50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <AlertTriangle className="h-6 w-6 text-yellow-500" />
                      <div>
                        <div className="font-semibold">No known CEX/KYC wallet found</div>
                        <div className="text-xs text-muted-foreground">
                          Traced {fullGenealogyData.summary?.totalWalletsTraced} wallets to depth {fullGenealogyData.summary?.maxDepthReached}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Summary Stats */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3 bg-muted rounded text-center">
                    <div className="text-2xl font-bold">{fullGenealogyData.summary?.totalWalletsTraced || 0}</div>
                    <div className="text-xs text-muted-foreground">Wallets Traced</div>
                  </div>
                  <div className="p-3 bg-muted rounded text-center">
                    <div className="text-2xl font-bold">{fullGenealogyData.summary?.maxDepthReached || 0}</div>
                    <div className="text-xs text-muted-foreground">Max Depth</div>
                  </div>
                  <div className="p-3 bg-green-500/10 border border-green-500/30 rounded text-center">
                    <div className="text-xs text-muted-foreground mb-1">Mint Wallet</div>
                    <a 
                      href={`https://solscan.io/account/${fullGenealogyData.summary?.mintWallet}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-xs text-primary hover:underline"
                    >
                      {fullGenealogyData.summary?.mintWallet?.slice(0, 6)}...{fullGenealogyData.summary?.mintWallet?.slice(-4)}
                    </a>
                  </div>
                </div>

                {/* Full Chain Visualization */}
                <div className="p-4 bg-gradient-to-r from-purple-500/10 via-muted to-green-500/10 rounded-lg">
                  <div className="font-semibold mb-3 flex items-center gap-2">
                    <Eye className="h-4 w-4" />
                    Complete Wallet Chain (KYC → Mint)
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    {fullGenealogyData.chain?.map((item: any, idx: number) => (
                      <div key={idx} className="flex items-center gap-2">
                        {idx > 0 && <ArrowRight className="h-4 w-4 text-muted-foreground" />}
                        <div className={`p-2 rounded ${
                          item.cexSource ? 'bg-purple-500/30 border-2 border-purple-500' :
                          item.level === 'mint' ? 'bg-green-500/20 border border-green-500/50' :
                          item.level === 'parent' ? 'bg-orange-500/20 border border-orange-500/50' :
                          'bg-muted border border-border'
                        }`}>
                          <div className="text-xs text-muted-foreground uppercase flex items-center gap-1">
                            {item.cexSource && <Shield className="h-3 w-3 text-purple-400" />}
                            {item.level}
                          </div>
                          <a 
                            href={`https://solscan.io/account/${item.wallet}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-mono text-xs hover:underline flex items-center gap-1"
                          >
                            {item.wallet?.slice(0, 6)}...{item.wallet?.slice(-4)}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                          {item.solFlow > 0 && (
                            <div className="text-xs text-green-400">{item.solFlow.toFixed(2)} SOL</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Recommended Watchlist */}
                {fullGenealogyData.recommendedWatchlist?.length > 0 && (
                  <div className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                    <div className="font-semibold mb-3 flex items-center gap-2">
                      <Target className="h-4 w-4 text-yellow-500" />
                      Recommended Watchlist
                    </div>
                    <p className="text-xs text-muted-foreground mb-3">
                      Monitor these wallets for new token mints. They are likely to be used for future token launches.
                    </p>
                    <div className="space-y-4">
                      {fullGenealogyData.recommendedWatchlist.map((w: any, i: number) => (
                        <div key={i} className="p-3 bg-background rounded border border-border">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-xs">{i + 1}</Badge>
                              <a 
                                href={`https://solscan.io/account/${w.wallet}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-mono text-xs text-primary hover:underline"
                              >
                                {w.wallet}
                              </a>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              <span className="text-green-400">{w.solFlow} SOL</span>
                              <span className="ml-2">• {w.reason}</span>
                            </div>
                          </div>
                          <WalletScanButtons 
                            walletAddress={w.wallet} 
                            sourceToken={tokenToTrace}
                            userId={user?.id}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Full Wallet Tree */}
                {fullGenealogyData.walletTree?.length > 0 && (
                  <div className="p-3 bg-muted rounded">
                    <div className="font-semibold mb-2">Full Wallet Tree ({fullGenealogyData.walletTree.length} wallets)</div>
                    <div className="max-h-64 overflow-y-auto space-y-1">
                      {fullGenealogyData.walletTree.map((node: any, i: number) => (
                        <div 
                          key={i} 
                          className={`flex items-center justify-between text-xs font-mono p-2 rounded ${
                            node.cexSource ? 'bg-purple-500/20 border border-purple-500/50' :
                            node.depth === 0 ? 'bg-green-500/10 border border-green-500/30' :
                            node.depth === 1 ? 'bg-orange-500/10 border border-orange-500/30' :
                            'bg-background'
                          }`}
                          style={{ marginLeft: `${node.depth * 12}px` }}
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground">D{node.depth}</span>
                            <a 
                              href={`https://solscan.io/account/${node.wallet}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:underline truncate max-w-[200px]"
                            >
                              {node.wallet}
                            </a>
                            {node.cexSource && (
                              <Badge variant="secondary" className="text-[10px]">{node.cexSource}</Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <span className="text-green-400">↓{node.solReceived} SOL</span>
                            <span className="text-red-400">↑{node.solSent} SOL</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <Button onClick={downloadFullGenealogyJSON} variant="outline" className="w-full justify-start">
                  <Download className="h-4 w-4 mr-2" />
                  Download Full Genealogy Data (JSON)
                </Button>
              </div>
            )}

            {genealogyData && (
              <div className="space-y-4 pt-4 border-t">
                {/* Wallet Chain Visualization */}
                <div className="p-4 bg-gradient-to-r from-muted to-background rounded-lg">
                  <div className="font-semibold mb-3">Wallet Chain</div>
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    {genealogyData.chain?.map((item: any, idx: number) => (
                      <div key={idx} className="flex items-center gap-2">
                        {idx > 0 && <ArrowRight className="h-4 w-4 text-muted-foreground" />}
                        <div className={`p-2 rounded ${
                          item.level === 'grandparent' ? 'bg-purple-500/20 border border-purple-500/50' :
                          item.level === 'parent' ? 'bg-orange-500/20 border border-orange-500/50' :
                          item.level === 'mint' ? 'bg-green-500/20 border border-green-500/50' :
                          'bg-blue-500/20 border border-blue-500/50'
                        }`}>
                          <div className="text-xs text-muted-foreground uppercase">{item.level}</div>
                          <a 
                            href={`https://solscan.io/account/${item.wallet || item.address}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-mono text-xs hover:underline flex items-center gap-1"
                          >
                            {(item.wallet || item.address)?.slice(0, 6)}...{(item.wallet || item.address)?.slice(-4)}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Key Details */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div className="p-3 bg-green-500/10 border border-green-500/30 rounded">
                    <div className="font-semibold flex items-center gap-2">
                      <Wallet className="h-4 w-4" />
                      Mint Wallet (Creator)
                    </div>
                    <a 
                      href={`https://solscan.io/account/${genealogyData.genealogy?.mintWallet}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-xs text-primary hover:underline break-all"
                    >
                      {genealogyData.genealogy?.mintWallet}
                    </a>
                    {genealogyData.genealogy?.mintTimestamp && (
                      <div className="text-xs text-muted-foreground mt-1">
                        Minted: {genealogyData.genealogy.mintTimestamp}
                      </div>
                    )}
                  </div>

                  {genealogyData.genealogy?.parentWallet && (
                    <div className="p-3 bg-orange-500/10 border border-orange-500/30 rounded">
                      <div className="font-semibold flex items-center gap-2">
                        <GitBranch className="h-4 w-4" />
                        Parent Wallet (Funder)
                      </div>
                      <a 
                        href={`https://solscan.io/account/${genealogyData.genealogy?.parentWallet}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-xs text-primary hover:underline break-all"
                      >
                        {genealogyData.genealogy?.parentWallet}
                      </a>
                      {genealogyData.genealogy?.parentWalletDetails && (
                        <div className="text-xs text-muted-foreground mt-1">
                          Sent: {genealogyData.genealogy.parentWalletDetails.totalSolSent?.toFixed(4)} SOL
                        </div>
                      )}
                    </div>
                  )}

                  {genealogyData.genealogy?.grandparentWallet && (
                    <div className="p-3 bg-purple-500/10 border border-purple-500/30 rounded">
                      <div className="font-semibold">Grandparent Wallet</div>
                      <a 
                        href={`https://solscan.io/account/${genealogyData.genealogy?.grandparentWallet}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-xs text-primary hover:underline break-all"
                      >
                        {genealogyData.genealogy?.grandparentWallet}
                      </a>
                    </div>
                  )}

                  {genealogyData.genealogy?.largestFunder && (
                    <div className="p-3 bg-muted rounded">
                      <div className="font-semibold">Largest Funder</div>
                      <a 
                        href={`https://solscan.io/account/${genealogyData.genealogy?.largestFunder.wallet}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-xs text-primary hover:underline"
                      >
                        {genealogyData.genealogy?.largestFunder.wallet?.slice(0, 8)}...
                      </a>
                      <span className="text-xs ml-2">
                        ({genealogyData.genealogy?.largestFunder.totalSolSent} SOL, {genealogyData.genealogy?.largestFunder.txCount} txs)
                      </span>
                    </div>
                  )}
                </div>

                {/* Funding Sources List */}
                {genealogyData.fundingSources?.length > 0 && (
                  <div className="p-3 bg-muted rounded">
                    <div className="font-semibold mb-2">All Funding Sources ({genealogyData.fundingSources.length})</div>
                    <div className="max-h-48 overflow-y-auto space-y-1">
                      {genealogyData.fundingSources.map((f: any, i: number) => (
                        <div 
                          key={i} 
                          className={`flex items-center justify-between text-xs font-mono p-2 rounded ${
                            f.isParent ? 'bg-orange-500/10 border border-orange-500/30' :
                            f.isLargestFunder ? 'bg-green-500/10 border border-green-500/30' :
                            'bg-background'
                          }`}
                        >
                          <a 
                            href={`https://solscan.io/account/${f.wallet}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline truncate max-w-[250px]"
                          >
                            {f.wallet}
                          </a>
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <span className="text-green-500">{f.totalSolSent} SOL</span>
                            <span>({f.txCount} tx)</span>
                            {f.isParent && <span className="text-orange-500 text-[10px]">PARENT</span>}
                            {f.isLargestFunder && <span className="text-green-500 text-[10px]">LARGEST</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <Button onClick={downloadGenealogyJSON} variant="outline" className="w-full justify-start">
                  <Download className="h-4 w-4 mr-2" />
                  Download Full Genealogy Data (JSON)
                </Button>

                {/* Offspring Tracing Section */}
                <div className="pt-4 border-t space-y-4">
                  <div className="font-semibold flex items-center gap-2">
                    <GitBranch className="h-4 w-4 rotate-180" />
                    Trace Offspring Wallets (Where did funds GO?)
                  </div>
                  
                  <Button 
                    onClick={traceOffspringWallets} 
                    disabled={offspringLoading || !genealogyData?.genealogy?.mintWallet}
                    variant="secondary"
                    className="w-full"
                  >
                    {offspringLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Tracing offspring wallets...
                      </>
                    ) : (
                      <>
                        <ArrowRight className="h-4 w-4 mr-2" />
                        Trace Where Mint Wallet Sent Funds
                      </>
                    )}
                  </Button>

                  {offspringData && (
                    <div className="space-y-4">
                      {/* Summary */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded text-center">
                          <div className="text-2xl font-bold text-red-400">
                            {offspringData.summary?.totalSolDistributed} SOL
                          </div>
                          <div className="text-xs text-muted-foreground">Total Distributed Out</div>
                        </div>
                        <div className="p-3 bg-muted rounded text-center">
                          <div className="text-2xl font-bold">
                            {offspringData.summary?.totalOffspringWallets}
                          </div>
                          <div className="text-xs text-muted-foreground">Offspring Wallets</div>
                        </div>
                      </div>

                      {/* Offspring Wallets List */}
                      {offspringData.offspring?.length > 0 && (
                        <div className="p-3 bg-muted rounded">
                          <div className="font-semibold mb-2 flex items-center gap-2">
                            Direct Recipients from Mint Wallet
                            <span className="text-xs text-muted-foreground">
                              (sorted by amount)
                            </span>
                          </div>
                          <div className="max-h-64 overflow-y-auto space-y-1">
                            {offspringData.offspring.slice(0, 20).map((o: any, i: number) => (
                              <div 
                                key={i} 
                                className={`flex items-center justify-between text-xs font-mono p-2 rounded ${
                                  i === 0 ? 'bg-red-500/10 border border-red-500/30' :
                                  o.totalSolReceived > 10 ? 'bg-orange-500/10 border border-orange-500/30' :
                                  'bg-background'
                                }`}
                              >
                                <a 
                                  href={`https://solscan.io/account/${o.wallet}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-primary hover:underline truncate max-w-[200px]"
                                >
                                  {o.wallet}
                                </a>
                                <div className="flex items-center gap-2 text-muted-foreground">
                                  <span className="text-red-400 font-semibold">{o.totalSolReceived} SOL</span>
                                  <span>({o.txCount} tx)</span>
                                  {i === 0 && <span className="text-red-500 text-[10px]">LARGEST</span>}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Level 2 Distribution */}
                      {offspringData.level2Distribution?.length > 0 && (
                        <div className="p-3 bg-muted rounded">
                          <div className="font-semibold mb-2">Level 2: Where Offspring Sent Funds</div>
                          <div className="space-y-3">
                            {offspringData.level2Distribution.map((level2: any, i: number) => (
                              <div key={i} className="p-2 bg-background rounded border">
                                <div className="flex items-center gap-2 mb-2">
                                  <a 
                                    href={`https://solscan.io/account/${level2.parentWallet}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="font-mono text-xs text-primary hover:underline"
                                  >
                                    {level2.parentWallet.slice(0, 8)}...{level2.parentWallet.slice(-4)}
                                  </a>
                                  <span className="text-xs text-muted-foreground">
                                    (received {level2.parentReceivedSol} SOL) → sent to:
                                  </span>
                                </div>
                                <div className="pl-4 space-y-1">
                                  {level2.children.slice(0, 5).map((child: any, j: number) => (
                                    <div key={j} className="flex items-center justify-between text-xs">
                                      <a 
                                        href={`https://solscan.io/account/${child.wallet}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="font-mono text-primary hover:underline"
                                      >
                                        {child.wallet.slice(0, 8)}...{child.wallet.slice(-4)}
                                      </a>
                                      <span className="text-orange-400">{child.solReceived.toFixed(2)} SOL</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <Button onClick={downloadOffspringJSON} variant="outline" className="w-full justify-start">
                        <Download className="h-4 w-4 mr-2" />
                        Download Offspring Data (JSON)
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Swap Trades Analysis */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-6 w-6" />
              Swap Trades Analysis (Solana Tracker)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 bg-muted rounded-lg">
              <p className="font-mono text-sm break-all">{tokenMint}</p>
              <p className="text-sm text-muted-foreground mt-1">pepemas token - Buy/Sell swaps only</p>
            </div>

            <Button onClick={fetchAnalysis} disabled={loading} className="w-full">
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Fetching swap trades...
                </>
              ) : (
                "Fetch Swap Trades Analysis"
              )}
            </Button>

            {analysisData && (
              <div className="space-y-4 pt-4 border-t">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="p-3 bg-muted rounded">
                    <div className="font-semibold">Total Trades</div>
                    <div className="text-2xl">{analysisData.summary?.totalTrades}</div>
                  </div>
                  <div className="p-3 bg-muted rounded">
                    <div className="font-semibold">Unique Wallets</div>
                    <div className="text-2xl">{analysisData.summary?.uniqueWallets}</div>
                  </div>
                  <div className="p-3 bg-muted rounded">
                    <div className="font-semibold">Early Sellers</div>
                    <div className="text-2xl">{analysisData.summary?.earlySellersCount}</div>
                  </div>
                  <div className="p-3 bg-muted rounded">
                    <div className="font-semibold">Extracted SOL</div>
                    <div className="text-2xl text-destructive">{analysisData.summary?.earlySellerExtractedSol}</div>
                  </div>
                </div>

                <div className="grid gap-2">
                  <Button onClick={downloadCSV} variant="outline" className="w-full justify-start">
                    <FileSpreadsheet className="h-4 w-4 mr-2" />
                    Download Wallet Stats & Trades CSV
                  </Button>
                  <Button onClick={downloadAnalysisText} variant="outline" className="w-full justify-start">
                    <FileText className="h-4 w-4 mr-2" />
                    Download Analysis Report (TXT)
                  </Button>
                  <Button onClick={downloadFullJSON} variant="outline" className="w-full justify-start">
                    <Download className="h-4 w-4 mr-2" />
                    Download Full Raw Data (JSON)
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Helius Full History */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-6 w-6" />
              Full Transaction History (Helius)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground">
                Includes ALL transactions: transfers, mints, burns, account creations, swaps, etc.
              </p>
            </div>

            <Button onClick={fetchHeliusHistory} disabled={heliusLoading} className="w-full" variant="secondary">
              {heliusLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Fetching all transactions from Helius...
                </>
              ) : (
                "Fetch ALL Transactions (Helius)"
              )}
            </Button>

            {heliusData && (
              <div className="space-y-4 pt-4 border-t">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="p-3 bg-muted rounded">
                    <div className="font-semibold">Total Transactions</div>
                    <div className="text-2xl">{heliusData.summary?.totalTransactions}</div>
                  </div>
                  <div className="p-3 bg-muted rounded">
                    <div className="font-semibold">Unique Wallets</div>
                    <div className="text-2xl">{heliusData.summary?.uniqueWallets}</div>
                  </div>
                </div>

                {heliusData.summary?.transactionTypes && (
                  <div className="p-3 bg-muted rounded">
                    <div className="font-semibold mb-2">Transaction Types</div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      {Object.entries(heliusData.summary.transactionTypes).map(([type, count]) => (
                        <div key={type} className="flex justify-between">
                          <span className="text-muted-foreground">{type}:</span>
                          <span className="font-mono">{String(count)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="p-3 bg-muted rounded text-sm">
                  <div className="font-semibold mb-1">Time Range</div>
                  <div className="text-muted-foreground">
                    {heliusData.summary?.timeRange?.first} → {heliusData.summary?.timeRange?.last}
                  </div>
                </div>

                <div className="grid gap-2">
                  <Button onClick={downloadHeliusCSV} variant="outline" className="w-full justify-start">
                    <FileSpreadsheet className="h-4 w-4 mr-2" />
                    Download All Transactions & Wallet Activity CSV
                  </Button>
                  <Button onClick={downloadHeliusJSON} variant="outline" className="w-full justify-start">
                    <Download className="h-4 w-4 mr-2" />
                    Download Full Helius Data (JSON)
                  </Button>
                </div>
                
                {/* Dust Wallets Section */}
                <div className="pt-4 border-t">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Wallet className="h-5 w-5 text-orange-500" />
                      <span className="font-semibold">Dust Wallets (&lt;$5 net flow)</span>
                      <span className="text-sm text-muted-foreground">
                        ({dustWallets.length} wallets)
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <Button 
                        onClick={() => setShowDustWallets(!showDustWallets)} 
                        variant="outline" 
                        size="sm"
                      >
                        {showDustWallets ? "Hide" : "Show"} List
                      </Button>
                      <Button 
                        onClick={downloadDustWalletsCSV} 
                        variant="outline" 
                        size="sm"
                        disabled={!dustWallets.length}
                      >
                        <Download className="h-3 w-3 mr-1" />
                        CSV
                      </Button>
                    </div>
                  </div>
                  
                  {showDustWallets && dustWallets.length > 0 && (
                    <div className="max-h-64 overflow-y-auto bg-background border rounded p-2 space-y-1">
                      {dustWallets.map((w: any, i: number) => (
                        <div 
                          key={w.wallet} 
                          className="flex items-center justify-between text-xs font-mono p-2 bg-muted rounded hover:bg-muted/80"
                        >
                          <a 
                            href={`https://solscan.io/account/${w.wallet}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline truncate max-w-[300px]"
                          >
                            {w.wallet}
                          </a>
                          <div className="flex gap-3 text-muted-foreground">
                            <span>Tx: {w.txCount}</span>
                            <span>Net: {(w.netSol || 0).toFixed(4)} SOL</span>
                            <span>Tokens: {w.netTokens?.toLocaleString() || 0}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {dustWallets.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      No dust wallets found (all wallets have &gt;$5 net flow)
                    </p>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Wallet Tracer */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-6 w-6" />
              Wallet Tracer (Dev/Funding Wallet)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground mb-2">
                Trace all transactions from a wallet. If you've loaded Helius data first, it will flag any overlapping wallets.
              </p>
              <Input 
                placeholder="Enter wallet address to trace..." 
                value={walletToTrace}
                onChange={(e) => setWalletToTrace(e.target.value)}
                className="font-mono"
              />
            </div>

            <Button onClick={traceWallet} disabled={walletTraceLoading} className="w-full" variant="secondary">
              {walletTraceLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Tracing wallet transactions...
                </>
              ) : (
                <>
                  <Search className="h-4 w-4 mr-2" />
                  Trace Wallet Transactions
                </>
              )}
            </Button>

            {walletTraceData && (
              <div className="space-y-4 pt-4 border-t">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="p-3 bg-muted rounded">
                    <div className="font-semibold">Total Transactions</div>
                    <div className="text-2xl">{walletTraceData.summary?.totalTransactions}</div>
                  </div>
                  <div className="p-3 bg-muted rounded">
                    <div className="font-semibold">Wallets Interacted</div>
                    <div className="text-2xl">{walletTraceData.summary?.uniqueWalletsInteracted}</div>
                  </div>
                  <div className="p-3 bg-muted rounded">
                    <div className="font-semibold">Total SOL Sent Out</div>
                    <div className="text-2xl text-destructive">{walletTraceData.summary?.totalSolSentOut}</div>
                  </div>
                  <div className="p-3 bg-muted rounded">
                    <div className="font-semibold">Total SOL Received</div>
                    <div className="text-2xl text-green-500">{walletTraceData.summary?.totalSolReceivedIn}</div>
                  </div>
                </div>

                {walletTraceData.summary?.overlappingWalletsCount > 0 && (
                  <div className="p-3 bg-destructive/10 border border-destructive rounded">
                    <div className="flex items-center gap-2 font-semibold text-destructive mb-2">
                      <AlertTriangle className="h-4 w-4" />
                      {walletTraceData.summary.overlappingWalletsCount} Overlapping Wallets Found!
                    </div>
                    <div className="text-sm space-y-1 max-h-40 overflow-y-auto">
                      {walletTraceData.overlappingWallets?.slice(0, 20).map((w: any, i: number) => (
                        <div key={i} className="font-mono text-xs">
                          {w.wallet} - Received: {w.solReceived} SOL
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="p-3 bg-muted rounded">
                  <div className="font-semibold mb-2">Top Recipients (SOL sent to)</div>
                  <div className="text-sm space-y-1 max-h-48 overflow-y-auto">
                    {walletTraceData.topRecipients?.slice(0, 15).map((w: any, i: number) => (
                      <div key={i} className="flex justify-between font-mono text-xs">
                        <span>{w.wallet.slice(0, 8)}...{w.wallet.slice(-6)}</span>
                        <span className="text-destructive">{w.solReceived} SOL</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="p-3 bg-muted rounded text-sm">
                  <div className="font-semibold mb-1">Time Range</div>
                  <div className="text-muted-foreground">
                    {walletTraceData.summary?.timeRange?.first} → {walletTraceData.summary?.timeRange?.last}
                  </div>
                </div>

                <div className="grid gap-2">
                  <Button onClick={downloadWalletTraceCSV} variant="outline" className="w-full justify-start">
                    <FileSpreadsheet className="h-4 w-4 mr-2" />
                    Download Wallet Flows & Transactions CSV
                  </Button>
                  <Button onClick={downloadWalletTraceJSON} variant="outline" className="w-full justify-start">
                    <Download className="h-4 w-4 mr-2" />
                    Download Full Trace Data (JSON)
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default TokenAnalysisDownload;
