import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface QueueEntry {
  id: string;
  token_mint: string;
  symbol: string | null;
  name: string | null;
  status: string;
  trigger_source: string | null;
  trigger_comment: string | null;
  created_at: string;
  posted_at: string | null;
  tweet_id: string | null;
  market_cap: number | null;
}

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-500/20 text-yellow-400',
  processing: 'bg-blue-500/20 text-blue-400 animate-pulse',
  posted: 'bg-green-500/20 text-green-400',
  failed: 'bg-red-500/20 text-red-400',
  expired: 'bg-muted text-muted-foreground',
  skipped: 'bg-muted text-muted-foreground',
};

export function PostingQueueViewer() {
  const [entries, setEntries] = useState<QueueEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const { toast } = useToast();

  const fetchQueue = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('holders_intel_post_queue')
      .select('id, token_mint, symbol, name, status, trigger_source, trigger_comment, created_at, posted_at, tweet_id, market_cap')
      .in('status', ['pending', 'processing', 'posted'])
      .order('status', { ascending: true }) // processing first, then pending, then posted
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      toast({ title: "Error fetching queue", description: error.message, variant: "destructive" });
    } else {
      // Sort: processing → pending → posted (most recent)
      const sorted = (data || []).sort((a, b) => {
        const order: Record<string, number> = { processing: 0, pending: 1, posted: 2 };
        const statusDiff = (order[a.status] ?? 3) - (order[b.status] ?? 3);
        if (statusDiff !== 0) return statusDiff;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
      setEntries(sorted);
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => { fetchQueue(); }, [fetchQueue]);

  // Auto-refresh every 30s
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchQueue, 30000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchQueue]);

  const shortMint = (m: string) => `${m.slice(0, 6)}…${m.slice(-4)}`;

  const timeAgo = (ts: string) => {
    const diff = Date.now() - new Date(ts).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
    return `${Math.floor(mins / 1440)}d ago`;
  };

  const fmtMcap = (n: number | null) =>
    n == null ? '—' : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(0)}K` : `$${n.toFixed(0)}`;

  const pendingCount = entries.filter(e => e.status === 'pending').length;
  const processingCount = entries.filter(e => e.status === 'processing').length;
  const postedCount = entries.filter(e => e.status === 'posted').length;

  // The poster processes 3 per tick (every 3 min) — estimate batches
  const pendingEntries = entries.filter(e => e.status === 'pending');
  const batches: QueueEntry[][] = [];
  for (let i = 0; i < pendingEntries.length; i += 3) {
    batches.push(pendingEntries.slice(i, i + 3));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <p className="text-sm text-muted-foreground">
            Live Posting Queue — 3 tokens per cycle (~3 min intervals)
          </p>
          <div className="flex gap-2 text-xs">
            <Badge variant="outline" className="bg-blue-500/20 text-blue-400">{processingCount} Processing</Badge>
            <Badge variant="outline" className="bg-yellow-500/20 text-yellow-400">{pendingCount} Pending</Badge>
            <Badge variant="outline" className="bg-green-500/20 text-green-400">{postedCount} Posted (recent)</Badge>
          </div>
        </div>
        <div className="flex gap-2 items-center">
          <label className="flex items-center gap-1 text-xs text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded"
            />
            Auto-refresh
          </label>
          <Button onClick={fetchQueue} size="sm" variant="outline" disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>
      </div>

      {/* Batch preview */}
      {batches.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {batches.slice(0, 6).map((batch, idx) => (
            <div key={idx} className="rounded-lg border border-border/50 bg-card/50 p-3 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">
                  {idx === 0 && processingCount === 0 ? '⏳ Next cycle' : idx === 0 ? '🔄 After current' : `Cycle +${idx + 1}`}
                </span>
                <span className="text-xs text-muted-foreground">~{(idx + 1) * 3}min</span>
              </div>
              {batch.map(entry => (
                <div key={entry.id} className="flex items-center justify-between text-sm">
                  <span className="font-medium">${entry.symbol || '?'}</span>
                  <span className="text-xs text-muted-foreground">{fmtMcap(entry.market_cap)}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {processingCount > 0 && (
        <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-3">
          <p className="text-sm font-medium text-blue-400 mb-2">🔄 Currently Processing</p>
          <div className="flex flex-wrap gap-2">
            {entries.filter(e => e.status === 'processing').map(e => (
              <Badge key={e.id} variant="outline" className="bg-blue-500/20 text-blue-400">
                ${e.symbol || shortMint(e.token_mint)}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {loading && entries.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">Loading queue…</div>
      ) : entries.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">Queue is empty.</div>
      ) : (
        <div className="max-h-[500px] overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead compact>#</TableHead>
                <TableHead compact>Token</TableHead>
                <TableHead compact>Mint</TableHead>
                <TableHead compact>MCap</TableHead>
                <TableHead compact>Source</TableHead>
                <TableHead compact>Queued</TableHead>
                <TableHead compact>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((e, idx) => (
                <TableRow key={e.id} className={e.status === 'processing' ? 'bg-blue-500/5' : ''}>
                  <TableCell compact className="text-xs text-muted-foreground font-mono">{idx + 1}</TableCell>
                  <TableCell compact className="font-medium">
                    {e.symbol ? `$${e.symbol}` : '—'}
                    {e.name && e.name !== e.symbol && (
                      <span className="text-muted-foreground ml-1 text-xs">{e.name}</span>
                    )}
                  </TableCell>
                  <TableCell compact>
                    <a
                      href={`https://dexscreener.com/solana/${e.token_mint}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-xs hover:text-primary"
                    >
                      {shortMint(e.token_mint)}
                    </a>
                  </TableCell>
                  <TableCell compact className="text-xs">{fmtMcap(e.market_cap)}</TableCell>
                  <TableCell compact className="text-xs">
                    <Badge variant="outline" className="text-xs">{e.trigger_source || '—'}</Badge>
                  </TableCell>
                  <TableCell compact className="text-xs">{timeAgo(e.created_at)}</TableCell>
                  <TableCell compact>
                    <Badge variant="outline" className={`text-xs ${statusColors[e.status] || ''}`}>
                      {e.status}
                      {e.status === 'posted' && e.tweet_id && (
                        <a
                          href={`https://x.com/i/status/${e.tweet_id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ml-1 underline"
                        >
                          ↗
                        </a>
                      )}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
