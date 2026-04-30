import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ExternalLink, RefreshCw, FileText, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';

type Row = {
  id: string;
  ticker: string | null;
  token_mint: string;
  status: string;
  tier: string | null;
  source_feed: string | null;
  published_slug: string | null;
  drafted_at: string | null;
  decided_at: string | null;
  funneled_at: string | null;
  status_reason: string | null;
  death_cause: string | null;
};

/**
 * Drafts tab — every autopsy candidate the writer touched, regardless of feed.
 * Single source of truth for "I clicked Generate Report — where did it go?"
 */
export default function AllDrafts() {
  const { toast } = useToast();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    const { data, error } = await supabase
      .from('autopsy_candidates')
      .select('id, ticker, token_mint, status, tier, source_feed, published_slug, drafted_at, decided_at, funneled_at, status_reason, death_cause')
      .in('status', ['analyzing', 'drafted', 'approved', 'failed'])
      .order('funneled_at', { ascending: false })
      .limit(100);
    if (error) {
      toast({ title: 'Load failed', description: error.message, variant: 'destructive' });
      setRows([]);
      return;
    }
    setRows((data ?? []) as Row[]);
  }

  useEffect(() => { load(); }, []);

  async function retry(r: Row) {
    setBusy(r.id);
    await supabase.from('autopsy_candidates').update({ status: 'pending', status_reason: null }).eq('id', r.id);
    const { error } = await supabase.functions.invoke('autopsy-writer', { body: { candidate_id: r.id } });
    setBusy(null);
    if (error) toast({ title: 'Retry failed', description: error.message, variant: 'destructive' });
    else { toast({ title: 'Retry started' }); load(); }
  }

  async function approve(r: Row) {
    setBusy(r.id);
    const { error } = await supabase
      .from('autopsy_candidates')
      .update({ status: 'approved', decided_at: new Date().toISOString() })
      .eq('id', r.id);
    setBusy(null);
    if (error) toast({ title: 'Approve failed', description: error.message, variant: 'destructive' });
    else { toast({ title: 'Approved — visible in Published tab' }); load(); }
  }

  if (rows === null) {
    return <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>;
  }

  if (rows.length === 0) {
    return <Card className="p-8 text-center text-muted-foreground">No drafts yet. Click "Generate Report" on a Live Death Watch / Backlog / Lambs row.</Card>;
  }

  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <p className="text-xs text-muted-foreground">{rows.length} drafts · status: analyzing / drafted / approved / failed</p>
        <Button variant="outline" size="sm" onClick={load}><RefreshCw className="h-3 w-3 mr-1" /> Reload</Button>
      </div>
      {rows.map(r => (
        <Card key={r.id} className="p-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span className="font-semibold">{r.ticker ? `$${r.ticker}` : <span className="italic text-muted-foreground">no ticker</span>}</span>
                <Badge variant={r.status === 'approved' ? 'default' : r.status === 'failed' ? 'destructive' : r.status === 'drafted' ? 'secondary' : 'outline'} className="text-[10px]">{r.status}</Badge>
                {r.tier && <Badge variant="outline" className="text-[10px]">Tier {r.tier}</Badge>}
                {r.source_feed && <Badge variant="outline" className="text-[10px]">{r.source_feed}</Badge>}
                {r.death_cause && <Badge variant="outline" className="text-[10px]">{r.death_cause}</Badge>}
              </div>
              <div className="text-[11px] text-muted-foreground mt-1 font-mono truncate">{r.token_mint}</div>
              <div className="text-[10px] text-muted-foreground mt-1">
                {r.funneled_at && <>Queued {formatDistanceToNow(new Date(r.funneled_at), { addSuffix: true })}</>}
                {r.drafted_at && <> · Drafted {formatDistanceToNow(new Date(r.drafted_at), { addSuffix: true })}</>}
                {r.decided_at && <> · Decided {formatDistanceToNow(new Date(r.decided_at), { addSuffix: true })}</>}
              </div>
              {r.status === 'failed' && r.status_reason && (
                <div className="text-[10px] text-destructive mt-1 flex items-start gap-1">
                  <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                  <span className="break-all">{r.status_reason}</span>
                </div>
              )}
            </div>
            <div className="flex gap-2 flex-wrap">
              {r.published_slug && (
                <Button size="sm" variant="outline" asChild>
                  <Link to={`/autopsy/${r.published_slug}`} target="_blank"><ExternalLink className="h-3 w-3 mr-1" /> View draft</Link>
                </Button>
              )}
              {r.status === 'drafted' && (
                <Button size="sm" disabled={busy === r.id} onClick={() => approve(r)}>
                  Approve & Publish
                </Button>
              )}
              {r.status === 'failed' && (
                <Button size="sm" variant="outline" disabled={busy === r.id} onClick={() => retry(r)}>
                  <RefreshCw className="h-3 w-3 mr-1" /> Retry
                </Button>
              )}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}