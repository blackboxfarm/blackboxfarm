import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { format, isToday, subDays, addDays } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { 
  ChevronLeft, 
  ChevronRight, 
  CalendarIcon, 
  Search, 
  Copy,
  Twitter,
  MessageCircle,
  Globe,
  List,
  Megaphone,
  FileText,
  Reply,
  Users,
  RefreshCw,
  Sparkles,
  Hash,
  Coins,
  AlertTriangle,
  Clock
} from 'lucide-react';
import { toast } from 'sonner';

interface DailyToken {
  token_mint: string;
  symbol: string | null;
  name: string | null;
  image: string | null;
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
  holdersIsOld: boolean;
}

type SortBy = 'time' | 'searches' | 'posted';

export function DailiesDashboard() {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [tokens, setTokens] = useState<DailyToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<SortBy>('time');
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [backfilling, setBackfilling] = useState(false);

  const fetchDailiesData = useCallback(async () => {
    setLoading(true);
    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    const startOfDayStr = `${dateStr}T00:00:00.000Z`;
    const endOfDayStr = `${dateStr}T23:59:59.999Z`;

    try {
      const [searchesRes, surgesRes, postsRes, commentsRes, socialsRes] = await Promise.all([
        supabase
          .from('token_search_log')
          .select('token_mint, ip_address, created_at')
          .gte('created_at', startOfDayStr)
          .lte('created_at', endOfDayStr),
        
        supabase
          .from('holders_intel_surge_alerts')
          .select('token_mint, alert_type, detected_at, queue_id, symbol, name')
          .gte('detected_at', startOfDayStr)
          .lte('detected_at', endOfDayStr),
        
        supabase
          .from('holders_intel_post_queue')
          .select('token_mint, trigger_source, status, tweet_id, posted_at, created_at, symbol')
          .gte('created_at', startOfDayStr)
          .lte('created_at', endOfDayStr)
          .eq('status', 'posted'),
        
        supabase
          .from('dailies_manual_comments')
          .select('*')
          .eq('comment_date', dateStr),
        
        supabase
          .from('token_socials_history')
          .select('token_mint, twitter, telegram, website')
          .order('captured_at', { ascending: false })
      ]);

      // Fetch token metadata with image (image_uri column may not be in types yet)
      const { data: seenTokens } = await supabase
        .from('holders_intel_seen_tokens')
        .select('token_mint, symbol, name, health_grade, image_uri') as { data: Array<{ token_mint: string; symbol: string | null; name: string | null; health_grade: string | null; image_uri: string | null }> | null };

      const seenTokensMap = new Map(
        (seenTokens || []).map(t => [t.token_mint, t])
      );

      const { data: searchResults } = await supabase
        .from('token_search_results')
        .select('token_mint, symbol, name, tier_dust, tier_retail, tier_serious, tier_whale, created_at')
        .order('created_at', { ascending: false });

      const holderDataMap = new Map<string, { total: number; dust: number; isOld: boolean }>();
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      
      for (const r of searchResults || []) {
        if (!holderDataMap.has(r.token_mint)) {
          const total = (r.tier_dust || 0) + (r.tier_retail || 0) + (r.tier_serious || 0) + (r.tier_whale || 0);
          const isOld = r.created_at ? new Date(r.created_at) < oneDayAgo : true;
          holderDataMap.set(r.token_mint, { total, dust: r.tier_dust || 0, isOld });
        }
      }

      const searchesByToken = new Map<string, { count: number; uniqueIps: Set<string>; lastAt: string }>();
      for (const s of searchesRes.data || []) {
        const existing = searchesByToken.get(s.token_mint) || { count: 0, uniqueIps: new Set(), lastAt: s.created_at };
        existing.count++;
        if (s.ip_address) existing.uniqueIps.add(s.ip_address);
        if (s.created_at > existing.lastAt) existing.lastAt = s.created_at;
        searchesByToken.set(s.token_mint, existing);
      }

      const surgesByToken = new Map<string, { type: string; symbol: string | null; name: string | null }>();
      const surgePriority: Record<string, number> = { 'surge_10min': 1, 'spike_1hr': 2, 'trending_24hr': 3 };
      for (const s of surgesRes.data || []) {
        const existing = surgesByToken.get(s.token_mint);
        if (!existing || (surgePriority[s.alert_type] || 99) < (surgePriority[existing.type] || 99)) {
          surgesByToken.set(s.token_mint, { type: s.alert_type, symbol: s.symbol, name: s.name });
        }
      }

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

      const commentsByToken = new Map(
        (commentsRes.data || []).map(c => [c.token_mint, c])
      );

      const socialsByToken = new Map<string, { twitter: string | null; telegram: string | null; website: string | null }>();
      for (const s of socialsRes.data || []) {
        if (!socialsByToken.has(s.token_mint)) {
          socialsByToken.set(s.token_mint, { twitter: s.twitter, telegram: s.telegram, website: s.website });
        }
      }

      const allTokenMints = new Set<string>();
      searchesByToken.forEach((_, k) => allTokenMints.add(k));
      surgesByToken.forEach((_, k) => allTokenMints.add(k));
      postsByToken.forEach((_, k) => allTokenMints.add(k));

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
          image: seen?.image_uri || null,
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
          lastActivityAt: searches?.lastAt || posts?.lastAt || null,
          holdersIsOld: holderData?.isOld ?? true
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
      fetchDailiesData();
    }
  };

  const handleBackfillAll = async () => {
    // Backfill tokens missing symbol, image, or socials
    const tokensNeedingData = tokens.filter(t => !t.symbol || !t.image || (!t.twitter && !t.telegram && !t.website));
    if (tokensNeedingData.length === 0) {
      toast.info('All tokens already have complete data');
      return;
    }

    setBackfilling(true);
    toast.info(`Backfilling data for ${tokensNeedingData.length} tokens...`);

    try {
      const { data, error } = await supabase.functions.invoke('dailies-backfill-socials', {
        body: { tokenMints: tokensNeedingData.map(t => t.token_mint) }
      });

      if (error) throw error;

      toast.success(`Backfill complete: ${data?.updated || 0} updated`);
      fetchDailiesData();
    } catch (error) {
      console.error('Backfill error:', error);
      toast.error('Failed to backfill data');
    } finally {
      setBackfilling(false);
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

  const stats = useMemo(() => ({
    totalTokens: tokens.length,
    totalPosted: tokens.filter(t => t.postedTop50 || t.postedDexTrigger || t.postedSurge).length,
    totalSurges: tokens.filter(t => t.wasSurge).length,
    totalSearches: tokens.reduce((sum, t) => sum + t.searchCount, 0),
    missingData: tokens.filter(t => !t.symbol || !t.image || (!t.twitter && !t.telegram && !t.website)).length
  }), [tokens]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  const getOriginIcons = (token: DailyToken) => {
    const icons: React.ReactNode[] = [];
    
    // Search origin - magnifying glass
    if (token.wasSearched) {
      icons.push(
        <Tooltip key="search">
          <TooltipTrigger asChild>
            <span className="inline-flex items-center">
              <Search className="h-3.5 w-3.5 text-primary" />
            </span>
          </TooltipTrigger>
          <TooltipContent>Searched {token.searchCount}x</TooltipContent>
        </Tooltip>
      );
    }
    
    // Surge origin - alert triangle
    if (token.wasSurge) {
      icons.push(
        <Tooltip key="surge">
          <TooltipTrigger asChild>
            <span><AlertTriangle className="h-3.5 w-3.5 text-destructive" /></span>
          </TooltipTrigger>
          <TooltipContent>
            {token.surgeType === 'surge_10min' && 'Surge 10min'}
            {token.surgeType === 'spike_1hr' && 'Spike 1hr'}
            {token.surgeType === 'trending_24hr' && 'Trending 24hr'}
            {!token.surgeType && 'Search Surge'}
          </TooltipContent>
        </Tooltip>
      );
    }
    
    // Top 50 list origin - list icon
    if (token.postedTop50) {
      icons.push(
        <Tooltip key="top50">
          <TooltipTrigger asChild><span><List className="h-3.5 w-3.5 text-primary" /></span></TooltipTrigger>
          <TooltipContent>Top 50 List</TooltipContent>
        </Tooltip>
      );
    }
    
    // Dex trigger origin - megaphone
    if (token.postedDexTrigger) {
      icons.push(
        <Tooltip key="dex">
          <TooltipTrigger asChild><span><Megaphone className="h-3.5 w-3.5 text-primary" /></span></TooltipTrigger>
          <TooltipContent>Dex Paid / CTO / Boost</TooltipContent>
        </Tooltip>
      );
    }
    
    // Surge post (if different from surge detection)
    if (token.postedSurge && !token.wasSurge) {
      icons.push(
        <Tooltip key="surge-post">
          <TooltipTrigger asChild><span><AlertTriangle className="h-3.5 w-3.5 text-primary" /></span></TooltipTrigger>
          <TooltipContent>Surge Posted</TooltipContent>
        </Tooltip>
      );
    }
    
    return icons.length > 0 ? icons : <span className="text-muted-foreground/40">—</span>;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h2 className="text-2xl font-bold">Dailies</h2>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setSelectedDate(prev => subDays(prev, 1))}>
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
                onSelect={(date) => { if (date) { setSelectedDate(date); setCalendarOpen(false); } }}
                disabled={(date) => date > new Date()}
                className="pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
          
          <Button variant="outline" size="icon" onClick={() => setSelectedDate(prev => { const next = addDays(prev, 1); return next > new Date() ? new Date() : next; })} disabled={isToday(selectedDate)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          
          <Button variant="secondary" onClick={() => setSelectedDate(new Date())} disabled={isToday(selectedDate)}>Today</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card><CardContent className="pt-4"><div className="text-2xl font-bold">{stats.totalTokens}</div><p className="text-xs text-muted-foreground">Unique Tokens</p></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="text-2xl font-bold text-primary">{stats.totalPosted}</div><p className="text-xs text-muted-foreground">Posted to X</p></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="text-2xl font-bold text-primary">{stats.totalSurges}</div><p className="text-xs text-muted-foreground">Surge Alerts</p></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="text-2xl font-bold text-primary">{stats.totalSearches}</div><p className="text-xs text-muted-foreground">Total Searches</p></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="text-2xl font-bold text-muted-foreground">{stats.missingData}</div><p className="text-xs text-muted-foreground">Missing Data</p></CardContent></Card>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-2">
          <Button variant={sortBy === 'time' ? 'default' : 'outline'} size="sm" onClick={() => setSortBy('time')}>By Time</Button>
          <Button variant={sortBy === 'searches' ? 'default' : 'outline'} size="sm" onClick={() => setSortBy('searches')}>By Searches</Button>
          <Button variant={sortBy === 'posted' ? 'default' : 'outline'} size="sm" onClick={() => setSortBy('posted')}>By Posted</Button>
        </div>
        <Button variant="outline" size="sm" onClick={handleBackfillAll} disabled={backfilling || stats.missingData === 0}>
          {backfilling ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
          Backfill Data ({stats.missingData})
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>
      ) : sortedTokens.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">No token activity for {format(selectedDate, 'MMMM d, yyyy')}</CardContent></Card>
      ) : (
        <TooltipProvider delayDuration={300}>
        <div className="border rounded-lg overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead compact className="w-[44px]"></TableHead>
                <TableHead compact className="w-[120px]">Token</TableHead>
                <TableHead compact className="w-[70px] text-center">Origin</TableHead>
                <TableHead compact className="w-[40px] text-center"><Tooltip><TooltipTrigger><Twitter className="h-3.5 w-3.5 mx-auto" /></TooltipTrigger><TooltipContent>Twitter/X</TooltipContent></Tooltip></TableHead>
                <TableHead compact className="w-[40px] text-center"><Tooltip><TooltipTrigger><MessageCircle className="h-3.5 w-3.5 mx-auto" /></TooltipTrigger><TooltipContent>Telegram</TooltipContent></Tooltip></TableHead>
                <TableHead compact className="w-[40px] text-center"><Tooltip><TooltipTrigger><Globe className="h-3.5 w-3.5 mx-auto" /></TooltipTrigger><TooltipContent>Website</TooltipContent></Tooltip></TableHead>
                <TableHead compact className="w-[70px] text-center border-l border-border/50"><Tooltip><TooltipTrigger><Hash className="h-3.5 w-3.5 mx-auto" /></TooltipTrigger><TooltipContent>Real Holders</TooltipContent></Tooltip></TableHead>
                <TableHead compact className="w-[45px] text-center">Grade</TableHead>
                <TableHead compact className="w-[45px] text-center"><Tooltip><TooltipTrigger><Clock className="h-3.5 w-3.5 mx-auto" /></TooltipTrigger><TooltipContent>Last Activity</TooltipContent></Tooltip></TableHead>
                <TableHead compact className="w-[40px] text-center border-l border-border/50"><Tooltip><TooltipTrigger><FileText className="h-3.5 w-3.5 mx-auto" /></TooltipTrigger><TooltipContent>Raw Feed</TooltipContent></Tooltip></TableHead>
                <TableHead compact className="w-[40px] text-center"><Tooltip><TooltipTrigger><Reply className="h-3.5 w-3.5 mx-auto" /></TooltipTrigger><TooltipContent>Reply</TooltipContent></Tooltip></TableHead>
                <TableHead compact className="w-[40px] text-center"><Tooltip><TooltipTrigger><Users className="h-3.5 w-3.5 mx-auto" /></TooltipTrigger><TooltipContent>Community</TooltipContent></Tooltip></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedTokens.map((token) => (
                <TableRow key={token.token_mint} className="hover:bg-muted/30">
                  {/* Image Column */}
                  <TableCell compact className="w-[44px] pr-0">
                    <Avatar className="h-7 w-7">
                      {token.image ? (
                        <AvatarImage src={token.image} alt={token.symbol || 'Token'} />
                      ) : null}
                      <AvatarFallback className="bg-muted text-[10px]">
                        <Coins className="h-3.5 w-3.5 text-muted-foreground" />
                      </AvatarFallback>
                    </Avatar>
                  </TableCell>

                  {/* Token Name/Symbol Column */}
                  <TableCell compact className="w-[120px]">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <a 
                          href={`https://solscan.io/token/${token.token_mint}`} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="font-semibold truncate max-w-[100px] block hover:text-primary transition-colors"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {token.symbol ? `$${token.symbol}` : `${token.token_mint.slice(0, 6)}...`}
                        </a>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p className="font-mono text-xs break-all">{token.token_mint}</p>
                        {token.name && <p className="text-muted-foreground">{token.name}</p>}
                        <div className="flex gap-1 mt-1">
                          <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => copyToClipboard(token.token_mint)}><Copy className="h-3 w-3" /></Button>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </TableCell>

                  {/* Origin Column */}
                  <TableCell compact className="w-[70px]"><div className="flex items-center justify-center gap-1">{getOriginIcons(token)}</div></TableCell>

                  {/* Socials Columns - Always show icon, grey if no link */}
                  <TableCell compact className="w-[40px] text-center">
                    {token.twitter ? (
                      <a href={token.twitter.startsWith('http') ? token.twitter : `https://x.com/${token.twitter}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80">
                        <Twitter className="h-3.5 w-3.5 mx-auto" />
                      </a>
                    ) : (
                      <Twitter className="h-3.5 w-3.5 mx-auto text-muted-foreground/30" />
                    )}
                  </TableCell>

                  <TableCell compact className="w-[40px] text-center">
                    {token.telegram ? (
                      <a href={token.telegram.startsWith('http') ? token.telegram : `https://t.me/${token.telegram}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80">
                        <MessageCircle className="h-3.5 w-3.5 mx-auto" />
                      </a>
                    ) : (
                      <MessageCircle className="h-3.5 w-3.5 mx-auto text-muted-foreground/30" />
                    )}
                  </TableCell>

                  <TableCell compact className="w-[40px] text-center">
                    {token.website ? (
                      <a href={token.website.startsWith('http') ? token.website : `https://${token.website}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80">
                        <Globe className="h-3.5 w-3.5 mx-auto" />
                      </a>
                    ) : (
                      <Globe className="h-3.5 w-3.5 mx-auto text-muted-foreground/30" />
                    )}
                  </TableCell>

                  {/* Holder Stats Columns */}
                  <TableCell compact className="w-[70px] text-center border-l border-border/30">
                    {token.realHolders != null ? (
                      <span className={cn("text-sm", token.holdersIsOld ? "text-muted-foreground" : "text-primary font-medium")}>{token.realHolders.toLocaleString()}</span>
                    ) : <span className="text-muted-foreground/40">—</span>}
                  </TableCell>

                  <TableCell compact className="w-[45px] text-center">
                    {token.healthGrade ? (
                      <span className={cn("font-semibold", token.holdersIsOld ? "text-muted-foreground" : "text-primary")}>{token.healthGrade}</span>
                    ) : <span className="text-muted-foreground/40">—</span>}
                  </TableCell>

                  {/* Timestamp Column */}
                  <TableCell compact className="w-[45px] text-center">
                    {token.lastActivityAt ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="text-muted-foreground cursor-help">
                            <Clock className="h-3.5 w-3.5 mx-auto" />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          {format(new Date(token.lastActivityAt), 'MMM d, yyyy h:mm a')}
                        </TooltipContent>
                      </Tooltip>
                    ) : <span className="text-muted-foreground/40">—</span>}
                  </TableCell>

                  {/* Manual Comment Checkboxes */}
                  <TableCell compact className="w-[40px] text-center border-l border-border/30">
                    <div className="flex justify-center"><Checkbox checked={token.rawFeedComment} onCheckedChange={(v) => handleCommentChange(token.token_mint, 'raw_feed_comment', !!v)} /></div>
                  </TableCell>
                  <TableCell compact className="w-[40px] text-center">
                    <div className="flex justify-center"><Checkbox checked={token.replyToPost} onCheckedChange={(v) => handleCommentChange(token.token_mint, 'reply_to_post', !!v)} /></div>
                  </TableCell>
                  <TableCell compact className="w-[40px] text-center">
                    <div className="flex justify-center"><Checkbox checked={token.communityComment} onCheckedChange={(v) => handleCommentChange(token.token_mint, 'community_comment', !!v)} /></div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        </TooltipProvider>
      )}
    </div>
  );
}
