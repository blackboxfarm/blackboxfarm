import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, Zap, Skull, Undo2, ExternalLink } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { fetchTemplate, processTemplate, type TokenShareData } from "@/lib/share-template";

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
  xpost_processed_at: string | null;
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
  killed: 'bg-red-500/20 text-red-400',
};

const torontoTime = (d?: Date) =>
  (d || new Date()).toLocaleString('en-CA', {
    timeZone: 'America/Toronto',
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

export function FunnelFeedDiscoveries() {
  const [discoveries, setDiscoveries] = useState<Discovery[]>([]);
  const [loading, setLoading] = useState(true);
  const [pushing, setPushing] = useState<Record<string, boolean>>({});
  const [pushedAt, setPushedAt] = useState<Record<string, string>>({});
  const [killing, setKilling] = useState<Record<string, boolean>>({});

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

  const handlePush = async (d: Discovery) => {
    setPushing(prev => ({ ...prev, [d.id]: true }));
    try {
      // 1. Fetch holder report
      const { data: reportData, error: reportError } = await supabase.functions.invoke('bagless-holders-report', {
        body: { tokenMint: d.token_mint },
      });
      if (reportError) throw reportError;
      if (!reportData || !reportData.holders) throw new Error('No holder data returned');

      const totalHolders = reportData.totalHolders || 0;
      const dustCount = reportData.dustWallets ?? 0;
      const dustPercentage = totalHolders > 0 ? parseFloat(((dustCount / totalHolders) * 100).toFixed(2)) : 0;

      // 2. Fetch AI summary
      let aiSummary = '';
      let lifecycle = '';
      try {
        const { data: aiData } = await supabase.functions.invoke('token-ai-interpreter', {
          body: { reportData, tokenMint: d.token_mint },
        });
        aiSummary = aiData?.interpretation?.abbreviated_summary ?? '';
        lifecycle = aiData?.interpretation?.lifecycle?.stage ?? '';
      } catch { /* non-blocking */ }

      // 3. Fetch active template
      const { data: activeRow } = await supabase
        .from('holders_intel_templates')
        .select('template_name')
        .eq('is_active', true)
        .single();
      const activeTemplateName = (activeRow?.template_name as 'small' | 'large') || 'large';
      const templateText = await fetchTemplate(activeTemplateName);

      // 4. Build token data and render template
      const tokenData: TokenShareData = {
        ticker: reportData.tokenSymbol || reportData.symbol || d.token_symbol || 'UNKNOWN',
        name: reportData.tokenName || reportData.name || d.token_name || 'Unknown Token',
        tokenAddress: d.token_mint,
        totalWallets: totalHolders,
        realHolders: reportData.realWalletCount ?? 0,
        dustCount,
        dustPercentage,
        whales: reportData.trueWhaleWallets ?? 0 + (reportData.babyWhaleWallets ?? 0) + (reportData.superBossWallets ?? 0) + (reportData.kingpinWallets ?? 0),
        serious: reportData.bossWallets ?? 0,
        realRetail: reportData.realWalletCount ?? 0,
        casual: (reportData.smallWallets ?? 0) + (reportData.mediumWallets ?? 0) + (reportData.largeWallets ?? 0),
        retail: (reportData.smallWallets ?? 0) + (reportData.mediumWallets ?? 0) + (reportData.largeWallets ?? 0),
        healthGrade: reportData.stabilityGrade ?? 'N/A',
        healthScore: reportData.stabilityScore ?? 0,
        comment1: '-On the Radar-',
        aiSummary,
        aiOverview: '',
        lifecycle,
      };
      const tweetText = processTemplate(templateText, tokenData);

      // 5. Post directly to X via post-share-card-twitter
      const { data: postResult, error: postError } = await supabase.functions.invoke('post-share-card-twitter', {
        body: { tweetText, twitterHandle: 'HoldersIntel' },
      });
      if (postError) throw postError;
      if (postResult && !postResult.success && !postResult.paused) {
        throw new Error(postResult.error || 'Failed to post tweet');
      }

      // 6. Update discovery status to posted
      await supabase
        .from('funnel_feed_discoveries')
        .update({ xpost_status: 'posted', xpost_processed_at: new Date().toISOString() })
        .eq('id', d.id);

      const ts = torontoTime();
      setPushedAt(prev => ({ ...prev, [d.id]: ts }));
      setDiscoveries(prev => prev.map(item =>
        item.id === d.id ? { ...item, xpost_status: 'posted', xpost_processed_at: new Date().toISOString() } : item
      ));

      const statusMsg = postResult?.paused ? 'Queued (X paused)' : 'Posted to X + TG';
      toast({ title: 'Pushed!', description: `${d.token_symbol || d.token_mint.slice(0, 8)} — ${statusMsg}` });
    } catch (err: any) {
      console.error('Manual push failed:', err);
      toast({ title: 'Push failed', description: err.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setPushing(prev => ({ ...prev, [d.id]: false }));
    }
  };

  const handleKillToggle = async (d: Discovery) => {
    const isKilled = d.xpost_status === 'killed';
    const newStatus = isKilled ? 'pending' : 'killed';
    setKilling(prev => ({ ...prev, [d.id]: true }));
    try {
      const { error } = await supabase
        .from('funnel_feed_discoveries')
        .update({ xpost_status: newStatus })
        .eq('id', d.id);
      if (error) throw error;

      setDiscoveries(prev => prev.map(item =>
        item.id === d.id ? { ...item, xpost_status: newStatus } : item
      ));
      toast({
        title: isKilled ? 'Reversed' : 'Killed',
        description: `${d.token_symbol || d.token_mint.slice(0, 8)} ${isKilled ? 'restored to pending' : 'blocked from posting'}`,
      });
    } catch (err: any) {
      toast({ title: 'Failed', description: err.message, variant: 'destructive' });
    } finally {
      setKilling(prev => ({ ...prev, [d.id]: false }));
    }
  };

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
                <TableHead compact>Manual PUSH</TableHead>
                <TableHead compact>KILL</TableHead>
                <TableHead compact>Padre</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {discoveries.map(d => {
                const isKilled = d.xpost_status === 'killed';
                const isPosted = d.xpost_status === 'posted' || !!pushedAt[d.id];
                const isPushing = pushing[d.id];
                const isKilling = killing[d.id];
                const postedTime = pushedAt[d.id] || (d.xpost_processed_at ? torontoTime(new Date(d.xpost_processed_at)) : null);

                return (
                  <TableRow key={d.id} className={isKilled ? 'opacity-50' : ''}>
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
                    {/* Manual PUSH */}
                    <TableCell compact>
                      {isPosted && postedTime ? (
                        <span className="text-xs text-green-400">{postedTime}</span>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 px-2 text-xs"
                          disabled={isPushing || isKilled}
                          onClick={() => handlePush(d)}
                        >
                          {isPushing ? (
                            <RefreshCw className="h-3 w-3 animate-spin" />
                          ) : (
                            <><Zap className="h-3 w-3 mr-1" />PUSH</>
                          )}
                        </Button>
                      )}
                    </TableCell>
                    {/* KILL / REVERSE */}
                    <TableCell compact>
                      {isPosted ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : (
                        <Button
                          size="sm"
                          variant={isKilled ? 'outline' : 'destructive'}
                          className="h-6 px-2 text-xs"
                          disabled={isKilling}
                          onClick={() => handleKillToggle(d)}
                        >
                          {isKilling ? (
                            <RefreshCw className="h-3 w-3 animate-spin" />
                          ) : isKilled ? (
                            <><Undo2 className="h-3 w-3 mr-1" />REVERSE</>
                          ) : (
                            <><Skull className="h-3 w-3 mr-1" />KILL</>
                          )}
                        </Button>
                      )}
                    </TableCell>
                    {/* Padre link */}
                    <TableCell compact>
                      <a
                        href={`https://trade.padre.gg/trade/solana/${d.token_mint}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center text-xs hover:text-primary"
                      >
                        <ExternalLink className="h-3 w-3" />
                      </a>
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
