import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Skull, RefreshCw, Play } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import AutopsyCandidateRow, { type Candidate } from './AutopsyCandidateRow';
import DeathTaxonomyModal from './DeathTaxonomyModal';

type SortKey =
  | 'score_desc'
  | 'curve_desc'
  | 'funneled_desc' | 'funneled_asc'
  | 'age_asc' | 'age_desc'
  | 'death_desc' | 'death_asc';

const SORT_LABELS: Record<SortKey, string> = {
  score_desc:    'Score (highest first)',
  curve_desc:    'Curve ATH % (highest first)',
  funneled_desc: 'Funneled at — newest',
  funneled_asc:  'Funneled at — oldest',
  age_asc:       'Mint creation — newest',
  age_desc:      'Mint creation — oldest',
  death_desc:    'Time of death — most recent',
  death_asc:     'Time of death — oldest',
};

function deathTime(c: Candidate): number {
  const t = c.analyzed_at ?? c.funneled_at;
  return t ? new Date(t).getTime() : 0;
}

function applySort(items: Candidate[], key: SortKey): Candidate[] {
  const copy = [...items];
  switch (key) {
    case 'score_desc':    return copy.sort((a, b) => b.candidate_score - a.candidate_score);
    case 'curve_desc':    return copy.sort((a, b) => (b.bonding_curve_pct ?? -1) - (a.bonding_curve_pct ?? -1));
    case 'funneled_desc': return copy.sort((a, b) => new Date(b.funneled_at).getTime() - new Date(a.funneled_at).getTime());
    case 'funneled_asc':  return copy.sort((a, b) => new Date(a.funneled_at).getTime() - new Date(b.funneled_at).getTime());
    case 'age_asc':       return copy.sort((a, b) => (a.age_hours ?? Infinity) - (b.age_hours ?? Infinity));
    case 'age_desc':      return copy.sort((a, b) => (b.age_hours ?? -1) - (a.age_hours ?? -1));
    case 'death_desc':    return copy.sort((a, b) => deathTime(b) - deathTime(a));
    case 'death_asc':     return copy.sort((a, b) => deathTime(a) - deathTime(b));
  }
}

export default function AutopsyQueueBody() {
  const { toast } = useToast();
  const [items, setItems] = useState<Candidate[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'A' | 'B' | 'C'>('all');
  const [sortKey, setSortKey] = useState<SortKey>('score_desc');

  async function load() {
    setItems(null);
    let q = supabase
      .from('autopsy_candidates')
      .select('*')
      .eq('source_feed', 'pumpfun_curve_death')
      .gte('bonding_curve_pct', 75)
      .lt('bonding_curve_pct', 99.5)
      .order('candidate_score', { ascending: false })
      .limit(100);
    if (filter !== 'all') q = q.eq('tier', filter);
    const { data, error } = await q;
    if (error) {
      toast({ title: 'Failed to load', description: error.message, variant: 'destructive' });
      setItems([]);
      return;
    }
    setItems((data ?? []) as Candidate[]);
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filter]);

  const sorted = useMemo(() => items ? applySort(items, sortKey) : null, [items, sortKey]);

  async function runFunnel() {
    setBusy('funnel');
    const { error } = await supabase.functions.invoke('autopsy-funnel-feeder', { body: { limit: 200 } });
    setBusy(null);
    if (error) toast({ title: 'Funnel failed', description: error.message, variant: 'destructive' });
    else { toast({ title: 'Funnel complete', description: 'Candidates refreshed.' }); load(); }
  }

  async function draft(id: string) {
    setBusy(id);
    const { error } = await supabase.functions.invoke('autopsy-writer', { body: { candidate_id: id } });
    setBusy(null);
    if (error) toast({ title: 'Writer failed', description: error.message, variant: 'destructive' });
    else { toast({ title: 'Draft complete' }); load(); }
  }

  async function decide(id: string, decision: 'approved' | 'rejected') {
    setBusy(id);
    const { error } = await supabase
      .from('autopsy_candidates')
      .update({ status: decision, decided_at: new Date().toISOString() })
      .eq('id', id);
    setBusy(null);
    if (error) toast({ title: 'Update failed', description: error.message, variant: 'destructive' });
    else load();
  }

  async function regenBanner(c: Candidate) {
    if (!c.published_slug) {
      toast({ title: 'No slug yet', description: 'Draft the autopsy first.', variant: 'destructive' });
      return;
    }
    setBusy(c.id);
    const { data: report } = await supabase
      .from('autopsy_reports')
      .select('id')
      .eq('slug', c.published_slug)
      .maybeSingle();
    const { error } = await supabase.functions.invoke('autopsy-banner-overlay', {
      body: {
        slug: c.published_slug,
        token_mint: c.token_mint,
        ticker: c.ticker,
        report_id: report?.id,
        source_feed: c.source_feed,
      },
    });
    setBusy(null);
    if (error) toast({ title: 'Banner failed', description: error.message, variant: 'destructive' });
    else toast({ title: 'Banner regenerated' });
  }

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h3 className="text-xl font-bold flex items-center gap-2">
            <Skull className="h-5 w-5 text-destructive" /> Autopsy Queue — Lambs
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Pump.fun curve-death candidates only · 75% ≤ curve ATH &lt; 100% · never graduated · auto-publish disabled.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <DeathTaxonomyModal />
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="h-3 w-3 mr-1" /> Reload
          </Button>
          <Button size="sm" onClick={runFunnel} disabled={busy === 'funnel'}>
            <Play className="h-3 w-3 mr-1" /> {busy === 'funnel' ? 'Running…' : 'Run Funnel'}
          </Button>
        </div>
      </header>

      <div className="flex gap-2 items-center flex-wrap">
        {(['all', 'A', 'B', 'C'] as const).map(t => (
          <Button key={t} variant={filter === t ? 'default' : 'outline'} size="sm" onClick={() => setFilter(t)}>
            {t === 'all' ? 'All' : `Tier ${t}`}
          </Button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Sort by</span>
          <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
            <SelectTrigger className="h-8 w-[230px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(SORT_LABELS) as SortKey[]).map(k => (
                <SelectItem key={k} value={k} className="text-xs">{SORT_LABELS[k]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {sorted === null && (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
      )}

      {sorted && sorted.length === 0 && (
        <Card className="p-8 text-center text-muted-foreground">No candidates. Click "Run Funnel" to populate.</Card>
      )}

      <div className="space-y-2">
        {sorted?.map((c, idx) => (
          <AutopsyCandidateRow
            key={c.id}
            ordinal={idx + 1}
            c={c}
            busy={busy}
            onDraft={draft}
            onDecide={decide}
            onRegenBanner={regenBanner}
          />
        ))}
      </div>
    </div>
  );
}