import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { ExternalLink, Copy, Check, RefreshCw, Play } from 'lucide-react';

interface PostedToken {
  token_mint: string;
  symbol: string;
  banner_url: string | null;
  image_uri: string | null;
  times_posted: number | null;
  x_community_id?: string | null;
  x_community_url?: string | null;
}

export function TokenXDashboard() {
  const [tokens, setTokens] = useState<PostedToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [backfilling, setBackfilling] = useState(false);
  const [copiedMint, setCopiedMint] = useState<string | null>(null);
  const [doneTokens, setDoneTokens] = useState<Set<string>>(new Set());

  const fetchTokens = async () => {
    setLoading(true);
    try {
      // Get posted tokens
      const { data: postedTokens, error } = await supabase
        .from('holders_intel_seen_tokens')
        .select('token_mint, symbol, banner_url, image_uri, times_posted')
        .eq('was_posted', true)
        .order('times_posted', { ascending: false });

      if (error) throw error;

      // Cross-reference with x_communities to find linked communities
      const tokensWithCommunities: PostedToken[] = [];
      for (const token of postedTokens || []) {
        const { data: communities } = await supabase
          .from('x_communities')
          .select('community_id, community_url')
          .contains('linked_token_mints', [token.token_mint])
          .limit(1);

        tokensWithCommunities.push({
          ...token,
          x_community_id: communities?.[0]?.community_id || null,
          x_community_url: communities?.[0]?.community_url || null,
        });
      }

      setTokens(tokensWithCommunities);
    } catch (err) {
      console.error('Error fetching tokens:', err);
      toast.error('Failed to load tokens');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTokens();
  }, []);

  const runBackfill = async () => {
    setBackfilling(true);
    try {
      const { data, error } = await supabase.functions.invoke('backfill-banner-urls');
      if (error) throw error;
      
      toast.success(`Backfill complete: ${data?.results?.updated || 0} banners found`);
      fetchTokens();
    } catch (err) {
      console.error('Backfill error:', err);
      toast.error('Backfill failed');
    } finally {
      setBackfilling(false);
    }
  };

  const generatePostText = (token: PostedToken) => {
    const holdersUrl = `https://blackboxfarm.lovable.app/holders?token=${token.token_mint}${token.x_community_id ? `&utm_community=${token.x_community_id}` : ''}`;
    
    return `Just paid for the $${token.symbol} banner on Holders 🔥

Check the live report here:
${holdersUrl}

#${token.symbol} #Solana`;
  };

  const handlePost = async (token: PostedToken) => {
    const text = generatePostText(token);
    
    try {
      await navigator.clipboard.writeText(text);
      setCopiedMint(token.token_mint);
      toast.success('Post text copied to clipboard!');
      
      // Open X compose in new tab
      const composeUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
      window.open(composeUrl, '_blank');
      
      setTimeout(() => setCopiedMint(null), 3000);
    } catch (err) {
      toast.error('Failed to copy to clipboard');
    }
  };

  const handleDone = (tokenMint: string) => {
    setDoneTokens(prev => new Set([...prev, tokenMint]));
    toast.success('Marked as done');
  };

  const missingBanners = tokens.filter(t => !t.banner_url).length;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Token X Posts</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            {tokens.length} posted tokens • {missingBanners} missing banners
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchTokens} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button 
            variant="default" 
            size="sm" 
            onClick={runBackfill} 
            disabled={backfilling || missingBanners === 0}
          >
            <Play className={`h-4 w-4 mr-2 ${backfilling ? 'animate-spin' : ''}`} />
            {backfilling ? 'Backfilling...' : `Backfill Banners (${missingBanners})`}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border max-h-[600px] overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-background z-10">
              <TableRow>
                <TableHead className="w-16">Icon</TableHead>
                <TableHead>Token</TableHead>
                <TableHead>Links</TableHead>
                <TableHead>X Community</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tokens.map((token) => (
                <TableRow 
                  key={token.token_mint} 
                  className={doneTokens.has(token.token_mint) ? 'opacity-50 bg-muted/30' : ''}
                >
                  <TableCell>
                    {token.image_uri ? (
                      <img 
                        src={token.image_uri} 
                        alt={token.symbol} 
                        className="w-10 h-10 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-xs">
                        ?
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">${token.symbol}</span>
                      <span className="text-xs text-muted-foreground font-mono">
                        {token.token_mint.slice(0, 8)}...
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <a
                        href={`https://dexscreener.com/solana/${token.token_mint}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary hover:underline flex items-center gap-1"
                      >
                        DEX <ExternalLink className="h-3 w-3" />
                      </a>
                      <a
                        href={`https://padre.gg/${token.symbol}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary hover:underline flex items-center gap-1"
                      >
                        Padre <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  </TableCell>
                  <TableCell>
                    {token.x_community_url ? (
                      <a
                        href={token.x_community_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary hover:underline flex items-center gap-1"
                      >
                        Community <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : (
                      <Badge variant="outline" className="text-xs">No community</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-2 justify-end">
                      <Button
                        size="sm"
                        variant={copiedMint === token.token_mint ? "default" : "outline"}
                        onClick={() => handlePost(token)}
                        disabled={doneTokens.has(token.token_mint)}
                      >
                        {copiedMint === token.token_mint ? (
                          <>
                            <Check className="h-4 w-4 mr-1" />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy className="h-4 w-4 mr-1" />
                            POST
                          </>
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant={doneTokens.has(token.token_mint) ? "secondary" : "ghost"}
                        onClick={() => handleDone(token.token_mint)}
                        disabled={doneTokens.has(token.token_mint)}
                      >
                        {doneTokens.has(token.token_mint) ? '✓ Done' : 'DONE'}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

export default TokenXDashboard;
