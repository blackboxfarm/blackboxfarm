import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skull, RefreshCw, FileText, ExternalLink } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

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
  collapse_pct: number | null;
  dollar_wipeout: number | null;
  current_status: string | null;
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

function autoTier(r: DeathRow): 'A' | 'B' | null {
  const ath = r.ath_usd ?? 0;
  const collapse = r.collapse_pct ?? 0;
  if (ath >= 100_000 && collapse >= 0.95 && (r.death_cause === 'rug_pull' || r.death_cause === 'liquidity_pulled')) return 'A';
  if (ath >= 50_000 && r.death_cause && r.death_cause !== 'organic_death') return 'B';
  return null;
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

  async function runAutopsy() {
    setBusy('autopsy');
    const { error } = await supabase.functions.invoke('token-autopsy', { body: { batchSize: 50 } });
    setBusy(null);
    if (error) toast({ title: 'Autopsy failed', description: error.message, variant: 'destructive' });
    else { toast({ title: 'Autopsy run complete' }); load(); }
  }

  async function backfillAth() {
    setBusy('ath');
    const { error } = await supabase.functions.invoke('ath-backfill', { body: { limit: 100 } });
    setBusy(null);
    if (error) toast({ title: 'ATH backfill failed', description: error.message, variant: 'destructive' });
    else { toast({ title: 'ATH backfill complete' }); load(); }
  }

  async function draftAutopsy(r: DeathRow, tier: 'A' | 'B') {
    setBusy(r.token_mint);
    // Insert candidate then trigger writer
    const { data: cand, error: insErr } = await supabase
      .from('autopsy_candidates')
      .upsert({
        token_mint: r.token_mint,
        ticker: r.symbol,
        tier,
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
    else { toast({ title: `Queued as Tier ${tier}` }); load(); }
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
            Active tokens flashing death signals. Mcap &lt; $1k, liq &lt; $500, or ≥95% collapse from $50k+ ATH.
            Sorted by dollar wipeout. Auto-refreshes every 5 min.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={backfillAth} disabled={busy === 'ath'}>
            {busy === 'ath' ? 'Filling ATH…' : 'Backfill ATH (100)'}
          </Button>
          <Button size="sm" variant="outline" onClick={runAutopsy} disabled={busy === 'autopsy'}>
            {busy === 'autopsy' ? 'Diagnosing…' : 'Run Autopsy (50)'}
          </Button>
          <Button size="sm" variant="outline" onClick={load}>
            <RefreshCw className="h-3 w-3 mr-1" /> Reload
          </Button>
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
          No active death candidates. Try Backfill ATH or Run Autopsy to populate signals.
        </Card>
      )}

      <div className="space-y-2">
        {filtered?.map(r => {
          const tier = autoTier(r);
          return (
            <Card key={r.token_mint} className="p-3">
              <div className="flex items-start gap-4 flex-wrap">
                <div className="flex-1 min-w-[200px]">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold">${r.symbol ?? '—'}</span>
                    <span className="text-xs text-muted-foreground truncate max-w-[160px]">{r.name ?? ''}</span>
                    {r.health_grade && (
                      <Badge variant="outline" className="text-[10px]">{r.health_grade} {r.health_score ? `(${r.health_score})` : ''}</Badge>
                    )}
                    {tier === 'A' && <Badge className="text-[10px] bg-destructive">Tier A auto</Badge>}
                    {tier === 'B' && <Badge variant="outline" className="text-[10px] border-amber-500 text-amber-500">Tier B</Badge>}
                    {r.death_cause && (
                      <Badge variant="outline" className="text-[10px]">{r.death_cause} {r.death_confidence ? `· ${r.death_confidence}%` : ''}</Badge>
                    )}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-1 font-mono truncate">
                    {r.token_mint}
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs flex-1 min-w-[400px]">
                  <Stat label="ATH MCap" value={fmtUsd(r.ath_usd)} />
                  <Stat label="Now" value={fmtUsd(r.current_mcap_usd)} />
                  <Stat label="Collapse" value={fmtPct(r.collapse_pct)} accent={r.collapse_pct && r.collapse_pct > 0.9 ? 'text-destructive' : undefined} />
                  <Stat label="Liq" value={fmtUsd(r.liquidity_usd)} />
                  <Stat label="Holders" value={r.holder_count?.toLocaleString() ?? '—'} />
                </div>
                <div className="flex gap-1 flex-wrap">
                  <Button size="sm" variant="default" disabled={busy === r.token_mint}
                    onClick={() => draftAutopsy(r, 'A')}>
                    <FileText className="h-3 w-3 mr-1" /> Tier A
                  </Button>
                  <Button size="sm" variant="outline" disabled={busy === r.token_mint}
                    onClick={() => draftAutopsy(r, 'B')}>
                    Tier B
                  </Button>
                  <Button size="sm" variant="ghost" asChild>
                    <a href={`/holders?token=${r.token_mint}`} target="_blank" rel="noreferrer">
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </Button>
                </div>
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