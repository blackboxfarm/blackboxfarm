import React, { useState, useCallback, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { 
  Shield, AlertTriangle, CheckCircle, XCircle, Loader2, 
  ExternalLink, Copy, ChevronDown, ChevronUp, Search,
  Link2, Wallet, Activity, Clock, ArrowRight
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

interface WalletAnalysis {
  pubkey: string;
  nickname: string | null;
  source: string;
  hasPrivateKey: boolean;
  keyValid: boolean | null;
  onChainCreationDate: string | null;
  firstTxSignature: string | null;
  solBalance: number | null;
  crossTransfers: CrossTransfer[];
  fundingSources: FundingSource[];
  recentSwaps: SwapActivity[];
}

interface CrossTransfer {
  from: string;
  to: string;
  amountSol: number;
  timestamp: string;
  signature: string;
}

interface FundingSource {
  funder: string;
  amountSol: number;
  timestamp: string;
  isCex: boolean;
  cexName: string | null;
  signature: string;
}

interface SwapActivity {
  tokenMint: string;
  direction: 'buy' | 'sell';
  amountSol: number;
  timestamp: string;
  platform: string;
  signature: string;
}

interface BundleReport {
  wallets: WalletAnalysis[];
  crossTransferLinks: CrossTransfer[];
  sharedFundingSources: { funder: string; wallets: string[]; cexName: string | null }[];
  simultaneousTrades: { tokenMint: string; wallets: string[]; timestamps: string[]; windowSeconds: number }[];
  riskScore: number;
  riskFactors: string[];
  verdict: 'CLEAN' | 'LOW_RISK' | 'MODERATE_RISK' | 'HIGH_RISK' | 'BUNDLE_DETECTED';
}

const SOURCE_LABELS: Record<string, { emoji: string; label: string }> = {
  super_admin: { emoji: '👑', label: 'Admin' },
  blackbox: { emoji: '📦', label: 'BlackBox' },
  airdrop: { emoji: '🪂', label: 'Airdrop' },
  custom: { emoji: '🔑', label: 'Custom' },
  wallet_pool: { emoji: '🏊', label: 'Pool' },
};

const VERDICT_CONFIG: Record<string, { color: string; bg: string; icon: React.ReactNode; label: string }> = {
  CLEAN: { color: 'text-green-400', bg: 'bg-green-900/30 border-green-500/30', icon: <CheckCircle className="w-6 h-6" />, label: '✅ CLEAN — No Bundle Detected' },
  LOW_RISK: { color: 'text-blue-400', bg: 'bg-blue-900/30 border-blue-500/30', icon: <Shield className="w-6 h-6" />, label: '🔵 LOW RISK — Minor Overlap' },
  MODERATE_RISK: { color: 'text-yellow-400', bg: 'bg-yellow-900/30 border-yellow-500/30', icon: <AlertTriangle className="w-6 h-6" />, label: '🟡 MODERATE RISK — Some Linkage Found' },
  HIGH_RISK: { color: 'text-orange-400', bg: 'bg-orange-900/30 border-orange-500/30', icon: <AlertTriangle className="w-6 h-6" />, label: '🟠 HIGH RISK — Strong Bundle Indicators' },
  BUNDLE_DETECTED: { color: 'text-red-400', bg: 'bg-red-900/30 border-red-500/30', icon: <XCircle className="w-6 h-6" />, label: '🔴 BUNDLE DETECTED — Flaggable On-Chain' },
};

function shortenAddress(addr: string, chars = 4) {
  if (!addr || addr.length < chars * 2 + 3) return addr;
  return `${addr.slice(0, chars)}...${addr.slice(-chars)}`;
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text);
  toast({ title: "Copied", description: text.slice(0, 20) + "..." });
}

function SolscanLink({ signature, label }: { signature: string; label?: string }) {
  return (
    <a
      href={`https://solscan.io/tx/${signature}`}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300 text-xs"
    >
      {label || shortenAddress(signature, 6)}
      <ExternalLink className="w-3 h-3" />
    </a>
  );
}

function WalletAddress({ pubkey, nickname }: { pubkey: string; nickname?: string | null }) {
  return (
    <span className="inline-flex items-center gap-1">
      <button onClick={() => copyToClipboard(pubkey)} className="hover:text-foreground text-muted-foreground">
        <Copy className="w-3 h-3" />
      </button>
      <a
        href={`https://solscan.io/account/${pubkey}`}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-400 hover:text-blue-300 font-mono text-xs"
      >
        {nickname ? `${nickname} (${shortenAddress(pubkey)})` : shortenAddress(pubkey, 6)}
      </a>
    </span>
  );
}

interface ReportHistoryItem {
  id: string;
  report_number: number;
  wallet_count: number;
  risk_score: number;
  verdict: string;
  risk_factors: string[];
  created_at: string;
}

export function WalletBundleReport() {
  const [report, setReport] = useState<BundleReport | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [expandedWallets, setExpandedWallets] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [reportHistory, setReportHistory] = useState<ReportHistoryItem[]>([]);
  const [activeReportId, setActiveReportId] = useState<string | null>(null);
  const [activeReportNumber, setActiveReportNumber] = useState<number | null>(null);

  const fetchHistory = useCallback(async () => {
    const { data } = await supabase
      .from('bundle_reports')
      .select('id, report_number, wallet_count, risk_score, verdict, risk_factors, created_at')
      .order('created_at', { ascending: false })
      .limit(20);
    if (data) setReportHistory(data as any);
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const loadReport = useCallback(async (id: string) => {
    const { data } = await supabase
      .from('bundle_reports')
      .select('*')
      .eq('id', id)
      .single();
    if (data) {
      const reportData = (data as any).report_data as BundleReport;
      setReport(reportData);
      setActiveReportId(id);
      setActiveReportNumber((data as any).report_number);
    }
  }, []);

  const runAnalysis = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('wallet-bundle-analyzer', {
        method: 'POST',
        body: {},
      });
      
      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);
      
      setReport(data);
      setActiveReportId(data.reportId || null);
      setActiveReportNumber(data.reportNumber || null);
      await fetchHistory();
      toast({ title: "Bundle Analysis Complete", description: `Report #${data.reportNumber || '?'} — Verdict: ${data.verdict} (Score: ${data.riskScore})` });
    } catch (e: any) {
      console.error('Bundle analysis failed:', e);
      setError(e.message || 'Analysis failed');
      toast({ title: "Analysis Failed", description: e.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [fetchHistory]);

  const toggleWallet = (pubkey: string) => {
    setExpandedWallets(prev => {
      const next = new Set(prev);
      if (next.has(pubkey)) next.delete(pubkey);
      else next.add(pubkey);
      return next;
    });
  };

  const getNicknameForPubkey = (pubkey: string): string | null => {
    return report?.wallets.find(w => w.pubkey === pubkey)?.nickname || null;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="border-primary/20">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Search className="w-6 h-6 text-primary" />
              <div>
                <CardTitle className="text-lg">🕵️ Wallet Bundle Detection Report</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  On-chain forensic analysis of all managed wallets for bundle detection risk
                </p>
                {activeReportNumber && (
                  <p className="text-xs text-primary mt-1 font-mono">Viewing Report #{activeReportNumber}</p>
                )}
              </div>
            </div>
            <Button onClick={runAnalysis} disabled={isLoading} size="lg">
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Analyzing On-Chain...
                </>
              ) : (
                <>
                  <Shield className="w-4 h-4 mr-2" />
                  Run New Analysis
                </>
              )}
            </Button>
          </div>
        </CardHeader>
      </Card>

      {/* Report History */}
      {reportHistory.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Clock className="w-4 h-4" /> Report History ({reportHistory.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {reportHistory.map((h) => {
                const vc = VERDICT_CONFIG[h.verdict];
                const isActive = h.id === activeReportId;
                return (
                  <Button
                    key={h.id}
                    variant={isActive ? "default" : "outline"}
                    size="sm"
                    onClick={() => loadReport(h.id)}
                    className={`text-xs gap-1.5 ${isActive ? '' : 'opacity-70 hover:opacity-100'}`}
                  >
                    <span className="font-mono">#{h.report_number}</span>
                    <Badge variant="outline" className={`text-[10px] ${vc?.color || ''}`}>
                      {h.risk_score}
                    </Badge>
                    <span className="text-muted-foreground">
                      {new Date(h.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  </Button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {error && (
        <Card className="border-destructive/50 bg-destructive/10">
          <CardContent className="pt-4">
            <p className="text-destructive font-mono text-sm">{error}</p>
          </CardContent>
        </Card>
      )}

      {isLoading && (
        <Card>
          <CardContent className="py-12 text-center space-y-4">
            <Loader2 className="w-12 h-12 animate-spin mx-auto text-primary" />
            <div>
              <p className="font-semibold">Running Deep On-Chain Analysis...</p>
              <p className="text-sm text-muted-foreground">
                Checking creation dates, cross-transfers, funding sources, and simultaneous trades via Helius.
                This may take 30-60 seconds.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {report && !isLoading && (
        <>
          {/* Verdict Banner */}
          <Card className={`border ${VERDICT_CONFIG[report.verdict].bg}`}>
            <CardContent className="pt-6">
              <div className="flex items-start gap-4">
                <div className={VERDICT_CONFIG[report.verdict].color}>
                  {VERDICT_CONFIG[report.verdict].icon}
                </div>
                <div className="flex-1">
                  <h3 className={`text-xl font-bold ${VERDICT_CONFIG[report.verdict].color}`}>
                    {VERDICT_CONFIG[report.verdict].label}
                  </h3>
                  <div className="mt-2 flex items-center gap-4">
                    <span className="text-sm text-muted-foreground">
                      Risk Score: <span className="font-bold text-foreground">{report.riskScore}/100</span>
                    </span>
                    <span className="text-sm text-muted-foreground">
                      Wallets Analyzed: <span className="font-bold text-foreground">{report.wallets.length}</span>
                    </span>
                  </div>
                  <div className="mt-3 space-y-1">
                    {report.riskFactors.map((factor, i) => (
                      <p key={i} className="text-sm text-muted-foreground">• {factor}</p>
                    ))}
                  </div>
                </div>
                {/* Risk meter */}
                <div className="w-32 text-center">
                  <div className="relative w-full h-3 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        report.riskScore >= 70 ? 'bg-red-500' :
                        report.riskScore >= 50 ? 'bg-orange-500' :
                        report.riskScore >= 30 ? 'bg-yellow-500' :
                        report.riskScore >= 10 ? 'bg-blue-500' : 'bg-green-500'
                      }`}
                      style={{ width: `${Math.min(report.riskScore, 100)}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{report.riskScore}/100</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Wallet Grid */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Wallet className="w-4 h-4" /> Wallet Inventory — On-Chain Data
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left">
                      <th className="pb-2 pr-3 text-muted-foreground font-medium">Wallet</th>
                      <th className="pb-2 px-3 text-muted-foreground font-medium">Source</th>
                      <th className="pb-2 px-3 text-muted-foreground font-medium">On-Chain Created</th>
                      <th className="pb-2 px-3 text-muted-foreground font-medium">SOL</th>
                      <th className="pb-2 px-3 text-muted-foreground font-medium">🔑 Key</th>
                      <th className="pb-2 px-3 text-muted-foreground font-medium">Cross-Tx</th>
                      <th className="pb-2 px-3 text-muted-foreground font-medium">Swaps</th>
                      <th className="pb-2 pl-3 text-muted-foreground font-medium">Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.wallets.map((w) => {
                      const isExpanded = expandedWallets.has(w.pubkey);
                      return (
                        <React.Fragment key={w.pubkey}>
                          <tr className="border-b border-border/50 hover:bg-muted/30">
                            <td className="py-2 pr-3">
                              <WalletAddress pubkey={w.pubkey} nickname={w.nickname} />
                            </td>
                            <td className="py-2 px-3">
                              <Badge variant="outline" className="text-xs">
                                {SOURCE_LABELS[w.source]?.emoji} {SOURCE_LABELS[w.source]?.label || w.source}
                              </Badge>
                            </td>
                            <td className="py-2 px-3 font-mono text-xs">
                              {w.onChainCreationDate
                                ? new Date(w.onChainCreationDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
                                : <span className="text-muted-foreground">No txns</span>
                              }
                            </td>
                            <td className="py-2 px-3 font-mono text-xs">
                              {w.solBalance !== null ? `${w.solBalance.toFixed(4)}` : '—'}
                            </td>
                            <td className="py-2 px-3">
                              {w.hasPrivateKey ? (
                                w.keyValid ? (
                                  <Badge className="bg-green-900/50 text-green-400 border-green-500/30 text-xs">✓ Valid</Badge>
                                ) : (
                                  <Badge className="bg-yellow-900/50 text-yellow-400 border-yellow-500/30 text-xs">⚠ Check</Badge>
                                )
                              ) : (
                                <Badge variant="destructive" className="text-xs">✗ None</Badge>
                              )}
                            </td>
                            <td className="py-2 px-3">
                              {w.crossTransfers.length > 0 ? (
                                <Badge className="bg-red-900/50 text-red-400 border-red-500/30 text-xs">
                                  {w.crossTransfers.length} link{w.crossTransfers.length > 1 ? 's' : ''}
                                </Badge>
                              ) : (
                                <span className="text-green-400 text-xs">Clean</span>
                              )}
                            </td>
                            <td className="py-2 px-3 text-xs text-muted-foreground">
                              {w.recentSwaps.length}
                            </td>
                            <td className="py-2 pl-3">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => toggleWallet(w.pubkey)}
                                className="h-6 px-2"
                              >
                                {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                              </Button>
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr>
                              <td colSpan={8} className="bg-muted/20 p-4">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                                  {/* Funding sources */}
                                  <div>
                                    <h4 className="font-semibold mb-2 flex items-center gap-1">
                                      <ArrowRight className="w-3 h-3" /> Funding Sources
                                    </h4>
                                    {w.fundingSources.length === 0 ? (
                                      <p className="text-muted-foreground">No incoming transfers found</p>
                                    ) : (
                                      <div className="space-y-1">
                                        {w.fundingSources.slice(0, 5).map((fs, i) => (
                                          <div key={i} className="flex items-center gap-2">
                                            {fs.isCex && (
                                              <Badge className="bg-blue-900/50 text-blue-300 text-[10px]">{fs.cexName}</Badge>
                                            )}
                                            <span className="font-mono">{shortenAddress(fs.funder, 4)}</span>
                                            <span className="text-muted-foreground">{fs.amountSol.toFixed(3)} SOL</span>
                                            <SolscanLink signature={fs.signature} />
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                  {/* Cross transfers */}
                                  <div>
                                    <h4 className="font-semibold mb-2 flex items-center gap-1">
                                      <Link2 className="w-3 h-3" /> Cross-Wallet Transfers
                                    </h4>
                                    {w.crossTransfers.length === 0 ? (
                                      <p className="text-green-400">No links to other managed wallets</p>
                                    ) : (
                                      <div className="space-y-1">
                                        {w.crossTransfers.map((ct, i) => (
                                          <div key={i} className="text-red-300">
                                            <WalletAddress pubkey={ct.from} nickname={getNicknameForPubkey(ct.from)} />
                                            {' → '}
                                            <WalletAddress pubkey={ct.to} nickname={getNicknameForPubkey(ct.to)} />
                                            <span className="ml-1 text-muted-foreground">{ct.amountSol.toFixed(3)} SOL</span>
                                            <SolscanLink signature={ct.signature} />
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                  {/* Recent swaps */}
                                  <div>
                                    <h4 className="font-semibold mb-2 flex items-center gap-1">
                                      <Activity className="w-3 h-3" /> Recent Swaps
                                    </h4>
                                    {w.recentSwaps.length === 0 ? (
                                      <p className="text-muted-foreground">No swap activity</p>
                                    ) : (
                                      <div className="space-y-1">
                                        {w.recentSwaps.slice(0, 5).map((sw, i) => (
                                          <div key={i} className="flex items-center gap-2">
                                            <Badge variant={sw.direction === 'buy' ? 'default' : 'secondary'} className="text-[10px]">
                                              {sw.direction.toUpperCase()}
                                            </Badge>
                                            <span className="font-mono">{shortenAddress(sw.tokenMint, 4)}</span>
                                            <span className="text-muted-foreground">{sw.amountSol.toFixed(3)} SOL</span>
                                            <span className="text-muted-foreground">{sw.platform}</span>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </div>
                                {/* First tx */}
                                {w.firstTxSignature && (
                                  <div className="mt-3 pt-3 border-t border-border/50 flex items-center gap-2 text-xs text-muted-foreground">
                                    <Clock className="w-3 h-3" />
                                    First transaction: <SolscanLink signature={w.firstTxSignature} label={`${new Date(w.onChainCreationDate!).toLocaleDateString()} — View on Solscan`} />
                                  </div>
                                )}
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Cross Transfer Links Section */}
          {report.crossTransferLinks.length > 0 && (
            <Card className="border-red-500/30">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2 text-red-400">
                  <Link2 className="w-4 h-4" /> 🚨 Cross-Wallet Transfer Links ({report.crossTransferLinks.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {report.crossTransferLinks.map((ct, i) => (
                    <div key={i} className="flex items-center gap-3 p-2 bg-red-900/10 rounded-lg text-sm">
                      <WalletAddress pubkey={ct.from} nickname={getNicknameForPubkey(ct.from)} />
                      <ArrowRight className="w-4 h-4 text-red-400" />
                      <WalletAddress pubkey={ct.to} nickname={getNicknameForPubkey(ct.to)} />
                      <span className="font-mono text-red-300">{ct.amountSol.toFixed(4)} SOL</span>
                      <span className="text-muted-foreground text-xs">{new Date(ct.timestamp).toLocaleDateString()}</span>
                      <SolscanLink signature={ct.signature} />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Shared Funding Sources */}
          {report.sharedFundingSources.length > 0 && (
            <Card className="border-orange-500/30">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2 text-orange-400">
                  <Wallet className="w-4 h-4" /> ⚠️ Shared Funding Sources ({report.sharedFundingSources.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {report.sharedFundingSources.map((sf, i) => (
                    <div key={i} className="p-3 bg-orange-900/10 rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-sm font-semibold">
                          {sf.cexName ? `${sf.cexName} Wallet` : 'Shared Funder'}:
                        </span>
                        <WalletAddress pubkey={sf.funder} />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {sf.wallets.map(w => (
                          <Badge key={w} variant="outline" className="text-xs">
                            <WalletAddress pubkey={w} nickname={getNicknameForPubkey(w)} />
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Simultaneous Trading */}
          {report.simultaneousTrades.length > 0 && (
            <Card className="border-purple-500/30">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2 text-purple-400">
                  <Activity className="w-4 h-4" /> ⏱️ Simultaneous Trading Clusters ({report.simultaneousTrades.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {report.simultaneousTrades.map((st, i) => (
                    <div key={i} className="p-3 bg-purple-900/10 rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-sm font-semibold">Token:</span>
                        <span className="font-mono text-xs">{shortenAddress(st.tokenMint, 6)}</span>
                        <Badge className="bg-purple-900/50 text-purple-300 text-xs">
                          {st.wallets.length} wallets within {st.windowSeconds}s
                        </Badge>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {st.wallets.map(w => (
                          <Badge key={w} variant="outline" className="text-xs">
                            <WalletAddress pubkey={w} nickname={getNicknameForPubkey(w)} />
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Clean sections */}
          {report.crossTransferLinks.length === 0 && report.sharedFundingSources.length === 0 && report.simultaneousTrades.length === 0 && (
            <Card className="border-green-500/30">
              <CardContent className="py-8 text-center">
                <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-3" />
                <h3 className="text-lg font-semibold text-green-400">All Clear</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  No cross-wallet transfers, shared funding sources, or simultaneous trades detected.
                </p>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
