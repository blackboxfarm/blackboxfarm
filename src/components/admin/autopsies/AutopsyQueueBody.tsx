import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Skull, RefreshCw, Play, Plus } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import AutopsyCandidateRow, { type Candidate } from './AutopsyCandidateRow';
import DeathTaxonomyModal from './DeathTaxonomyModal';
import LiveDeathWatch from './LiveDeathWatch';
import CoolDeathsBacklog from './CoolDeathsBacklog';
import AllDrafts from './AllDrafts';

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
  const [lastAutoRunAt, setLastAutoRunAt] = useState<string | null>(null);
  const [manualMint, setManualMint] = useState('');
  const [manualBusy, setManualBusy] = useState(false);

  async function addManualCandidate() {
    const mint = manualMint.trim();
    if (!mint || mint.length < 32 || mint.length > 64) {
      toast({ title: 'Invalid mint', description: 'Paste a Solana token mint address.', variant: 'destructive' });
      return;
    }
    setManualBusy(true);
    try {
      // Check for existing candidate first
      const { data: existing } = await supabase
        .from('autopsy_candidates')
        .select('id, status, published_slug')
        .eq('token_mint', mint)
        .maybeSingle();

      let candidateId = existing?.id;
      if (!candidateId) {
        const { data: inserted, error: insErr } = await supabase
          .from('autopsy_candidates')
          .insert({
            token_mint: mint,
            source_feed: 'admin_manual',
            status: 'pending',
            tier: 'B',
            candidate_score: 100,
          })
          .select('id')
          .single();
        if (insErr) throw insErr;
        candidateId = inserted.id;
      }

      // Kick the writer immediately
      const { error: wErr } = await supabase.functions.invoke('autopsy-writer', {
        body: { candidate_id: candidateId },
      });
      if (wErr) throw wErr;

      toast({
        title: existing ? 'Re-queued for drafting' : 'Added to funnel',
        description: `${mint.slice(0, 6)}…${mint.slice(-4)} sent to autopsy-writer.`,
      });
      setManualMint('');
      load();
    } catch (e: any) {
      toast({ title: 'Manual add failed', description: e?.message ?? String(e), variant: 'destructive' });
    } finally {
      setManualBusy(false);
    }
  }

  async function load() {
    setItems(null);
    let q = supabase
      .from('autopsy_candidates')
      .select('*')
      .eq('source_feed', 'pumpfun_curve_death')
      .gte('bonding_curve_pct', 75)
      .lt('bonding_curve_pct', 100)
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
  useEffect(() => {
    const interval = window.setInterval(load, 60_000);
    return () => window.clearInterval(interval);
    /* eslint-disable-next-line */
  }, [filter]);

  useEffect(() => {
    const key = 'autopsy-lamb-funnel-last-run';
    const last = Number(window.localStorage.getItem(key) ?? 0);
    if (Date.now() - last < 30 * 60 * 1000) {
      setLastAutoRunAt(new Date(last).toISOString());
      return;
    }
    window.localStorage.setItem(key, String(Date.now()));
    setLastAutoRunAt(new Date().toISOString());
    supabase.functions.invoke('autopsy-funnel-feeder', { body: { limit: 200, source: 'autopsy-queue-auto' } })
      .then(({ error }) => {
        if (!error) load();
      });
    /* eslint-disable-next-line */
  }, []);

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
            <Skull className="h-5 w-5 text-destructive" /> Autopsy Queue
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Three pools feed the autopsy pipeline. Live Death Watch surfaces new deaths as they happen.
            Cool Deaths Backlog is a frozen historical pool. Lambs is the legacy pump.fun curve-death funnel.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <DeathTaxonomyModal />
        </div>
      </header>

      <Card className="p-3 flex items-center gap-2 flex-wrap border-dashed">
        <Plus className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="text-xs font-medium text-muted-foreground">Manual add to funnel:</span>
        <Input
          placeholder="Paste token mint address…"
          value={manualMint}
          onChange={(e) => setManualMint(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') addManualCandidate(); }}
          className="h-8 text-xs font-mono flex-1 min-w-[260px]"
          disabled={manualBusy}
        />
        <Button size="sm" onClick={addManualCandidate} disabled={manualBusy || !manualMint.trim()}>
          {manualBusy ? 'Queuing…' : 'Add & Draft'}
        </Button>
      </Card>

      <Tabs defaultValue="drafts" className="mt-4">
        <TabsList>
          <TabsTrigger value="drafts">📝 Drafts (your reports)</TabsTrigger>
          <TabsTrigger value="live">Live Death Watch</TabsTrigger>
          <TabsTrigger value="backlog">Cool Deaths Backlog</TabsTrigger>
          <TabsTrigger value="lambs">Lambs (curve-death)</TabsTrigger>
        </TabsList>

        <TabsContent value="drafts" className="mt-4">
          <AllDrafts />
        </TabsContent>

        <TabsContent value="live" className="mt-4">
          <LiveDeathWatch />
        </TabsContent>

        <TabsContent value="backlog" className="mt-4">
          <CoolDeathsBacklog />
        </TabsContent>

        <TabsContent value="lambs" className="mt-4">
          <div className="flex items-start justify-between gap-4 flex-wrap mb-3">
            <p className="text-xs text-muted-foreground">
              Pump.fun curve-death candidates · peak curve ≥75% and &lt;100% · never graduated · auto-refreshes every minute.
              {lastAutoRunAt ? ` Last check ${format(new Date(lastAutoRunAt), 'MMM d HH:mm')}.` : ''}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={load}>
                <RefreshCw className="h-3 w-3 mr-1" /> Reload
              </Button>
              <Button size="sm" onClick={runFunnel} disabled={busy === 'funnel'}>
                <Play className="h-3 w-3 mr-1" /> {busy === 'funnel' ? 'Running…' : 'Run Funnel'}
              </Button>
            </div>
          </div>
          <div className="flex gap-2 items-center flex-wrap mb-3">
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
        </TabsContent>
      </Tabs>
    </div>
  );
}