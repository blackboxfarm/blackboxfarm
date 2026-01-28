import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, Twitter, CheckCircle, Star, Users, Eye, Heart, Repeat, ExternalLink, Trophy, Copy, Clock, Zap, Play, Square, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { format, formatDistanceToNow } from "date-fns";

interface TwitterMention {
  id: string;
  tweet_id: string;
  tweet_text: string;
  tweet_url: string | null;
  author_username: string | null;
  author_followers: number;
  detected_contracts: string[];
  detected_tickers: string[];
  engagement_score: number;
  likes_count: number;
  retweets_count: number;
  replies_count: number;
  impression_count: number;
  is_verified: boolean;
  verified_type: string | null;
  quality_score: number;
  is_best_source: boolean | null;
  duplicate_of: string | null;
  queued_for_analysis: boolean;
  posted_at: string | null;
  created_at: string;
}

interface ScannerState {
  token_mint: string;
  symbol: string;
  virality_score: number;
  source: string;
  last_scanned_at: string | null;
  scan_count: number;
}

interface CronJobStatus {
  jobname: string;
  schedule: string;
  active: boolean;
}

export function TwitterScrapesView() {
  const [mentions, setMentions] = useState<TwitterMention[]>([]);
  const [scannerQueue, setScannerQueue] = useState<ScannerState[]>([]);
  const [lastScanned, setLastScanned] = useState<ScannerState | null>(null);
  const [nextUp, setNextUp] = useState<ScannerState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [cronStatus, setCronStatus] = useState<CronJobStatus | null>(null);
  const [isTogglingCron, setIsTogglingCron] = useState(false);
  const [filter, setFilter] = useState<'all' | 'best' | 'queued' | 'verified' | 'reply_targets'>('all');
  const [stats, setStats] = useState({
    total: 0,
    bestSources: 0,
    duplicates: 0,
    queued: 0,
    verified: 0,
  });

  const fetchCronStatus = async () => {
    try {
      const { data, error } = await supabase.rpc('get_cron_job_status');
      if (error) throw error;
      
      const twitterJob = (data as CronJobStatus[])?.find(job => job.jobname === 'twitter-scanner-16min');
      setCronStatus(twitterJob || null);
    } catch (error) {
      console.error('Error fetching cron status:', error);
    }
  };

  const toggleScanner = async () => {
    setIsTogglingCron(true);
    try {
      if (cronStatus?.active) {
        // Stop the scanner
        const { error } = await supabase.functions.invoke('twitter-scanner-control', {
          body: { action: 'stop' }
        });
        if (error) throw error;
        toast.success('Twitter Scanner stopped');
      } else {
        // Start the scanner
        const { error } = await supabase.functions.invoke('twitter-scanner-control', {
          body: { action: 'start' }
        });
        if (error) throw error;
        toast.success('Twitter Scanner started');
      }
      await fetchCronStatus();
    } catch (error: any) {
      console.error('Toggle scanner error:', error);
      toast.error(error.message || 'Failed to toggle scanner');
    } finally {
      setIsTogglingCron(false);
    }
  };

  const fetchMentions = async () => {
    setIsLoading(true);
    try {
      let query = supabase
        .from('twitter_token_mentions')
        .select('*')
        .order('quality_score', { ascending: false })
        .limit(100);

      if (filter === 'best') {
        query = query.eq('is_best_source', true);
      } else if (filter === 'queued') {
        query = query.eq('queued_for_analysis', true);
      } else if (filter === 'verified') {
        query = query.eq('is_verified', true);
      } else if (filter === 'reply_targets') {
        query = query
          .is('duplicate_of', null)
          .gte('author_followers', 500)
          .order('likes_count', { ascending: false })
          .order('retweets_count', { ascending: false })
          .order('impression_count', { ascending: false });
      }

      const { data, error } = await query;

      if (error) throw error;
      setMentions(data || []);

      // Get stats
      const { data: allData } = await supabase
        .from('twitter_token_mentions')
        .select('is_best_source, queued_for_analysis, is_verified, duplicate_of');

      if (allData) {
        setStats({
          total: allData.length,
          bestSources: allData.filter(m => m.is_best_source === true).length,
          duplicates: allData.filter(m => m.duplicate_of !== null).length,
          queued: allData.filter(m => m.queued_for_analysis).length,
          verified: allData.filter(m => m.is_verified).length,
        });
      }

      // Fetch scanner state
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      
      // Get next token to scan (highest virality, not scanned recently)
      const { data: nextToken } = await supabase
        .from('twitter_scanner_state')
        .select('*')
        .or(`last_scanned_at.is.null,last_scanned_at.lt.${twoHoursAgo}`)
        .order('virality_score', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      setNextUp(nextToken);
      
      // Get last scanned token
      const { data: lastToken } = await supabase
        .from('twitter_scanner_state')
        .select('*')
        .not('last_scanned_at', 'is', null)
        .order('last_scanned_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      setLastScanned(lastToken);
      
      // Get queue (tokens waiting to be scanned)
      const { data: queueData } = await supabase
        .from('twitter_scanner_state')
        .select('*')
        .or(`last_scanned_at.is.null,last_scanned_at.lt.${twoHoursAgo}`)
        .order('virality_score', { ascending: false })
        .limit(10);
      
      setScannerQueue(queueData || []);

    } catch (error) {
      console.error('Error fetching mentions:', error);
      toast.error('Failed to load Twitter mentions');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchMentions();
    fetchCronStatus();
  }, [filter]);

  const getQualityColor = (score: number) => {
    if (score >= 500) return 'text-yellow-400';
    if (score >= 200) return 'text-green-400';
    if (score >= 50) return 'text-blue-400';
    return 'text-muted-foreground';
  };

  const getSourceColor = (source: string) => {
    if (source === 'dex_boost_100') return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50';
    if (source === 'dex_paid') return 'bg-orange-500/20 text-orange-400 border-orange-500/50';
    if (source === 'queue') return 'bg-green-500/20 text-green-400 border-green-500/50';
    return 'bg-blue-500/20 text-blue-400 border-blue-500/50';
  };

  const copyContract = (contract: string) => {
    navigator.clipboard.writeText(contract);
    toast.success('Contract copied!');
  };

  const isScannerActive = cronStatus?.active ?? false;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Twitter className="h-6 w-6 text-sky-400" />
            Twitter Token Scrapes
          </h2>
          <p className="text-muted-foreground text-sm mt-1">
            Single-token scanning every 16 minutes
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => { fetchMentions(); fetchCronStatus(); }} disabled={isLoading}>
            <RefreshCw className={cn("h-4 w-4 mr-2", isLoading && "animate-spin")} />
            Refresh
          </Button>
          <Button
            onClick={toggleScanner}
            disabled={isTogglingCron}
            variant={isScannerActive ? "destructive" : "default"}
            className={cn(
              !isScannerActive && "bg-green-600 hover:bg-green-700"
            )}
          >
            {isTogglingCron ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : isScannerActive ? (
              <Square className="h-4 w-4 mr-2" />
            ) : (
              <Play className="h-4 w-4 mr-2" />
            )}
            {isTogglingCron ? 'Processing...' : isScannerActive ? 'Stop Scanner' : 'Start Scanner'}
          </Button>
        </div>
      </div>

      {/* Scanner Status */}
      <Card className={cn(
        "bg-card/50",
        isScannerActive ? "border-green-500/50" : "border-muted"
      )}>
        <CardContent className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={cn(
              "h-3 w-3 rounded-full",
              isScannerActive ? "bg-green-500 animate-pulse" : "bg-muted-foreground"
            )} />
            <span className="font-medium">
              Scanner Status: {isScannerActive ? 'Running' : 'Stopped'}
            </span>
            {cronStatus && (
              <Badge variant="outline" className="text-xs">
                {cronStatus.schedule}
              </Badge>
            )}
          </div>
          {isScannerActive && (
            <span className="text-xs text-muted-foreground">
              Runs every 16 minutes automatically
            </span>
          )}
        </CardContent>
      </Card>

      {/* Scanner State Cards */}
      <div className="grid grid-cols-2 gap-4">
        {/* Next Up */}
        <Card className="bg-card/50 border-sky-500/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Zap className="h-4 w-4 text-sky-400" />
              Next Token to Scan
            </CardTitle>
          </CardHeader>
          <CardContent>
            {nextUp ? (
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xl font-bold">${nextUp.symbol}</span>
                  <Badge variant="outline" className={cn("ml-2 text-xs", getSourceColor(nextUp.source))}>
                    {nextUp.source}
                  </Badge>
                </div>
                <div className="text-right">
                  <div className="text-lg font-semibold text-sky-400">{nextUp.virality_score}</div>
                  <div className="text-xs text-muted-foreground">virality score</div>
                </div>
              </div>
            ) : (
              <span className="text-muted-foreground">No tokens in queue</span>
            )}
          </CardContent>
        </Card>

        {/* Last Scanned */}
        <Card className="bg-card/50 border-green-500/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Clock className="h-4 w-4 text-green-400" />
              Last Scanned
            </CardTitle>
          </CardHeader>
          <CardContent>
            {lastScanned ? (
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xl font-bold">${lastScanned.symbol}</span>
                  <Badge variant="outline" className={cn("ml-2 text-xs", getSourceColor(lastScanned.source))}>
                    {lastScanned.source}
                  </Badge>
                </div>
                <div className="text-right">
                  <div className="text-sm text-green-400">
                    {lastScanned.last_scanned_at && formatDistanceToNow(new Date(lastScanned.last_scanned_at), { addSuffix: true })}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {lastScanned.scan_count} scans total
                  </div>
                </div>
              </div>
            ) : (
              <span className="text-muted-foreground">No scans yet</span>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Token Queue */}
      {scannerQueue.length > 0 && (
        <Card className="bg-card/50 border-orange-500/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              📋 Scanner Queue ({scannerQueue.length} tokens)
              <span className="text-xs text-muted-foreground font-normal ml-2">
                sorted by virality score
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex flex-wrap gap-2">
              {scannerQueue.map((t, i) => (
                <Badge 
                  key={t.token_mint} 
                  variant="outline" 
                  className={cn(
                    "text-xs",
                    i === 0 && "ring-2 ring-sky-500/50",
                    getSourceColor(t.source)
                  )}
                >
                  ${t.symbol}
                  <span className="ml-1 opacity-70">({t.virality_score})</span>
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-5 gap-4">
        <Card className="bg-card/50">
          <CardContent className="p-4">
            <div className="text-2xl font-bold">{stats.total}</div>
            <div className="text-sm text-muted-foreground">Total Mentions</div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-yellow-500/30">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-yellow-400">{stats.bestSources}</div>
            <div className="text-sm text-muted-foreground flex items-center gap-1">
              <Trophy className="h-3 w-3" /> Best Sources
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-muted">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-muted-foreground">{stats.duplicates}</div>
            <div className="text-sm text-muted-foreground flex items-center gap-1">
              <Copy className="h-3 w-3" /> Duplicates
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-green-500/30">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-green-400">{stats.queued}</div>
            <div className="text-sm text-muted-foreground">Queued</div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-sky-500/30">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-sky-400">{stats.verified}</div>
            <div className="text-sm text-muted-foreground flex items-center gap-1">
              <CheckCircle className="h-3 w-3" /> Verified
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 flex-wrap">
        {(['all', 'reply_targets', 'best', 'queued', 'verified'] as const).map((f) => (
          <Button
            key={f}
            variant={filter === f ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter(f)}
            className={f === 'reply_targets' ? 'bg-sky-500/20 border-sky-500/50 hover:bg-sky-500/30' : ''}
          >
            {f === 'all' && 'All'}
            {f === 'reply_targets' && '🎯 Reply Targets'}
            {f === 'best' && '🏆 Best Sources'}
            {f === 'queued' && '✅ Queued'}
            {f === 'verified' && '✓ Verified Only'}
          </Button>
        ))}
      </div>

      {/* Mentions List */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Recent Mentions ({mentions.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : mentions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No mentions found. Start the scanner to discover tokens.
            </div>
          ) : (
            <div className="space-y-3">
              {mentions.map((mention) => (
                <div
                  key={mention.id}
                  className={cn(
                    "p-4 rounded-lg border bg-card/30 hover:bg-card/50 transition-colors",
                    mention.is_best_source === true && "border-yellow-500/50 bg-yellow-500/5",
                    mention.duplicate_of && "opacity-60 border-dashed"
                  )}
                >
                  <div className="flex items-start justify-between gap-4">
                    {/* Left: Author & Status */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="font-medium">@{mention.author_username || 'unknown'}</span>
                        {mention.is_verified && (
                          <Badge variant="outline" className="text-sky-400 border-sky-400/50 text-xs">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            {mention.verified_type || 'Verified'}
                          </Badge>
                        )}
                        {mention.is_best_source === true && (
                          <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/50 text-xs">
                            <Trophy className="h-3 w-3 mr-1" />
                            Best Source
                          </Badge>
                        )}
                        {mention.duplicate_of && (
                          <Badge variant="outline" className="text-muted-foreground text-xs">
                            <Copy className="h-3 w-3 mr-1" />
                            Duplicate
                          </Badge>
                        )}
                        {mention.queued_for_analysis && (
                          <Badge className="bg-green-500/20 text-green-400 border-green-500/50 text-xs">
                            Queued
                          </Badge>
                        )}
                      </div>
                      
                      {/* Tweet Text (truncated) */}
                      <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                        {mention.tweet_text}
                      </p>
                      
                      {/* Contracts */}
                      <div className="flex flex-wrap gap-1 mb-2">
                        {mention.detected_contracts.slice(0, 3).map((contract, i) => (
                          <Button
                            key={i}
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs font-mono bg-muted/30"
                            onClick={() => copyContract(contract)}
                          >
                            {contract.slice(0, 8)}...{contract.slice(-4)}
                          </Button>
                        ))}
                        {mention.detected_tickers.map((ticker, i) => (
                          <Badge key={i} variant="outline" className="text-xs">
                            ${ticker}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    
                    {/* Right: Metrics */}
                    <div className="text-right shrink-0 space-y-1">
                      {/* Quality Score */}
                      <div className={cn("text-xl font-bold", getQualityColor(mention.quality_score))}>
                        <Star className="h-4 w-4 inline mr-1" />
                        {mention.quality_score}
                      </div>
                      
                      {/* Engagement Metrics */}
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {mention.author_followers.toLocaleString()}
                        </span>
                        <span className="flex items-center gap-1">
                          <Heart className="h-3 w-3 text-red-400" />
                          {mention.likes_count}
                        </span>
                        <span className="flex items-center gap-1">
                          <Repeat className="h-3 w-3 text-green-400" />
                          {mention.retweets_count}
                        </span>
                        <span className="flex items-center gap-1">
                          <Eye className="h-3 w-3" />
                          {mention.impression_count.toLocaleString()}
                        </span>
                      </div>
                      
                      {/* Time & Link */}
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {mention.posted_at && (
                          <span>{format(new Date(mention.posted_at), 'MMM d, h:mm a')}</span>
                        )}
                        {mention.tweet_url && (
                          <a
                            href={mention.tweet_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sky-400 hover:text-sky-300"
                          >
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
