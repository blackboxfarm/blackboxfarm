import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, ExternalLink, ArrowUpDown, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { useEffect, useState, useMemo } from "react";
import { toast } from "sonner";
import { TokenImageModal } from "@/components/ui/token-image-modal";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";

const getLaunchpadIcon = (launchpad?: string) => {
  if (!launchpad) return null;
  const icons: Record<string, string> = {
    'pump.fun': '/launchpad-logos/pumpfun.png',
    'bonk.fun': '/launchpad-logos/bonkfun.png',
    'bags.fm': '/launchpad-logos/bagsfm.png',
    'raydium': '/launchpad-logos/raydium.png',
  };
  return icons[launchpad.toLowerCase()] || null;
};

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
  launchpad?: string;
}

export const TokenSets = () => {
  const [enriching, setEnriching] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const [sortColumn, setSortColumn] = useState<'symbol' | 'name' | 'launchpad' | 'raydium_date' | 'creator_wallet' | 'discovery_source' | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  
  const { data: tokens, isLoading, refetch } = useQuery({
    queryKey: ['token-sets'],
    queryFn: async () => {
      // Fetch from scraped_tokens
      const { data: scrapedTokens, error: scrapedError } = await supabase
        .from('scraped_tokens' as any)
        .select('token_mint, symbol, name, discovery_source, first_seen_at, creator_wallet, image_url, raydium_date, metadata_fetched_at, creator_fetched_at, launchpad')
        .order('first_seen_at', { ascending: false });

      // Fetch from token_lifecycle (Recently Discovered Tokens)
      const { data: lifecycleTokens, error: lifecycleError } = await supabase
        .from('token_lifecycle')
        .select('token_mint, symbol, name, discovery_source, first_seen_at, image_url, pair_created_at, launchpad')
        .order('first_seen_at', { ascending: false })
        .limit(500);

      if (scrapedError) {
        console.error('Error fetching scraped tokens:', scrapedError);
      }
      
      if (lifecycleError) {
        console.error('Error fetching lifecycle tokens:', lifecycleError);
      }

      // Combine both sources, removing duplicates by token_mint
      const tokenMap = new Map<string, TokenSet>();

      // Add scraped tokens first
      (scrapedTokens || []).forEach((t: any) => {
        tokenMap.set(t.token_mint, {
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
          launchpad: t.launchpad || undefined,
        });
      });

      // Merge lifecycle tokens, filling in missing data
      (lifecycleTokens || []).forEach((t: any) => {
        const existing = tokenMap.get(t.token_mint);
        if (existing) {
          // Merge data, preferring non-null values
          tokenMap.set(t.token_mint, {
            ...existing,
            symbol: existing.symbol || t.symbol,
            name: existing.name || t.name,
            image_url: existing.image_url || t.image_url,
            raydium_date: existing.raydium_date || t.pair_created_at,
            discovery_source: existing.discovery_source || t.discovery_source,
            launchpad: existing.launchpad || t.launchpad,
          });
        } else {
          // Add new token from lifecycle
          tokenMap.set(t.token_mint, {
            token_mint: t.token_mint,
            symbol: t.symbol || undefined,
            name: t.name || undefined,
            creator_wallet: undefined,
            discovery_source: t.discovery_source || 'dex_compile',
            first_seen_at: t.first_seen_at || new Date().toISOString(),
            image_url: t.image_url || undefined,
            raydium_date: t.pair_created_at || undefined,
            metadata_fetched_at: undefined,
            creator_fetched_at: undefined,
            launchpad: t.launchpad || undefined,
          });
        }
      });

      // Convert map to sorted array
      return Array.from(tokenMap.values()).sort((a, b) => 
        new Date(b.first_seen_at).getTime() - new Date(a.first_seen_at).getTime()
      );
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

  // Filter and sort tokens
  const filteredAndSortedTokens = useMemo(() => {
    if (!tokens) return [];

    let filtered = tokens.filter((token) => {
      const query = searchQuery.toLowerCase();
      return (
        token.token_mint.toLowerCase().includes(query) ||
        token.symbol?.toLowerCase().includes(query) ||
        token.name?.toLowerCase().includes(query) ||
        token.creator_wallet?.toLowerCase().includes(query)
      );
    });

    if (sortColumn) {
      filtered = [...filtered].sort((a, b) => {
        let aVal = a[sortColumn];
        let bVal = b[sortColumn];

        // Handle null/undefined values
        if (!aVal && !bVal) return 0;
        if (!aVal) return sortDirection === 'asc' ? 1 : -1;
        if (!bVal) return sortDirection === 'asc' ? -1 : 1;

        // String comparison
        if (typeof aVal === 'string' && typeof bVal === 'string') {
          return sortDirection === 'asc' 
            ? aVal.localeCompare(bVal)
            : bVal.localeCompare(aVal);
        }

        // Date comparison
        if (sortColumn === 'raydium_date') {
          const dateA = new Date(aVal as string).getTime();
          const dateB = new Date(bVal as string).getTime();
          return sortDirection === 'asc' ? dateA - dateB : dateB - dateA;
        }

        return 0;
      });
    }

    return filtered;
  }, [tokens, searchQuery, sortColumn, sortDirection]);

  // Pagination
  const totalPages = Math.ceil(filteredAndSortedTokens.length / itemsPerPage);
  const paginatedTokens = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredAndSortedTokens.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredAndSortedTokens, currentPage, itemsPerPage]);

  // Reset to page 1 when search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, itemsPerPage]);

  const handleSort = (column: typeof sortColumn) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
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
          <div className="flex items-center justify-between mb-4">
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
          
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by token, name, or wallet..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={itemsPerPage.toString()} onValueChange={(val) => setItemsPerPage(Number(val))}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10 per page</SelectItem>
                <SelectItem value="25">25 per page</SelectItem>
                <SelectItem value="50">50 per page</SelectItem>
                <SelectItem value="100">100 per page</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-4">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="py-2 w-10">Image</TableHead>
                  <TableHead className="py-2 min-w-[160px]">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2 hover:bg-accent"
                      onClick={() => handleSort('symbol')}
                    >
                      Token
                      <ArrowUpDown className="ml-2 h-3 w-3" />
                    </Button>
                  </TableHead>
                  <TableHead className="py-2 min-w-[260px]">Token Address (Mint)</TableHead>
                  <TableHead className="py-2 min-w-[80px]">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2 hover:bg-accent"
                      onClick={() => handleSort('launchpad')}
                    >
                      Launchpad
                      <ArrowUpDown className="ml-2 h-3 w-3" />
                    </Button>
                  </TableHead>
                  <TableHead className="py-2 min-w-[120px]">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2 hover:bg-accent"
                      onClick={() => handleSort('raydium_date')}
                    >
                      Raydium Date
                      <ArrowUpDown className="ml-2 h-3 w-3" />
                    </Button>
                  </TableHead>
                  <TableHead className="py-2 min-w-[220px]">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2 hover:bg-accent"
                      onClick={() => handleSort('creator_wallet')}
                    >
                      Creator Wallet
                      <ArrowUpDown className="ml-2 h-3 w-3" />
                    </Button>
                  </TableHead>
                  <TableHead className="py-2 min-w-[100px]">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2 hover:bg-accent"
                      onClick={() => handleSort('discovery_source')}
                    >
                      Source
                      <ArrowUpDown className="ml-2 h-3 w-3" />
                    </Button>
                  </TableHead>
                  <TableHead className="py-2 w-16">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedTokens.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      No tokens found matching your search.
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedTokens.map((token) => (
                  <TableRow key={token.token_mint}>
                    <TableCell className="py-2">
                      <TokenImageModal 
                        imageUrl={token.image_url}
                        tokenSymbol={token.symbol}
                        tokenName={token.name}
                        tokenMint={token.token_mint}
                      />
                    </TableCell>
                    <TableCell className="py-2">
                      <div className="flex flex-col">
                        <span className="font-medium text-sm">${token.symbol || 'Unknown'}</span>
                        <span className="text-xs text-muted-foreground truncate max-w-[150px]">{token.name || 'No name'}</span>
                      </div>
                    </TableCell>
                    <TableCell className="py-2">
                      <code className="text-xs block max-w-[260px] truncate" title={token.token_mint}>{token.token_mint}</code>
                    </TableCell>
                    <TableCell className="py-2">
                      {token.launchpad && getLaunchpadIcon(token.launchpad) ? (
                        <div className="flex items-center gap-2">
                          <img 
                            src={getLaunchpadIcon(token.launchpad)} 
                            alt={token.launchpad} 
                            className="w-5 h-5 object-contain"
                          />
                          <span className="text-xs">{token.launchpad}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="py-2">
                      <span className="text-xs whitespace-nowrap">
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
                          <span className="text-xs text-muted-foreground">Enriching...</span>
                        )}
                      </div>
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
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-4 border-t">
              <div className="text-sm text-muted-foreground">
                Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, filteredAndSortedTokens.length)} of {filteredAndSortedTokens.length} tokens
              </div>
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious 
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      className={currentPage === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                    />
                  </PaginationItem>
                  
                  {[...Array(Math.min(5, totalPages))].map((_, i) => {
                    let pageNum;
                    if (totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (currentPage <= 3) {
                      pageNum = i + 1;
                    } else if (currentPage >= totalPages - 2) {
                      pageNum = totalPages - 4 + i;
                    } else {
                      pageNum = currentPage - 2 + i;
                    }
                    
                    return (
                      <PaginationItem key={pageNum}>
                        <PaginationLink
                          onClick={() => setCurrentPage(pageNum)}
                          isActive={currentPage === pageNum}
                          className="cursor-pointer"
                        >
                          {pageNum}
                        </PaginationLink>
                      </PaginationItem>
                    );
                  })}

                  <PaginationItem>
                    <PaginationNext 
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      className={currentPage === totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
