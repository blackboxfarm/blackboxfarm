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

interface OffspringWallet {
  wallet: string;
  depth: number;
  amountReceived: number;
  timestamp?: string;
  hasMinted: boolean;
  mintedTokens: MintedToken[];
  children: OffspringWallet[];
}

interface ScanResult {
  parentWallet: string;
  totalOffspring: number;
  totalMinters: number;
  totalTokensMinted: number;
  allMintedTokens: MintedToken[];
  offspringTree?: OffspringWallet;
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

function flattenOffspringWallets(node?: OffspringWallet): Array<{ wallet: string; depth: number; minted: number }> {
  if (!node) return [];

  const wallets = [{ wallet: node.wallet, depth: node.depth, minted: node.mintedTokens?.length ?? 0 }];
  for (const child of node.children ?? []) {
    wallets.push(...flattenOffspringWallets(child));
  }

  return wallets;
}

function mapGenealogyToOffspring(node: any): OffspringWallet {
  return {
    wallet: node?.wallet,
    depth: node?.depth ?? 0,
    amountReceived: node?.amount_sol ?? 0,
    timestamp: node?.timestamp ?? undefined,
    hasMinted: false,
    mintedTokens: [],
    children: Array.isArray(node?.children) ? node.children.map(mapGenealogyToOffspring) : [],
  };
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

      // Resolve token -> creator wallet
      // PRIMARY: For pump.fun tokens, call pump.fun API directly (authoritative source)
      let resolvedCreator: string | null = null;

      if (originalInput.toLowerCase().endsWith("pump")) {
        try {
          const pumpRes = await fetch(`https://frontend-api-v3.pump.fun/coins/${originalInput}`);
          if (pumpRes.ok) {
            const pumpData = await pumpRes.json();
            if (pumpData?.creator && typeof pumpData.creator === "string" && pumpData.creator.length >= 32) {
              resolvedCreator = pumpData.creator;
              console.log("pump.fun API resolved creator:", resolvedCreator);
            }
          }
        } catch (e) {
          console.warn("pump.fun API lookup failed:", e);
        }
      }

      // FALLBACK: DB lookups
      if (!resolvedCreator) {
        const { data: watchlistHit } = await supabase
          .from("pumpfun_watchlist")
          .select("creator_wallet")
          .eq("token_mint", wallet)
          .limit(1)
          .maybeSingle();

        if (watchlistHit?.creator_wallet) {
          resolvedCreator = watchlistHit.creator_wallet;
        } else {
          const { data: lifecycleHit } = await supabase
            .from("token_lifecycle")
            .select("creator_wallet")
            .eq("token_mint", originalInput)
            .limit(1)
            .maybeSingle();

          if (lifecycleHit?.creator_wallet) {
            resolvedCreator = lifecycleHit.creator_wallet;
          } else {
            const { data: devTokenHit } = await supabase
              .from("developer_tokens")
              .select("creator_wallet")
              .eq("token_mint", originalInput)
              .limit(1)
              .maybeSingle();

            if (devTokenHit?.creator_wallet) {
              resolvedCreator = devTokenHit.creator_wallet;
            }
          }
        }
      }

      // LAST RESORT: trigger token-creator-linker
      if (!resolvedCreator && originalInput.toLowerCase().endsWith("pump")) {
        try {
          await supabase.functions.invoke("token-creator-linker", {
            body: { tokenMints: [originalInput] },
          });

          const { data: linkedDevTokenHit } = await supabase
            .from("developer_tokens")
            .select("creator_wallet")
            .eq("token_mint", originalInput)
            .limit(1)
            .maybeSingle();

          if (linkedDevTokenHit?.creator_wallet) {
            resolvedCreator = linkedDevTokenHit.creator_wallet;
          }
        } catch (e) {
          console.warn("token-creator-linker fallback failed:", e);
        }
      }

      if (resolvedCreator) {
        wallet = resolvedCreator;
      }

      setCreatorWallet(wallet);

      const scannerPromise = supabase.functions.invoke("offspring-mint-scanner", {
        body: { parentWallet: wallet, maxDepth: 3 },
      });

      const genealogyPromise = supabase.functions.invoke("wallet-genealogy-scanner", {
        body: { wallets: [wallet], maxDepth: 3, minAmountSol: 0.05 },
      });

      const [repResponse, blResponse, meshResponse, devTokensResponse] = await Promise.all([
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
        supabase
          .from("developer_tokens")
          .select("token_mint, creator_wallet, launch_date, created_at")
          .eq("creator_wallet", wallet)
          .limit(250),
      ]);

      const dbMintedTokens: MintedToken[] = (devTokensResponse.data ?? []).map((token: any) => ({
        tokenMint: token.token_mint,
        creatorWallet: token.creator_wallet,
        createdAt: token.launch_date || token.created_at || undefined,
        depth: 0,
        fundingPath: [wallet],
      }));

      if (dbMintedTokens.length > 0) {
        setScanResult({
          parentWallet: wallet,
          totalOffspring: 0,
          totalMinters: 1,
          totalTokensMinted: dbMintedTokens.length,
          allMintedTokens: dbMintedTokens,
          scanDepth: 0,
          scanDuration: 0,
        });
      }

      if (repResponse.data) setDevRep(repResponse.data as unknown as DevReputation);
      if (blResponse.data) setBlacklistEntries(blResponse.data as unknown as BlacklistEntry[]);
      if (meshResponse.data) setMeshLinks(meshResponse.data as unknown as MeshLink[]);

      void genealogyPromise
        .then((genealogyResponse) => {
          const genealogyTree = (genealogyResponse.data as any)?.results?.[0]?.funding_tree;
          if (!genealogyTree) return;

          setScanResult((prev) => {
            const fallback: ScanResult = {
              parentWallet: wallet,
              totalOffspring: 0,
              totalMinters: 1,
              totalTokensMinted: dbMintedTokens.length,
              allMintedTokens: dbMintedTokens,
              scanDepth: 0,
              scanDuration: 0,
            };

            return {
              ...(prev ?? fallback),
              offspringTree: mapGenealogyToOffspring(genealogyTree),
            };
          });
        })
        .catch((genealogyError) => {
          console.warn("wallet-genealogy-scanner background scan failed:", genealogyError);
        });

      void scannerPromise
        .then((scanResponse) => {
          const scanData = (scanResponse.data as ScanResult | null) ?? null;
          if (!scanData) return;

          const mergedTokensMap = new Map<string, MintedToken>();
          for (const token of scanData.allMintedTokens ?? []) {
            mergedTokensMap.set(token.tokenMint, token);
          }
          for (const token of dbMintedTokens) {
            if (!mergedTokensMap.has(token.tokenMint)) {
              mergedTokensMap.set(token.tokenMint, token);
            }
          }

          const mergedTokens = Array.from(mergedTokensMap.values()).sort((a, b) =>
            (b.createdAt || "").localeCompare(a.createdAt || "")
          );

          setScanResult({
            ...scanData,
            allMintedTokens: mergedTokens,
            totalTokensMinted: mergedTokens.length,
            totalMinters: Math.max(scanData.totalMinters, mergedTokens.length > 0 ? 1 : 0),
          });
        })
        .catch((scanError) => {
          console.warn("offspring-mint-scanner background scan failed:", scanError);
        });
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
  const familyWallets = flattenOffspringWallets(scanResult?.offspringTree);
  const relatedWalletCount = Math.max(familyWallets.length - 1, 0);

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

        {/* Wallet Family Tree */}
        {familyWallets.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-white">
              🌳 Wallet Family Tree ({relatedWalletCount} related wallets)
            </h2>
            <div className="bg-gray-900/60 border border-gray-800 rounded-lg overflow-x-auto max-h-80">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800 text-gray-500">
                    <th className="text-left py-2 px-3 w-16">Depth</th>
                    <th className="text-left py-2 px-3">Wallet</th>
                    <th className="text-left py-2 px-3 w-28">Mints</th>
                  </tr>
                </thead>
                <tbody>
                  {familyWallets.map((node, i) => (
                    <tr key={`${node.wallet}-${i}`} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                      <td className="py-2 px-3 text-gray-400">{node.depth}</td>
                      <td className="py-2 px-3">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-white break-all">{node.wallet}</span>
                          <CopyBtn text={node.wallet} />
                          <ExtLink href={`https://solscan.io/account/${node.wallet}`} label="solscan" color="text-blue-400" />
                        </div>
                      </td>
                      <td className="py-2 px-3 text-gray-300">{node.minted}</td>
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
