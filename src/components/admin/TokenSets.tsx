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
      // Fetch from dex_compiles
      const { data: dexTokens, error: dexError } = await supabase
        .from('dex_compiles')
        .select('token_mint, symbol, name, discovery_source, first_seen_at')
        .order('first_seen_at', { ascending: false });

      if (dexError) throw dexError;

      // Fetch from scraped_tokens
      const { data: scrapedTokens, error: scrapedError } = await supabase
        .from('scraped_tokens')
        .select('token_mint, symbol, name, discovery_source, first_seen_at, creator_wallet')
        .order('first_seen_at', { ascending: false });

      if (scrapedError && scrapedError.code !== 'PGRST116') {
        // Ignore table doesn't exist error
        console.warn('scraped_tokens table may not exist yet');
      }

      // Combine and deduplicate by token_mint
      const combined = [...(dexTokens || []), ...(scrapedTokens || [])];
      const uniqueTokens = new Map<string, TokenSet>();

      combined.forEach(token => {
        if (!uniqueTokens.has(token.token_mint)) {
          uniqueTokens.set(token.token_mint, token as TokenSet);
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
