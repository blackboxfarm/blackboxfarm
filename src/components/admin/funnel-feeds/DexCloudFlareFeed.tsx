import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const WORKER_URL = "https://dex-trending-solana.yayasanjembatanbali.workers.dev/api/trending/solana";

interface TrendingPair {
  pairId: string;
  tokenMint: string;
  symbol: string | null;
  name: string | null;
  liquidityUsd: number | null;
  volume24h: number | null;
  priceUsd: string | null;
  fdv: number | null;
  url: string;
  // enriched from our DB
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
  const [workerMeta, setWorkerMeta] = useState<{ timestamp?: number; stale?: boolean }>({});
  const { toast } = useToast();

  const fetchTrending = async () => {
    setLoading(true);
    try {
      // 1) Fetch from CloudFlare worker
      const res = await fetch(WORKER_URL);
      if (!res.ok) throw new Error(`Worker returned ${res.status}`);
      const data = await res.json();

      setWorkerMeta({ timestamp: data.timestamp, stale: data.stale });
      const workerPairs: TrendingPair[] = (data.pairs || []).filter((p: any) => p.ok).map((p: any) => ({
        pairId: p.pairId,
        tokenMint: p.tokenMint,
        symbol: p.symbol,
        name: p.name,
        liquidityUsd: p.liquidityUsd,
        volume24h: p.volume24h,
        priceUsd: p.priceUsd,
        fdv: p.fdv,
        url: p.url,
        dbStatus: 'not_seen' as const,
      }));

      // 2) Cross-reference with our DB: check seen tokens + post queue
      const mints = workerPairs.map(p => p.tokenMint);

      const [seenRes, queueRes] = await Promise.all([
        supabase.from('holders_intel_seen_tokens').select('token_mint').in('token_mint', mints),
        supabase.from('holders_intel_post_queue').select('token_mint, status').in('token_mint', mints),
      ]);

      const seenSet = new Set((seenRes.data || []).map(r => r.token_mint));
      const queueMap = new Map<string, string>();
      for (const q of (queueRes.data || [])) {
        queueMap.set(q.token_mint, q.status);
      }

      // 3) Enrich status
      for (const p of workerPairs) {
        const queueStatus = queueMap.get(p.tokenMint);
        if (queueStatus === 'posted') p.dbStatus = 'posted';
        else if (queueStatus) p.dbStatus = 'queued';
        else if (seenSet.has(p.tokenMint)) p.dbStatus = 'seen';
        else p.dbStatus = 'not_seen';
      }

      setPairs(workerPairs);
    } catch (err: any) {
      toast({ title: "Error fetching trending", description: err.message, variant: "destructive" });
    }
    setLoading(false);
  };

  useEffect(() => { fetchTrending(); }, []);

  const shortMint = (m: string) => `${m.slice(0, 6)}…${m.slice(-4)}`;
  const fmtUsd = (n: number | null) => n == null ? '—' : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(0)}K` : `$${n.toFixed(0)}`;
  const workerAge = workerMeta.timestamp ? `${Math.floor((Date.now() / 1000 - workerMeta.timestamp) / 60)}m ago` : '';

  // Stats
  const newCount = pairs.filter(p => p.dbStatus === 'not_seen').length;
  const seenCount = pairs.filter(p => p.dbStatus === 'seen').length;
  const queuedCount = pairs.filter(p => p.dbStatus === 'queued').length;
  const postedCount = pairs.filter(p => p.dbStatus === 'posted').length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <p className="text-sm text-muted-foreground">
            {pairs.length} trending tokens {workerAge && `· refreshed ${workerAge}`}
            {workerMeta.stale && <span className="text-yellow-400 ml-1">(stale cache)</span>}
          </p>
          <div className="flex gap-2 text-xs">
            <Badge variant="outline" className="bg-yellow-500/20 text-yellow-400">{newCount} New</Badge>
            <Badge variant="outline" className="bg-blue-500/20 text-blue-400">{seenCount} In DB</Badge>
            <Badge variant="outline" className="bg-purple-500/20 text-purple-400">{queuedCount} Queued</Badge>
            <Badge variant="outline" className="bg-green-500/20 text-green-400">{postedCount} Posted</Badge>
          </div>
        </div>
        <Button onClick={fetchTrending} size="sm" variant="outline" disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-8 text-muted-foreground">Fetching DexScreener trending…</div>
      ) : pairs.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">No trending data from worker.</div>
      ) : (
        <div className="max-h-[600px] overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead compact>#</TableHead>
                <TableHead compact>Token</TableHead>
                <TableHead compact>Mint</TableHead>
                <TableHead compact>Liquidity</TableHead>
                <TableHead compact>24h Vol</TableHead>
                <TableHead compact>FDV</TableHead>
                <TableHead compact>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pairs.map((p, i) => {
                const st = statusConfig[p.dbStatus || 'not_seen'];
                return (
                  <TableRow key={p.pairId}>
                    <TableCell compact className="text-muted-foreground text-xs">{i + 1}</TableCell>
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
