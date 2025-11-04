import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

interface TokenSet {
  token_mint: string;
  symbol?: string;
  name?: string;
  creator_wallet?: string;
  discovery_source: string;
  first_seen_at: string;
  image_url?: string;
  raydium_date?: string;
}

export const TokenSets = () => {
  const { data: tokens, isLoading } = useQuery({
    queryKey: ['token-sets'],
    queryFn: async () => {
      // Fetch from scraped_tokens (columns: id, token_mint, symbol, name, creator_wallet, discovery_source, first_seen_at)
      const { data: scrapedTokens, error: scrapedError } = await supabase
        .from('scraped_tokens' as any)
        .select('token_mint, symbol, name, discovery_source, first_seen_at, creator_wallet')
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
        // Optional fields left undefined when not available in table
        image_url: undefined,
        raydium_date: undefined,
      }));
    }
  });

  const fetchCreatorWallet = async (tokenMint: string) => {
    // TODO: Implement solscan.io API call to get creator wallet
    console.log('Fetching creator wallet for:', tokenMint);
    // This will be implemented with the solscan API
  };

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
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="py-2 w-12">Image</TableHead>
                  <TableHead className="py-2">Token</TableHead>
                  <TableHead className="py-2">Raydium Date</TableHead>
                  <TableHead className="py-2">Token Address (Mint)</TableHead>
                  <TableHead className="py-2">Creator Wallet</TableHead>
                  <TableHead className="py-2">Source</TableHead>
                  <TableHead className="py-2">Actions</TableHead>
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
                      <code className="text-xs">{token.token_mint}</code>
                    </TableCell>
                    <TableCell className="py-2">
                      {token.creator_wallet ? (
                        <code className="text-xs">{token.creator_wallet}</code>
                      ) : (
                        <Button 
                          variant="outline" 
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => fetchCreatorWallet(token.token_mint)}
                        >
                          Fetch from Solscan
                        </Button>
                      )}
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
