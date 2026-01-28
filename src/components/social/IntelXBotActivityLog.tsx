import React, { useState, useCallback, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { RefreshCw, ExternalLink, CheckCircle, XCircle, Clock, SkipForward, AlertCircle, Twitter } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { formatDistanceToNow } from 'date-fns';

interface QueueItem {
  id: string;
  token_mint: string;
  symbol: string;
  name: string;
  status: string;
  scheduled_at: string;
  posted_at: string | null;
  tweet_id: string | null;
  error_message: string | null;
  snapshot_slot: string;
  created_at: string;
  trigger_source?: string;
}

interface SeenToken {
  token_mint: string;
  symbol: string;
  name: string;
  snapshot_slot: string;
  times_seen: number;
  was_posted: boolean;
  health_grade: string | null;
  first_seen_at: string;
  last_seen_at: string;
}

interface TwitterMention {
  id: string;
  tweet_id: string;
  tweet_text: string;
  tweet_url: string;
  author_username: string;
  author_followers: number;
  detected_contracts: string[];
  engagement_score: number;
  queued_for_analysis: boolean;
  posted_at: string;
}

export function IntelXBotActivityLog() {
  const [activeTab, setActiveTab] = useState<'queue' | 'seen' | 'twitter' | 'stats'>('queue');
  const [queueItems, setQueueItems] = useState<QueueItem[]>([]);
  const [seenTokens, setSeenTokens] = useState<SeenToken[]>([]);
  const [twitterMentions, setTwitterMentions] = useState<TwitterMention[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  // Stats
  const [stats, setStats] = useState({
    totalPosted: 0,
    totalSkipped: 0,
    totalPending: 0,
    totalSeen: 0,
    uniquePosted: 0,
    twitterMentions: 0,
    twitterQueued: 0,
  });

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      // Fetch queue items
      const { data: queueData } = await supabase
        .from('holders_intel_post_queue')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      // Fetch seen tokens
      const { data: seenData } = await supabase
        .from('holders_intel_seen_tokens')
        .select('*')
        .order('last_seen_at', { ascending: false })
        .limit(100);

      // Fetch Twitter mentions
      const { data: twitterData } = await supabase
        .from('twitter_token_mentions')
        .select('*')
        .order('posted_at', { ascending: false })
        .limit(50);

      // Get counts for stats
      const { count: postedCount } = await supabase
        .from('holders_intel_post_queue')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'posted');

      const { count: skippedCount } = await supabase
        .from('holders_intel_post_queue')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'skipped');

      const { count: pendingCount } = await supabase
        .from('holders_intel_post_queue')
        .select('id', { count: 'exact', head: true })
        .in('status', ['pending', 'processing']);

      const { count: seenCount } = await supabase
        .from('holders_intel_seen_tokens')
        .select('token_mint', { count: 'exact', head: true });

      const { count: wasPostedCount } = await supabase
        .from('holders_intel_seen_tokens')
        .select('token_mint', { count: 'exact', head: true })
        .eq('was_posted', true);

      // Twitter mentions stats
      const { count: twitterMentionsCount } = await supabase
        .from('twitter_token_mentions')
        .select('id', { count: 'exact', head: true });

      const { count: twitterQueuedCount } = await supabase
        .from('twitter_token_mentions')
        .select('id', { count: 'exact', head: true })
        .eq('queued_for_analysis', true);

      setQueueItems((queueData || []) as QueueItem[]);
      setSeenTokens(seenData || []);
      setTwitterMentions((twitterData || []) as TwitterMention[]);
      setStats({
        totalPosted: postedCount || 0,
        totalSkipped: skippedCount || 0,
        totalPending: pendingCount || 0,
        totalSeen: seenCount || 0,
        uniquePosted: wasPostedCount || 0,
        twitterMentions: twitterMentionsCount || 0,
        twitterQueued: twitterQueuedCount || 0,
      });
      setLastRefresh(new Date());
    } catch (err) {
      console.error('Failed to fetch activity data:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'posted':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'skipped':
        return <SkipForward className="h-4 w-4 text-yellow-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'pending':
        return <Clock className="h-4 w-4 text-blue-500" />;
      case 'processing':
        return <RefreshCw className="h-4 w-4 text-purple-500 animate-spin" />;
      default:
        return <AlertCircle className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, string> = {
      posted: 'bg-green-600',
      skipped: 'bg-yellow-600',
      failed: 'bg-red-600',
      pending: 'bg-blue-600',
      processing: 'bg-purple-600',
    };
    return (
      <Badge className={`${variants[status] || 'bg-muted'} text-xs`}>
        {status}
      </Badge>
    );
  };

  const getHealthBadge = (grade: string | null) => {
    if (!grade) return <Badge variant="outline" className="text-xs">--</Badge>;
    const colors: Record<string, string> = {
      'A+': 'bg-emerald-600',
      'A': 'bg-green-600',
      'B+': 'bg-lime-600',
      'B': 'bg-yellow-600',
      'C+': 'bg-orange-500',
      'C': 'bg-orange-600',
      'D': 'bg-red-500',
      'F': 'bg-red-700',
    };
    return (
      <Badge className={`${colors[grade] || 'bg-muted'} text-xs`}>
        {grade}
      </Badge>
    );
  };

  const shortenMint = (mint: string) => `${mint.slice(0, 6)}...${mint.slice(-4)}`;

  return (
    <Card className="bg-card/50 border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              📊 Activity Log
            </CardTitle>
            <CardDescription>
              Monitor token fetching, filtering decisions, and post results
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {lastRefresh ? `Updated ${formatDistanceToNow(lastRefresh)} ago` : ''}
            </span>
            <Button
              onClick={fetchData}
              disabled={isLoading}
              variant="outline"
              size="sm"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary Stats */}
        <div className="grid grid-cols-7 gap-2 p-3 bg-muted/30 rounded-lg">
          <div className="text-center">
            <p className="text-xl font-bold text-green-500">{stats.totalPosted}</p>
            <p className="text-[10px] text-muted-foreground">Posted</p>
          </div>
          <div className="text-center">
            <p className="text-xl font-bold text-yellow-500">{stats.totalSkipped}</p>
            <p className="text-[10px] text-muted-foreground">Skipped</p>
          </div>
          <div className="text-center">
            <p className="text-xl font-bold text-blue-500">{stats.totalPending}</p>
            <p className="text-[10px] text-muted-foreground">Pending</p>
          </div>
          <div className="text-center">
            <p className="text-xl font-bold">{stats.totalSeen}</p>
            <p className="text-[10px] text-muted-foreground">Seen</p>
          </div>
          <div className="text-center">
            <p className="text-xl font-bold text-emerald-500">{stats.uniquePosted}</p>
            <p className="text-[10px] text-muted-foreground">Unique</p>
          </div>
          <div className="text-center">
            <p className="text-xl font-bold text-sky-500">{stats.twitterMentions}</p>
            <p className="text-[10px] text-muted-foreground">🐦 Scanned</p>
          </div>
          <div className="text-center">
            <p className="text-xl font-bold text-purple-500">{stats.twitterQueued}</p>
            <p className="text-[10px] text-muted-foreground">🐦 Queued</p>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="queue">Queue</TabsTrigger>
            <TabsTrigger value="seen">Seen</TabsTrigger>
            <TabsTrigger value="twitter">🐦 Twitter</TabsTrigger>
            <TabsTrigger value="stats">Stats</TabsTrigger>
          </TabsList>

          <TabsContent value="queue">
            <ScrollArea className="h-[400px] rounded-md border">
              <div className="p-4 space-y-2">
                {queueItems.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No queue items yet</p>
                ) : (
                  queueItems.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 p-3 bg-muted/20 rounded-lg hover:bg-muted/40 transition-colors"
                    >
                      {getStatusIcon(item.status)}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-muted-foreground">
                            {shortenMint(item.token_mint)}
                          </span>
                          {getStatusBadge(item.status)}
                          {item.snapshot_slot && (
                            <Badge variant="outline" className="text-[10px]">
                              {item.snapshot_slot}
                            </Badge>
                          )}
                        </div>
                        {item.error_message && (
                          <p className="text-xs text-muted-foreground mt-1 truncate">
                            ⚠️ {item.error_message}
                          </p>
                        )}
                        <p className="text-[10px] text-muted-foreground mt-1">
                          {item.posted_at
                            ? `Posted ${formatDistanceToNow(new Date(item.posted_at))} ago`
                            : `Scheduled ${formatDistanceToNow(new Date(item.scheduled_at))} ago`}
                        </p>
                      </div>
                      {item.tweet_id && (
                        <a
                          href={`https://x.com/HoldersIntel/status/${item.tweet_id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sky-500 hover:text-sky-400"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      )}
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="seen">
            <ScrollArea className="h-[400px] rounded-md border">
              <div className="p-4 space-y-2">
                {seenTokens.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No seen tokens yet</p>
                ) : (
                  seenTokens.map((token) => (
                    <div
                      key={token.token_mint}
                      className="flex items-center gap-3 p-3 bg-muted/20 rounded-lg hover:bg-muted/40 transition-colors"
                    >
                      {token.was_posted ? (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      ) : (
                        <Clock className="h-4 w-4 text-muted-foreground" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-muted-foreground">
                            {shortenMint(token.token_mint)}
                          </span>
                          {getHealthBadge(token.health_grade)}
                          <Badge variant={token.was_posted ? "default" : "outline"} className="text-[10px]">
                            {token.was_posted ? 'Posted' : 'Not Posted'}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] text-muted-foreground">
                            Seen {token.times_seen}x
                          </span>
                          <span className="text-[10px] text-muted-foreground">•</span>
                          <span className="text-[10px] text-muted-foreground">
                            {token.snapshot_slot}
                          </span>
                        </div>
                      </div>
                      <a
                        href={`https://dexscreener.com/solana/${token.token_mint}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="twitter">
            <ScrollArea className="h-[400px] rounded-md border">
              <div className="p-4 space-y-2">
                {twitterMentions.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No Twitter mentions scanned yet</p>
                ) : (
                  twitterMentions.map((mention) => (
                    <div
                      key={mention.id}
                      className="flex items-center gap-3 p-3 bg-muted/20 rounded-lg hover:bg-muted/40 transition-colors"
                    >
                      <Twitter className={`h-4 w-4 ${mention.queued_for_analysis ? 'text-sky-500' : 'text-muted-foreground'}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-medium">@{mention.author_username}</span>
                          <Badge variant="outline" className="text-[10px]">
                            {mention.author_followers?.toLocaleString()} followers
                          </Badge>
                          <Badge className={`text-[10px] ${mention.queued_for_analysis ? 'bg-purple-600' : 'bg-muted'}`}>
                            {mention.queued_for_analysis ? 'Queued' : 'Scanned'}
                          </Badge>
                          <Badge variant="outline" className="text-[10px]">
                            ❤️ {mention.engagement_score}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                          {mention.tweet_text}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          {mention.detected_contracts?.slice(0, 2).map((contract, i) => (
                            <span key={i} className="font-mono text-[10px] text-muted-foreground">
                              {shortenMint(contract)}
                            </span>
                          ))}
                          {mention.detected_contracts?.length > 2 && (
                            <span className="text-[10px] text-muted-foreground">
                              +{mention.detected_contracts.length - 2} more
                            </span>
                          )}
                        </div>
                      </div>
                      <a
                        href={mention.tweet_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sky-500 hover:text-sky-400"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="stats">
            <ScrollArea className="h-[400px] rounded-md border">
              <div className="p-4 space-y-3">
                <p className="text-sm font-medium mb-3">Decision Summary</p>
                
                {/* Group by snapshot slot */}
                {Array.from(new Set(queueItems.map(q => q.snapshot_slot))).map(slot => {
                  const slotItems = queueItems.filter(q => q.snapshot_slot === slot);
                  const posted = slotItems.filter(q => q.status === 'posted').length;
                  const skipped = slotItems.filter(q => q.status === 'skipped').length;
                  const pending = slotItems.filter(q => ['pending', 'processing'].includes(q.status)).length;
                  const errors = slotItems.filter(q => q.error_message).map(q => q.error_message);
                  const uniqueErrors = Array.from(new Set(errors));

                  return (
                    <div key={slot} className="p-3 bg-muted/20 rounded-lg space-y-2">
                      <div className="flex items-center justify-between">
                        <Badge variant="outline">{slot || 'Unknown Slot'}</Badge>
                        <span className="text-xs text-muted-foreground">
                          {slotItems.length} tokens
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div>
                          <p className="text-lg font-bold text-green-500">{posted}</p>
                          <p className="text-[10px] text-muted-foreground">Posted</p>
                        </div>
                        <div>
                          <p className="text-lg font-bold text-yellow-500">{skipped}</p>
                          <p className="text-[10px] text-muted-foreground">Skipped</p>
                        </div>
                        <div>
                          <p className="text-lg font-bold text-blue-500">{pending}</p>
                          <p className="text-[10px] text-muted-foreground">Pending</p>
                        </div>
                      </div>
                      {uniqueErrors.length > 0 && (
                        <div className="text-xs text-muted-foreground space-y-1 pt-2 border-t border-border">
                          <p className="font-medium">Skip Reasons:</p>
                          {uniqueErrors.map((err, i) => (
                            <p key={i} className="truncate">• {err}</p>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}

                {queueItems.length === 0 && (
                  <p className="text-center text-muted-foreground py-8">
                    No activity data yet. Start the XBot to begin tracking.
                  </p>
                )}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
