import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Copy, RotateCcw, Share2 } from 'lucide-react';
import { toast } from 'sonner';
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

// Mock data for demo
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

export function ShareCardDemo({ tokenStats = mockTokenStats }: { tokenStats?: TokenStats }) {
  const [tweetTemplate, setTweetTemplate] = useState(() => getTemplate());

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
            <Label>Preview</Label>
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
      </CardContent>
    </Card>
  );
}
