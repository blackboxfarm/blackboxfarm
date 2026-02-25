import React, { useState, useEffect, useCallback } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, ExternalLink, Copy, Check, ShieldAlert, AlertTriangle } from "lucide-react";

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="inline-flex items-center ml-1 text-gray-500 hover:text-white transition-colors"
      title="Copy"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

function ExtLink({ href, label, color }: { href: string; label: string; color: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer"
      className={`inline-flex items-center gap-1 ${color} hover:underline`}
    >
      {label} <ExternalLink className="h-3 w-3" />
    </a>
  );
}

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

export default function IntelReport() {
  const { address } = useParams<{ address: string }>();
  const [searchParams] = useSearchParams();
  const inputAddress = address || searchParams.get("q") || "";

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creatorWallet, setCreatorWallet] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [devRep, setDevRep] = useState<DevReputation | null>(null);
  const [blacklistEntries, setBlacklistEntries] = useState<BlacklistEntry[]>([]);
  const [meshLinks, setMeshLinks] = useState<MeshLink[]>([]);

  const runReport = useCallback(async (input: string) => {
    if (!input.trim()) return;
    setLoading(true);
    setError(null);

    try {
      let wallet = input.trim();
      const originalInput = wallet;

      // Resolve token -> creator wallet (3-stage fallback)
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
          // Fallback: use token-creator-linker to resolve on-chain
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
          .limit(50),
      ]);

      if (scanResponse.data) setScanResult(scanResponse.data as ScanResult);
      if (repResponse.data) setDevRep(repResponse.data as unknown as DevReputation);
      if (blResponse.data) setBlacklistEntries(blResponse.data as unknown as BlacklistEntry[]);
      if (meshResponse.data) setMeshLinks(meshResponse.data as unknown as MeshLink[]);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (inputAddress) {
      runReport(inputAddress);
    }
  }, [inputAddress, runReport]);

  if (!inputAddress) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] text-white flex items-center justify-center">
        <p className="text-gray-400">No address provided. Use /intel/YOUR_ADDRESS</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] text-white flex flex-col items-center justify-center gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-violet-400" />
        <p className="text-gray-400">Scanning wallet tree & building report...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] text-white flex items-center justify-center">
        <p className="text-red-400">Error: {error}</p>
      </div>
    );
  }

  const trustColor = devRep?.trust_level === "scammer" || devRep?.trust_level === "serial_rugger" || devRep?.trust_level === "blacklisted"
    ? "text-red-400" : devRep?.trust_level === "trusted" || devRep?.trust_level === "verified"
    ? "text-green-400" : "text-yellow-400";

  const gradRate = devRep ? (devRep.total_tokens_launched > 0 ? ((devRep.tokens_graduated / devRep.total_tokens_launched) * 100).toFixed(0) : "0") : "—";

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-gray-200">
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">

        {/* Title */}
        <div className="border-b border-gray-800 pb-6">
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            🔮 Intelligence Report
            {(devRep?.trust_level === "scammer" || devRep?.trust_level === "serial_rugger") && (
              <ShieldAlert className="h-6 w-6 text-red-400 animate-pulse" />
            )}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Generated {new Date().toLocaleString()} • Input: <span className="font-mono text-gray-400">{inputAddress}</span>
          </p>
        </div>

        {/* Dev Wallet Section */}
        {creatorWallet && (
          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-white">🔴 Dev Wallet</h2>
            <div className="bg-gray-900/60 border border-gray-800 rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm text-white break-all">{creatorWallet}</span>
                <CopyBtn text={creatorWallet} />
                <ExtLink href={`https://solscan.io/account/${creatorWallet}`} label="solscan" color="text-blue-400" />
              </div>
              {devRep && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                  <div>
                    <span className="text-gray-500">Trust Level</span>
                    <p className={`font-bold uppercase ${trustColor}`}>{devRep.trust_level}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Rep Score</span>
                    <p className="text-white font-bold">{devRep.reputation_score}/100</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Tokens Launched</span>
                    <p className="text-white font-bold">{devRep.total_tokens_launched}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Graduation Rate</span>
                    <p className="text-white font-bold">{gradRate}% ({devRep.tokens_graduated}/{devRep.total_tokens_launched})</p>
                  </div>
                  {devRep.dev_pattern && (
                    <div className="col-span-2">
                      <span className="text-gray-500">Pattern</span>
                      <p className="text-white">{devRep.dev_pattern}</p>
                    </div>
                  )}
                  {devRep.notes && (
                    <div className="col-span-full">
                      <span className="text-gray-500">Notes</span>
                      <p className="text-gray-300">{devRep.notes}</p>
                    </div>
                  )}
                </div>
              )}
              {!devRep && <p className="text-gray-500 text-sm">No reputation data in DB for this wallet.</p>}
            </div>
          </section>
        )}

        {/* Blacklist Entries */}
        {blacklistEntries.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-red-400 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" /> Blacklist Entries ({blacklistEntries.length})
            </h2>
            <div className="space-y-2">
              {blacklistEntries.map((bl, i) => (
                <div key={i} className="bg-red-950/20 border border-red-900/40 rounded-lg p-3 text-sm">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="uppercase text-[10px] font-bold px-2 py-0.5 rounded bg-red-900/40 text-red-300">{bl.entry_type}</span>
                    <span className="uppercase text-[10px] font-bold px-2 py-0.5 rounded bg-red-900/40 text-red-300">{bl.risk_level}</span>
                    <span className="font-mono text-gray-400 break-all">{bl.identifier}</span>
                    <CopyBtn text={bl.identifier} />
                  </div>
                  <p className="mt-1 text-gray-400">{bl.blacklist_reason}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Mesh / Funding Links */}
        {meshLinks.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-white">🔗 Reputation Mesh ({meshLinks.length} links)</h2>
            <div className="bg-gray-900/60 border border-gray-800 rounded-lg overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800 text-gray-500">
                    <th className="text-left py-2 px-3">Source</th>
                    <th className="text-left py-2 px-3">Relationship</th>
                    <th className="text-left py-2 px-3">Linked</th>
                    <th className="text-right py-2 px-3">Confidence</th>
                  </tr>
                </thead>
                <tbody>
                  {meshLinks.map((link, i) => (
                    <tr key={i} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                      <td className="py-2 px-3 font-mono text-xs break-all">
                        {link.source_id} <CopyBtn text={link.source_id} />
                      </td>
                      <td className="py-2 px-3">
                        <span className="text-violet-400 text-xs">{link.relationship.replace(/_/g, " ")}</span>
                      </td>
                      <td className="py-2 px-3 font-mono text-xs break-all">
                        {link.linked_id} <CopyBtn text={link.linked_id} />
                      </td>
                      <td className="py-2 px-3 text-right text-gray-400">{link.confidence}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* All Minted Tokens */}
        {scanResult && scanResult.allMintedTokens.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-white">
              🪙 All Minted Tokens ({scanResult.totalTokensMinted})
              <span className="text-gray-500 text-sm ml-2">
                scanned in {(scanResult.scanDuration / 1000).toFixed(1)}s
              </span>
            </h2>
            <div className="bg-gray-900/60 border border-gray-800 rounded-lg overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800 text-gray-500">
                    <th className="text-left py-2 px-3 w-8">#</th>
                    <th className="text-left py-2 px-3">Token Mint</th>
                    <th className="text-left py-2 px-3">Name</th>
                    <th className="text-left py-2 px-3">Date</th>
                    <th className="text-left py-2 px-3">Creator</th>
                    <th className="text-left py-2 px-3">Links</th>
                  </tr>
                </thead>
                <tbody>
                  {scanResult.allMintedTokens.map((token, i) => (
                    <tr key={token.tokenMint} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                      <td className="py-2 px-3 text-gray-500">{i + 1}</td>
                      <td className="py-2 px-3">
                        <div className="flex items-center gap-1">
                          <span className="font-mono text-xs text-white break-all">{token.tokenMint}</span>
                          <CopyBtn text={token.tokenMint} />
                        </div>
                      </td>
                      <td className="py-2 px-3 text-white whitespace-nowrap">
                        {token.name || token.symbol || "—"}
                      </td>
                      <td className="py-2 px-3 text-gray-400 whitespace-nowrap">
                        {token.createdAt ? new Date(token.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}
                      </td>
                      <td className="py-2 px-3">
                        <div className="flex items-center gap-1">
                          <span className="font-mono text-xs text-gray-400 break-all">{token.creatorWallet}</span>
                          <CopyBtn text={token.creatorWallet} />
                        </div>
                      </td>
                      <td className="py-2 px-3">
                        <div className="flex items-center gap-3 whitespace-nowrap">
                          <a href={`https://trade.padre.gg/trade/solana/${token.tokenMint}`} target="_blank" rel="noopener noreferrer"
                            className="text-violet-400 hover:text-violet-300 inline-flex items-center gap-1">
                            padre.gg <ExternalLink className="h-3 w-3" />
                          </a>
                          <a href={`https://pump.fun/coin/${token.tokenMint}`} target="_blank" rel="noopener noreferrer"
                            className="text-green-400 hover:text-green-300 inline-flex items-center gap-1">
                            pump.fun <ExternalLink className="h-3 w-3" />
                          </a>
                          <a href={`https://solscan.io/token/${token.tokenMint}`} target="_blank" rel="noopener noreferrer"
                            className="text-blue-400 hover:text-blue-300 inline-flex items-center gap-1">
                            solscan <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Socials */}
        {devRep?.twitter_accounts && devRep.twitter_accounts.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-white">🐦 Linked Socials</h2>
            <div className="flex flex-wrap gap-2">
              {devRep.twitter_accounts.map((url, i) => (
                <a key={i} href={url.startsWith("http") ? url : `https://${url}`}
                  target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-sky-400 hover:text-sky-300 px-3 py-1.5 rounded bg-gray-900 border border-gray-800">
                  {url} <ExternalLink className="h-3 w-3" />
                </a>
              ))}
            </div>
          </section>
        )}

        {/* No results */}
        {scanResult && scanResult.totalTokensMinted === 0 && (
          <div className="text-center text-gray-500 py-12">
            No minted tokens found for this wallet.
          </div>
        )}

      </div>
    </div>
  );
}
