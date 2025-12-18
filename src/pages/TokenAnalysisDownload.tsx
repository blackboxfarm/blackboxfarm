import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, Loader2, FileText, FileSpreadsheet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const TokenAnalysisDownload = () => {
  const [loading, setLoading] = useState(false);
  const [analysisData, setAnalysisData] = useState<any>(null);

  const tokenMint = "DyqgbSyWcwRw17Y3SvAtmP4o73n1nes5PzwAEjvVpump";

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

  const downloadCSV = () => {
    if (!analysisData?.allWalletStats) return;

    // Create CSV for all wallet stats
    const walletHeaders = ["wallet", "buyCount", "sellCount", "buySol", "sellSol", "pnlSol", "pnlUsd", "netTokens", "isEmpty", "tradeSequence"];
    const walletRows = analysisData.allWalletStats.map((w: any) => 
      walletHeaders.map(h => w[h] ?? "").join(",")
    );
    const walletCSV = [walletHeaders.join(","), ...walletRows].join("\n");

    // Create CSV for all trades
    const tradeHeaders = ["index", "type", "wallet", "amount", "volumeSol", "volumeUsd", "priceUsd", "time"];
    const tradeRows = analysisData.first100Trades?.map((t: any) =>
      tradeHeaders.map(h => t[h] ?? "").join(",")
    ) || [];
    const tradesCSV = [tradeHeaders.join(","), ...tradeRows].join("\n");

    // Download wallet stats
    downloadFile(`token_wallet_stats_${tokenMint.slice(0, 8)}.csv`, walletCSV, "text/csv");
    
    // Download trades
    downloadFile(`token_trades_${tokenMint.slice(0, 8)}.csv`, tradesCSV, "text/csv");
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
      text += `#${t.index} ${t.type.toUpperCase()} | ${t.wallet?.slice(0, 8)}... | ${t.amount?.toFixed(2)} tokens | ${t.volumeSol?.toFixed(4)} SOL | ${t.time}\n`;
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
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-6 w-6" />
              Token Analysis Download
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 bg-muted rounded-lg">
              <p className="font-mono text-sm break-all">{tokenMint}</p>
              <p className="text-sm text-muted-foreground mt-1">pepemas token</p>
            </div>

            <Button onClick={fetchAnalysis} disabled={loading} className="w-full">
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Fetching all trades...
                </>
              ) : (
                "Fetch Full Analysis"
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
                    <div className="text-2xl text-red-500">{analysisData.summary?.earlySellerExtractedSol}</div>
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
      </div>
    </div>
  );
};

export default TokenAnalysisDownload;
