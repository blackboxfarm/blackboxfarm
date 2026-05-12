import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";

function fmtUsd(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  const v = Number(n);
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}k`;
  if (v >= 1) return `$${v.toFixed(2)}`;
  return `$${v.toFixed(6)}`;
}

const CONF_STYLE: Record<string, string> = {
  high: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
  medium: "bg-amber-500/15 text-amber-300 border-amber-500/40",
  low: "bg-rose-500/15 text-rose-300 border-rose-500/40",
};

const SOURCE_LABEL: Record<string, string> = {
  pumpfun: "pump.fun",
  geckoterminal: "GT",
  birdeye: "Birdeye",
  geckoterminal_ohlcv: "GT",
  dexscreener_floor: "DexScreener",
  pumpfun_api: "pump.fun",
};

/**
 * ATH cell with confidence pip + per-row "Re-verify ATH" button.
 * Prefers the new lifetime ath_alltime_usd, falls back to legacy ath_market_cap_usd,
 * then ath_24h_usd (clearly marked stale).
 */
export function AthCell({ row }: { row: any }) {
  const [loading, setLoading] = useState(false);
  const [override, setOverride] = useState<{ usd: number; source: string; confidence: string } | null>(null);

  const alltime = override?.usd ?? (row.ath_alltime_usd != null ? Number(row.ath_alltime_usd) : null);
  const alltimeSource = override?.source ?? (row.ath_alltime_source as string | null);
  const alltimeConfidence = override?.confidence ?? (row.ath_alltime_confidence as string | null);
  const alltimeAt = row.ath_alltime_captured_at as string | null;

  const legacyMcap = row.ath_market_cap_usd != null ? Number(row.ath_market_cap_usd) : null;
  const legacy24h = row.ath_24h_usd != null ? Number(row.ath_24h_usd) : null;

  const reverify = async () => {
    if (!row.token_mint) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ath-alltime-resolver", {
        body: { tokenMint: row.token_mint },
      });
      if (error) throw error;
      if (data?.athUsd) {
        setOverride({ usd: Number(data.athUsd), source: data.source, confidence: data.confidence });
        toast.success(`ATH: ${fmtUsd(data.athUsd)} · ${data.source} (${data.confidence})`);
      } else {
        toast.error(`No ATH found via resolver chain.`);
      }
    } catch (e: any) {
      toast.error(`ATH re-verify failed: ${e?.message || "unknown"}`);
    } finally {
      setLoading(false);
    }
  };

  // Priority: new ath_alltime > legacy mcap > 24h fallback
  let display: React.ReactNode;
  let tooltip = "";
  if (alltime != null) {
    const sourceLabel = SOURCE_LABEL[alltimeSource || ""] || alltimeSource || "?";
    const confKey = (alltimeConfidence || "medium").toLowerCase();
    display = (
      <div className="flex flex-col gap-0.5">
        <span className="font-medium">{fmtUsd(alltime)}</span>
        <span className="flex items-center gap-1">
          <Badge
            variant="outline"
            className={`px-1 py-0 text-[9px] leading-tight ${CONF_STYLE[confKey] || ""}`}
          >
            {sourceLabel} · {confKey}
          </Badge>
        </span>
      </div>
    );
    tooltip = `Lifetime ATH · source: ${sourceLabel} · confidence: ${confKey}` +
      (alltimeAt ? ` · captured ${new Date(alltimeAt).toLocaleString()}` : "");
  } else if (legacyMcap != null) {
    display = (
      <div className="flex flex-col gap-0.5">
        <span>{fmtUsd(legacyMcap)}</span>
        <Badge variant="outline" className="px-1 py-0 text-[9px] leading-tight opacity-70">
          legacy
        </Badge>
      </div>
    );
    tooltip = `Legacy ATH market cap${row.ath_market_cap_at ? ` · ${new Date(row.ath_market_cap_at).toLocaleString()}` : ""}. Click ↻ to re-verify.`;
  } else if (legacy24h != null) {
    display = (
      <div className="flex flex-col gap-0.5">
        <span className="opacity-70">{fmtUsd(legacy24h)}</span>
        <Badge variant="outline" className="px-1 py-0 text-[9px] leading-tight opacity-60">
          24h only
        </Badge>
      </div>
    );
    tooltip = "Only 24h ATH price recorded — not lifetime. Click ↻ to resolve.";
  } else {
    display = <span className="text-muted-foreground">—</span>;
    tooltip = "No ATH recorded. Click ↻ to resolve.";
  }

  return (
    <div className="flex items-start gap-1">
      <TooltipProvider delayDuration={150}>
        <Tooltip>
          <TooltipTrigger asChild>
            <div>{display}</div>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs max-w-[280px]">
            {tooltip}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <Button
        size="icon"
        variant="ghost"
        className="h-5 w-5 shrink-0"
        onClick={reverify}
        disabled={loading}
        title="Re-verify lifetime ATH (pump.fun → GeckoTerminal → Birdeye)"
      >
        {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
      </Button>
    </div>
  );
}