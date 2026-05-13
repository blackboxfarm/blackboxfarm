import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ExternalLink, RefreshCw, Newspaper, Twitter, History, Loader2, Stamp } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AutopsyTweetComposer } from './AutopsyTweetComposer';
import { AUTOPSIES } from '@/data/autopsies';

type Report = {
  id: string;
  slug: string;
  ticker: string | null;
  title: string;
  subtitle: string | null;
  death_cause: string;
  death_intent: string | null;
  hero_image_path: string | null;
  published_at: string | null;
  created_at: string;
  token_mint?: string;
  verdict?: string | null;
  harm_score?: number | null;
  harm_headline?: string | null;
};

export default function PublishedAutopsies() {
  const { toast } = useToast();
  const [rows, setRows] = useState<Report[] | null>(null);
  const [backfillBusy, setBackfillBusy] = useState<'idle' | 'dry' | 'run'>('idle');
  const [pillBusy, setPillBusy] = useState<string | 'all' | null>(null);

  async function stampPill(slug: string | 'all') {
    setPillBusy(slug);
    try {
      const body = slug === 'all' ? { all_missing: true } : { slug };
      const { data, error } = await supabase.functions.invoke('autopsy-banner-stamp-pill', { body });
      if (error) throw error;
      const d = data as any;
      toast({
        title: 'Pill stamped',
        description: `${d.stamped}/${d.total} banner(s) updated with @Dead_Tokens pill.`,
      });
      await load();
    } catch (e) {
      toast({ title: 'Stamp failed', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setPillBusy(null);
    }
  }

  async function backfillTrackRecords(dryRun: boolean) {
    setBackfillBusy(dryRun ? 'dry' : 'run');
    try {
      const extraMints = AUTOPSIES.map((a) => a.mintAddress).filter(Boolean);
      const { data, error } = await supabase.functions.invoke(
        'dev-track-record-backfill-all-autopsies',
        { body: { dryRun, staleDays: 7, extraMints } },
      );
      if (error) throw error;
      const d = data as any;
      toast({
        title: dryRun ? 'Dry-run complete' : 'Backfill started',
        description:
          `${d.total_mints} mints · ${d.mints_with_dev} resolved · ` +
          `${d.unique_devs} unique devs · ${d.already_fresh} fresh · ` +
          `${d.to_run} ${dryRun ? 'would run' : 'queued (5s stagger)'}` +
          (d.unresolved_mints?.length ? ` · ${d.unresolved_mints.length} mints missing creator_wallet` : ''),
      });
    } catch (e) {
      toast({ title: 'Backfill failed', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setBackfillBusy('idle');
    }
  }

  async function load() {
    const { data, error } = await supabase
      .from('autopsy_reports')
      .select('id, slug, ticker, title, subtitle, death_cause, death_intent, hero_image_path, published_at, created_at, token_mint, verdict, harm_score, harm_headline')
      .eq('is_current', true)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) {
      toast({ title: 'Load failed', description: error.message, variant: 'destructive' });
      setRows([]);
      return;
    }
    setRows((data ?? []) as Report[]);
  }

  useEffect(() => { load(); }, []);

  if (rows === null) {
    return <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>;
  }

  if (rows.length === 0) {
    return <Card className="p-8 text-center text-muted-foreground">No published reports yet. Drafts that finish writing land here.</Card>;
  }

  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center flex-wrap gap-2">
        <p className="text-xs text-muted-foreground">{rows.length} reports</p>
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            disabled={backfillBusy !== 'idle'}
            onClick={() => backfillTrackRecords(true)}
          >
            {backfillBusy === 'dry' ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <History className="h-3 w-3 mr-1" />}
            Dry-run dev backfill
          </Button>
          <Button
            size="sm"
            disabled={backfillBusy !== 'idle'}
            className="bg-gold text-gold-foreground hover:bg-gold/90"
            onClick={() => backfillTrackRecords(false)}
          >
            {backfillBusy === 'run' ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <History className="h-3 w-3 mr-1" />}
            Backfill all dev track records
          </Button>
          <Button variant="outline" size="sm" onClick={load}><RefreshCw className="h-3 w-3 mr-1" /> Reload</Button>
          <Button
            size="sm"
            variant="outline"
            disabled={pillBusy !== null}
            onClick={() => stampPill('all')}
          >
            {pillBusy === 'all' ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Stamp className="h-3 w-3 mr-1" />}
            Stamp all missing pills
          </Button>
        </div>
      </div>
      {rows.map(r => (
        <Card key={r.id} className="p-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <Newspaper className="h-4 w-4 text-muted-foreground" />
                <span className="font-semibold">{r.title}</span>
                <Badge variant="outline" className="text-[10px]">{r.death_cause}</Badge>
                {r.death_intent && <Badge variant="outline" className="text-[10px]">{r.death_intent}</Badge>}
              </div>
              {r.subtitle && <div className="text-xs text-muted-foreground mt-1">{r.subtitle}</div>}
              <div className="text-[10px] text-muted-foreground mt-1 font-mono">/autopsy/{r.slug}</div>
              <div className="text-[10px] text-muted-foreground mt-1">
                Created {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                {r.published_at && <> · Published {formatDistanceToNow(new Date(r.published_at), { addSuffix: true })}</>}
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button size="sm" variant="outline" asChild>
                <Link to={`/autopsy/${r.slug}`} target="_blank"><ExternalLink className="h-3 w-3 mr-1" /> View</Link>
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={pillBusy !== null}
                onClick={() => stampPill(r.slug)}
                title="Stamp @Dead_Tokens pill onto the existing banner"
              >
                {pillBusy === r.slug ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Stamp className="h-3 w-3 mr-1" />}
                Stamp pill
              </Button>
              <Dialog>
                <DialogTrigger asChild>
                  <Button size="sm" variant="outline" className="gap-1">
                    <Twitter className="h-3 w-3" /> X Post
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>DeadTokens X Post — {r.ticker || r.slug}</DialogTitle>
                  </DialogHeader>
                  <AutopsyTweetComposer
                    input={{
                      ticker: r.ticker || '',
                      title: r.title,
                      mintAddress: r.token_mint || '',
                      slug: r.slug,
                      verdict: r.verdict,
                      deathCause: r.death_cause,
                      harmHeadline: r.harm_headline,
                      harmScore: r.harm_score,
                    }}
                    heroImage={r.hero_image_path}
                  />
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}