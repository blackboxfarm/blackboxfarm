import { useState } from "react";
import { ChevronDown, ExternalLink, Copy, Check } from "lucide-react";
import { useWalletMints } from "@/hooks/useLauncherProfiles";
import { toast } from "@/hooks/use-toast";

function fmtDate(d: string | null) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch { return "—"; }
}

export function WalletMintsAccordion({ wallet, rank }: { wallet: string; rank: number }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const { data: mints, isLoading } = useWalletMints(open ? wallet : undefined);

  async function copy(e: React.MouseEvent) {
    e.stopPropagation();
    await navigator.clipboard.writeText(wallet);
    setCopied(true);
    toast({ title: "Copied", description: wallet });
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="rounded bg-muted/40 border border-transparent hover:border-border/60 transition">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full px-2 py-1 flex items-center gap-2 text-left"
      >
        <ChevronDown className={`h-3 w-3 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
        <span className="text-muted-foreground text-[10px] w-8 shrink-0">#{rank}</span>
        <span className="font-mono text-[11px] truncate flex-1">{wallet}</span>
        <button onClick={copy} className="p-1 hover:bg-background rounded" title="Copy">
          {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
        </button>
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