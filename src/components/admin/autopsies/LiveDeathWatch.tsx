import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skull, FileText, ArrowUpCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
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
  holder_count: number | null;
  health_grade: string | null;
  health_score: number | null;
  risk_label: string | null;
  death_cause: string | null;
  death_confidence: number | null;
  death_at: string | null;
  ath_at: string | null;
  latest_at: string | null;
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

function shortMint(m: string): string {
  if (!m) return '—';
  return `${m.slice(0, 4)}…${m.slice(-4)}`;
}

export default function LiveDeathWatch() {
  const { toast } = useToast();
  const [rows, setRows] = useState<DeathRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [causeFilter, setCauseFilter] = useState<string>('all');

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
    setRows((data ?? []) as DeathRow[]);
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
    // All candidates start at Tier B (review state). Promotion to Tier A
    // (auto-publish) is a separate manual step elsewhere.
    const { data: cand, error: insErr } = await supabase
      .from('autopsy_candidates')
      .upsert({
        token_mint: r.token_mint,
        ticker: r.symbol,
        tier: 'B',
        source_feed: 'live_death_watch',
        candidate_score: Math.round((r.collapse_pct ?? 0) * 100),
        funneled_at: new Date().toISOString(),
        status: 'pending',
      }, { onConflict: 'token_mint' })
      .select('id')
      .single();
    if (insErr || !cand) {
      setBusy(null);
      toast({ title: 'Queue failed', description: insErr?.message, variant: 'destructive' });
      return;
    }
    const { error: wErr } = await supabase.functions.invoke('autopsy-writer', { body: { candidate_id: cand.id } });
    setBusy(null);
    if (wErr) toast({ title: 'Writer failed', description: wErr.message, variant: 'destructive' });
    else { toast({ title: 'Report drafting started' }); load(); }
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
          return (
            <Card key={r.token_mint} className="p-3">
              <div className="flex items-start gap-4 flex-wrap">
                <div className="flex-1 min-w-[200px]">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold">{r.symbol ? `$${r.symbol}` : shortMint(r.token_mint)}</span>
                    <span className="text-xs text-muted-foreground truncate max-w-[160px]">{r.name ?? ''}</span>
                    {r.health_grade && (
                      <Badge variant="outline" className="text-[10px]">{r.health_grade} {r.health_score ? `(${r.health_score})` : ''}</Badge>
                    )}
                    {r.death_cause && (
                      <Badge variant="outline" className="text-[10px]">{r.death_cause} {r.death_confidence ? `· ${r.death_confidence}%` : ''}</Badge>
                    )}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-1 font-mono truncate">
                    {r.token_mint}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                    <span title={fmtDate(r.ath_at)}>📈 ATH: {fmtAgo(r.ath_at)}</span>
                    <span title={fmtDate(r.death_at)} className="text-destructive">💀 Died: {fmtAgo(r.death_at) }{r.death_at ? '' : ' (no death event yet)'}</span>
                    <span title={fmtDate(r.latest_at)}>🕒 Last price: {fmtAgo(r.latest_at)}</span>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs flex-1 min-w-[400px]">
                  <Stat label="ATH MCap" value={fmtUsd(r.ath_usd)} />
                  <Stat label="Now" value={fmtUsd(r.current_mcap_usd)} />
                  <Stat label="Collapse" value={fmtPct(r.collapse_pct)} accent={r.collapse_pct && r.collapse_pct > 0.9 ? 'text-destructive' : undefined} />
                  <Stat label="Liq" value={fmtUsd(r.liquidity_usd)} />
                  <Stat label="Holders" value={r.holder_count?.toLocaleString() ?? '—'} />
                </div>
                <TooltipProvider delayDuration={200}>
                  <div className="flex gap-1 flex-wrap">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button size="sm" variant="default" disabled={busy === r.token_mint}
                          onClick={() => draftAutopsy(r)}>
                          <FileText className="h-3 w-3 mr-1" /> Generate Report
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs text-xs">
                        Queues this token as a Tier B candidate and drafts a full autopsy report. Promote to Tier A in the Queue to auto-publish.
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