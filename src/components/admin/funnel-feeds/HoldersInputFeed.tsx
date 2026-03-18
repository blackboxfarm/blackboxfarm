import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

interface HoldersEntry {
  id: string;
  token_mint: string;
  symbol: string | null;
  name: string | null;
  status: string;
  trigger_source: string | null;
  trigger_comment: string | null;
  scheduled_at: string;
  posted_at: string | null;
}

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-500/20 text-yellow-400',
  posted: 'bg-green-500/20 text-green-400',
  failed: 'bg-red-500/20 text-red-400',
  skipped: 'bg-muted text-muted-foreground',
};

export function HoldersInputFeed() {
  const [entries, setEntries] = useState<HoldersEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchEntries = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('holders_intel_post_queue')
      .select('id, token_mint, symbol, name, status, trigger_source, trigger_comment, scheduled_at, posted_at')
      .or('trigger_source.ilike.%holders%,trigger_source.eq.holders_query,trigger_source.eq./holders,trigger_source.ilike.%holder_input%')
      .order('scheduled_at', { ascending: false })
      .limit(200);

    setEntries((data as HoldersEntry[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchEntries(); }, []);

  const shortMint = (m: string) => `${m.slice(0, 6)}…${m.slice(-4)}`;
  const timeAgo = (ts: string) => {
    const diff = Date.now() - new Date(ts).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m`;
    if (mins < 1440) return `${Math.floor(mins / 60)}h`;
    return `${Math.floor(mins / 1440)}d`;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {entries.length} tokens submitted via /holders input
        </p>
        <Button onClick={fetchEntries} size="sm" variant="outline" disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-8 text-muted-foreground">Loading…</div>
      ) : entries.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">No /holders submissions yet.</div>
      ) : (
        <div className="max-h-[600px] overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead compact>Token</TableHead>
                <TableHead compact>Mint</TableHead>
                <TableHead compact>Source</TableHead>
                <TableHead compact>Comment</TableHead>
                <TableHead compact>Submitted</TableHead>
                <TableHead compact>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map(e => (
                <TableRow key={e.id}>
                  <TableCell compact className="font-medium">
                    {e.symbol ? `$${e.symbol}` : '—'}
                    {e.name && <span className="text-muted-foreground ml-1 text-xs">{e.name}</span>}
                  </TableCell>
                  <TableCell compact>
                    <a href={`https://pump.fun/${e.token_mint}`} target="_blank" rel="noopener noreferrer"
                      className="font-mono text-xs hover:text-primary">
                      {shortMint(e.token_mint)}
                    </a>
                  </TableCell>
                  <TableCell compact className="text-xs">
                    <Badge variant="outline" className="text-xs">{e.trigger_source || '—'}</Badge>
                  </TableCell>
                  <TableCell compact className="text-xs text-muted-foreground max-w-[200px] truncate">
                    {e.trigger_comment || '—'}
                  </TableCell>
                  <TableCell compact className="text-xs">{timeAgo(e.scheduled_at)}</TableCell>
                  <TableCell compact>
                    <Badge variant="outline" className={`text-xs ${statusColors[e.status] || ''}`}>
                      {e.status}
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
