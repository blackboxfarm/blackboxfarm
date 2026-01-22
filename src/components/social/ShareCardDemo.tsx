import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Copy, RotateCcw, Share2, Search, Send, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import {
  DEFAULT_TWEET_TEMPLATE,
  TEMPLATE_STORAGE_KEY,
  TEMPLATE_VARIABLES,
  getTemplate,
  saveTemplate,
  processTemplate,
  getShareUrl,
  type TokenShareData,
} from '@/lib/share-template';

interface TokenStats {
  symbol: string;
  name: string;
  tokenAddress: string;
  price: number;
  marketCap: number;
  healthScore: number;
  healthGrade: string;
  totalHolders: number;
  realHolders: number;
  whaleCount: number;
  strongCount: number;  // Serious ($200-$1K)
  activeCount: number;  // Retail ($1-$199)
  dustCount: number;    // Dust (<$1)
  dustPercentage: number;
}

// Mock data for demo (used when no token is fetched)
const mockTokenStats: TokenStats = {
  symbol: 'DEMO',
  name: 'Demo Token',
  tokenAddress: 'DemoToken1234567890abcdefghijklmnopqrstuvwxyz',
  price: 0.00001234,
  marketCap: 1250000,
  healthScore: 78,
  healthGrade: 'B+',
  totalHolders: 2847,
  realHolders: 1423,
  whaleCount: 12,
  strongCount: 284,   // Serious
  activeCount: 1127,  // Retail
  dustCount: 1424,
  dustPercentage: 50,
};

export function ShareCardDemo({ tokenStats: initialTokenStats = mockTokenStats }: { tokenStats?: TokenStats }) {
  const [tweetTemplate, setTweetTemplate] = useState(() => getTemplate());
  const [tokenMint, setTokenMint] = useState('');
  const [isFetching, setIsFetching] = useState(false);
  const [isPosting, setIsPosting] = useState(false);
  const [fetchedStats, setFetchedStats] = useState<TokenStats | null>(null);

  // Use fetched stats if available, otherwise use initial/mock
  const tokenStats = fetchedStats || initialTokenStats;

  // Persist template to localStorage whenever it changes
  useEffect(() => {
    saveTemplate(tweetTemplate);
  }, [tweetTemplate]);

  // Convert TokenStats to TokenShareData format
  const tokenData: TokenShareData = {
    ticker: tokenStats.symbol,
    name: tokenStats.name,
    tokenAddress: tokenStats.tokenAddress,
    totalWallets: tokenStats.totalHolders,
    realHolders: tokenStats.realHolders,
    dustCount: tokenStats.dustCount,
    dustPercentage: tokenStats.dustPercentage,
    whales: tokenStats.whaleCount,
    serious: tokenStats.strongCount,
    retail: tokenStats.activeCount,
    healthGrade: tokenStats.healthGrade,
    healthScore: tokenStats.healthScore,
  };

  // Fetch holder data using the same edge function as /holders page
  const handleFetch = async () => {
    if (!tokenMint.trim()) {
      toast.error('Please enter a token address');
      return;
    }

    setIsFetching(true);
    try {
      const { data, error } = await supabase.functions.invoke('bagless-holders-report', {
        body: { tokenMint: tokenMint.trim() }
      });

      if (error) throw error;

      if (!data || !data.holders) {
        throw new Error('No holder data returned');
      }

      console.log('Holder report response:', data);

      // Transform the response into TokenStats format
      // NOTE: bagless-holders-report historically evolved; support both old/new keys.
      const totalHolders = data.totalHolders || 0;
      const dustCount = data.tierBreakdown?.dust ?? data.dustWallets ?? data.simpleTiers?.dust?.count ?? 0;
      
      // Calculate dust percentage as (dustCount / totalHolders) * 100
      const dustPercentage = totalHolders > 0 
        ? parseFloat(((dustCount / totalHolders) * 100).toFixed(2))
        : 0;

      const stats: TokenStats = {
        symbol: data.tokenSymbol || data.symbol || 'UNKNOWN',
        name: data.tokenName || data.name || data.tokenSymbol || data.symbol || 'Unknown Token',
        tokenAddress: tokenMint.trim(),
        price: data.tokenPriceUSD || 0,
        marketCap:
          data.marketCap ||
          (typeof data.totalBalance === 'number' && typeof data.tokenPriceUSD === 'number'
            ? data.totalBalance * data.tokenPriceUSD
            : 0),
        healthScore: data.stabilityScore ?? data.healthScore?.score ?? 0,
        healthGrade: data.stabilityGrade ?? data.healthScore?.grade ?? 'N/A',
        totalHolders,
        realHolders: data.realHolders ?? data.realWallets ?? 0,
        whaleCount: data.tierBreakdown?.whale ?? data.simpleTiers?.whales?.count ?? 0,
        strongCount: data.tierBreakdown?.serious ?? data.simpleTiers?.serious?.count ?? 0,
        activeCount: data.tierBreakdown?.retail ?? data.simpleTiers?.retail?.count ?? 0,
        dustCount,
        dustPercentage,
      };

      setFetchedStats(stats);
      toast.success(`Fetched data for $${stats.symbol}`);
    } catch (err: any) {
      console.error('Fetch error:', err);
      toast.error(err.message || 'Failed to fetch token data');
    } finally {
      setIsFetching(false);
    }
  };

  // Post to Twitter via edge function using @HoldersIntent credentials
  const handlePostToTwitter = async () => {
    if (!fetchedStats) {
      toast.error('Please fetch token data first');
      return;
    }

    setIsPosting(true);
    try {
      // Get the processed tweet text from the template
      const tweetText = processTemplate(tweetTemplate, tokenData);

      const { data, error } = await supabase.functions.invoke('post-share-card-twitter', {
        body: { 
          tweetText,
          // This must match a username in public.twitter_accounts (currently: HoldersIntel)
          twitterHandle: 'HoldersIntel'
        }
      });

      if (error) throw error;

      if (data?.success) {
        toast.success(
          <div>
            Tweet posted! <a href={data.tweetUrl} target="_blank" rel="noopener noreferrer" className="underline">View tweet</a>
          </div>
        );
      } else {
        throw new Error(data?.error || 'Failed to post tweet');
      }
    } catch (err: any) {
      console.error('Post error:', err);
      toast.error(err.message || 'Failed to post to Twitter');
    } finally {
      setIsPosting(false);
    }
  };

  // Open Twitter with custom text only (no appended URL)
  const shareToTwitter = () => {
    const tweetText = processTemplate(tweetTemplate, tokenData);
    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`;
    window.open(twitterUrl, '_blank', 'width=550,height=420');
  };

  const copyTemplate = () => {
    navigator.clipboard.writeText(processTemplate(tweetTemplate, tokenData));
    toast.success('Tweet text copied!');
  };

  return (
    <Card className="bg-card/50 border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          ✏️ Tweet Template
        </CardTitle>
        <CardDescription>
          Customize the text for sharing. Use variables like {'{ticker}'} to insert dynamic data.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="tweet-template">Template</Label>
            <Textarea
              id="tweet-template"
              value={tweetTemplate}
              onChange={(e) => setTweetTemplate(e.target.value)}
              placeholder="Enter your tweet template..."
              rows={14}
              className="font-mono text-sm"
            />
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setTweetTemplate(DEFAULT_TWEET_TEMPLATE)}
                className="text-xs"
              >
                <RotateCcw className="h-3 w-3 mr-1" />
                Reset
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={copyTemplate}
                className="text-xs"
              >
                <Copy className="h-3 w-3 mr-1" />
                Copy Text
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Preview {fetchedStats && <Badge variant="secondary" className="ml-2">${fetchedStats.symbol}</Badge>}</Label>
            <div className="p-3 bg-muted/50 rounded-lg border text-sm whitespace-pre-wrap min-h-[300px]">
              {processTemplate(tweetTemplate, tokenData)}
            </div>
          </div>
        </div>
        
        {/* Variables reference */}
        <div className="pt-2 border-t border-border">
          <p className="text-xs text-muted-foreground mb-2">Available variables:</p>
          <div className="flex flex-wrap gap-2">
            {TEMPLATE_VARIABLES.map((v) => (
              <Badge 
                key={v.var} 
                variant="outline" 
                className="text-xs cursor-pointer hover:bg-muted"
                onClick={() => {
                  navigator.clipboard.writeText(v.var);
                  toast.success(`Copied ${v.var}`);
                }}
                title={v.desc}
              >
                {v.var}
              </Badge>
            ))}
          </div>
        </div>

        {/* Share Button */}
        <div className="pt-4 border-t border-border">
          <Button 
            className="w-full bg-sky-500 hover:bg-sky-600"
            onClick={shareToTwitter}
          >
            <Share2 className="h-4 w-4 mr-2" />
            Share to X (Twitter)
          </Button>
        </div>

        {/* Token Fetch + API Post Section */}
        <div className="pt-4 border-t border-border space-y-3">
          <Label className="text-sm font-medium">Manual API Post (@HoldersIntel)</Label>
          <div className="flex gap-2">
            <Input
              placeholder="Enter token address..."
              value={tokenMint}
              onChange={(e) => setTokenMint(e.target.value)}
              className="flex-1 font-mono text-sm"
            />
            <Button
              variant="outline"
              onClick={handleFetch}
              disabled={isFetching || !tokenMint.trim()}
            >
              {isFetching ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
              <span className="ml-2">Fetch</span>
            </Button>
          </div>
          
          <Button 
            className="w-full bg-emerald-600 hover:bg-emerald-700"
            onClick={handlePostToTwitter}
            disabled={isPosting || !fetchedStats}
          >
            {isPosting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Send className="h-4 w-4 mr-2" />
            )}
            Post to @HoldersIntel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}