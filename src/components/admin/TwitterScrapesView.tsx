import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, Twitter, CheckCircle, XCircle, Star, Users, Eye, Heart, Repeat, MessageCircle, ExternalLink, Trophy, Copy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

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

export function TwitterScrapesView() {
  const [mentions, setMentions] = useState<TwitterMention[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  const [filter, setFilter] = useState<'all' | 'best' | 'queued' | 'verified'>('all');
  const [stats, setStats] = useState({
    total: 0,
    bestSources: 0,
    duplicates: 0,
    queued: 0,
    verified: 0,
  });

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
    } catch (error) {
      console.error('Error fetching mentions:', error);
      toast.error('Failed to load Twitter mentions');
    } finally {
      setIsLoading(false);
    }
  };

  const runScanner = async () => {
    setIsScanning(true);
    try {
      const { data, error } = await supabase.functions.invoke('twitter-token-mention-scanner');
      if (error) throw error;
      toast.success(`Scan complete: ${data.stats?.mentions_saved || 0} mentions saved, ${data.stats?.best_sources_selected || 0} best sources`);
      fetchMentions();
    } catch (error: any) {
      console.error('Scanner error:', error);
      toast.error(error.message || 'Scanner failed');
    } finally {
      setIsScanning(false);
    }
  };

  useEffect(() => {
    fetchMentions();
  }, [filter]);

  const getQualityColor = (score: number) => {
    if (score >= 500) return 'text-yellow-400';
    if (score >= 200) return 'text-green-400';
    if (score >= 50) return 'text-blue-400';
    return 'text-muted-foreground';
  };

  const copyContract = (contract: string) => {
    navigator.clipboard.writeText(contract);
    toast.success('Contract copied!');
  };

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
            Quality-filtered token mentions with deduplication
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchMentions} disabled={isLoading}>
            <RefreshCw className={cn("h-4 w-4 mr-2", isLoading && "animate-spin")} />
            Refresh
          </Button>
          <Button onClick={runScanner} disabled={isScanning}>
            <Twitter className={cn("h-4 w-4 mr-2", isScanning && "animate-pulse")} />
            {isScanning ? 'Scanning...' : 'Run Scanner'}
          </Button>
        </div>
      </div>

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
      <div className="flex gap-2">
        {(['all', 'best', 'queued', 'verified'] as const).map((f) => (
          <Button
            key={f}
            variant={filter === f ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter(f)}
          >
            {f === 'all' && 'All'}
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
              No mentions found. Run the scanner to discover tokens.
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
