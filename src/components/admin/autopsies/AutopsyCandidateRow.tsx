import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import {
  RefreshCw, CheckCircle2, XCircle, Clock, Image as ImageIcon,
  ExternalLink, Copy, Check,
} from "lucide-react";
import { useState } from "react";
import { formatAgeHours } from "@/lib/utils";
import { SOURCE_FEED_LABELS } from "@/data/autopsyTaxonomy";

export interface Candidate {
  id: string;
  token_mint: string;
  ticker: string | null;
  token_name: string | null;
  source_feed: string;
  candidate_score: number;
  death_cause: string | null;
  death_intent: string | null;
  death_confidence: number | null;
  tier: string | null;
  status: string;
  ath_mcap_usd: number | null;
  current_mcap_usd: number | null;
  age_hours: number | null;
  funneled_at: string;
  analyzed_at?: string | null;
  published_slug: string | null;
  bonding_curve_pct?: number | null;
}

const TIER_COLORS: Record<string, string> = {
  A: "bg-destructive/15 text-destructive border-destructive/30",
  B: "bg-amber-500/15 text-amber-500 border-amber-500/30",
  C: "bg-muted text-muted-foreground border-border",
};

const STATUS_ICON: Record<string, React.ReactNode> = {
  pending: <Clock className="h-3 w-3" />,
  analyzing: <RefreshCw className="h-3 w-3 animate-spin" />,
  drafted: <CheckCircle2 className="h-3 w-3 text-amber-500" />,
  approved: <CheckCircle2 className="h-3 w-3 text-emerald-500" />,
  published: <CheckCircle2 className="h-3 w-3 text-emerald-500" />,
  rejected: <XCircle className="h-3 w-3 text-destructive" />,
  failed: <XCircle className="h-3 w-3 text-destructive" />,
};

const SOURCE_BADGE_COLOR: Record<string, string> = {
  token_lifecycle: "bg-sky-500/15 text-sky-400 border-sky-500/30",
  pumpfun_curve_death: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  pumpfun_watchlist: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  ath_collapsed: "bg-fuchsia-500/15 text-fuchsia-400 border-fuchsia-500/30",
  admin_manual: "bg-primary/15 text-primary border-primary/30",
};

function curveBadgeColor(pct: number | null | undefined): string {
  if (pct == null) return "bg-muted text-muted-foreground border-border";
  if (pct >= 90) return "bg-yellow-500/15 text-yellow-400 border-yellow-500/30"; // gold
  if (pct >= 80) return "bg-zinc-400/15 text-zinc-300 border-zinc-400/30";       // silver
  return "bg-orange-700/15 text-orange-400 border-orange-700/30";                 // bronze
}

interface Props {
  ordinal: number;
  c: Candidate;
  busy: string | null;
  onDraft: (id: string) => void;
  onDecide: (id: string, d: "approved" | "rejected") => void;
  onRegenBanner: (c: Candidate) => void;
}

export default function AutopsyCandidateRow({ ordinal, c, busy, onDraft, onDecide, onRegenBanner }: Props) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const sourceMeta = SOURCE_FEED_LABELS[c.source_feed] ?? { label: c.source_feed, description: "Unknown intake source." };
  const dexUrl = `https://dexscreener.com/solana/${c.token_mint}`;
  const pumpFunUrl = `https://pump.fun/coin/${c.token_mint}`;
  const isCurveDeath = c.source_feed === 'pumpfun_curve_death' || c.source_feed === 'pumpfun_watchlist';

  async function copyMint() {
    try {
      await navigator.clipboard.writeText(c.token_mint);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  }

  return (
    <Card className="p-4 flex items-start gap-3 flex-wrap">
      <div className="text-xs font-mono text-muted-foreground pt-0.5 min-w-[2.5rem]">#{ordinal}</div>

      <div className="flex flex-col gap-2 min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          {c.tier && <Badge variant="outline" className={TIER_COLORS[c.tier]}>{c.tier}</Badge>}
          <Badge variant="outline" className="text-[10px]">
            {c.status} {STATUS_ICON[c.status]}
          </Badge>
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="outline" className={`text-[10px] ${SOURCE_BADGE_COLOR[c.source_feed] ?? ""}`}>
                  {sourceMeta.label}
                </Badge>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p className="text-xs">{sourceMeta.description}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <span className="font-semibold text-sm truncate">
            {c.ticker ?? "?"}{c.token_name && c.token_name !== c.ticker ? ` · ${c.token_name}` : ""}
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <a
            href={dexUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-xs text-primary hover:underline break-all inline-flex items-center gap-1"
            title="Open on DexScreener"
          >
            {c.token_mint}
            <ExternalLink className="h-3 w-3 flex-shrink-0" />
          </a>
          {isCurveDeath && (
            <a
              href={pumpFunUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-emerald-400 hover:underline inline-flex items-center gap-1"
              title="Open on pump.fun"
            >
              pump.fun <ExternalLink className="h-2.5 w-2.5" />
            </a>
          )}
          <button
            onClick={copyMint}
            className="text-muted-foreground hover:text-foreground transition-colors"
            title="Copy mint address"
          >
            {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
          </button>
        </div>

        <div className="text-xs text-muted-foreground flex flex-wrap gap-x-2 gap-y-0.5">
          <span>{c.death_cause ?? "unclassified"}</span>
          <span>· conf {c.death_confidence ?? "?"}</span>
          <span>· score {c.candidate_score}</span>
          {c.bonding_curve_pct != null && (
            <Badge variant="outline" className={`text-[10px] ${curveBadgeColor(c.bonding_curve_pct)}`}>
              ATH curve {Math.round(c.bonding_curve_pct)}%
            </Badge>
          )}
          {c.ath_mcap_usd ? <span>· ATH ${Math.round(c.ath_mcap_usd).toLocaleString()}</span> : null}
          {c.age_hours != null ? <span>· {formatAgeHours(c.age_hours)} old</span> : null}
          <span>· funneled {format(new Date(c.funneled_at), "MMM d HH:mm")}</span>
        </div>
      </div>

      <div className="flex gap-1 flex-wrap">
        {c.published_slug && (
          <Link to={`/autopsy/${c.published_slug}`}>
            <Button size="sm" variant="ghost">View</Button>
          </Link>
        )}
        {c.status === "pending" && (
          <Button size="sm" variant="outline" onClick={() => onDraft(c.id)} disabled={busy === c.id}>
            {busy === c.id ? "…" : "Draft"}
          </Button>
        )}
        {c.status === "drafted" && (
          <>
            <Button size="sm" onClick={() => onDecide(c.id, "approved")} disabled={busy === c.id}>Approve</Button>
            <Button size="sm" variant="ghost" onClick={() => onDecide(c.id, "rejected")} disabled={busy === c.id}>Reject</Button>
          </>
        )}
        {c.published_slug && ["drafted", "approved", "published"].includes(c.status) && (
          <Button size="sm" variant="ghost" onClick={() => onRegenBanner(c)} disabled={busy === c.id} title="Regenerate banner overlay">
            <ImageIcon className="h-3 w-3 mr-1" /> Banner
          </Button>
        )}
      </div>
    </Card>
  );
}