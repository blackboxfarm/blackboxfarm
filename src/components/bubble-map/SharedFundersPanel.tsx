import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Loader2, Users, ChevronDown, ChevronRight, ExternalLink, AlertTriangle } from 'lucide-react';

interface SiblingToken {
  mint: string;
  symbol: string | null;
  creator: string;
  peak_multiplier: number | null;
}

interface SharedFunder {
  funder: string;
  depth_in_chain: number;
  siblings_count: number;
  sibling_creators: string[];
  sibling_tokens: SiblingToken[];
  cluster_label: 'tight_cluster' | 'likely_dev_family' | 'wide_funder' | 'infra_router';
}

interface KycTerminus {
  wallet: string;
  cex_name: string;
  depth: number;
}

interface Response {
  creator: string;
  ancestors_walked?: number;
  kyc_terminus?: KycTerminus | null;
  shared_funders: SharedFunder[];
  message?: string;
}

const labelMeta: Record<SharedFunder['cluster_label'], { color: string; text: string }> = {
  tight_cluster: { color: 'bg-amber-500/20 text-amber-300 border-amber-500/40', text: 'Tight Cluster' },
  likely_dev_family: { color: 'bg-rose-500/20 text-rose-300 border-rose-500/40', text: 'Likely Dev Family' },
  wide_funder: { color: 'bg-muted text-muted-foreground border-border', text: 'Wide Funder' },
  infra_router: { color: 'bg-destructive/20 text-destructive border-destructive/40', text: 'Public Router (ignore)' },
};

export function SharedFundersPanel({ creatorWallet }: { creatorWallet: string | null }) {
  const [data, setData] = useState<Response | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    if (!creatorWallet) { setData(null); return; }
    let cancelled = false;
    setLoading(true);
    setError(null);
    supabase.functions.invoke('mesh-shared-funders', { body: { wallet: creatorWallet } })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) { setError(error.message); return; }
        setData(data as Response);
      })
      .catch((e) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [creatorWallet]);

  if (!creatorWallet) return null;

  return (
    <Card className="border-primary/20 bg-card/80 backdrop-blur">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          Shared Funders / Dev-Family Lens
          {data?.shared_funders && data.shared_funders.length > 0 && (
            <Badge variant="secondary" className="ml-auto text-[10px]">
              {data.shared_funders.length} cluster{data.shared_funders.length === 1 ? '' : 's'}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {loading && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Walking funding chain...
          </div>
        )}
        {error && (
          <div className="text-xs text-destructive flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" /> {error}
          </div>
        )}
        {data?.kyc_terminus && (
          <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 flex items-center gap-2">
            <span className="text-base">🏦</span>
            <div className="flex flex-col">
              <span className="text-[10px] uppercase tracking-wide text-emerald-300/80">KYC Root</span>
              <span className="text-sm font-semibold text-emerald-200">
                {data.kyc_terminus.cex_name}
              </span>
            </div>
            <span className="ml-auto text-[10px] text-emerald-300/70">
              hop {data.kyc_terminus.depth} · <code className="font-mono">{data.kyc_terminus.wallet.slice(0, 6)}…{data.kyc_terminus.wallet.slice(-4)}</code>
            </span>
          </div>
        )}
        {data && !data.kyc_terminus && data.shared_funders.length > 0 && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
            ⚠ Trail did not reach a known exchange yet — collaboration clusters below may still be valuable.
          </div>
        )}
        {data && data.shared_funders.length === 0 && (
          <div className="text-xs text-muted-foreground">
            {data.message || 'No collaboration clusters detected for this creator.'}
          </div>
        )}
        {data && data.shared_funders.length > 0 && (
          <>
            <p className="text-[11px] text-muted-foreground leading-snug">
              Wallets in this creator's funding chain that <strong>also</strong> bankrolled other token creators.
              The same hand often = same operator running multiple mints.
            </p>
            {data.shared_funders.map((f) => (
              <FunderCard key={f.funder} funder={f} />
            ))}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function FunderCard({ funder }: { funder: SharedFunder }) {
  const [open, setOpen] = useState(false);
  const meta = labelMeta[funder.cluster_label];
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button className="w-full text-left rounded-md border border-border/60 bg-background/40 hover:bg-background/70 px-3 py-2 transition-colors">
          <div className="flex items-center gap-2">
            {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            <code className="text-[11px] font-mono">
              {funder.funder.slice(0, 6)}…{funder.funder.slice(-4)}
            </code>
            <Badge variant="outline" className={`text-[10px] ${meta.color}`}>{meta.text}</Badge>
            <span className="ml-auto text-[10px] text-muted-foreground">
              hop {funder.depth_in_chain} · {funder.siblings_count} siblings
            </span>
          </div>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="px-3 pt-2 pb-3 space-y-2">
        {funder.sibling_tokens.length > 0 ? (
          <div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
              Top sibling tokens
            </div>
            <ul className="space-y-1">
              {funder.sibling_tokens.map((t) => (
                <li key={t.mint} className="flex items-center gap-2 text-[11px]">
                  <span className="font-semibold">${t.symbol || t.mint.slice(0, 6)}</span>
                  {t.peak_multiplier != null && (
                    <Badge variant="secondary" className="text-[9px]">
                      {t.peak_multiplier.toFixed(1)}x peak
                    </Badge>
                  )}
                  <a
                    href={`/bubble?token=${t.mint}`}
                    target="_blank"
                    rel="noreferrer"
                    className="ml-auto text-primary hover:underline inline-flex items-center gap-0.5"
                  >
                    open <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="text-[10px] text-muted-foreground italic">
            Sibling creators detected, but no tokens yet indexed in our watchlists.
          </div>
        )}
        <div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
            Other creators funded ({Math.min(funder.sibling_creators.length, 20)})
          </div>
          <div className="flex flex-wrap gap-1">
            {funder.sibling_creators.slice(0, 12).map((c) => (
              <code key={c} className="text-[10px] font-mono bg-muted/50 rounded px-1.5 py-0.5">
                {c.slice(0, 4)}…{c.slice(-4)}
              </code>
            ))}
            {funder.sibling_creators.length > 12 && (
              <span className="text-[10px] text-muted-foreground">+{funder.sibling_creators.length - 12} more</span>
            )}
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}