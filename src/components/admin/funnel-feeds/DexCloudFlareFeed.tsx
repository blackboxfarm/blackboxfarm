import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, Send, CheckCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface TrendingPair {
  rank: number;
  pairId: string;
  tokenMint: string;
  symbol: string | null;
  name: string | null;
  liquidityUsd: number | null;
  volume24h: number | null;
  priceUsd: string | null;
  fdv: number | null;
  url: string;
  dbStatus?: 'not_seen' | 'seen' | 'posted' | 'queued';
}

const statusConfig: Record<string, { label: string; className: string }> = {
  not_seen: { label: 'New', className: 'bg-yellow-500/20 text-yellow-400' },
  seen: { label: 'In DB', className: 'bg-blue-500/20 text-blue-400' },
  queued: { label: 'Queued', className: 'bg-purple-500/20 text-purple-400' },
  posted: { label: 'Posted', className: 'bg-green-500/20 text-green-400' },
};

export function DexCloudFlareFeed() {
  const [pairs, setPairs] = useState<TrendingPair[]>([]);
  const [loading, setLoading] = useState(true);
  const [queueing, setQueueing] = useState(false);
  const [health, setHealth] = useState<any>(null);
  const { toast } = useToast();

  const fetchTrending = async () => {
    setLoading(true);
    try {
      // Fetch from internal dex-top-200 edge function (Firecrawl-powered)
      const { data, error } = await supabase.functions.invoke('dex-top-200', { body: {} });

      if (error) throw new Error(error.message);
      if (!data?.success) throw new Error(data?.error || 'Unknown error');

      setHealth(data.health);

      const topPairs: TrendingPair[] = (data.tokens || [])
        .filter((t: any) => t.tokenMint)
        .map((t: any) => ({
          rank: t.rank,
          pairId: t.pairId,
          tokenMint: t.tokenMint,
          symbol: t.symbol,
          name: t.name,
          liquidityUsd: t.liquidityUsd,
          volume24h: t.volume24h,
          priceUsd: t.priceUsd,
          fdv: t.fdv,
          url: t.url || `https://dexscreener.com/solana/${t.pairId}`,
          dbStatus: 'not_seen' as const,
        }));

      // Cross-reference with our DB
      const mints = topPairs.map(p => p.tokenMint);

      const [seenRes, queueRes] = await Promise.all([
        supabase.from('holders_intel_seen_tokens').select('token_mint, was_posted').in('token_mint', mints),
        supabase.from('holders_intel_post_queue').select('token_mint, status').in('token_mint', mints),
      ]);

      const seenMap = new Map<string, boolean>();
      for (const r of (seenRes.data || [])) {
        seenMap.set(r.token_mint, r.was_posted ?? false);
      }
      // For queue, prioritize 'posted' status over 'pending'/'processing' for same mint
      const queueMap = new Map<string, string>();
      for (const q of (queueRes.data || [])) {
        const existing = queueMap.get(q.token_mint);
        if (q.status === 'posted' || !existing) {
          queueMap.set(q.token_mint, q.status);
        }
      }

      for (const p of topPairs) {
        const queueStatus = queueMap.get(p.tokenMint);
        const wasPosted = seenMap.get(p.tokenMint);
        if (queueStatus === 'posted' || wasPosted === true) p.dbStatus = 'posted';
        else if (queueStatus) p.dbStatus = 'queued';
        else if (seenMap.has(p.tokenMint)) p.dbStatus = 'seen';
        else p.dbStatus = 'not_seen';
      }

      setPairs(topPairs);
    } catch (err: any) {
      toast({ title: "Error fetching trending", description: err.message, variant: "destructive" });
    }
    setLoading(false);
  };

  useEffect(() => { fetchTrending(); }, []);

  const shortMint = (m: string) => `${m.slice(0, 6)}…${m.slice(-4)}`;
  const fmtUsd = (n: number | null) => n == null ? '—' : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(0)}K` : `$${n.toFixed(0)}`;

  const newCount = pairs.filter(p => p.dbStatus === 'not_seen').length;
  const seenCount = pairs.filter(p => p.dbStatus === 'seen').length;
  const queuedCount = pairs.filter(p => p.dbStatus === 'queued').length;
  const postedCount = pairs.filter(p => p.dbStatus === 'posted').length;

  const [reconciling, setReconciling] = useState(false);

  const reconcileFromX = async () => {
    setReconciling(true);
    try {
      const { data, error } = await supabase.functions.invoke('reconcile-x-posts', {
        body: { max_results: 100 },
      });
      if (error) throw new Error(error.message);
      toast({
        title: "Reconciliation complete",
        description: `Scanned ${data.tweets_scanned} tweets • ${data.unique_mints_found} mints found • ${data.queue_reconciled} queue updated • ${data.seen_reconciled} seen updated • ${data.already_correct} already correct`,
      });
      await fetchTrending();
    } catch (err: any) {
      toast({ title: "Reconcile error", description: err.message, variant: "destructive" });
    }
    setReconciling(false);
  };

  const queueAllNew = async () => {
    const newPairs = pairs.filter(p => p.dbStatus === 'not_seen' && p.tokenMint);
    if (newPairs.length === 0) {
      toast({ title: "No new tokens to queue" });
      return;
    }
    setQueueing(true);
    try {
      // Deduplicate: check which mints are already in queue
      const mints = newPairs.map(p => p.tokenMint!);
      const { data: existingQueue } = await supabase
        .from('holders_intel_post_queue')
        .select('token_mint')
        .in('token_mint', mints)
        .in('status', ['pending', 'processing']);
      
      const alreadyQueued = new Set((existingQueue || []).map(r => r.token_mint));
      const deduped = newPairs.filter(p => !alreadyQueued.has(p.tokenMint));
      
      if (deduped.length === 0) {
        toast({ title: "All tokens already queued" });
        setQueueing(false);
        return;
      }

      const rows = deduped.map(p => ({
        token_mint: p.tokenMint,
        symbol: p.symbol || null,
        name: p.name || null,
        market_cap: p.fdv || null,
        trigger_source: 'dex_top_200',
        trigger_comment: `🔥 DexScreener Trending #${p.rank}`,
        scheduled_at: new Date().toISOString(),
        status: 'pending',
      }));

      const { error } = await supabase.from('holders_intel_post_queue').insert(rows);
      if (error) throw new Error(error.message);

      toast({ title: `Queued ${newPairs.length} tokens for posting` });
      await fetchTrending(); // Refresh to update statuses
    } catch (err: any) {
      toast({ title: "Queue error", description: err.message, variant: "destructive" });
    }
    setQueueing(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <p className="text-sm text-muted-foreground">
            {pairs.length} trending tokens (Firecrawl Top 200)
            {health && !health.page1_ok && <span className="text-red-400 ml-1">⚠ Page 1 failed</span>}
            {health && !health.page2_ok && <span className="text-red-400 ml-1">⚠ Page 2 failed</span>}
            {health?.retry_used && <span className="text-yellow-400 ml-1">(retry used)</span>}
          </p>
          <div className="flex gap-2 text-xs">
            <Badge variant="outline" className="bg-yellow-500/20 text-yellow-400">{newCount} New</Badge>
            <Badge variant="outline" className="bg-blue-500/20 text-blue-400">{seenCount} In DB</Badge>
            <Badge variant="outline" className="bg-purple-500/20 text-purple-400">{queuedCount} Queued</Badge>
            <Badge variant="outline" className="bg-green-500/20 text-green-400">{postedCount} Posted</Badge>
          </div>
        </div>
        <div className="flex gap-2">
          {newCount > 0 && (
            <Button onClick={queueAllNew} size="sm" variant="outline" disabled={queueing || loading}
              className="text-yellow-400 border-yellow-500/30 hover:bg-yellow-500/10">
              <Send className={`h-4 w-4 mr-1 ${queueing ? 'animate-pulse' : ''}`} />
              Queue {newCount} New
            </Button>
          )}
          <Button onClick={reconcileFromX} size="sm" variant="outline" disabled={reconciling || loading}
            className="text-green-400 border-green-500/30 hover:bg-green-500/10">
            <CheckCheck className={`h-4 w-4 mr-1 ${reconciling ? 'animate-pulse' : ''}`} />
            {reconciling ? 'Reconciling…' : 'Reconcile from 𝕏'}
          </Button>
          <Button onClick={fetchTrending} size="sm" variant="outline" disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-8 text-muted-foreground">Fetching DexScreener Top 200…</div>
      ) : pairs.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">No trending data available.</div>
      ) : (
        <div className="max-h-[600px] overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead compact>Rank</TableHead>
                <TableHead compact>Token</TableHead>
                <TableHead compact>Mint</TableHead>
                <TableHead compact>Liquidity</TableHead>
                <TableHead compact>24h Vol</TableHead>
                <TableHead compact>FDV</TableHead>
                <TableHead compact>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pairs.map((p) => {
                const st = statusConfig[p.dbStatus || 'not_seen'];
                return (
                  <TableRow key={p.pairId}>
                    <TableCell compact className="text-muted-foreground text-xs font-mono">#{p.rank}</TableCell>
                    <TableCell compact className="font-medium">
                      {p.symbol ? `$${p.symbol}` : '—'}
                      {p.name && <span className="text-muted-foreground ml-1 text-xs">{p.name}</span>}
                    </TableCell>
                    <TableCell compact>
                      <a href={p.url} target="_blank" rel="noopener noreferrer"
                        className="font-mono text-xs hover:text-primary">
                        {shortMint(p.tokenMint)}
                      </a>
                    </TableCell>
                    <TableCell compact className="text-xs">{fmtUsd(p.liquidityUsd)}</TableCell>
                    <TableCell compact className="text-xs">{fmtUsd(p.volume24h)}</TableCell>
                    <TableCell compact className="text-xs">{fmtUsd(p.fdv)}</TableCell>
                    <TableCell compact>
                      <Badge variant="outline" className={`text-xs ${st.className}`}>{st.label}</Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
