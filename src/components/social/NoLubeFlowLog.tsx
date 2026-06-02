import React, { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, RefreshCw, CheckCircle2, Circle, XCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

/**
 * No Lube — Flow Log
 * Per CA, shows the 5-stage pipeline:
 *   1. Read CA from Insiders        (telegram_channel_calls)
 *   2. Posted CA to BlackBox        (ingest_started_at)
 *   3. Scraped BlackBox replies     (blackbox_harvested_at / mesh_hydrated_at)
 *   4. Posted CA to Private         (no_lube_post_log channel='private')
 *   5. Posted CA to Public          (no_lube_post_log channel='public')
 */

type Lifecycle = {
  token_mint: string;
  token_symbol: string | null;
  channel_name: string | null;
  first_called_at: string | null;
  first_call_message_id: number | null;
  ingest_started_at: string | null;
  ingest_completed_at: string | null;
  ingest_status: string | null;
  ingest_last_error: string | null;
  ingest_latency_ms: number | null;
  mesh_hydrated_at: string | null;
  holders_refreshed_at: string | null;
  blackbox_harvested_at: string | null;
};

type Post = {
  token_mint: string;
  channel: string | null;
  post_kind: string | null;
  posted: boolean | null;
  posted_at: string | null;
  block_reason: string | null;
  tg_message_id: number | null;
};

type Stage = {
  label: string;
  at: string | null;
  status: 'ok' | 'pending' | 'fail' | 'skip';
  detail?: string;
};

const fmtTime = (iso: string | null): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  const now = Date.now();
  const diff = (now - d.getTime()) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return d.toLocaleString();
};

const StageRow: React.FC<{ s: Stage }> = ({ s }) => {
  const Icon =
    s.status === 'ok' ? CheckCircle2 :
    s.status === 'fail' ? XCircle :
    Circle;
  const color =
    s.status === 'ok' ? 'text-emerald-500' :
    s.status === 'fail' ? 'text-red-500' :
    s.status === 'skip' ? 'text-muted-foreground' :
    'text-yellow-500';
  return (
    <div className="flex items-start gap-2 text-xs leading-tight">
      <Icon className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${color}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-medium truncate">{s.label}</span>
          <span className="text-muted-foreground whitespace-nowrap">{fmtTime(s.at)}</span>
        </div>
        {s.detail && (
          <div className="text-[10px] text-muted-foreground truncate">{s.detail}</div>
        )}
      </div>
    </div>
  );
};

export const NoLubeFlowLog: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [tokens, setTokens] = useState<Lifecycle[]>([]);
  const [postsByMint, setPostsByMint] = useState<Record<string, Post[]>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: lc } = await supabase
        .from('telegram_insider_token_lifecycle')
        .select('token_mint, token_symbol, channel_name, first_called_at, first_call_message_id, ingest_started_at, ingest_completed_at, ingest_status, ingest_last_error, ingest_latency_ms, mesh_hydrated_at, holders_refreshed_at, blackbox_harvested_at')
        .order('first_called_at', { ascending: false })
        .limit(30);
      const rows = (lc || []) as Lifecycle[];
      setTokens(rows);
      const mints = rows.map(r => r.token_mint);
      if (mints.length) {
        const { data: posts } = await supabase
          .from('no_lube_post_log')
          .select('token_mint, channel, post_kind, posted, posted_at, block_reason, tg_message_id')
          .in('token_mint', mints)
          .order('posted_at', { ascending: false });
        const map: Record<string, Post[]> = {};
        (posts || []).forEach((p: any) => {
          if (!map[p.token_mint]) map[p.token_mint] = [];
          map[p.token_mint].push(p);
        });
        setPostsByMint(map);
      } else {
        setPostsByMint({});
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const buildStages = (t: Lifecycle): Stage[] => {
    const posts = postsByMint[t.token_mint] || [];
    const priv = posts.find(p => p.channel === 'private' && p.posted);
    const pub = posts.find(p => p.channel === 'public' && p.posted);
    const privBlocked = !priv && posts.find(p => p.channel === 'private' && p.block_reason);
    const pubBlocked = !pub && posts.find(p => p.channel === 'public' && p.block_reason);

    return [
      {
        label: '1. Read CA from Insiders',
        at: t.first_called_at,
        status: t.first_called_at ? 'ok' : 'pending',
        detail: t.first_call_message_id ? `msg #${t.first_call_message_id}` : undefined,
      },
      {
        label: '2. Posted CA to BlackBox',
        at: t.ingest_started_at,
        status: t.ingest_started_at ? (t.ingest_last_error ? 'fail' : 'ok') : 'pending',
        detail: t.ingest_last_error ?? (t.ingest_status ?? undefined),
      },
      {
        label: '3. Scraped BlackBox replies',
        at: t.ingest_completed_at || t.blackbox_harvested_at || t.mesh_hydrated_at || t.holders_refreshed_at,
        status: t.ingest_completed_at
          ? (t.ingest_last_error ? 'fail' : 'ok')
          : 'pending',
        detail: t.ingest_latency_ms ? `${t.ingest_latency_ms}ms` : (t.ingest_status ?? undefined),
      },
      {
        label: `4. Posted CA to Private${priv?.post_kind ? ` (${priv.post_kind})` : ''}`,
        at: priv?.posted_at ?? privBlocked?.posted_at ?? null,
        status: priv ? 'ok' : (privBlocked ? 'fail' : 'pending'),
        detail: priv ? (priv.tg_message_id ? `tg msg #${priv.tg_message_id}` : undefined)
               : privBlocked?.block_reason ?? undefined,
      },
      {
        label: `5. Posted CA to Public${pub?.post_kind ? ` (${pub.post_kind})` : ''}`,
        at: pub?.posted_at ?? pubBlocked?.posted_at ?? null,
        status: pub ? 'ok' : (pubBlocked ? 'skip' : 'pending'),
        detail: pub ? (pub.tg_message_id ? `tg msg #${pub.tg_message_id}` : undefined)
               : pubBlocked?.block_reason ?? 'awaiting gate (e.g. MC ≥ $75k)',
      },
    ];
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div>
          <CardTitle className="text-base">Flow Log</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Insiders → BlackBox → Reply scrape → Private post → Public post
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading && tokens.length === 0 && (
          <div className="text-center py-8 text-sm text-muted-foreground">Loading…</div>
        )}
        {!loading && tokens.length === 0 && (
          <div className="text-center py-8 text-sm text-muted-foreground">No tokens yet.</div>
        )}
        {tokens.map(t => {
          const stages = buildStages(t);
          return (
            <div key={t.token_mint} className="border rounded-lg p-3 space-y-2 bg-card/50">
              <div className="flex items-center justify-between gap-2 pb-2 border-b">
                <div className="flex items-center gap-2 min-w-0">
                  <Badge variant="outline" className="font-mono text-[10px]">
                    ${t.token_symbol || '?'}
                  </Badge>
                  <span className="text-[10px] font-mono text-muted-foreground truncate">
                    {t.token_mint}
                  </span>
                </div>
                <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                  {fmtTime(t.first_called_at)}
                </span>
              </div>
              <div className="space-y-1.5">
                {stages.map((s, i) => <StageRow key={i} s={s} />)}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
};

export default NoLubeFlowLog;