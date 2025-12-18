import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, Loader2, FileText, FileSpreadsheet, Database, Search, AlertTriangle, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";

const TokenAnalysisDownload = () => {
  const [loading, setLoading] = useState(false);
  const [heliusLoading, setHeliusLoading] = useState(false);
  const [walletTraceLoading, setWalletTraceLoading] = useState(false);
  const [analysisData, setAnalysisData] = useState<any>(null);
  const [heliusData, setHeliusData] = useState<any>(null);
  const [walletTraceData, setWalletTraceData] = useState<any>(null);
  const [walletToTrace, setWalletToTrace] = useState("6rDqAoNhfVhhLynpidBWkSqEzPRkpgzFsMFhmnaCahX8");
  const [showDustWallets, setShowDustWallets] = useState(false);

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

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-4xl mx-auto space-y-6">
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
