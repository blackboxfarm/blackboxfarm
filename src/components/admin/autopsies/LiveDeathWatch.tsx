import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skull, FileText, CheckCircle2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { runFullAutopsyPipeline } from './runFullAutopsyPipeline';
import PipelineProgressDialog from './PipelineProgressDialog';
import { usePipelineProgress } from './usePipelineProgress';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface DeathRow {
  token_mint: string;
  symbol: string | null;
  name: string | null;
  launchpad: string | null;
  creator_wallet: string | null;
  ath_usd: number | null;
  current_mcap_usd: number | null;
  current_price_usd: number | null;
  liquidity_usd: number | null;
  volume_24h: number | null;
  holder_count: number | null;
  health_grade: string | null;
  health_score: number | null;
  risk_label: string | null;
  death_cause: string | null;
  death_confidence: number | null;
  death_at: string | null;
  ath_at: string | null;
  latest_at: string | null;
  first_seen_at?: string | null;
  collapse_pct: number | null;
  dollar_wipeout: number | null;
  current_status: string | null;
  is_recent: boolean | null;
}

function fmtUsd(n: number | null | undefined): string {
  if (n == null || !isFinite(n)) return '—';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
}
function fmtPct(n: number | null | undefined): string {
  if (n == null) return '—';
  return `${(n * 100).toFixed(0)}%`;
}

function fmtAgo(iso: string | null | undefined): string {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  if (!isFinite(then)) return '—';
  const mins = Math.max(0, Math.floor((Date.now() - then) / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString();
}

function cleanTokenText(value: string | null | undefined, kind: 'symbol' | 'name'): string | null {
  const v = value?.trim();
  if (!v) return null;
  const bad = kind === 'symbol' ? ['unknown', 'unk', 'token'] : ['unknown', 'unknown token', 'token'];
  return bad.includes(v.toLowerCase()) ? null : v;
}

export default function LiveDeathWatch() {
  const { toast } = useToast();
  const [rows, setRows] = useState<DeathRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [causeFilter, setCauseFilter] = useState<string>('all');
  // mint → status of an existing autopsy_candidates row (analyzing/drafted/approved/failed)
  const [processed, setProcessed] = useState<Record<string, { status: string; slug: string | null }>>({});
  const hydratingRef = useRef(false);
  const progress = usePipelineProgress();

  async function load() {
    setRows(null);
    const { data, error } = await (supabase as any)
      .from('v_live_death_watch')
      .select('*')
      .eq('is_recent', true)
      .order('dollar_wipeout', { ascending: false })
      .limit(500);
    if (error) {
      toast({ title: 'Load failed', description: error.message, variant: 'destructive' });
      setRows([]);
      return;
    }
    const list = (data ?? []) as DeathRow[];
    setRows(list);

    // Look up which of these mints already have an autopsy_candidates row so
    // we can lock the "Generate Report" button and tint the card.
    if (list.length > 0) {
      const mints = list.map(r => r.token_mint);
      const { data: cands } = await supabase
        .from('autopsy_candidates')
        .select('token_mint, status, published_slug')
        .in('token_mint', mints);
      const map: Record<string, { status: string; slug: string | null }> = {};
      (cands ?? []).forEach((c: any) => {
        map[c.token_mint] = { status: c.status, slug: c.published_slug ?? null };
      });
      setProcessed(map);
    }

    const missingMetadata = list
      .filter(r => !cleanTokenText(r.symbol, 'symbol') || !cleanTokenText(r.name, 'name'))
      .map(r => r.token_mint);
    if (missingMetadata.length > 0 && !hydratingRef.current) {
      hydratingRef.current = true;
      supabase.functions.invoke('autopsy-live-death-hydrator', { body: { tokenMints: missingMetadata.slice(0, 40) } })
        .then(({ data }) => { if (data?.updated > 0) load(); })
        .catch(() => {})
        .finally(() => { hydratingRef.current = false; });
    }
  }

  useEffect(() => { load(); }, []);
  useEffect(() => {
    const id = window.setInterval(load, 5 * 60 * 1000);
    return () => window.clearInterval(id);
  }, []);

  const filtered = useMemo(() => {
    if (!rows) return null;
    const q = search.trim().toLowerCase();
    return rows.filter(r => {
      if (causeFilter !== 'all' && r.death_cause !== causeFilter) return false;
      if (!q) return true;
      return (
        r.token_mint.toLowerCase().includes(q) ||
        (r.symbol ?? '').toLowerCase().includes(q) ||
        (r.name ?? '').toLowerCase().includes(q)
      );
    });
  }, [rows, search, causeFilter]);

  async function draftAutopsy(r: DeathRow) {
    setBusy(r.token_mint);
    const ticker = cleanTokenText(r.symbol, 'symbol');
    const tokenName = cleanTokenText(r.name, 'name');
    const ageHours = r.first_seen_at ? (Date.now() - new Date(r.first_seen_at).getTime()) / 3600000 : null;
    progress.start(`Generating Autopsy${ticker ? ' — $' + ticker : ''}`);
    const result = await runFullAutopsyPipeline({
      toast,
      onProgress: progress.onProgress,
      upsert: {
        token_mint: r.token_mint,
        ticker,
        token_name: tokenName,
        tier: 'B',
        source_feed: 'live_death_watch',
        candidate_score: Math.round((r.collapse_pct ?? 0) * 100),
        death_confidence: r.death_confidence,
        ath_mcap_usd: r.ath_usd,
        current_mcap_usd: r.current_mcap_usd,
        liquidity_usd: r.liquidity_usd,
        age_hours: ageHours,
        creator_wallet: r.creator_wallet,
      },
    });
    progress.finish(result.ok ? undefined : result.error);
    setBusy(null);
    load();
  }

  const causes = useMemo(() => {
    const set = new Set<string>();
    rows?.forEach(r => { if (r.death_cause) set.add(r.death_cause); });
    return Array.from(set);
  }, [rows]);

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Skull className="h-4 w-4 text-destructive" /> Live Death Watch
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            Tokens that hit $50k+ market cap then died — current mcap &lt; $1k or down ≥95% from ATH,
            with a price snapshot in the last 24h. Older deaths roll into the Cool Deaths Backlog.
            Sorted by dollar wipeout. Refreshes every 5 min.
          </p>
          <div className="mt-2 rounded border border-border/60 bg-muted/30 p-2 text-[11px] text-muted-foreground">
            <span className="font-semibold text-foreground">Generate Report</span> — Queues the token as a Tier B candidate (review state) and drafts a full autopsy via <code>autopsy-writer</code>. Approve / promote to Tier A from the Queue when ready to auto-publish.
          </div>
        </div>
      </header>

      <div className="flex gap-2 flex-wrap items-center">
        <Input
          placeholder="Search ticker, name, or mint…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="h-8 max-w-xs text-xs"
        />
        <Button
          size="sm"
          variant={causeFilter === 'all' ? 'default' : 'outline'}
          onClick={() => setCauseFilter('all')}
        >
          All causes
        </Button>
        {causes.map(c => (
          <Button
            key={c}
            size="sm"
            variant={causeFilter === c ? 'default' : 'outline'}
            onClick={() => setCauseFilter(c)}
          >
            {c}
          </Button>
        ))}
        <span className="text-xs text-muted-foreground ml-auto">
          {filtered ? `${filtered.length} rows` : ''}
        </span>
      </div>

      {filtered === null && (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      )}

      {filtered && filtered.length === 0 && (
        <Card className="p-8 text-center text-muted-foreground text-sm">
          No tokens currently meet the death threshold (≥$50k ATH and collapsed). The price-history pipeline will surface new candidates as they collapse.
        </Card>
      )}

      <div className="space-y-2">
        {filtered?.map(r => {
          const symbol = cleanTokenText(r.symbol, 'symbol');
          const name = cleanTokenText(r.name, 'name');
          const deathAt = r.death_at ?? r.latest_at;
          const proc = processed[r.token_mint];
          const isProcessed = !!proc;
          const isLocked = isProcessed && proc.status !== 'failed';
          return (
            <Card
              key={r.token_mint}
              className={`p-3 transition-colors ${isLocked ? 'bg-muted/40 border-primary/30 opacity-80' : ''}`}
            >
              <div className="flex items-start gap-4 flex-wrap">
                <div className="flex-1 min-w-[200px]">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold">{symbol ? `$${symbol}` : 'Resolving ticker…'}</span>
                    {name && <span className="text-xs text-muted-foreground truncate max-w-[160px]">{name}</span>}
                    {r.health_grade && (
                      <Badge variant="outline" className="text-[10px]">{r.health_grade} {r.health_score ? `(${r.health_score})` : ''}</Badge>
                    )}
                    {r.death_cause && (
                      <Badge variant="outline" className="text-[10px]">{r.death_cause} {r.death_confidence ? `· ${r.death_confidence}%` : ''}</Badge>
                    )}
                    {isProcessed && (
                      <Badge
                        variant={proc.status === 'approved' ? 'default' : proc.status === 'failed' ? 'destructive' : 'secondary'}
                        className="text-[10px] gap-1"
                      >
                        <CheckCircle2 className="h-3 w-3" /> {proc.status}
                      </Badge>
                    )}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-1 font-mono truncate">
                    <a
                      href={`https://dexscreener.com/solana/${r.token_mint}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-primary underline-offset-2 hover:underline"
                      title="Open on DexScreener"
                    >
                      {r.token_mint}
                    </a>
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                    <span title={fmtDate(r.ath_at)}>📈 ATH: {fmtAgo(r.ath_at)}</span>
                    <span title={fmtDate(deathAt)} className="text-destructive">💀 Dead: {fmtAgo(deathAt)}</span>
                    <span title={fmtDate(r.latest_at)}>🕒 Last price: {fmtAgo(r.latest_at)}</span>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-6 gap-3 text-xs flex-1 min-w-[400px]">
                  <Stat label="ATH MCap" value={fmtUsd(r.ath_usd)} />
                  <Stat label="Now" value={fmtUsd(r.current_mcap_usd)} />
                  <Stat label="Collapse" value={fmtPct(r.collapse_pct)} accent={r.collapse_pct && r.collapse_pct > 0.9 ? 'text-destructive' : undefined} />
                  <Stat label="Liq" value={fmtUsd(r.liquidity_usd)} />
                  <Stat label="24h Vol" value={fmtUsd(r.volume_24h)} />
                  <Stat label="Holders" value={r.holder_count?.toLocaleString() ?? '—'} />
                </div>
                <TooltipProvider delayDuration={200}>
                  <div className="flex gap-1 flex-wrap">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="sm"
                          variant={isLocked ? 'outline' : 'default'}
                          disabled={busy === r.token_mint || isLocked}
                          onClick={() => draftAutopsy(r)}
                        >
                          <FileText className="h-3 w-3 mr-1" />
                          {isLocked ? (proc.status === 'approved' ? 'Published' : proc.status === 'drafted' ? 'Drafted' : proc.status === 'analyzing' ? 'Analyzing…' : 'Queued') : 'Generate Report'}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs text-xs">
                        {isLocked
                          ? `Already in the autopsy pipeline (status: ${proc.status}). Manage from the Drafts / Published tabs.`
                          : 'Queues this token as a Tier B candidate and drafts a full autopsy report. Promote to Tier A in the Queue to auto-publish.'}
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </TooltipProvider>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`font-mono ${accent ?? ''}`}>{value}</div>
    </div>
  );
}