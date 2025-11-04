import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { toast } from "sonner";

interface TokenSet {
  token_mint: string;
  symbol?: string;
  name?: string;
  creator_wallet?: string;
  discovery_source: string;
  first_seen_at: string;
  image_url?: string;
  raydium_date?: string;
  metadata_fetched_at?: string;
  creator_fetched_at?: string;
}

export const TokenSets = () => {
  const [enriching, setEnriching] = useState(false);
  
  const { data: tokens, isLoading, refetch } = useQuery({
    queryKey: ['token-sets'],
    queryFn: async () => {
      // Fetch from scraped_tokens with new enrichment columns
      const { data: scrapedTokens, error: scrapedError } = await supabase
        .from('scraped_tokens' as any)
        .select('token_mint, symbol, name, discovery_source, first_seen_at, creator_wallet, image_url, raydium_date, metadata_fetched_at, creator_fetched_at')
        .order('first_seen_at', { ascending: false });

      if (scrapedError) {
        console.error('Error fetching scraped tokens:', scrapedError);
        return [] as TokenSet[];
      }

      return (scrapedTokens as any[]).map((t: any) => ({
        token_mint: t.token_mint,
        symbol: t.symbol || undefined,
        name: t.name || undefined,
        creator_wallet: t.creator_wallet || undefined,
        discovery_source: t.discovery_source || 'html_scrape',
        first_seen_at: t.first_seen_at || new Date().toISOString(),
        image_url: t.image_url || undefined,
        raydium_date: t.raydium_date || undefined,
        metadata_fetched_at: t.metadata_fetched_at || undefined,
        creator_fetched_at: t.creator_fetched_at || undefined,
      }));
    }
  });

  // Auto-enrich tokens on mount
  useEffect(() => {
    const enrichTokens = async () => {
      if (tokens && tokens.length > 0) {
        // Check if any tokens need enrichment (missing symbol, name, image, or creator)
        const needsEnrichment = tokens.some(
          (t) => !t.symbol || !t.name || !t.image_url || !t.creator_wallet
        );

        if (needsEnrichment && !enriching) {
          setEnriching(true);
          console.log('Starting token enrichment...');
          try {
            const { error } = await supabase.functions.invoke('enrich-scraped-tokens', {
              body: { batchSize: 50 }
            });

            if (error) {
              console.error('Enrichment error:', error);
              toast.error('Failed to enrich tokens');
            } else {
              console.log('Token enrichment started successfully');
              toast.success('Token enrichment started');
              // Refetch after a delay to get updated data
              setTimeout(() => {
                console.log('Refetching enriched token data...');
                refetch();
              }, 5000);
            }
          } catch (error) {
            console.error('Enrichment error:', error);
            toast.error('Enrichment failed');
          } finally {
            setEnriching(false);
          }
        }
      }
    };

    enrichTokens();
  }, [tokens, enriching, refetch]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Token Sets</CardTitle>
              <CardDescription>
                Combined list of tokens from Dex Compiles and HTML Scrapes
              </CardDescription>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold">{tokens?.length || 0}</div>
              <div className="text-xs text-muted-foreground">Total Tokens</div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-4">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="py-2 w-10">Image</TableHead>
                  <TableHead className="py-2 min-w-[140px]">Token</TableHead>
                  <TableHead className="py-2 min-w-[100px]">Raydium Date</TableHead>
                  <TableHead className="py-2 min-w-[220px]">Creator Wallet</TableHead>
                  <TableHead className="py-2 min-w-[240px]">Token Address (Mint)</TableHead>
                  <TableHead className="py-2 min-w-[100px]">Source</TableHead>
                  <TableHead className="py-2 w-16">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tokens?.map((token) => (
                  <TableRow key={token.token_mint}>
                    <TableCell className="py-2">
                      {token.image_url ? (
                        <img 
                          src={token.image_url} 
                          alt={token.symbol || 'Token'} 
                          className="w-6 h-6 rounded-full object-cover"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center">
                          <span className="text-xs text-muted-foreground">?</span>
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="py-2">
                      <div className="flex flex-col">
                        <span className="font-medium text-sm">${token.symbol || 'No Symbol'}</span>
                        <span className="text-xs text-muted-foreground">{token.name || '-'}</span>
                      </div>
                    </TableCell>
                    <TableCell className="py-2">
                      <span className="text-xs">
                        {token.raydium_date 
                          ? new Date(token.raydium_date).toLocaleDateString('en-US', { 
                              month: 'short', 
                              day: 'numeric',
                              year: 'numeric'
                            })
                          : '-'}
                      </span>
                    </TableCell>
                    <TableCell className="py-2">
                      <div className="max-w-[220px]">
                        {token.creator_wallet ? (
                          <Link to={`/developer/${token.creator_wallet}`}>
                            <code className="text-xs block truncate hover:underline cursor-pointer text-primary" title={token.creator_wallet}>
                              {token.creator_wallet}
                            </code>
                          </Link>
                        ) : (
                          <span className="text-xs text-muted-foreground">Pending...</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="py-2">
                      <code className="text-xs block max-w-[240px] truncate" title={token.token_mint}>{token.token_mint}</code>
                    </TableCell>
                    <TableCell className="py-2">
                      <Badge variant="outline" className="text-xs">{token.discovery_source}</Badge>
                    </TableCell>
                    <TableCell className="py-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        asChild
                      >
                        <a 
                          href={`https://solscan.io/token/${token.token_mint}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
