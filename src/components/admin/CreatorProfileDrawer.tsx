/**
 * CreatorProfileDrawer
 *
 * Opens beside the Wallet Cross-Links panel and shows the fused Creator
 * Profile for whatever signal you searched (wallet, X handle, TG ID,
 * Discord ID, KYC root, website domain).
 *
 * Powered by the `creator-profile-lookup` edge function.
 */

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Loader2, ExternalLink, Wallet, AtSign, Send, Globe, Hash, Building2, GitMerge } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Pre-resolved query: e.g. "@somehandle" or a wallet address. */
  query: string | null;
}

const KIND_ICON: Record<string, JSX.Element> = {
  wallet: <Wallet className="h-3.5 w-3.5" />,
  kyc_root: <Building2 className="h-3.5 w-3.5" />,
  x_user_id: <AtSign className="h-3.5 w-3.5" />,
  x_handle: <AtSign className="h-3.5 w-3.5" />,
  telegram_user_id: <Send className="h-3.5 w-3.5" />,
  telegram_handle: <Send className="h-3.5 w-3.5" />,
  discord_id: <Hash className="h-3.5 w-3.5" />,
  discord_handle: <Hash className="h-3.5 w-3.5" />,
  website_domain: <Globe className="h-3.5 w-3.5" />,
};

export default function CreatorProfileDrawer({ open, onOpenChange, query }: Props) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !query) return;
    setLoading(true);
    setData(null);
    setError(null);
    supabase.functions
      .invoke("creator-profile-lookup", { body: { query } })
      .then(({ data, error }) => {
        if (error) {
          setError(error.message);
        } else if (data?.ok === false) {
          setError(data.error || "Lookup failed");
        } else {
          setData(data);
        }
      })
      .catch((e) => setError(e?.message || String(e)))
      .finally(() => setLoading(false));
  }, [open, query]);

  const verdictColor =
    data?.stats?.verdict === "green" ? "bg-green-500/20 text-green-400 border-green-500/40" :
    data?.stats?.verdict === "red" ? "bg-red-500/20 text-red-400 border-red-500/40" :
    data?.stats?.verdict === "mixed" ? "bg-amber-500/20 text-amber-400 border-amber-500/40" :
    "bg-muted text-muted-foreground";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 flex-wrap">
            Creator Profile
            {data?.found && data.stats?.verdict && (
              <Badge className={verdictColor}>{data.stats.verdict.toUpperCase()}</Badge>
            )}
          </SheetTitle>
          <SheetDescription>
            Searched: <span className="font-mono text-foreground">{query}</span>
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          {loading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Resolving fused identity…
            </div>
          )}

          {error && (
            <div className="text-sm text-destructive border border-destructive/40 rounded p-3">
              {error}
            </div>
          )}

          {!loading && data && !data.found && (
            <div className="text-sm text-muted-foreground border border-dashed rounded p-4">
              No Creator Profile found for this signal yet. It hasn't been seen
              by the fusion engine — check back after the next backfill or
              token-discovery pass.
            </div>
          )}

          {data?.found && (
            <>
              {/* Identity card */}
              <div className="border rounded-md p-3 bg-muted/20 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-semibold">
                    {data.profile?.display_name || (
                      <span className="font-mono text-xs text-muted-foreground">
                        {data.profile?.master_wallet_address?.slice(0, 6)}…
                        {data.profile?.master_wallet_address?.slice(-4)}
                      </span>
                    )}
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {data.stats.totalAliases} aliases
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground grid grid-cols-2 gap-x-4 gap-y-1">
                  <div>Wallets: <strong className="text-foreground">{data.stats.totalWallets}</strong></div>
                  <div>Tokens: <strong className="text-foreground">{data.stats.totalTokens}</strong></div>
                  <div>Winners (≥3x): <strong className="text-green-400">{data.stats.winners}</strong></div>
                  <div>Rugs: <strong className="text-red-400">{data.stats.rugs}</strong></div>
                </div>
              </div>

              {/* Aliases */}
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
                  Identity Signals
                </div>
                <div className="space-y-1.5">
                  {data.aliases.map((a: any, i: number) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span className="text-muted-foreground">{KIND_ICON[a.alias_kind] || null}</span>
                      <span className="text-muted-foreground w-32 shrink-0">{a.alias_kind}</span>
                      <span className="font-mono truncate">{a.alias_value}</span>
                      <Badge variant="outline" className="ml-auto text-[10px]">{a.confidence}%</Badge>
                    </div>
                  ))}
                </div>
              </div>

              {/* Tokens */}
              {data.tokens.length > 0 && (
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
                    Tokens ({data.tokens.length})
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {data.tokens.map((t: any) => (
                      <a
                        key={t.token_mint}
                        href={`/bubble?token=${t.token_mint}`}
                        target="_blank"
                        rel="noreferrer"
                        className={`px-2 py-1 rounded text-xs border transition-colors hover:opacity-80 ${
                          t.is_rugged ? "bg-red-500/10 border-red-500/30 text-red-400"
                          : t.peak_multiplier >= 5 ? "bg-green-500/10 border-green-500/30 text-green-400"
                          : t.peak_multiplier >= 2 ? "bg-cyan-500/10 border-cyan-500/30 text-cyan-400"
                          : "bg-muted/50 border-border text-muted-foreground"
                        }`}
                        title={`${t.token_symbol || t.token_mint} — peak ${t.peak_multiplier}x`}
                      >
                        {t.token_symbol || t.token_mint.slice(0, 4)} · {t.peak_multiplier}x
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Merge history */}
              {data.mergeHistory.length > 0 && (
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1">
                    <GitMerge className="h-3 w-3" /> Absorbed Identities ({data.mergeHistory.length})
                  </div>
                  <div className="space-y-1.5 text-xs">
                    {data.mergeHistory.map((m: any, i: number) => (
                      <div key={i} className="border rounded p-2 bg-muted/10">
                        <div className="font-mono text-muted-foreground">{m.absorbed_id.slice(0, 8)}…</div>
                        <div className="text-muted-foreground">
                          merged via <span className="text-foreground">{m.trigger_kind}</span> = {m.trigger_value}
                        </div>
                        <div className="text-[10px] text-muted-foreground/70">
                          {new Date(m.created_at).toLocaleString()} · {m.triggered_by}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {data.profile?.master_wallet_address && (
                <a
                  href={`https://solscan.io/account/${data.profile.master_wallet_address}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-primary inline-flex items-center gap-1 hover:underline"
                >
                  Master wallet on Solscan <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
