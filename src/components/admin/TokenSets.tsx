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
}

export const TokenSets = () => {
  const { data: tokens, isLoading } = useQuery({
    queryKey: ['token-sets'],
    queryFn: async () => {
      const results: TokenSet[] = [];

      // Fetch from dex_compiles
      const { data: dexTokens, error: dexError } = await supabase
        .from('dex_compiles' as any)
        .select('token_mint, symbol, name, discovery_source, first_seen_at')
        .order('first_seen_at', { ascending: false });

      if (!dexError && dexTokens) {
        results.push(...(dexTokens as any[]).map((t: any) => ({
          token_mint: t.token_mint,
          symbol: t.symbol || undefined,
          name: t.name || undefined,
          discovery_source: t.discovery_source || 'dex_compile',
          first_seen_at: t.first_seen_at || new Date().toISOString()
        })));
      }

      // Fetch from scraped_tokens
      const { data: scrapedTokens, error: scrapedError } = await supabase
        .from('scraped_tokens' as any)
        .select('token_mint, symbol, name, discovery_source, first_seen_at, creator_wallet')
        .order('first_seen_at', { ascending: false });

      if (!scrapedError && scrapedTokens) {
        results.push(...(scrapedTokens as any[]).map((t: any) => ({
          token_mint: t.token_mint,
          symbol: t.symbol || undefined,
          name: t.name || undefined,
          creator_wallet: t.creator_wallet || undefined,
          discovery_source: t.discovery_source || 'html_scrape',
          first_seen_at: t.first_seen_at || new Date().toISOString()
        })));
      }

      // Deduplicate by token_mint
      const uniqueTokens = new Map<string, TokenSet>();
      results.forEach(token => {
        if (!uniqueTokens.has(token.token_mint)) {
          uniqueTokens.set(token.token_mint, token);
        }
      });

      return Array.from(uniqueTokens.values());
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
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Token Sets</CardTitle>
          <CardDescription>
            Combined list of tokens from Dex Compiles and HTML Scrapes
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Token</TableHead>
                  <TableHead>Token Address (Mint)</TableHead>
                  <TableHead>Creator Wallet</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tokens?.map((token) => (
                  <TableRow key={token.token_mint}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{token.symbol || 'No Symbol'}</span>
                        <span className="text-xs text-muted-foreground">{token.name || '-'}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <code className="text-xs">{token.token_mint}</code>
                    </TableCell>
                    <TableCell>
                      {token.creator_wallet ? (
                        <code className="text-xs">{token.creator_wallet}</code>
                      ) : (
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => fetchCreatorWallet(token.token_mint)}
                        >
                          Fetch from Solscan
                        </Button>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{token.discovery_source}</Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        asChild
                      >
                        <a 
                          href={`https://solscan.io/token/${token.token_mint}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <ExternalLink className="h-4 w-4" />
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
