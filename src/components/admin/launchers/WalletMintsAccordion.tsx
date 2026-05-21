import { useState } from "react";
import { ChevronDown, ExternalLink, Copy, Check, RefreshCw, Circle, Search } from "lucide-react";
import { useWalletMints, useToggleExcludedWallet, invokeTokenEnricher } from "@/hooks/useLauncherProfiles";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

function fmtDate(d: string | null) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch { return "—"; }
}

export function WalletMintsAccordion({
  wallet,
  rank,
  profileId,
  excluded,
  excludedWallets,
}: {
  wallet: string;
  rank: number;
  profileId: string;
  excluded: boolean;
  excludedWallets: string[];
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [refreshing, setRefreshing] = useState<string | null>(null);
  const qc = useQueryClient();
  const toggleExclude = useToggleExcludedWallet();
  const { data: mints, isLoading, refetch } = useWalletMints(open ? wallet : undefined);

  async function copy(e: React.MouseEvent) {
    e.stopPropagation();
    await navigator.clipboard.writeText(wallet);
    setCopied(true);
    toast({ title: "Copied", description: wallet });
    setTimeout(() => setCopied(false), 1500);
  }

  async function refreshMint(mint: string, e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    setRefreshing(mint);
    try {
      const result = await invokeTokenEnricher({ mint, launcherProfileId: profileId });
      if (result?.token) {
        qc.setQueryData(["wallet-mints", wallet], (rows: any[] | undefined) =>
          (rows || []).map((row) => row.mint_address === mint ? {
            ...row,
            symbol: result.token.symbol ?? row.symbol,
            name: result.token.name ?? row.name,
            image: result.token.image ?? row.image,
          } : row)
        );
      }
      await refetch();
      qc.invalidateQueries({ queryKey: ["launcher-mint-events", profileId] });
      toast({ title: "Refreshed", description: mint.slice(0, 8) + "…" });
    } catch (err: any) {
      toast({ title: "Refresh failed", description: err?.message, variant: "destructive" });
    } finally {
      setRefreshing(null);
    }
  }

  return (
    <div className={`rounded bg-muted/40 border border-transparent hover:border-border/60 transition ${excluded ? "opacity-60" : ""}`}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full px-2 py-1 flex items-center gap-2 text-left"
      >
        <ChevronDown className={`h-3 w-3 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
        <span className="text-muted-foreground text-[10px] w-8 shrink-0">#{rank}</span>
        <span className="font-mono text-[11px] truncate flex-1">{wallet}</span>
        <span
          onClick={(e) => { e.stopPropagation(); toggleExclude.mutate({ profileId, wallet, excluded: !excluded, current: excludedWallets }); }}
          className="flex items-center gap-1"
          title={excluded ? "Excluded from polling — click to include" : "Included in polling — click to exclude"}
        >
          <Switch checked={!excluded} onCheckedChange={() => { /* handled by span click */ }} className="scale-75" />
        </span>
        <button onClick={copy} className="p-1 hover:bg-background rounded" title="Copy">
          {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
        </button>
        <a
          href={`https://blackbox.farm/bubblemap?wallet=${wallet}`}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="p-1 hover:bg-background rounded"
          title="Wallet search on Blackbox"
        >
          <Search className="h-3 w-3" />
        </a>
        <a
          href={`https://solscan.io/account/${wallet}`}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="p-1 hover:bg-background rounded"
          title="Solscan"
        >
          <ExternalLink className="h-3 w-3" />
        </a>
      </button>

      {open && (
        <div className="px-3 pb-2 pt-1 border-t border-border/40">
          {isLoading && <div className="text-[11px] text-muted-foreground py-2">Loading mints…</div>}
          {!isLoading && !mints?.length && (
            <div className="text-[11px] text-muted-foreground py-2">No known mints from this wallet.</div>
          )}
          {!isLoading && !!mints?.length && (
            <div className="space-y-1 py-1">
              {mints.map((m) => (
                <div key={m.mint_address} className="flex items-center gap-2 text-[11px] py-1 px-1 rounded hover:bg-background/60">
                  {m.image ? (
                    <img src={m.image} alt="" className="w-6 h-6 rounded-full object-cover shrink-0" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-muted shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {m.symbol ? (
                        <span className="font-semibold">${m.symbol}</span>
                      ) : (
                        <span className="text-muted-foreground italic">unknown</span>
                      )}
                      {m.name && <span className="text-muted-foreground truncate">{m.name}</span>}
                    </div>
                    <div className="font-mono text-[10px] text-muted-foreground truncate">{m.mint_address}</div>
                  </div>
                  <span className="text-muted-foreground whitespace-nowrap">{fmtDate(m.mint_date)}</span>
                  <button
                    onClick={(e) => refreshMint(m.mint_address, e)}
                    disabled={refreshing === m.mint_address}
                    className="p-1 hover:bg-background rounded disabled:opacity-50"
                    title="Fetch ticker/image/links from DexScreener + Helius"
                  >
                    <RefreshCw className={`h-3 w-3 ${refreshing === m.mint_address ? "animate-spin" : ""}`} />
                  </button>
                  <a
                    href={`https://blackbox.farm/bubblemap?token=${m.mint_address}`}
                    target="_blank"
                    rel="noreferrer"
                    className="p-1 hover:bg-background rounded"
                    title="Open Bubble Map"
                  >
                    <Circle className="h-3 w-3 fill-primary/40" />
                  </a>
                  <a href={`https://dexscreener.com/solana/${m.mint_address}`} target="_blank" rel="noreferrer" className="p-1 hover:bg-background rounded" title="DexScreener">
                    <img src="/assets/dextools-logo.svg" alt="dex" className="w-3 h-3" onError={(e) => { (e.currentTarget as HTMLImageElement).outerHTML = '🔥'; }} />
                  </a>
                  <a href={`https://solscan.io/token/${m.mint_address}`} target="_blank" rel="noreferrer" className="p-1 hover:bg-background rounded" title="Solscan">
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}