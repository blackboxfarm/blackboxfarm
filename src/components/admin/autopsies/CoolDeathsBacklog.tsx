import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Archive, FileText, Lock, Trash2 } from 'lucide-react';
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

function cleanTokenText(value: string | null | undefined, kind: 'symbol' | 'name'): string | null {
  const v = value?.trim();
  if (!v) return null;
  const bad = kind === 'symbol' ? ['unknown', 'unk', 'token'] : ['unknown', 'unknown token', 'token'];
  return bad.includes(v.toLowerCase()) ? null : v;
}

export default function CoolDeathsBacklog() {
  const { toast } = useToast();
  const [rows, setRows] = useState<BacklogRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const hydratingRef = useRef(false);

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
    const list = (data ?? []) as BacklogRow[];
    setRows(list);
    // Auto-resolve placeholders silently from live metadata sources. No manual button.
    const missingMetadata = list
      .filter(r => !cleanTokenText(r.symbol, 'symbol') || !cleanTokenText(r.name, 'name'))
      .map(r => r.token_mint);
    if (missingMetadata.length > 0 && !hydratingRef.current) {
      hydratingRef.current = true;
      supabase.functions.invoke('autopsy-live-death-hydrator', { body: { tokenMints: missingMetadata.slice(0, 40) } })
        .then(({ data }) => {
          if (data?.updated > 0) {
            // Reload silently to show the resolved tickers
            supabase.from('autopsy_backlog').select('*')
              .order('ath_usd', { ascending: false }).limit(500)
              .then(({ data }) => { if (data) setRows(data as BacklogRow[]); });
          }
        })
        .catch(() => {})
        .finally(() => { hydratingRef.current = false; });
    }
  }

  // Frozen snapshot — never auto-rebuild. Just load what's there.
  useEffect(() => { load(); }, []);

  async function deleteRow(r: BacklogRow) {
    setBusy(r.token_mint);
    const { error } = await supabase.from('autopsy_backlog').delete().eq('token_mint', r.token_mint);
    setBusy(null);
    if (error) {
      toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
      return;
    }
    setRows(prev => (prev ?? []).filter(x => x.token_mint !== r.token_mint));
  }

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
    const ticker = cleanTokenText(r.symbol, 'symbol');
    const tokenName = cleanTokenText(r.name, 'name');
    const { data: cand, error: insErr } = await supabase
      .from('autopsy_candidates')
      .upsert({
        token_mint: r.token_mint,
        ticker,
        token_name: tokenName,
        tier: 'B',
        source_feed: 'cool_deaths_backlog',
        candidate_score: Math.round((r.collapse_pct ?? 0) * 100),
        death_confidence: r.death_confidence,
        ath_mcap_usd: r.ath_usd,
        current_mcap_usd: r.current_mcap_usd,
        liquidity_usd: r.liquidity_usd,
        creator_wallet: r.creator_wallet,
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
            Frozen one-shot snapshot. Cherry-pick rows to draft autopsies, or delete the ones you don't want.
            Tickers auto-resolve from existing mint data on load.
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
          Backlog is empty.
        </Card>
      )}

      <div className="space-y-2">
        {filtered?.map(r => {
          const symbol = cleanTokenText(r.symbol, 'symbol');
          const name = cleanTokenText(r.name, 'name');
          const isLocked = !!r.drafted_slug || !!r.drafted_at;
          return (
          <Card key={r.token_mint} className={`p-3 transition-colors ${isLocked ? 'bg-muted/40 border-primary/30 opacity-80' : ''}`}>
            <div className="flex items-start gap-4 flex-wrap">
              <div className="flex-1 min-w-[200px]">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold">{symbol ? `$${symbol}` : <span className="text-muted-foreground italic text-xs">resolving ticker…</span>}</span>
                  {name && <span className="text-xs text-muted-foreground truncate max-w-[200px]">{name}</span>}
                  {r.death_cause && (
                    <Badge variant="outline" className="text-[10px]">{r.death_cause}</Badge>
                  )}
                  {isLocked && (
                    <Badge className="text-[10px]">Drafted</Badge>
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
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs flex-1 min-w-[360px]">
                <Stat label="ATH MCap" value={fmtUsd(r.ath_usd)} />
                <Stat label="Now" value={fmtUsd(r.current_mcap_usd)} />
                <Stat label="Liq" value={fmtUsd(r.liquidity_usd)} />
                <Stat label="Holders" value={r.holder_count?.toLocaleString() ?? '—'} />
              </div>
              <div className="flex gap-1 flex-wrap">
                <Button
                  size="sm"
                  variant={isLocked ? 'outline' : 'default'}
                  disabled={busy === r.token_mint || isLocked}
                  onClick={() => draftAutopsy(r)}
                >
                  <FileText className="h-3 w-3 mr-1" /> {isLocked ? 'Drafted' : 'Generate Report'}
                </Button>
                <Button size="sm" variant="outline" disabled={busy === r.token_mint}
                  onClick={() => deleteRow(r)}
                  className="text-destructive hover:bg-destructive hover:text-destructive-foreground"
                  aria-label="Delete from backlog">
                  <Trash2 className="h-3 w-3" />
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-mono">{value}</div>
    </div>
  );
}