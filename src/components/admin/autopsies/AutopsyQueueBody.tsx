import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Skull, RefreshCw, Play, CheckCircle2, XCircle, Clock, Image as ImageIcon } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

interface Candidate {
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
  published_slug: string | null;
}

const TIER_COLORS: Record<string, string> = {
  A: 'bg-destructive/15 text-destructive border-destructive/30',
  B: 'bg-amber-500/15 text-amber-500 border-amber-500/30',
  C: 'bg-muted text-muted-foreground border-border',
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

export default function AutopsyQueueBody() {
  const { toast } = useToast();
  const [items, setItems] = useState<Candidate[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'A' | 'B' | 'C'>('all');

  async function load() {
    setItems(null);
    let q = supabase
      .from('autopsy_candidates')
      .select('*')
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
            Tier-A auto-publish on confidence ≥ threshold · Tier-B awaits approval · Tier-C skipped unless flagged.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="h-3 w-3 mr-1" /> Reload
          </Button>
          <Button size="sm" onClick={runFunnel} disabled={busy === 'funnel'}>
            <Play className="h-3 w-3 mr-1" /> {busy === 'funnel' ? 'Running…' : 'Run Funnel'}
          </Button>
        </div>
      </header>

      <div className="flex gap-2">
        {(['all', 'A', 'B', 'C'] as const).map(t => (
          <Button key={t} variant={filter === t ? 'default' : 'outline'} size="sm" onClick={() => setFilter(t)}>
            {t === 'all' ? 'All' : `Tier ${t}`}
          </Button>
        ))}
      </div>

      {items === null && (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
      )}

      {items && items.length === 0 && (
        <Card className="p-8 text-center text-muted-foreground">No candidates. Click "Run Funnel" to populate.</Card>
      )}

      <div className="space-y-2">
        {items?.map(c => (
          <Card key={c.id} className="p-4 flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              {c.tier && <Badge variant="outline" className={TIER_COLORS[c.tier]}>{c.tier}</Badge>}
              <Badge variant="outline" className="text-[10px]">{c.status} {STATUS_ICON[c.status]}</Badge>
              <div className="min-w-0">
                <div className="font-mono text-xs truncate">{c.ticker ?? '?'} · {c.token_mint.slice(0, 8)}…{c.token_mint.slice(-4)}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {c.death_cause ?? 'unclassified'} · conf {c.death_confidence ?? '?'} · score {c.candidate_score}
                  {c.ath_mcap_usd ? ` · ATH $${Math.round(c.ath_mcap_usd).toLocaleString()}` : ''}
                  {c.age_hours ? ` · ${c.age_hours.toFixed(0)}h old` : ''}
                  · {format(new Date(c.funneled_at), 'MMM d HH:mm')}
                </div>
              </div>
            </div>
            <div className="flex gap-1 flex-wrap">
              {c.published_slug && (
                <Link to={`/autopsy/${c.published_slug}`}>
                  <Button size="sm" variant="ghost">View</Button>
                </Link>
              )}
              {c.status === 'pending' && (
                <Button size="sm" variant="outline" onClick={() => draft(c.id)} disabled={busy === c.id}>
                  {busy === c.id ? '…' : 'Draft'}
                </Button>
              )}
              {c.status === 'drafted' && (
                <>
                  <Button size="sm" onClick={() => decide(c.id, 'approved')} disabled={busy === c.id}>Approve</Button>
                  <Button size="sm" variant="ghost" onClick={() => decide(c.id, 'rejected')} disabled={busy === c.id}>Reject</Button>
                </>
              )}
              {c.published_slug && ['drafted', 'approved', 'published'].includes(c.status) && (
                <Button size="sm" variant="ghost" onClick={() => regenBanner(c)} disabled={busy === c.id} title="Regenerate banner overlay">
                  <ImageIcon className="h-3 w-3 mr-1" /> Banner
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}