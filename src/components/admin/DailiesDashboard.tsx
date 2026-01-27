import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { format, isToday, subDays, addDays, startOfDay } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { 
  ChevronLeft, 
  ChevronRight, 
  CalendarIcon, 
  Search, 
  Zap, 
  TrendingUp, 
  Flame,
  ExternalLink,
  Copy,
  Twitter,
  MessageCircle,
  Globe,
  ChevronDown,
  ListOrdered,
  Megaphone,
  AlertTriangle,
  FileText,
  Reply,
  Users
} from 'lucide-react';
import { toast } from 'sonner';

interface DailyToken {
  token_mint: string;
  symbol: string | null;
  name: string | null;
  wasSearched: boolean;
  searchCount: number;
  uniqueIps: number;
  wasSurge: boolean;
  surgeType: string | null;
  postedTop50: boolean;
  top50TweetId: string | null;
  postedDexTrigger: boolean;
  dexTweetId: string | null;
  postedSurge: boolean;
  surgeTweetId: string | null;
  totalHolders: number | null;
  dustHolders: number | null;
  realHolders: number | null;
  healthGrade: string | null;
  twitter: string | null;
  telegram: string | null;
  website: string | null;
  rawFeedComment: boolean;
  replyToPost: boolean;
  communityComment: boolean;
  lastActivityAt: string | null;
}

type SortBy = 'time' | 'searches' | 'posted';

export function DailiesDashboard() {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [tokens, setTokens] = useState<DailyToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedToken, setExpandedToken] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortBy>('time');
  const [calendarOpen, setCalendarOpen] = useState(false);

  const fetchDailiesData = useCallback(async () => {
    setLoading(true);
    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    const startOfDayStr = `${dateStr}T00:00:00.000Z`;
    const endOfDayStr = `${dateStr}T23:59:59.999Z`;

    try {
      // Fetch all data sources in parallel
      const [searchesRes, surgesRes, postsRes, commentsRes, socialsRes] = await Promise.all([
        // Token searches for this date
        supabase
          .from('token_search_log')
          .select('token_mint, ip_address, created_at')
          .gte('created_at', startOfDayStr)
          .lte('created_at', endOfDayStr),
        
        // Surge alerts for this date
        supabase
          .from('holders_intel_surge_alerts')
          .select('token_mint, alert_type, detected_at, queue_id, symbol, name')
          .gte('detected_at', startOfDayStr)
          .lte('detected_at', endOfDayStr),
        
        // Posts for this date
        supabase
          .from('holders_intel_post_queue')
          .select('token_mint, trigger_source, status, tweet_id, posted_at, created_at, symbol')
          .gte('created_at', startOfDayStr)
          .lte('created_at', endOfDayStr)
          .eq('status', 'posted'),
        
        // Manual comments for this date
        supabase
          .from('dailies_manual_comments')
          .select('*')
          .eq('comment_date', dateStr),
        
        // Get socials for tokens (will filter later)
        supabase
          .from('token_socials_history')
          .select('token_mint, twitter, telegram, website')
          .order('created_at', { ascending: false })
      ]);

      // Fetch seen tokens for metadata
      const { data: seenTokens } = await supabase
        .from('holders_intel_seen_tokens')
        .select('token_mint, symbol, name, health_grade');

      const seenTokensMap = new Map(
        (seenTokens || []).map(t => [t.token_mint, t])
      );

      // Fetch latest search results for holder counts
      const { data: searchResults } = await supabase
        .from('token_search_results')
        .select('token_mint, symbol, name, tier_dust, tier_retail, tier_serious, tier_whale')
        .order('created_at', { ascending: false });

      const holderDataMap = new Map<string, { total: number; dust: number }>();
      for (const r of searchResults || []) {
        if (!holderDataMap.has(r.token_mint)) {
          const total = (r.tier_dust || 0) + (r.tier_retail || 0) + (r.tier_serious || 0) + (r.tier_whale || 0);
          holderDataMap.set(r.token_mint, { total, dust: r.tier_dust || 0 });
        }
      }

      // Aggregate searches by token
      const searchesByToken = new Map<string, { count: number; uniqueIps: Set<string>; lastAt: string }>();
      for (const s of searchesRes.data || []) {
        const existing = searchesByToken.get(s.token_mint) || { count: 0, uniqueIps: new Set(), lastAt: s.created_at };
        existing.count++;
        if (s.ip_address) existing.uniqueIps.add(s.ip_address);
        if (s.created_at > existing.lastAt) existing.lastAt = s.created_at;
        searchesByToken.set(s.token_mint, existing);
      }

      // Map surges by token (take highest priority)
      const surgesByToken = new Map<string, { type: string; symbol: string | null; name: string | null }>();
      const surgePriority: Record<string, number> = { 'surge_10min': 1, 'spike_1hr': 2, 'trending_24hr': 3 };
      for (const s of surgesRes.data || []) {
        const existing = surgesByToken.get(s.token_mint);
        if (!existing || (surgePriority[s.alert_type] || 99) < (surgePriority[existing.type] || 99)) {
          surgesByToken.set(s.token_mint, { type: s.alert_type, symbol: s.symbol, name: s.name });
        }
      }

      // Map posts by token and type
      const postsByToken = new Map<string, { top50?: string; dex?: string; surge?: string; symbol?: string; lastAt?: string }>();
      for (const p of postsRes.data || []) {
        const existing = postsByToken.get(p.token_mint) || {};
        if (p.trigger_source === 'scheduler') existing.top50 = p.tweet_id;
        else if (p.trigger_source === 'dex_scanner') existing.dex = p.tweet_id;
        else if (p.trigger_source === 'surge_scanner') existing.surge = p.tweet_id;
        if (p.symbol) existing.symbol = p.symbol;
        if (p.posted_at && (!existing.lastAt || p.posted_at > existing.lastAt)) existing.lastAt = p.posted_at;
        postsByToken.set(p.token_mint, existing);
      }

      // Map comments by token
      const commentsByToken = new Map(
        (commentsRes.data || []).map(c => [c.token_mint, c])
      );

      // Map socials by token (latest entry)
      const socialsByToken = new Map<string, { twitter: string | null; telegram: string | null; website: string | null }>();
      for (const s of socialsRes.data || []) {
        if (!socialsByToken.has(s.token_mint)) {
          socialsByToken.set(s.token_mint, { twitter: s.twitter, telegram: s.telegram, website: s.website });
        }
      }

      // Collect all unique tokens
      const allTokenMints = new Set<string>();
      searchesByToken.forEach((_, k) => allTokenMints.add(k));
      surgesByToken.forEach((_, k) => allTokenMints.add(k));
      postsByToken.forEach((_, k) => allTokenMints.add(k));

      // Build consolidated token list
      const consolidatedTokens: DailyToken[] = Array.from(allTokenMints).map(mint => {
        const searches = searchesByToken.get(mint);
        const surge = surgesByToken.get(mint);
        const posts = postsByToken.get(mint);
        const comments = commentsByToken.get(mint);
        const socials = socialsByToken.get(mint);
        const seen = seenTokensMap.get(mint);
        const holderData = holderDataMap.get(mint);

        return {
          token_mint: mint,
          symbol: seen?.symbol || surge?.symbol || posts?.symbol || null,
          name: seen?.name || surge?.name || null,
          wasSearched: !!searches,
          searchCount: searches?.count || 0,
          uniqueIps: searches?.uniqueIps.size || 0,
          wasSurge: !!surge,
          surgeType: surge?.type || null,
          postedTop50: !!posts?.top50,
          top50TweetId: posts?.top50 || null,
          postedDexTrigger: !!posts?.dex,
          dexTweetId: posts?.dex || null,
          postedSurge: !!posts?.surge,
          surgeTweetId: posts?.surge || null,
          totalHolders: holderData?.total || null,
          dustHolders: holderData?.dust || null,
          realHolders: holderData ? holderData.total - holderData.dust : null,
          healthGrade: seen?.health_grade || null,
          twitter: socials?.twitter || null,
          telegram: socials?.telegram || null,
          website: socials?.website || null,
          rawFeedComment: comments?.raw_feed_comment || false,
          replyToPost: comments?.reply_to_post || false,
          communityComment: comments?.community_comment || false,
          lastActivityAt: searches?.lastAt || posts?.lastAt || null
        };
      });

      setTokens(consolidatedTokens);
    } catch (error) {
      console.error('Error fetching dailies data:', error);
      toast.error('Failed to fetch dailies data');
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    fetchDailiesData();
  }, [fetchDailiesData]);

  // Real-time subscription for today
  useEffect(() => {
    if (!isToday(selectedDate)) return;

    const channel = supabase
      .channel('dailies-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'token_search_log' }, () => fetchDailiesData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'holders_intel_post_queue' }, () => fetchDailiesData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'holders_intel_surge_alerts' }, () => fetchDailiesData())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [selectedDate, fetchDailiesData]);

  const handleCommentChange = async (tokenMint: string, field: 'raw_feed_comment' | 'reply_to_post' | 'community_comment', value: boolean) => {
    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    
    // Optimistic update
    setTokens(prev => prev.map(t => 
      t.token_mint === tokenMint 
        ? { ...t, [field === 'raw_feed_comment' ? 'rawFeedComment' : field === 'reply_to_post' ? 'replyToPost' : 'communityComment']: value }
        : t
    ));

    try {
      const { error } = await supabase
        .from('dailies_manual_comments')
        .upsert({
          token_mint: tokenMint,
          comment_date: dateStr,
          [field]: value
        }, { onConflict: 'token_mint,comment_date' });

      if (error) throw error;
    } catch (error) {
      console.error('Error updating comment:', error);
      toast.error('Failed to update comment');
      fetchDailiesData(); // Revert on error
    }
  };

  const sortedTokens = useMemo(() => {
    const sorted = [...tokens];
    switch (sortBy) {
      case 'searches':
        return sorted.sort((a, b) => b.searchCount - a.searchCount);
      case 'posted':
        return sorted.sort((a, b) => {
          const aPosted = (a.postedTop50 ? 1 : 0) + (a.postedDexTrigger ? 1 : 0) + (a.postedSurge ? 1 : 0);
          const bPosted = (b.postedTop50 ? 1 : 0) + (b.postedDexTrigger ? 1 : 0) + (b.postedSurge ? 1 : 0);
          return bPosted - aPosted;
        });
      case 'time':
      default:
        return sorted.sort((a, b) => {
          if (!a.lastActivityAt && !b.lastActivityAt) return 0;
          if (!a.lastActivityAt) return 1;
          if (!b.lastActivityAt) return -1;
          return new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime();
        });
    }
  }, [tokens, sortBy]);

  // Summary stats
  const stats = useMemo(() => ({
    totalTokens: tokens.length,
    totalPosted: tokens.filter(t => t.postedTop50 || t.postedDexTrigger || t.postedSurge).length,
    totalSurges: tokens.filter(t => t.wasSurge).length,
    totalSearches: tokens.reduce((sum, t) => sum + t.searchCount, 0)
  }), [tokens]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  const getSurgeIcon = (type: string | null) => {
    switch (type) {
      case 'surge_10min':
        return <Flame className="h-4 w-4 text-destructive" />;
      case 'spike_1hr':
        return <Zap className="h-4 w-4 text-primary" />;
      case 'trending_24hr':
        return <TrendingUp className="h-4 w-4 text-primary" />;
      default: return null;
    }
  };

  const TweetLink = ({ tweetId, label }: { tweetId: string | null; label?: string }) => {
    if (!tweetId) return <span className="text-muted-foreground/40">—</span>;
    return (
      <a 
        href={`https://x.com/HoldersIntel/status/${tweetId}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-primary hover:text-primary/80 transition-colors"
        title={label ? `Open ${label} X post` : 'Open X post'}
      >
        <Twitter className="h-3.5 w-3.5" />
        <ExternalLink className="h-3 w-3" />
      </a>
    );
  };

  return (
    <div className="space-y-4">
      {/* Header with date navigation */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h2 className="text-2xl font-bold">Dailies</h2>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="icon"
            onClick={() => setSelectedDate(prev => subDays(prev, 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          
          <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="min-w-[180px]">
                <CalendarIcon className="mr-2 h-4 w-4" />
                {format(selectedDate, 'MMM d, yyyy')}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(date) => {
                  if (date) {
                    setSelectedDate(date);
                    setCalendarOpen(false);
                  }
                }}
                disabled={(date) => date > new Date()}
                className="pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
          
          <Button 
            variant="outline" 
            size="icon"
            onClick={() => setSelectedDate(prev => {
              const next = addDays(prev, 1);
              return next > new Date() ? new Date() : next;
            })}
            disabled={isToday(selectedDate)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          
          <Button 
            variant="secondary"
            onClick={() => setSelectedDate(new Date())}
            disabled={isToday(selectedDate)}
          >
            Today
          </Button>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">{stats.totalTokens}</div>
            <p className="text-xs text-muted-foreground">Unique Tokens</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-primary">{stats.totalPosted}</div>
            <p className="text-xs text-muted-foreground">Posted to X</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-primary">{stats.totalSurges}</div>
            <p className="text-xs text-muted-foreground">Surge Alerts</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-primary">{stats.totalSearches}</div>
            <p className="text-xs text-muted-foreground">Total Searches</p>
          </CardContent>
        </Card>
      </div>

      {/* Sort controls */}
      <div className="flex gap-2">
        <Button 
          variant={sortBy === 'time' ? 'default' : 'outline'} 
          size="sm"
          onClick={() => setSortBy('time')}
        >
          By Time
        </Button>
        <Button 
          variant={sortBy === 'searches' ? 'default' : 'outline'} 
          size="sm"
          onClick={() => setSortBy('searches')}
        >
          By Searches
        </Button>
        <Button 
          variant={sortBy === 'posted' ? 'default' : 'outline'} 
          size="sm"
          onClick={() => setSortBy('posted')}
        >
          By Posted
        </Button>
      </div>

      {/* Token table */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : sortedTokens.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No token activity for {format(selectedDate, 'MMMM d, yyyy')}
          </CardContent>
        </Card>
      ) : (
        <TooltipProvider delayDuration={300}>
        <div className="border rounded-lg overflow-hidden">
          <div className="px-3 py-2 text-xs text-muted-foreground border-b bg-muted/20">
            Tip: <span className="font-medium">Raw / Reply / Comm</span> are manual X engagement checkboxes (click to toggle).
          </div>
          <Table className="table-fixed w-full">
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead compact className="w-[160px]">Token</TableHead>
                <TableHead compact className="text-center w-[90px]">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center justify-center gap-1 cursor-help">
                        <Search className="h-3.5 w-3.5 text-primary" />
                        <span>Searched</span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>Public searches for this token</TooltipContent>
                  </Tooltip>
                </TableHead>
                <TableHead compact className="text-center w-[70px]">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center justify-center gap-1 cursor-help">
                        <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                        <span>Surge</span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>Search surge/spike detected</TooltipContent>
                  </Tooltip>
                </TableHead>
                <TableHead compact className="text-center w-[80px]">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center justify-center gap-1 cursor-help">
                        <ListOrdered className="h-3.5 w-3.5 text-primary" />
                        <span>Top50</span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>Posted via Top 50 scheduler</TooltipContent>
                  </Tooltip>
                </TableHead>
                <TableHead compact className="text-center w-[80px]">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center justify-center gap-1 cursor-help">
                        <Megaphone className="h-3.5 w-3.5 text-primary" />
                        <span>Dex</span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>Posted via DEX boosts/alerts</TooltipContent>
                  </Tooltip>
                </TableHead>
                <TableHead compact className="text-center w-[90px]">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center justify-center gap-1 cursor-help">
                        <Zap className="h-3.5 w-3.5 text-primary" />
                        <span>Surge X</span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>Posted via surge detection</TooltipContent>
                  </Tooltip>
                </TableHead>
                <TableHead compact className="text-center w-[70px] border-l border-border/50">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center justify-center gap-1 cursor-help">
                        <FileText className="h-3.5 w-3.5 text-primary" />
                        <span>Raw</span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>Manual comment in raw X feed</TooltipContent>
                  </Tooltip>
                </TableHead>
                <TableHead compact className="text-center w-[70px]">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center justify-center gap-1 cursor-help">
                        <Reply className="h-3.5 w-3.5 text-primary" />
                        <span>Reply</span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>Reply to an X post</TooltipContent>
                  </Tooltip>
                </TableHead>
                <TableHead compact className="text-center w-[90px]">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center justify-center gap-1 cursor-help">
                        <Users className="h-3.5 w-3.5 text-primary" />
                        <span>Comm</span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>Comment in X Community</TooltipContent>
                  </Tooltip>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedTokens.map((token) => (
                <React.Fragment key={token.token_mint}>
                  <TableRow
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => setExpandedToken((prev) => (prev === token.token_mint ? null : token.token_mint))}
                  >
                    <TableCell compact className="font-mono w-[160px]">
                      <div className="flex items-center gap-1.5">
                        <ChevronDown
                          className={cn(
                            'h-3 w-3 transition-transform shrink-0',
                            expandedToken === token.token_mint && 'rotate-180'
                          )}
                        />
                        <span className="font-semibold truncate max-w-[120px]" title={token.symbol || token.token_mint}>
                          {token.symbol ? `$${token.symbol}` : `${token.token_mint.slice(0, 6)}...`}
                        </span>
                      </div>
                    </TableCell>

                    <TableCell compact className="text-center w-[90px]">
                      {token.wasSearched ? (
                        <div className="flex items-center justify-center gap-1">
                          <Search className="h-3.5 w-3.5 text-primary" />
                          <span className="text-primary font-medium text-xs">({token.searchCount})</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground/40">—</span>
                      )}
                    </TableCell>

                    <TableCell compact className="text-center w-[70px]">
                      {token.wasSurge ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex items-center justify-center w-full">
                              {getSurgeIcon(token.surgeType)}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            {token.surgeType === 'surge_10min' && 'Search Surge (10min)'}
                            {token.surgeType === 'spike_1hr' && 'Interest Spike (1hr)'}
                            {token.surgeType === 'trending_24hr' && 'Trending (24hr)'}
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        <span className="text-muted-foreground/40">—</span>
                      )}
                    </TableCell>

                    <TableCell compact className="text-center w-[80px]" onClick={(e) => e.stopPropagation()}>
                      <TweetLink tweetId={token.top50TweetId} label="Top50" />
                    </TableCell>
                    <TableCell compact className="text-center w-[80px]" onClick={(e) => e.stopPropagation()}>
                      <TweetLink tweetId={token.dexTweetId} label="Dex" />
                    </TableCell>
                    <TableCell compact className="text-center w-[90px]" onClick={(e) => e.stopPropagation()}>
                      <TweetLink tweetId={token.surgeTweetId} label="Surge" />
                    </TableCell>

                    <TableCell
                      compact
                      className="text-center w-[70px] border-l border-border/30"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex justify-center">
                        <Checkbox
                          checked={token.rawFeedComment}
                          onCheckedChange={(v) => handleCommentChange(token.token_mint, 'raw_feed_comment', !!v)}
                        />
                      </div>
                    </TableCell>
                    <TableCell compact className="text-center w-[70px]" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-center">
                        <Checkbox
                          checked={token.replyToPost}
                          onCheckedChange={(v) => handleCommentChange(token.token_mint, 'reply_to_post', !!v)}
                        />
                      </div>
                    </TableCell>
                    <TableCell compact className="text-center w-[90px]" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-center">
                        <Checkbox
                          checked={token.communityComment}
                          onCheckedChange={(v) => handleCommentChange(token.token_mint, 'community_comment', !!v)}
                        />
                      </div>
                    </TableCell>
                  </TableRow>

                  {expandedToken === token.token_mint && (
                    <TableRow className="bg-muted/30">
                      <TableCell colSpan={9} className="p-4">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                          {/* Mint Info */}
                          <div className="min-w-0">
                            <p className="text-muted-foreground mb-1">Mint Address</p>
                            <div className="flex items-center gap-2 flex-wrap">
                              <code className="text-xs bg-background px-2 py-1 rounded">
                                {token.token_mint.slice(0, 8)}...{token.token_mint.slice(-8)}
                              </code>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6"
                                onClick={() => copyToClipboard(token.token_mint)}
                              >
                                <Copy className="h-3 w-3" />
                              </Button>
                              <a
                                href={`https://solscan.io/token/${token.token_mint}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary hover:underline"
                              >
                                Solscan
                              </a>
                            </div>
                            {token.name && <p className="mt-2 text-muted-foreground">{token.name}</p>}
                          </div>

                          {/* Socials */}
                          <div>
                            <p className="text-muted-foreground mb-1">Socials</p>
                            <div className="flex items-center gap-3">
                              {token.twitter ? (
                                <a
                                  href={token.twitter.startsWith('http') ? token.twitter : `https://x.com/${token.twitter}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-primary hover:underline"
                                >
                                  <Twitter className="h-4 w-4" /> X
                                </a>
                              ) : (
                                <span className="text-muted-foreground/60">No X</span>
                              )}

                              {token.telegram ? (
                                <a
                                  href={token.telegram.startsWith('http') ? token.telegram : `https://t.me/${token.telegram}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-primary hover:underline"
                                >
                                  <MessageCircle className="h-4 w-4" /> TG
                                </a>
                              ) : (
                                <span className="text-muted-foreground/60">No TG</span>
                              )}

                              {token.website ? (
                                <a
                                  href={token.website.startsWith('http') ? token.website : `https://${token.website}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-primary hover:underline"
                                >
                                  <Globe className="h-4 w-4" /> Web
                                </a>
                              ) : (
                                <span className="text-muted-foreground/60">No Web</span>
                              )}
                            </div>
                          </div>

                          {/* Holder Stats */}
                          <div>
                            <p className="text-muted-foreground mb-1">Holder Stats</p>
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                              <div>
                                <span className="text-muted-foreground">Total:</span>{' '}
                                <span className="font-medium">{token.totalHolders?.toLocaleString() || '-'}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Dust:</span>{' '}
                                <span className="font-medium">{token.dustHolders?.toLocaleString() || '-'}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Real:</span>{' '}
                                <span className="font-medium text-primary">{token.realHolders?.toLocaleString() || '-'}</span>
                              </div>
                              {token.healthGrade && (
                                <div>
                                  <span className="text-muted-foreground">Grade:</span>{' '}
                                  <span className="font-semibold text-primary">{token.healthGrade}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              ))}
            </TableBody>
          </Table>
        </div>
        </TooltipProvider>
      )}
    </div>
  );
}
