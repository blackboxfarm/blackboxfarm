import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

interface Discovery {
  id: string;
  token_mint: string;
  token_symbol: string | null;
  token_name: string | null;
  source_id: string;
  source_message_id: number | null;
  discovered_at: string;
  mesh_status: string;
  xpost_status: string;
  watchlist_status: string;
  creator_wallet: string | null;
  funnel_feed_sources: { source_name: string } | null;
}

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-500/20 text-yellow-400',
  processing: 'bg-blue-500/20 text-blue-400',
  completed: 'bg-green-500/20 text-green-400',
  failed: 'bg-red-500/20 text-red-400',
  already_seen: 'bg-muted text-muted-foreground',
  already_exists: 'bg-muted text-muted-foreground',
  queued: 'bg-purple-500/20 text-purple-400',
  posted: 'bg-green-500/20 text-green-400',
  skipped: 'bg-muted text-muted-foreground',
  inserted: 'bg-green-500/20 text-green-400',
};

export function FunnelFeedDiscoveries() {
  const [discoveries, setDiscoveries] = useState<Discovery[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDiscoveries = async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke('funnel-feed-scanner', {
      body: { action: 'get_discoveries', limit: 200 },
    });
    if (!error && data?.discoveries) {
      setDiscoveries(data.discoveries);
    }
    setLoading(false);
  };

  useEffect(() => { fetchDiscoveries(); }, []);

  const shortMint = (m: string) => `${m.slice(0, 6)}...${m.slice(-4)}`;
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
          {discoveries.length} discoveries loaded
        </p>
        <Button onClick={fetchDiscoveries} size="sm" variant="outline" disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-8 text-muted-foreground">Loading...</div>
      ) : discoveries.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">No token discoveries yet. Scan some feeds first.</div>
      ) : (
        <div className="max-h-[600px] overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead compact>Token</TableHead>
                <TableHead compact>Mint</TableHead>
                <TableHead compact>Source</TableHead>
                <TableHead compact>Discovered</TableHead>
                <TableHead compact>Mesh</TableHead>
                <TableHead compact>Watchlist</TableHead>
                <TableHead compact>X Post</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {discoveries.map(d => (
                <TableRow key={d.id}>
                  <TableCell compact className="font-medium">
                    {d.token_symbol ? `$${d.token_symbol}` : '—'}
                    {d.token_name && <span className="text-muted-foreground ml-1 text-xs">{d.token_name}</span>}
                  </TableCell>
                  <TableCell compact>
                    <a
                      href={`https://pump.fun/${d.token_mint}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-xs hover:text-primary"
                    >
                      {shortMint(d.token_mint)}
                    </a>
                  </TableCell>
                  <TableCell compact className="text-xs">
                    {d.funnel_feed_sources?.source_name || '—'}
                  </TableCell>
                  <TableCell compact className="text-xs">{timeAgo(d.discovered_at)}</TableCell>
                  <TableCell compact>
                    <Badge variant="outline" className={`text-xs ${statusColors[d.mesh_status] || ''}`}>
                      {d.mesh_status}
                    </Badge>
                  </TableCell>
                  <TableCell compact>
                    <Badge variant="outline" className={`text-xs ${statusColors[d.watchlist_status] || ''}`}>
                      {d.watchlist_status}
                    </Badge>
                  </TableCell>
                  <TableCell compact>
                    <Badge variant="outline" className={`text-xs ${statusColors[d.xpost_status] || ''}`}>
                      {d.xpost_status}
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
