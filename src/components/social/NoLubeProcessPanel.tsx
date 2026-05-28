import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, RefreshCw, FileText, ExternalLink, Play } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import processMd from '../../../docs/no-lube-process.md?raw';

/**
 * No Lube — Private channel "Process" tab.
 * - Top: button to open the processing protocol (.md) in a popup.
 * - Below: live list of tokens scraped from the Insiders channel.
 *   Clicking a row opens a popup showing every lifecycle column as var = value,
 *   1 per line — mapped 1:1 to the .md spec.
 */

const FIELDS: string[] = [
  'token_symbol', 'token_mint', 'channel_name', 'launchpad',
  'entry_mc_text', 'entry_market_cap', 'peak_market_cap', 'peak_multiplier',
  'peak_reached_at', 'milestone_count', 'last_milestone_at', 'total_messages',
  'first_called_at',
  'ingest_status', 'ingest_started_at', 'ingest_completed_at', 'ingest_last_error', 'ingest_latency_ms',
  'creator_status', 'creator_wallet', 'creator_attempts',
  'creator_last_attempt_at', 'creator_resolved_at', 'creator_risk_tier',
  'dev_wallet', 'dev_wallet_source', 'dev_wallet_resolved_at', 'dev_history_warning',
  'kyc_status', 'kyc_label', 'kyc_attempts', 'kyc_last_attempt_at',
  'genealogy_depth', 'genealogy_kyc_root',
  'mesh_hydrated_at', 'mesh_promoted_at', 'mesh_promotion_status', 'mesh_promotion_reason',
  'holders_refreshed_at', 'blackbox_harvested_at',
  'enrichment_status', 'enrichment_last_run_at',
  'socials_changed', 'socials_last_checked_at',
  'is_rugged', 'lifespan_minutes', 'created_at', 'updated_at',
];

type Row = Record<string, unknown> & {
  id: string;
  token_mint: string;
  token_symbol: string | null;
  first_called_at: string;
  ingest_status: string | null;
  creator_status: string | null;
  kyc_status: string | null;
  mesh_hydrated_at: string | null;
  dev_wallet: string | null;
  dev_wallet_source: string | null;
  ingest_latency_ms: number | null;
};

type PostStatus = {
  snapshot?: { posted_at: string | null };
  private?: { posted_at: string | null; had_image: boolean; image_url: string | null };
  public?: { posted_at: string | null; had_image: boolean; image_url: string | null };
};

const fmt = (v: unknown): string => {
  if (v === null || v === undefined) return '∅ null';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
};

const short = (s: string, n = 6) => (s.length > n * 2 + 2 ? `${s.slice(0, n)}…${s.slice(-n)}` : s);

export function NoLubeProcessPanel() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [showDoc, setShowDoc] = useState(false);
  const [selected, setSelected] = useState<Row | null>(null);
  const [postStatus, setPostStatus] = useState<Record<string, PostStatus>>({});

  const load = async () => {
    setLoading(true);
    const { data: marker } = await (supabase as any)
      .from('pipeline_reset_markers')
      .select('reset_after')
      .eq('pipeline_name', 'insiders_no_lube_process_queue')
      .maybeSingle();

    let query = supabase
      .from('telegram_insider_token_lifecycle')
      .select(FIELDS.concat(['id']).join(','))
      .neq('ingest_status', 'archived')
      .order('first_called_at', { ascending: false });

    const resetAfter = (marker as { reset_after?: string } | null)?.reset_after;
    if (resetAfter) query = query.gt('created_at', resetAfter);

    const { data, error } = await query.limit(100);
    if (!error && data) setRows(data as unknown as Row[]);
    if (!error && data && data.length > 0) {
      const mints = (data as any[]).map(r => r.token_mint).filter(Boolean);
      const { data: posts } = await supabase
        .from('no_lube_post_log')
        .select('token_mint, channel, post_kind, posted_at, had_image, image_url, posted')
        .in('token_mint', mints)
        .eq('posted', true)
        .order('posted_at', { ascending: false });
      const byMint: Record<string, PostStatus> = {};
      for (const p of (posts || []) as any[]) {
        const slot = (byMint[p.token_mint] ||= {});
        if (p.post_kind === 'snapshot') {
          if (!slot.snapshot) slot.snapshot = { posted_at: p.posted_at };
          continue;
        }
        const ch = (p.channel === 'public' || p.channel === 'private') ? p.channel : null;
        if (!ch) continue;
        // first row per (mint, channel) wins because list is sorted DESC
        if (!slot[ch]) {
          slot[ch] = {
            posted_at: p.posted_at,
            had_image: !!p.had_image,
            image_url: p.image_url || null,
          };
        }
      }
      setPostStatus(byMint);
    } else {
      setPostStatus({});
    }
    setLoading(false);
  };

  const runPipeline = async () => {
    setRunning(true);
    try {
      await supabase.functions.invoke('insiders-pipeline-orchestrator', { body: {} });
      await load();
    } finally {
      setRunning(false);
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-4">
      <Card className="bg-card/60 border-border">
        <CardContent className="pt-4 flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">Insiders → No Lube pipeline</div>
            <p className="text-xs text-muted-foreground">
              Event-driven ingest: every new Insiders message triggers <code>insiders-row-ingest</code> the second it lands in DB.
              Dev wallet is resolved via Solscan <code>fund_by</code> in one call. If Solscan misses it, <code>dev_wallet_source = in_process</code>
              and the No-Lube poster shows "In Process" for that slot while background enrichment fills it in.
              <span className="text-muted-foreground"> Pre-pipeline backlog is archived and hidden.</span>
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowDoc(true)}>
              <FileText className="h-3 w-3 mr-1" /> View protocol
            </Button>
            <Button variant="outline" size="sm" onClick={runPipeline} disabled={running}>
              {running ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Play className="h-3 w-3 mr-1" />}
              Run pipeline now
            </Button>
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              {loading ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-1" />}
              Refresh
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card/60 border-border">
        <CardContent className="pt-4">
          <div className="text-xs text-muted-foreground mb-2">
            Last {rows.length} tokens scraped from the Insiders channel (newest first)
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead compact>Ticker / Mint</TableHead>
                <TableHead compact>Creator</TableHead>
                <TableHead compact>Dev wallet</TableHead>
                <TableHead compact>KYC</TableHead>
                <TableHead compact>Mesh</TableHead>
                <TableHead compact>Posted</TableHead>
                <TableHead compact>Latency</TableHead>
                <TableHead compact>First called</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(r => {
                const ps = postStatus[r.token_mint];
                return (
                <TableRow
                  key={r.id}
                  className="cursor-pointer"
                  onClick={() => setSelected(r)}
                >
                  <TableCell compact>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-pink-300">${r.token_symbol || '?'}</span>
                      <code className="text-[10px] text-muted-foreground font-mono">{short(r.token_mint)}</code>
                      <ExternalLink className="h-3 w-3 text-muted-foreground" />
                    </div>
                  </TableCell>
                  <TableCell compact><Badge variant="outline" className="text-[10px]">{r.creator_status || '—'}</Badge></TableCell>
                  <TableCell compact>
                    {r.dev_wallet ? (
                      <div className="flex flex-col">
                        <code className="text-[10px] font-mono">{short(r.dev_wallet)}</code>
                        <span className="text-[9px] text-muted-foreground">{r.dev_wallet_source}</span>
                      </div>
                    ) : (
                      <Badge variant="outline" className="text-[10px] text-amber-400 border-amber-400/50">
                        {r.dev_wallet_source === 'in_process' ? 'in_process' : '—'}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell compact><Badge variant="outline" className="text-[10px]">{r.kyc_status || '—'}</Badge></TableCell>
                  <TableCell compact>
                    <Badge variant="outline" className="text-[10px]">
                      {r.mesh_hydrated_at ? 'hydrated' : '—'}
                    </Badge>
                  </TableCell>
                  <TableCell compact>
                    <div className="flex flex-col gap-0.5">
                      {ps?.snapshot ? (
                        <Badge variant="outline" className="text-[10px] text-amber-300 border-amber-300/40">
                          ⚡ Snapshot
                        </Badge>
                      ) : (
                        <span className="text-[9px] text-muted-foreground">Snapshot —</span>
                      )}
                      {ps?.private ? (
                        <Badge variant="outline" className="text-[10px] text-emerald-400 border-emerald-400/40">
                          Private {ps.private.had_image ? '🖼️' : '📝'}
                        </Badge>
                      ) : (
                        <span className="text-[9px] text-muted-foreground">Private —</span>
                      )}
                      {ps?.public ? (
                        <Badge variant="outline" className="text-[10px] text-cyan-400 border-cyan-400/40">
                          Public {ps.public.had_image ? '🖼️' : '📝'}
                        </Badge>
                      ) : (
                        <span className="text-[9px] text-muted-foreground">Public —</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell compact className="text-[10px] text-muted-foreground">
                    {typeof r.ingest_latency_ms === 'number' ? `${r.ingest_latency_ms}ms` : '—'}
                  </TableCell>
                  <TableCell compact className="text-[10px] text-muted-foreground">
                    {new Date(r.first_called_at).toLocaleString()}
                  </TableCell>
                </TableRow>
                );
              })}
              {!loading && rows.length === 0 && (
                <TableRow><TableCell compact colSpan={8} className="text-center text-muted-foreground">No tokens yet.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Protocol .md popup */}
      <Dialog open={showDoc} onOpenChange={setShowDoc}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>No Lube — Processing Protocol</DialogTitle>
          </DialogHeader>
          <pre className="text-xs whitespace-pre-wrap font-mono leading-relaxed">{processMd}</pre>
        </DialogContent>
      </Dialog>

      {/* Per-token var=value popup */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>
              {selected?.token_symbol ? `$${selected.token_symbol}` : 'Token'} —{' '}
              <code className="text-xs">{selected?.token_mint}</code>
            </DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="font-mono text-xs space-y-0.5">
              {FIELDS.map(f => (
                <div key={f} className="grid grid-cols-[220px_1fr] gap-2 border-b border-border/30 py-0.5">
                  <span className="text-pink-300">{f}</span>
                  <span className="text-foreground break-all">= {fmt((selected as Record<string, unknown>)[f])}</span>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
