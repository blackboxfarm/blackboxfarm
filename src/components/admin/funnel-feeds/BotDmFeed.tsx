import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RefreshCw, MessageSquare, Users } from "lucide-react";

interface BotInteraction {
  id: string;
  token_mint: string;
  telegram_username: string | null;
  chat_type: string | null;
  chat_title: string | null;
  chat_id: number | null;
  command: string | null;
  response_status: string | null;
  created_at: string;
  // resolved
  symbol?: string | null;
  name?: string | null;
  queue_status?: string | null;
}

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-500/20 text-yellow-400',
  posted: 'bg-green-500/20 text-green-400',
  processing: 'bg-blue-500/20 text-blue-400',
  failed: 'bg-red-500/20 text-red-400',
  skipped: 'bg-muted text-muted-foreground',
  success: 'bg-green-500/20 text-green-400',
  expired: 'bg-orange-500/20 text-orange-400',
  error: 'bg-red-500/20 text-red-400',
};

export function BotDmFeed() {
  const [allEntries, setAllEntries] = useState<BotInteraction[]>([]);
  const [loading, setLoading] = useState(true);
  const [subTab, setSubTab] = useState("all");

  const fetchEntries = async () => {
    setLoading(true);

    // Fetch token interactions, excluding system_reset
    const { data: interactions } = await supabase
      .from('telegram_bot_interactions')
      .select('id, token_mint, telegram_username, chat_type, chat_title, chat_id, command, response_status, created_at')
      .not('token_mint', 'is', null)
      .neq('token_mint', '')
      .neq('telegram_username', 'system_reset')
      .order('created_at', { ascending: false })
      .limit(1000);

    if (!interactions || interactions.length === 0) {
      setAllEntries([]);
      setLoading(false);
      return;
    }

    // Deduplicate by token_mint — keep earliest occurrence per mint
    const seenMints = new Map<string, typeof interactions[0]>();
    for (const i of interactions) {
      if (!seenMints.has(i.token_mint)) {
        seenMints.set(i.token_mint, i);
      }
    }
    const unique = Array.from(seenMints.values());

    // Resolve symbols from token_lifecycle
    const mints = unique.map(u => u.token_mint);
    const { data: tokenData } = await supabase
      .from('token_lifecycle')
      .select('token_mint, symbol, name')
      .in('token_mint', mints.slice(0, 500));

    const tokenMap = new Map<string, { symbol: string | null; name: string | null }>();
    tokenData?.forEach(t => tokenMap.set(t.token_mint, { symbol: t.symbol, name: t.name }));

    // Check post queue status
    const { data: queueEntries } = await supabase
      .from('holders_intel_post_queue')
      .select('token_mint, status')
      .in('token_mint', mints.slice(0, 500));

    const queueMap = new Map<string, string>();
    queueEntries?.forEach(q => {
      const existing = queueMap.get(q.token_mint);
      if (!existing || q.status === 'posted') {
        queueMap.set(q.token_mint, q.status);
      }
    });

    const merged: BotInteraction[] = unique.map(i => {
      const resolved = tokenMap.get(i.token_mint);
      return {
        ...i,
        symbol: resolved?.symbol || null,
        name: resolved?.name || null,
        queue_status: queueMap.get(i.token_mint) || null,
      };
    });

    setAllEntries(merged);
    setLoading(false);
  };

  useEffect(() => { fetchEntries(); }, []);

  const dmEntries = allEntries.filter(e => e.chat_type === 'private');
  const groupEntries = allEntries.filter(e => e.chat_type !== 'private');
  const filtered = subTab === 'dm' ? dmEntries : subTab === 'groups' ? groupEntries : allEntries;

  const shortMint = (m: string) => `${m.slice(0, 6)}…${m.slice(-4)}`;
  const timeAgo = (ts: string) => {
    const diff = Date.now() - new Date(ts).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m`;
    if (mins < 1440) return `${Math.floor(mins / 60)}h`;
    return `${Math.floor(mins / 1440)}d`;
  };

  const formatSymbol = (e: BotInteraction) => {
    if (e.symbol && e.symbol !== '-' && e.symbol !== 'No Symbol') {
      return e.symbol.startsWith('$') ? e.symbol : `$${e.symbol}`;
    }
    return '—';
  };

  const getSourceLabel = (e: BotInteraction) => {
    if (e.chat_type === 'private') return 'DM';
    return e.chat_title || `Group ${e.chat_id}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {allEntries.length} unique tokens — {dmEntries.length} via DM, {groupEntries.length} via groups/channels
        </p>
        <Button onClick={fetchEntries} size="sm" variant="outline" disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      <Tabs value={subTab} onValueChange={setSubTab}>
        <TabsList>
          <TabsTrigger value="all">All ({allEntries.length})</TabsTrigger>
          <TabsTrigger value="dm">💬 DMs ({dmEntries.length})</TabsTrigger>
          <TabsTrigger value="groups">👥 Groups/Channels ({groupEntries.length})</TabsTrigger>
        </TabsList>
      </Tabs>

      {loading ? (
        <div className="text-center py-8 text-muted-foreground">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">No token interactions found.</div>
      ) : (
        <div className="max-h-[600px] overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead compact>Token</TableHead>
                <TableHead compact>Mint</TableHead>
                <TableHead compact>Source</TableHead>
                <TableHead compact>User</TableHead>
                <TableHead compact>Command</TableHead>
                <TableHead compact>When</TableHead>
                <TableHead compact>Response</TableHead>
                <TableHead compact>Queue</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(e => (
                <TableRow key={e.id}>
                  <TableCell compact className="font-medium text-sm">
                    {formatSymbol(e)}
                    {e.name && <span className="text-muted-foreground ml-1 text-xs">{e.name}</span>}
                  </TableCell>
                  <TableCell compact>
                    <a href={`https://dexscreener.com/solana/${e.token_mint}`} target="_blank" rel="noopener noreferrer"
                      className="font-mono text-xs hover:text-primary">
                      {shortMint(e.token_mint)}
                    </a>
                  </TableCell>
                  <TableCell compact>
                    <Badge variant="outline" className="text-xs flex items-center gap-1 w-fit">
                      {e.chat_type === 'private' ? <MessageSquare className="h-3 w-3" /> : <Users className="h-3 w-3" />}
                      {e.chat_type === 'private' ? 'DM' : (
                        <span className="max-w-[120px] truncate" title={getSourceLabel(e)}>
                          {getSourceLabel(e)}
                        </span>
                      )}
                    </Badge>
                  </TableCell>
                  <TableCell compact className="text-xs">
                    {e.telegram_username ? (
                      <a href={`https://t.me/${e.telegram_username}`} target="_blank" rel="noopener noreferrer"
                        className="hover:text-primary">
                        @{e.telegram_username}
                      </a>
                    ) : '—'}
                  </TableCell>
                  <TableCell compact className="text-xs text-muted-foreground">
                    {e.command || '—'}
                  </TableCell>
                  <TableCell compact className="text-xs">{timeAgo(e.created_at)}</TableCell>
                  <TableCell compact>
                    <Badge variant="outline" className={`text-xs ${statusColors[e.response_status || ''] || ''}`}>
                      {e.response_status || '—'}
                    </Badge>
                  </TableCell>
                  <TableCell compact>
                    {e.queue_status ? (
                      <Badge variant="outline" className={`text-xs ${statusColors[e.queue_status] || ''}`}>
                        {e.queue_status}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
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
