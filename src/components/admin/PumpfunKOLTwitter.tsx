import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { 
  Twitter, 
  RefreshCw, 
  Search, 
  TrendingUp, 
  TrendingDown,
  MessageCircle,
  Heart,
  Repeat,
  Eye,
  Link2,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  ExternalLink
} from "lucide-react";

interface KOLTweet {
  id: string;
  kol_id: string;
  kol_wallet: string;
  twitter_handle: string;
  tweet_id: string;
  tweet_text: string;
  tweet_url: string;
  posted_at: string;
  likes_count: number;
  retweets_count: number;
  replies_count: number;
  views_count: number;
  detected_tickers: string[];
  detected_contracts: string[];
  tweet_type: string;
  sentiment_score: number;
  is_token_promotion: boolean;
  correlated_activity_id: string | null;
  correlation_type: string | null;
  correlation_delta_mins: number | null;
}

const getTweetTypeBadge = (type: string) => {
  const styles: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
    shill: { variant: "default", label: "Shill" },
    alpha_call: { variant: "secondary", label: "Alpha" },
    buy_signal: { variant: "default", label: "Buy Signal" },
    sell_signal: { variant: "destructive", label: "Sell Signal" },
    fud: { variant: "destructive", label: "FUD" },
    general: { variant: "outline", label: "General" },
  };
  const style = styles[type] || styles.general;
  return <Badge variant={style.variant}>{style.label}</Badge>;
};

const getSentimentIcon = (score: number) => {
  if (score > 0.2) return <TrendingUp className="h-4 w-4 text-green-500" />;
  if (score < -0.2) return <TrendingDown className="h-4 w-4 text-red-500" />;
  return null;
};

export default function PumpfunKOLTwitter() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [scanHandle, setScanHandle] = useState("");

  // Fetch tweets
  const { data: tweets, isLoading } = useQuery({
    queryKey: ["kol-tweets", filterType],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("pumpfun-kol-twitter-scanner", {
        body: { 
          action: "get-tweets", 
          limit: 100,
          token_only: filterType === "token",
          type: filterType !== "all" && filterType !== "token" ? filterType : undefined
        }
      });
      if (error) throw error;
      return data.tweets as KOLTweet[];
    }
  });

  // Fetch stats
  const { data: stats } = useQuery({
    queryKey: ["kol-twitter-stats"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("pumpfun-kol-twitter-scanner", {
        body: { action: "get-stats" }
      });
      if (error) throw error;
      return data.stats;
    }
  });

  // Scan single KOL
  const scanMutation = useMutation({
    mutationFn: async (handle: string) => {
      const { data, error } = await supabase.functions.invoke("pumpfun-kol-twitter-scanner", {
        body: { action: "scan-kol", twitter_handle: handle, limit: 20 }
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast({
        title: "Scan Complete",
        description: `Scanned ${data.tweets_scanned} tweets, ${data.token_mentions} token mentions`
      });
      queryClient.invalidateQueries({ queryKey: ["kol-tweets"] });
      queryClient.invalidateQueries({ queryKey: ["kol-twitter-stats"] });
      setScanHandle("");
    },
    onError: (error: Error) => {
      toast({ title: "Scan Failed", description: error.message, variant: "destructive" });
    }
  });

  // Scan all KOLs
  const scanAllMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("pumpfun-kol-twitter-scanner", {
        body: { action: "scan-all-kols", limit_per_kol: 10, max_kols: 5 }
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast({
        title: "Bulk Scan Complete",
        description: `Scanned ${data.kols_scanned} KOL accounts`
      });
      queryClient.invalidateQueries({ queryKey: ["kol-tweets"] });
      queryClient.invalidateQueries({ queryKey: ["kol-twitter-stats"] });
    },
    onError: (error: Error) => {
      toast({ title: "Bulk Scan Failed", description: error.message, variant: "destructive" });
    }
  });

  // Correlate with trading
  const correlateMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("pumpfun-kol-twitter-scanner", {
        body: { action: "correlate-trading", hours_window: 48 }
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast({
        title: "Correlation Complete",
        description: `Found ${data.correlations_found} tweet-trade correlations`
      });
      queryClient.invalidateQueries({ queryKey: ["kol-tweets"] });
    },
    onError: (error: Error) => {
      toast({ title: "Correlation Failed", description: error.message, variant: "destructive" });
    }
  });

  const filteredTweets = tweets?.filter(t => 
    !searchQuery || 
    t.tweet_text.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.twitter_handle.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.detected_tickers?.some(ticker => ticker.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">{stats?.total || 0}</div>
            <p className="text-xs text-muted-foreground">Total Tweets</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-primary">{stats?.tokenMentions || 0}</div>
            <p className="text-xs text-muted-foreground">Token Mentions</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-green-500">{stats?.correlated || 0}</div>
            <p className="text-xs text-muted-foreground">Trade Correlations</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">{stats?.byType?.shill || 0}</div>
            <p className="text-xs text-muted-foreground">Shills</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-orange-500">
              {((stats?.avgSentiment || 0) * 100).toFixed(0)}%
            </div>
            <p className="text-xs text-muted-foreground">Avg Sentiment</p>
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Twitter className="h-5 w-5" />
            Twitter Timeline Scanner
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <div className="flex gap-2 flex-1 min-w-[200px]">
              <Input
                placeholder="@username to scan"
                value={scanHandle}
                onChange={(e) => setScanHandle(e.target.value.replace("@", ""))}
                className="flex-1"
              />
              <Button 
                onClick={() => scanHandle && scanMutation.mutate(scanHandle)}
                disabled={!scanHandle || scanMutation.isPending}
              >
                {scanMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
                Scan
              </Button>
            </div>
            
            <Button 
              variant="outline" 
              onClick={() => scanAllMutation.mutate()}
              disabled={scanAllMutation.isPending}
            >
              {scanAllMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Scan All KOLs
            </Button>
            
            <Button 
              variant="secondary" 
              onClick={() => correlateMutation.mutate()}
              disabled={correlateMutation.isPending}
            >
              {correlateMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Link2 className="h-4 w-4 mr-2" />
              )}
              Correlate Trades
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Tweets Feed */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Tweet Feed</CardTitle>
            <div className="flex items-center gap-2">
              <Input
                placeholder="Search tweets..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-48"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={filterType} onValueChange={setFilterType}>
            <TabsList className="mb-4">
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="token">Token Mentions</TabsTrigger>
              <TabsTrigger value="shill">Shills</TabsTrigger>
              <TabsTrigger value="alpha_call">Alpha</TabsTrigger>
              <TabsTrigger value="buy_signal">Buy Signals</TabsTrigger>
            </TabsList>

            <TabsContent value={filterType}>
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <ScrollArea className="h-[600px]">
                  <div className="space-y-4">
                    {filteredTweets?.map((tweet) => (
                      <Card key={tweet.id} className="bg-muted/30">
                        <CardContent className="pt-4">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              {/* Header */}
                              <div className="flex items-center gap-2 mb-2">
                                <a 
                                  href={`https://twitter.com/${tweet.twitter_handle}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="font-semibold hover:underline"
                                >
                                  @{tweet.twitter_handle}
                                </a>
                                {getTweetTypeBadge(tweet.tweet_type)}
                                {getSentimentIcon(tweet.sentiment_score)}
                                {tweet.correlated_activity_id && (
                                  <Badge variant="outline" className="text-green-500 border-green-500">
                                    <CheckCircle2 className="h-3 w-3 mr-1" />
                                    {tweet.correlation_type} ({tweet.correlation_delta_mins}m)
                                  </Badge>
                                )}
                              </div>

                              {/* Tweet text */}
                              <p className="text-sm mb-2 whitespace-pre-wrap">{tweet.tweet_text}</p>

                              {/* Detected tokens */}
                              {(tweet.detected_tickers?.length > 0 || tweet.detected_contracts?.length > 0) && (
                                <div className="flex flex-wrap gap-1 mb-2">
                                  {tweet.detected_tickers?.map((ticker) => (
                                    <Badge key={ticker} variant="secondary" className="text-xs">
                                      ${ticker}
                                    </Badge>
                                  ))}
                                  {tweet.detected_contracts?.map((contract) => (
                                    <Badge key={contract} variant="outline" className="text-xs font-mono">
                                      {contract.slice(0, 8)}...
                                    </Badge>
                                  ))}
                                </div>
                              )}

                              {/* Metrics */}
                              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                <span className="flex items-center gap-1">
                                  <Heart className="h-3 w-3" />
                                  {tweet.likes_count.toLocaleString()}
                                </span>
                                <span className="flex items-center gap-1">
                                  <Repeat className="h-3 w-3" />
                                  {tweet.retweets_count.toLocaleString()}
                                </span>
                                <span className="flex items-center gap-1">
                                  <MessageCircle className="h-3 w-3" />
                                  {tweet.replies_count.toLocaleString()}
                                </span>
                                <span className="flex items-center gap-1">
                                  <Eye className="h-3 w-3" />
                                  {tweet.views_count.toLocaleString()}
                                </span>
                                <span>
                                  {new Date(tweet.posted_at).toLocaleString()}
                                </span>
                              </div>
                            </div>

                            <a
                              href={tweet.tweet_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="shrink-0"
                            >
                              <Button variant="ghost" size="icon">
                                <ExternalLink className="h-4 w-4" />
                              </Button>
                            </a>
                          </div>
                        </CardContent>
                      </Card>
                    ))}

                    {filteredTweets?.length === 0 && (
                      <div className="text-center py-8 text-muted-foreground">
                        No tweets found. Scan some KOL timelines to get started.
                      </div>
                    )}
                  </div>
                </ScrollArea>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
