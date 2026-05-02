import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ExternalLink, RefreshCw, FileText, AlertTriangle, Send, Search, Rocket, Skull, Flame, Loader2, X, Microscope, Droplet } from 'lucide-react';
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
  social_completeness?: number | null;
  manual_tg_join_completed?: boolean | null;
};

type RowWithTg = Row & {
  tg_url?: string | null;
  current_version?: number | null;
  boost_peak?: number | null;
  boost_events?: number | null;
  vulture_count?: number | null;
  vulture_swept_at?: string | null;
  vulture_handles?: string[];
  vulture_scam_urls?: string[];
  dissent_score?: number | null;
  dissent_swept_at?: string | null;
  dissent_absent_dev?: number | null;
  dissent_no_marketing?: number | null;
  dissent_days_since_dev_anywhere?: number | null;
};

/**
 * Drafts tab — every autopsy candidate the writer touched, regardless of feed.
 * Single source of truth for "I clicked Generate Report — where did it go?"
 */
export default function AllDrafts() {
  const { toast } = useToast();
  const [rows, setRows] = useState<RowWithTg[] | null>(null);
  // Busy key is `${rowId}:${action}` so only the clicked button spins
  const [busy, setBusy] = useState<string | null>(null);
  const isBusy = (rowId: string, action: string) => busy === `${rowId}:${action}`;
  const rowBusy = (rowId: string) => !!busy && busy.startsWith(`${rowId}:`);
  const [reloading, setReloading] = useState(false);

  async function load() {
    const { data, error } = await supabase
      .from('autopsy_candidates')
      .select('id, ticker, token_mint, status, tier, source_feed, published_slug, drafted_at, decided_at, funneled_at, status_reason, death_cause, social_completeness, manual_tg_join_completed')
      .in('status', ['analyzing', 'drafted', 'approved', 'failed'])
      .order('funneled_at', { ascending: false })
      .limit(100);
    if (error) {
      toast({ title: 'Load failed', description: error.message, variant: 'destructive' });
      setRows([]);
      return;
    }
    const baseRows = (data ?? []) as Row[];

    // Fetch TG URLs + current versions in parallel
    const mints = baseRows.map(r => r.token_mint);
    const candidateIds = baseRows.map(r => r.id);
    const [{ data: socials }, { data: reps }] = await Promise.all([
      mints.length
        ? supabase.from('token_social_links').select('token_mint, platform, url').in('token_mint', mints).ilike('platform', '%telegram%')
        : Promise.resolve({ data: [] as any[] }),
      candidateIds.length
        ? supabase.from('autopsy_reports').select('candidate_id, version').in('candidate_id', candidateIds).eq('is_current', true)
        : Promise.resolve({ data: [] as any[] }),
    ]);
    const { data: boosts } = mints.length
      ? await supabase.from('token_boost_history').select('token_mint, total_amount, delta_amount').in('token_mint', mints)
      : { data: [] as any[] };
    // Latest vulture_sweep blob per candidate
    const { data: vBlobs } = candidateIds.length
      ? await supabase
          .from('autopsy_evidence_blobs')
          .select('candidate_id, payload, captured_at')
          .in('candidate_id', candidateIds)
          .eq('kind', 'vulture_sweep')
          .order('captured_at', { ascending: false })
      : { data: [] as any[] };
    const vultureByCand = new Map<string, { count: number; at: string; handles: string[]; scam_urls: string[] }>();
    for (const v of (vBlobs ?? []) as any[]) {
      if (vultureByCand.has(v.candidate_id)) continue; // first row per cand = latest
      const p = v.payload || {};
      vultureByCand.set(v.candidate_id, {
        count: Number(p.vulture_count ?? 0),
        at: v.captured_at,
        handles: Array.isArray(p.vulture_handles) ? p.vulture_handles : [],
        scam_urls: Array.isArray(p.scam_urls) ? p.scam_urls : [],
      });
    }
    // Latest community_dissent blob per candidate
    const { data: dBlobs } = candidateIds.length
      ? await supabase
          .from('autopsy_evidence_blobs')
          .select('candidate_id, payload, captured_at')
          .in('candidate_id', candidateIds)
          .eq('kind', 'community_dissent')
          .order('captured_at', { ascending: false })
      : { data: [] as any[] };
    const dissentByCand = new Map<string, { score: number; at: string; absent_dev: number; no_marketing: number; days_since_dev: number | null }>();
    for (const d of (dBlobs ?? []) as any[]) {
      if (dissentByCand.has(d.candidate_id)) continue;
      const p = d.payload || {};
      const counts = p.counts || {};
      dissentByCand.set(d.candidate_id, {
        score: Number(p.dissent_score ?? 0),
        at: d.captured_at,
        absent_dev: Number(counts.absent_dev ?? 0),
        no_marketing: Number(counts.no_marketing ?? 0),
        days_since_dev: p.days_since_dev_post_anywhere ?? null,
      });
    }
    const tgByMint = new Map<string, string>();
    for (const s of (socials ?? [])) tgByMint.set(s.token_mint, s.url);
    const versionByCand = new Map<string, number>();
    for (const r of (reps ?? [])) versionByCand.set(r.candidate_id, r.version);
    const peakByMint = new Map<string, number>();
    const eventsByMint = new Map<string, number>();
    for (const b of (boosts ?? []) as any[]) {
      const v = Number(b.total_amount ?? 0);
      if (v > (peakByMint.get(b.token_mint) ?? 0)) peakByMint.set(b.token_mint, v);
      if (Number(b.delta_amount ?? 0) > 0) eventsByMint.set(b.token_mint, (eventsByMint.get(b.token_mint) ?? 0) + 1);
    }

    setRows(baseRows.map(r => ({
      ...r,
      tg_url: tgByMint.get(r.token_mint) ?? null,
      current_version: versionByCand.get(r.id) ?? null,
      boost_peak: peakByMint.get(r.token_mint) ?? null,
      boost_events: eventsByMint.get(r.token_mint) ?? null,
      vulture_count: vultureByCand.get(r.id)?.count ?? null,
      vulture_swept_at: vultureByCand.get(r.id)?.at ?? null,
      vulture_handles: vultureByCand.get(r.id)?.handles ?? [],
      vulture_scam_urls: vultureByCand.get(r.id)?.scam_urls ?? [],
      dissent_score: dissentByCand.get(r.id)?.score ?? null,
      dissent_swept_at: dissentByCand.get(r.id)?.at ?? null,
      dissent_absent_dev: dissentByCand.get(r.id)?.absent_dev ?? null,
      dissent_no_marketing: dissentByCand.get(r.id)?.no_marketing ?? null,
      dissent_days_since_dev_anywhere: dissentByCand.get(r.id)?.days_since_dev ?? null,
    })));
  }

  useEffect(() => { load(); }, []);

  async function handleReload() {
    setReloading(true);
    await load();
    setReloading(false);
    toast({ title: 'Reloaded', description: `${rows?.length ?? 0} drafts refreshed from DB` });
  }

  async function dismissError(r: RowWithTg) {
    const { error } = await supabase
      .from('autopsy_candidates')
      .update({ status_reason: null })
      .eq('id', r.id);
    if (error) toast({ title: 'Could not clear error', description: error.message, variant: 'destructive' });
    else { toast({ title: 'Error cleared' }); load(); }
  }

  async function retry(r: RowWithTg) {
    setBusy(`${r.id}:retry`);
    await supabase.from('autopsy_candidates').update({ status: 'pending', status_reason: null }).eq('id', r.id);
    const { error } = await supabase.functions.invoke('autopsy-writer', { body: { candidate_id: r.id } });
    setBusy(null);
    if (error) toast({ title: 'Retry failed', description: error.message, variant: 'destructive' });
    else { toast({ title: 'Retry started' }); load(); }
  }

  async function regenerate(r: RowWithTg) {
    setBusy(`${r.id}:regenerate`);
    // Clear any stale status_reason before regenerating so old errors don't linger
    await supabase.from('autopsy_candidates').update({ status_reason: null }).eq('id', r.id);
    const { error } = await supabase.functions.invoke('autopsy-writer', { body: { candidate_id: r.id, regenerate: true } });
    setBusy(null);
    if (error) toast({ title: 'Re-generate failed', description: error.message, variant: 'destructive' });
    else { toast({ title: 'Re-generating — replaces current draft' }); load(); }
  }

  async function reForensics(r: RowWithTg) {
    setBusy(`${r.id}:forensics`);
    try {
      // Force a fresh tx-timeline pull, then re-run the writer so the new
      // evidence ends up in the prompt and the report.
      toast({ title: 'Pulling on-chain forensics…', description: 'Launch tx + dev timeline + cascade.' });
      const { error: txErr } = await supabase.functions.invoke('autopsy-tx-timeline', {
        body: { candidate_id: r.id, force: true },
      });
      if (txErr) {
        toast({ title: 'Forensics pull failed', description: txErr.message, variant: 'destructive' });
        setBusy(null);
        return;
      }
      await supabase.from('autopsy_candidates').update({ status_reason: null }).eq('id', r.id);
      const { error: wErr } = await supabase.functions.invoke('autopsy-writer', {
        body: { candidate_id: r.id, regenerate: true },
      });
      if (wErr) {
        toast({ title: 'Writer failed after forensics', description: wErr.message, variant: 'destructive' });
      } else {
        toast({ title: 'Re-forensics complete', description: 'Report rewritten with on-chain evidence.' });
      }
    } finally {
      setBusy(null);
      load();
    }
  }

  async function reHydrate(r: RowWithTg) {
    setBusy(`${r.id}:hydrate`);
    try {
      toast({ title: 'Re-hydrating mesh…', description: 'Identity → creator → mesh → socials → holders.' });
      const { data, error } = await supabase.functions.invoke('token-mesh-hydrate', {
        body: { mint: r.token_mint, candidate_id: r.id, surface: 'autopsy_rehydrate', force: true },
      });
      if (error) {
        toast({ title: 'Re-hydrate failed', description: error.message, variant: 'destructive' });
        return;
      }
      const steps: Array<{ step: string; ok: boolean; source?: string; detail?: string; reason?: string }> =
        (data as any)?.steps ?? [];
      for (const s of steps) {
        toast({
          title: `${s.ok ? '✓' : '⚠'} ${s.step}${s.source ? ` (${s.source})` : ''}`,
          description: s.ok ? (s.detail ?? 'ok') : (s.reason ?? 'no detail'),
          variant: s.ok ? 'default' : 'destructive',
        });
      }
      toast({ title: 'Re-hydrate complete', description: 'Row refreshed. Re-generate to use the new data.' });
    } finally {
      setBusy(null);
      load();
    }
  }

  async function tgDeepScrape(r: RowWithTg) {
    setBusy(`${r.id}:tgscrape`);
    const { data, error } = await supabase.functions.invoke('autopsy-tg-deep-pull', { body: { candidate_id: r.id } });
    setBusy(null);
    if (error) toast({ title: 'TG scrape failed', description: error.message, variant: 'destructive' });
    else { toast({ title: 'TG scrape captured', description: 'Re-generate to use the new evidence.' }); load(); }
  }

  async function communitySweep(r: RowWithTg) {
    setBusy(`${r.id}:sweep`);
    const { data, error } = await supabase.functions.invoke('autopsy-community-sweep', {
      body: { candidate_id: r.id, token_mint: r.token_mint, force: true, lenses: ['vulture', 'dissent'] },
    });
    setBusy(null);
    if (error) {
      toast({ title: 'Community sweep failed', description: error.message, variant: 'destructive' });
      return;
    }
    const v = (data as any)?.lenses?.vulture ?? {};
    const d = (data as any)?.lenses?.dissent ?? {};
    toast({
      title: `Community sweep complete`,
      description: `vultures: ${v.vulture_count ?? 0} · dissent score: ${d.dissent_score ?? 0}/100${d.riot_threshold_met ? ' (RIOT)' : ''}. Re-generate to include in the report.`,
    });
    load();
  }

  async function approve(r: RowWithTg) {
    setBusy(`${r.id}:approve`);
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
        <Button variant="outline" size="sm" onClick={handleReload} disabled={reloading}>
          {reloading
            ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Reloading…</>
            : <><RefreshCw className="h-3 w-3 mr-1" /> Reload</>}
        </Button>
      </div>
      {rows.map(r => (
        <Card key={r.id} className="p-3 space-y-3">
          {/* Action row — full width, top */}
          <div className="flex gap-2 flex-wrap justify-end">
              {r.tg_url ? (
                <Button size="sm" variant="ghost" asChild>
                  <a href={r.tg_url} target="_blank" rel="noreferrer"><Send className="h-3 w-3 mr-1" /> Open TG</a>
                </Button>
              ) : (
                <TooltipProvider delayDuration={150}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span tabIndex={0}>
                        <Button size="sm" variant="ghost" disabled className="opacity-50 pointer-events-none">
                          <Send className="h-3 w-3 mr-1" /> Open TG
                        </Button>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>no tg detected</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              {r.tg_url ? (
                <Button size="sm" variant="outline" disabled={rowBusy(r.id)} onClick={() => tgDeepScrape(r)}>
                  {isBusy(r.id, 'tgscrape')
                    ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Scraping…</>
                    : <><Search className="h-3 w-3 mr-1" /> I'm in — deep scrape</>}
                </Button>
              ) : (
                <TooltipProvider delayDuration={150}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span tabIndex={0}>
                        <Button size="sm" variant="outline" disabled className="opacity-50 pointer-events-none">
                          <Search className="h-3 w-3 mr-1" /> I'm in — deep scrape
                        </Button>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>no tg detected</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              <Button
                size="sm"
                variant="outline"
                disabled={rowBusy(r.id)}
                onClick={() => communitySweep(r)}
                className={r.vulture_swept_at ? 'border-red-500/40' : ''}
              >
                {isBusy(r.id, 'sweep')
                  ? <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  : <Skull className="h-3 w-3 mr-1" />}
                {isBusy(r.id, 'sweep')
                  ? 'Sweeping…'
                  : (r.vulture_swept_at || r.dissent_swept_at ? 'Re-sweep community' : 'Sweep community')}
              </Button>
              {r.published_slug && (
                <Button size="sm" variant="outline" asChild>
                  <Link to={`/autopsy/${r.published_slug}`} target="_blank"><ExternalLink className="h-3 w-3 mr-1" /> View draft</Link>
                </Button>
              )}
              {r.status === 'drafted' && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={rowBusy(r.id)}
                    onClick={() => regenerate(r)}
                    className="border-amber-500 text-amber-600 hover:bg-amber-500/10 dark:text-amber-400"
                  >
                    {isBusy(r.id, 'regenerate')
                      ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Re-generating…</>
                      : <><RefreshCw className="h-3 w-3 mr-1" /> Re-generate (replace)</>}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={rowBusy(r.id)}
                    onClick={() => reHydrate(r)}
                    className="border-blue-500 text-blue-600 hover:bg-blue-500/10 dark:text-blue-400"
                    title="Re-pull identity, creator, socials, holders — full mesh hydration"
                  >
                    {isBusy(r.id, 'hydrate')
                      ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Re-hydrating…</>
                      : <><Droplet className="h-3 w-3 mr-1" /> Re-Hydrate</>}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={rowBusy(r.id)}
                    onClick={() => reForensics(r)}
                    className="border-cyan-500 text-cyan-600 hover:bg-cyan-500/10 dark:text-cyan-400"
                    title="Re-pull on-chain forensics, then rewrite the report"
                  >
                    {isBusy(r.id, 'forensics')
                      ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Re-forensics…</>
                      : <><Microscope className="h-3 w-3 mr-1" /> Re-Forensics</>}
                  </Button>
                  <Button size="sm" disabled={rowBusy(r.id)} onClick={() => approve(r)}>
                    {isBusy(r.id, 'approve')
                      ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Approving…</>
                      : <>Approve & Publish</>}
                  </Button>
                </>
              )}
              {r.status === 'approved' && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={rowBusy(r.id)}
                    onClick={() => regenerate(r)}
                    className="border-amber-500 text-amber-600 hover:bg-amber-500/10 dark:text-amber-400"
                  >
                    {isBusy(r.id, 'regenerate')
                      ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Re-generating…</>
                      : <><RefreshCw className="h-3 w-3 mr-1" /> Re-generate (replace)</>}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={rowBusy(r.id)}
                    onClick={() => reHydrate(r)}
                    className="border-blue-500 text-blue-600 hover:bg-blue-500/10 dark:text-blue-400"
                    title="Re-pull identity, creator, socials, holders — full mesh hydration"
                  >
                    {isBusy(r.id, 'hydrate')
                      ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Re-hydrating…</>
                      : <><Droplet className="h-3 w-3 mr-1" /> Re-Hydrate</>}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={rowBusy(r.id)}
                    onClick={() => reForensics(r)}
                    className="border-cyan-500 text-cyan-600 hover:bg-cyan-500/10 dark:text-cyan-400"
                    title="Re-pull on-chain forensics, then rewrite the report"
                  >
                    {isBusy(r.id, 'forensics')
                      ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Re-forensics…</>
                      : <><Microscope className="h-3 w-3 mr-1" /> Re-Forensics</>}
                  </Button>
                </>
              )}
              {r.status === 'failed' && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={rowBusy(r.id)}
                    onClick={() => regenerate(r)}
                    className="border-amber-500 text-amber-600 hover:bg-amber-500/10 dark:text-amber-400"
                  >
                    {isBusy(r.id, 'regenerate')
                      ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Re-generating…</>
                      : <><RefreshCw className="h-3 w-3 mr-1" /> Re-generate (replace)</>}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={rowBusy(r.id)}
                    onClick={() => reHydrate(r)}
                    className="border-blue-500 text-blue-600 hover:bg-blue-500/10 dark:text-blue-400"
                    title="Re-pull identity, creator, socials, holders — full mesh hydration"
                  >
                    {isBusy(r.id, 'hydrate')
                      ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Re-hydrating…</>
                      : <><Droplet className="h-3 w-3 mr-1" /> Re-Hydrate</>}
                  </Button>
                  <Button size="sm" variant="outline" disabled={rowBusy(r.id)} onClick={() => retry(r)}>
                    {isBusy(r.id, 'retry')
                      ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Retrying…</>
                      : <><RefreshCw className="h-3 w-3 mr-1" /> Retry</>}
                  </Button>
                </>
              )}
              {r.status !== 'drafted' && r.status !== 'approved' && r.status !== 'failed' && (
                <>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={rowBusy(r.id)}
                  onClick={() => regenerate(r)}
                  className="border-amber-500 text-amber-600 hover:bg-amber-500/10 dark:text-amber-400"
                  title="Force-regenerate even while analyzing"
                >
                  {isBusy(r.id, 'regenerate')
                    ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Re-generating…</>
                    : <><RefreshCw className="h-3 w-3 mr-1" /> Re-generate</>}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={rowBusy(r.id)}
                  onClick={() => reHydrate(r)}
                  className="border-blue-500 text-blue-600 hover:bg-blue-500/10 dark:text-blue-400"
                  title="Re-pull identity, creator, socials, holders — full mesh hydration"
                >
                  {isBusy(r.id, 'hydrate')
                    ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Re-hydrating…</>
                    : <><Droplet className="h-3 w-3 mr-1" /> Re-Hydrate</>}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={rowBusy(r.id)}
                  onClick={() => reForensics(r)}
                  className="border-cyan-500 text-cyan-600 hover:bg-cyan-500/10 dark:text-cyan-400"
                  title="Re-pull on-chain forensics, then rewrite the report"
                >
                  {isBusy(r.id, 'forensics')
                    ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Re-forensics…</>
                    : <><Microscope className="h-3 w-3 mr-1" /> Re-Forensics</>}
                </Button>
                </>
              )}
          </div>

          {/* Title + status pills — full width, no compression */}
          <div className="flex items-center gap-2 flex-wrap">
            <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="font-semibold whitespace-nowrap">{r.ticker ? `$${r.ticker}` : <span className="italic text-muted-foreground">no ticker</span>}</span>
            <Badge variant={r.status === 'approved' ? 'default' : r.status === 'failed' ? 'destructive' : r.status === 'drafted' ? 'secondary' : 'outline'} className="text-[10px] whitespace-nowrap">
              {r.status}{r.current_version && r.current_version > 1 ? ` v${r.current_version}` : ''}
            </Badge>
            {r.tier && <Badge variant="outline" className="text-[10px] whitespace-nowrap">Tier {r.tier}</Badge>}
            {r.source_feed && <Badge variant="outline" className="text-[10px] whitespace-nowrap">{r.source_feed}</Badge>}
            {r.death_cause && <Badge variant="outline" className="text-[10px] whitespace-nowrap">{r.death_cause}</Badge>}
            {typeof r.social_completeness === 'number' && r.social_completeness > 0 && (
              <Badge variant="outline" className="text-[10px] whitespace-nowrap">socials {r.social_completeness}/6</Badge>
            )}
            {r.manual_tg_join_completed && <Badge variant="outline" className="text-[10px] whitespace-nowrap">TG✓</Badge>}
          </div>

          {/* Intel row: boost / vultures / dissent — full width, breathing room */}
          {(typeof r.boost_peak === 'number' && r.boost_peak > 0) ||
           (typeof r.vulture_count === 'number' && r.vulture_count > 0) ||
           (typeof r.dissent_score === 'number' && r.dissent_score > 0) ? (
            <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-border/40">
              {typeof r.boost_peak === 'number' && r.boost_peak > 0 && (
                <Badge variant="outline" className="text-[10px] border-amber-500/50 text-amber-600 dark:text-amber-400">
                  <Rocket className="h-2.5 w-2.5 mr-1" />boost peak {r.boost_peak}x
                  {r.boost_events ? ` · ${r.boost_events} events` : ''}
                </Badge>
              )}
              {typeof r.vulture_count === 'number' && r.vulture_count > 0 && (
                <Badge
                  variant="outline"
                  className="text-[10px] border-red-500/60 text-red-600 dark:text-red-400"
                  title={(r.vulture_handles ?? []).slice(0, 10).map(h => `@${h}`).join(', ')}
                >
                  <Skull className="h-2.5 w-2.5 mr-1" />{r.vulture_count} vultures
                  {(r.vulture_scam_urls?.length ?? 0) > 0 ? ` · ${r.vulture_scam_urls!.length} scam URLs` : ''}
                </Badge>
              )}
              {typeof r.dissent_score === 'number' && r.dissent_score > 0 && (
                <Badge
                  variant="outline"
                  className={`text-[10px] ${r.dissent_score >= 60 ? 'border-orange-500/70 text-orange-600 dark:text-orange-400' : 'border-amber-500/40 text-amber-600 dark:text-amber-400'}`}
                  title={`absent_dev=${r.dissent_absent_dev ?? 0}, no_marketing=${r.dissent_no_marketing ?? 0}, days since dev posted anywhere=${r.dissent_days_since_dev_anywhere ?? '?'}`}
                >
                  <Flame className="h-2.5 w-2.5 mr-1" />dissent {r.dissent_score}/100
                  {(r.dissent_absent_dev ?? 0) > 0 ? ` · ${r.dissent_absent_dev} "where's dev?"` : ''}
                </Badge>
              )}
            </div>
          ) : null}

          {/* Footer: mint + timestamps */}
          <div className="pt-1">
            <div className="text-[11px] text-muted-foreground font-mono truncate">{r.token_mint}</div>
            <div className="text-[10px] text-muted-foreground mt-1">
              {r.funneled_at && <>Queued {formatDistanceToNow(new Date(r.funneled_at), { addSuffix: true })}</>}
              {r.drafted_at && <> · Drafted {formatDistanceToNow(new Date(r.drafted_at), { addSuffix: true })}</>}
              {r.decided_at && <> · Decided {formatDistanceToNow(new Date(r.decided_at), { addSuffix: true })}</>}
            </div>
            {r.status === 'failed' && r.status_reason && (
              <div className="text-[10px] text-destructive mt-1 flex items-start gap-2 bg-destructive/5 border border-destructive/20 rounded px-2 py-1.5">
                <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold mb-0.5">
                    Last error{r.decided_at ? ` · ${formatDistanceToNow(new Date(r.decided_at), { addSuffix: true })}` : ''}
                  </div>
                  <div className="break-all opacity-80">{r.status_reason}</div>
                </div>
                <button
                  onClick={() => dismissError(r)}
                  className="shrink-0 opacity-60 hover:opacity-100 transition-opacity"
                  title="Dismiss this error"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}