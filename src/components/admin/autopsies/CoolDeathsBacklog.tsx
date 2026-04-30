import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Archive, FileText, ExternalLink, Lock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface BacklogRow {
  token_mint: string;
  symbol: string | null;
  name: string | null;
  launchpad: string | null;
  creator_wallet: string | null;
  ath_usd: number | null;
  current_mcap_usd: number | null;
  liquidity_usd: number | null;
  holder_count: number | null;
  death_cause: string | null;
  death_confidence: number | null;
  death_at: string | null;
  collapse_pct: number | null;
  drafted_slug: string | null;
  drafted_at: string | null;
  is_frozen: boolean;
  captured_at: string;
}

function fmtUsd(n: number | null | undefined): string {
  if (n == null || !isFinite(n)) return '—';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
}

export default function CoolDeathsBacklog() {
  const { toast } = useToast();
  const [rows, setRows] = useState<BacklogRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  async function load() {
    setRows(null);
    const { data, error } = await supabase
      .from('autopsy_backlog')
      .select('*')
      .order('ath_usd', { ascending: false })
      .limit(500);
    if (error) {
      toast({ title: 'Load failed', description: error.message, variant: 'destructive' });
      setRows([]);
      return;
    }
    setRows((data ?? []) as BacklogRow[]);
  }

  // Auto-build once on first mount if backlog is empty, then load.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { count } = await supabase
        .from('autopsy_backlog')
        .select('token_mint', { count: 'exact', head: true });
      if (cancelled) return;
      if ((count ?? 0) === 0) {
        await supabase.functions.invoke('autopsy-backlog-builder', { body: { force: false, limit: 500 } });
      }
      if (!cancelled) load();
    })();
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    if (!rows) return null;
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r =>
      r.token_mint.toLowerCase().includes(q) ||
      (r.symbol ?? '').toLowerCase().includes(q) ||
      (r.name ?? '').toLowerCase().includes(q),
    );
  }, [rows, search]);

  async function draftAutopsy(r: BacklogRow) {
    setBusy(r.token_mint);
    const { data: cand, error: insErr } = await supabase
      .from('autopsy_candidates')
      .upsert({
        token_mint: r.token_mint,
        ticker: r.symbol,
        tier: 'B',
        source_feed: 'cool_deaths_backlog',
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
    else {
      toast({ title: 'Draft queued' });
      // mark drafted
      await supabase.from('autopsy_backlog')
        .update({ drafted_at: new Date().toISOString() })
        .eq('token_mint', r.token_mint);
      load();
    }
  }

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Archive className="h-4 w-4" /> Cool Deaths Backlog
            <Badge variant="outline" className="text-[10px]"><Lock className="h-2.5 w-2.5 mr-1" /> Frozen</Badge>
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            One-shot historical pool. Tokens older than 24h, ATH ≥ $50k, classified bad/sad-dev death.
            Cherry-pick a row to draft a Tier-B autopsy. Built automatically on first view — frozen after.
          </p>
        </div>
      </header>

      <Input
        placeholder="Search ticker, name, or mint…"
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="h-8 max-w-xs text-xs"
      />

      {filtered === null && (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      )}

      {filtered && filtered.length === 0 && (
        <Card className="p-8 text-center text-muted-foreground text-sm">
          Building backlog… scanning token_lifecycle for cool deaths (24h+ old, ATH ≥ $50k). Refresh in ~30s.
        </Card>
      )}

      <div className="space-y-2">
        {filtered?.map(r => (
          <Card key={r.token_mint} className="p-3">
            <div className="flex items-start gap-4 flex-wrap">
              <div className="flex-1 min-w-[200px]">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold">${r.symbol ?? '—'}</span>
                  <span className="text-xs text-muted-foreground truncate max-w-[160px]">{r.name ?? ''}</span>
                  {r.death_cause && (
                    <Badge variant="outline" className="text-[10px]">{r.death_cause}</Badge>
                  )}
                  {r.drafted_slug && (
                    <Badge className="text-[10px]">Drafted</Badge>
                  )}
                </div>
                <div className="text-[11px] text-muted-foreground mt-1 font-mono truncate">{r.token_mint}</div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs flex-1 min-w-[360px]">
                <Stat label="ATH MCap" value={fmtUsd(r.ath_usd)} />
                <Stat label="Now" value={fmtUsd(r.current_mcap_usd)} />
                <Stat label="Liq" value={fmtUsd(r.liquidity_usd)} />
                <Stat label="Holders" value={r.holder_count?.toLocaleString() ?? '—'} />
              </div>
              <div className="flex gap-1 flex-wrap">
                <Button size="sm" disabled={busy === r.token_mint || !!r.drafted_slug}
                  onClick={() => draftAutopsy(r)}>
                  <FileText className="h-3 w-3 mr-1" /> {r.drafted_slug ? 'Drafted' : 'Draft autopsy'}
                </Button>
                <Button size="sm" variant="ghost" asChild>
                  <a href={`/holders?token=${r.token_mint}`} target="_blank" rel="noreferrer">
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-mono">{value}</div>
    </div>
  );
}