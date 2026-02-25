import React, { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, ExternalLink, AlertTriangle, ShieldAlert, Copy, Check, TreePine } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface MintedToken {
  tokenMint: string;
  name?: string;
  symbol?: string;
  createdAt?: string;
  creatorWallet: string;
  depth: number;
  fundingPath: string[];
}

interface ScanResult {
  parentWallet: string;
  totalOffspring: number;
  totalMinters: number;
  totalTokensMinted: number;
  allMintedTokens: MintedToken[];
  scanDepth: number;
  scanDuration: number;
}

interface DevReputation {
  wallet_address: string;
  trust_level: string;
  reputation_score: number;
  total_tokens_launched: number;
  tokens_graduated: number;
  tokens_rugged: number;
  dev_pattern: string;
  notes: string;
  upstream_wallets: string[];
  twitter_accounts: string[];
  is_serial_spammer: boolean;
}

interface BlacklistEntry {
  identifier: string;
  entry_type: string;
  risk_level: string;
  blacklist_reason: string;
  linked_token_mints: string[];
  linked_wallets: string[];
}

interface MeshLink {
  source_id: string;
  linked_id: string;
  relationship: string;
  confidence: number;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="inline-flex items-center text-muted-foreground hover:text-foreground transition-colors"
      title="Copy"
    >
      {copied ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
    </button>
  );
}

function WalletAddress({ address, label }: { address: string; label?: string }) {
  return (
    <span className="inline-flex items-center gap-1 font-mono text-xs">
      {label && <span className="text-muted-foreground mr-1">{label}:</span>}
      <span className="text-foreground">{address}</span>
      <CopyButton text={address} />
    </span>
  );
}

export default function DevIntelReport() {
  const { toast } = useToast();
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [devRep, setDevRep] = useState<DevReputation | null>(null);
  const [blacklistEntries, setBlacklistEntries] = useState<BlacklistEntry[]>([]);
  const [meshLinks, setMeshLinks] = useState<MeshLink[]>([]);
  const [creatorWallet, setCreatorWallet] = useState<string | null>(null);

  const runReport = useCallback(async () => {
    if (!input.trim()) return;
    setLoading(true);
    setScanResult(null);
    setDevRep(null);
    setBlacklistEntries([]);
    setMeshLinks([]);
    setCreatorWallet(null);

    try {
      // Step 1: Resolve creator wallet if input looks like a token (3-stage fallback)
      let wallet = input.trim();
      const originalInput = wallet;
      
      const { data: watchlistHit } = await supabase
        .from("pumpfun_watchlist")
        .select("creator_wallet")
        .eq("token_mint", wallet)
        .limit(1)
        .maybeSingle();

      if (watchlistHit?.creator_wallet) {
        wallet = watchlistHit.creator_wallet;
      } else {
        const { data: lifecycleHit } = await supabase
          .from("token_lifecycle")
          .select("creator_wallet")
          .eq("token_mint", originalInput)
          .limit(1)
          .maybeSingle();
        if (lifecycleHit?.creator_wallet) {
          wallet = lifecycleHit.creator_wallet;
        } else {
          // Fallback: resolve creator on-chain via token-creator-linker
          try {
            const { data: linkerData } = await supabase.functions.invoke("token-creator-linker", {
              body: { tokenMints: [originalInput] },
            });
            if (linkerData?.results?.[0]?.creatorWallet) {
              wallet = linkerData.results[0].creatorWallet;
            } else if (linkerData?.results?.[0]?.creator_wallet) {
              wallet = linkerData.results[0].creator_wallet;
            }
          } catch (e) {
            console.warn("token-creator-linker fallback failed:", e);
          }
        }
      }

      setCreatorWallet(wallet);

      // Step 2: Run offspring scanner + DB lookups in parallel
      const [scanResponse, repResponse, blResponse, meshResponse] = await Promise.all([
        supabase.functions.invoke("offspring-mint-scanner", {
          body: { parentWallet: wallet, maxDepth: 0 },
        }),
        supabase
          .from("dev_wallet_reputation")
          .select("*")
          .eq("wallet_address", wallet)
          .maybeSingle(),
        supabase
          .from("pumpfun_blacklist")
          .select("identifier, entry_type, risk_level, blacklist_reason, linked_token_mints, linked_wallets")
          .or(`identifier.eq.${wallet},identifier.eq.${input.trim()}`)
          .eq("is_active", true),
        supabase
          .from("reputation_mesh")
          .select("source_id, linked_id, relationship, confidence")
          .or(`source_id.eq.${wallet},linked_id.eq.${wallet}`)
          .limit(20),
      ]);

      if (scanResponse.data) {
        setScanResult(scanResponse.data as ScanResult);
      }
      if (repResponse.data) {
        setDevRep(repResponse.data as unknown as DevReputation);
      }
      if (blResponse.data) {
        setBlacklistEntries(blResponse.data as unknown as BlacklistEntry[]);
      }
      if (meshResponse.data) {
        setMeshLinks(meshResponse.data as unknown as MeshLink[]);
      }

      toast({ title: "Report loaded", description: `Found ${scanResponse.data?.totalTokensMinted || 0} minted tokens` });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [input, toast]);

  const trustColor = (level: string) => {
    switch (level) {
      case "scammer": case "serial_rugger": case "blacklisted": return "destructive";
      case "suspicious": case "repeat_loser": return "secondary";
      case "trusted": case "verified": return "default";
      default: return "outline";
    }
  };

  const riskColor = (level: string) => {
    switch (level) {
      case "critical": return "bg-red-500/20 text-red-400 border-red-500/30";
      case "high": return "bg-orange-500/20 text-orange-400 border-orange-500/30";
      case "medium": return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
      default: return "bg-muted text-muted-foreground";
    }
  };

  return (
    <div className="space-y-4">
      {/* Search */}
      <Card className="border-violet-500/20">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <TreePine className="h-5 w-5 text-violet-400" />
            Dev Intel Report
          </CardTitle>
          <CardDescription>
            Enter a token mint or dev wallet to generate a full intelligence report with wallet tree, all minted tokens, and padre.gg links.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              placeholder="Token mint or dev wallet address..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runReport()}
              className="font-mono text-sm"
            />
            <Button onClick={runReport} disabled={loading || !input.trim()}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              <span className="ml-2">{loading ? "Scanning..." : "Scan"}</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {creatorWallet && (
        <div className="space-y-4">
          {/* Dev Reputation Header */}
          <Card className={`${devRep?.trust_level === "scammer" || devRep?.trust_level === "serial_rugger" ? "border-red-500/40 bg-red-950/10" : "border-border"}`}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-3">
                  {(devRep?.trust_level === "scammer" || devRep?.trust_level === "serial_rugger") && (
                    <ShieldAlert className="h-6 w-6 text-red-400 animate-pulse" />
                  )}
                  <div>
                    <CardTitle className="text-lg">Dev Wallet</CardTitle>
                    <WalletAddress address={creatorWallet} />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {devRep && (
                    <>
                      <Badge variant={trustColor(devRep.trust_level)} className="uppercase text-xs">
                        {devRep.trust_level}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        Score: {devRep.reputation_score}/100
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {devRep.total_tokens_launched} launched / {devRep.tokens_graduated} graduated
                      </Badge>
                    </>
                  )}
                </div>
              </div>
            </CardHeader>
            {devRep?.notes && (
              <CardContent className="pt-0">
                <p className="text-sm text-muted-foreground">{devRep.notes}</p>
                {devRep.dev_pattern && (
                  <Badge variant="outline" className="mt-2 text-xs">Pattern: {devRep.dev_pattern}</Badge>
                )}
              </CardContent>
            )}
          </Card>

          {/* Blacklist Status */}
          {blacklistEntries.length > 0 && (
            <Card className="border-red-500/30 bg-red-950/10">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-400" />
                  Blacklist Entries ({blacklistEntries.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {blacklistEntries.map((bl, i) => (
                  <div key={i} className={`p-2 rounded border text-xs ${riskColor(bl.risk_level)}`}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-[10px] uppercase">{bl.entry_type}</Badge>
                      <Badge variant="outline" className="text-[10px] uppercase">{bl.risk_level}</Badge>
                      <span className="font-mono">{bl.identifier.slice(0, 12)}...</span>
                    </div>
                    <p className="mt-1 opacity-80">{bl.blacklist_reason}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Funding Chain */}
          {meshLinks.length > 0 && (
            <Card className="border-violet-500/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">🔗 Funding Chain & Mesh Links ({meshLinks.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1">
                  {meshLinks.map((link, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs font-mono p-1.5 rounded bg-muted/30">
                      <span className="text-muted-foreground">{link.source_id.slice(0, 8)}...</span>
                      <Badge variant="outline" className="text-[10px]">{link.relationship.replace(/_/g, " ")}</Badge>
                      <span className="text-muted-foreground">{link.linked_id.slice(0, 8)}...</span>
                      <span className="text-muted-foreground ml-auto">({link.confidence}%)</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Minted Tokens Table */}
          {scanResult && scanResult.allMintedTokens.length > 0 && (
            <Card className="border-violet-500/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">
                  🪙 All Minted Tokens ({scanResult.totalTokensMinted})
                  <span className="text-muted-foreground text-xs ml-2">
                    Scanned in {(scanResult.scanDuration / 1000).toFixed(1)}s
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-2 px-2 text-muted-foreground font-medium">#</th>
                        <th className="text-left py-2 px-2 text-muted-foreground font-medium">Token Mint</th>
                        <th className="text-left py-2 px-2 text-muted-foreground font-medium">Name</th>
                        <th className="text-left py-2 px-2 text-muted-foreground font-medium">Date</th>
                        <th className="text-left py-2 px-2 text-muted-foreground font-medium">Creator</th>
                        <th className="text-left py-2 px-2 text-muted-foreground font-medium">Links</th>
                      </tr>
                    </thead>
                    <tbody>
                      {scanResult.allMintedTokens.map((token, i) => (
                        <tr key={token.tokenMint} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                          <td className="py-2 px-2 text-muted-foreground">{i + 1}</td>
                          <td className="py-2 px-2">
                            <div className="flex items-center gap-1">
                              <span className="font-mono text-foreground">{token.tokenMint}</span>
                              <CopyButton text={token.tokenMint} />
                            </div>
                          </td>
                          <td className="py-2 px-2 text-foreground">
                            {token.name || token.symbol || "—"}
                          </td>
                          <td className="py-2 px-2 text-muted-foreground whitespace-nowrap">
                            {token.createdAt ? new Date(token.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}
                          </td>
                          <td className="py-2 px-2 font-mono text-muted-foreground">
                            {token.creatorWallet.slice(0, 8)}...
                          </td>
                          <td className="py-2 px-2">
                            <div className="flex items-center gap-2">
                              <a
                                href={`https://trade.padre.gg/trade/solana/${token.tokenMint}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-violet-400 hover:text-violet-300 transition-colors"
                              >
                                padre.gg <ExternalLink className="h-3 w-3" />
                              </a>
                              <a
                                href={`https://pump.fun/coin/${token.tokenMint}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-green-400 hover:text-green-300 transition-colors"
                              >
                                pump.fun <ExternalLink className="h-3 w-3" />
                              </a>
                              <a
                                href={`https://solscan.io/token/${token.tokenMint}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300 transition-colors"
                              >
                                solscan <ExternalLink className="h-3 w-3" />
                              </a>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Socials */}
          {devRep?.twitter_accounts && devRep.twitter_accounts.length > 0 && (
            <Card className="border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">🐦 Linked Socials</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {devRep.twitter_accounts.map((url, i) => (
                    <a
                      key={i}
                      href={url.startsWith("http") ? url : `https://${url}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300 px-2 py-1 rounded bg-muted/30 border border-border"
                    >
                      {url} <ExternalLink className="h-3 w-3" />
                    </a>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* No results */}
          {!loading && scanResult && scanResult.totalTokensMinted === 0 && (
            <Card className="border-border">
              <CardContent className="py-8 text-center text-muted-foreground">
                No minted tokens found for this wallet.
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
