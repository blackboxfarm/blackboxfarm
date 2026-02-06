import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { ExternalLink, Copy, Check, RefreshCw, Play, Filter, ArrowUpDown, Clock, DollarSign, Users } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface PostedToken {
  token_mint: string;
  symbol: string;
  banner_url: string | null;
  image_uri: string | null;
  times_posted: number | null;
  x_community_id?: string | null;
  x_community_url?: string | null;
  snapshot_slot?: string | null;
  minted_at?: string | null;
  bonded_at?: string | null;
}

type CommunityFilter = 'all' | 'with-community' | 'no-community';
type SortOrder = 'newest' | 'oldest' | 'most-posted';
type BondedFilter = 'all' | 'bonded' | 'not-bonded';

// Format date to Toronto timezone: "Feb03/26|14:33"
function formatTorontoDate(isoDate: string | null | undefined): string {
  if (!isoDate) return '-';
  try {
    const date = new Date(isoDate);
    return date.toLocaleString('en-US', {
      timeZone: 'America/Toronto',
      month: 'short',
      day: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).replace(',', '|').replace(' ', '/').replace(' ', '');
  } catch {
    return '-';
  }
}

// Calculate relative time ago from a date
function getTimeAgo(isoDate: string | null | undefined): string {
  if (!isoDate) return '-';
  try {
    const date = new Date(isoDate);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffDays > 0) {
      const remainingHours = Math.floor((diffMs % 86400000) / 3600000);
      return `${diffDays}d ${remainingHours}h`;
    } else if (diffHours > 0) {
      const remainingMins = Math.floor((diffMs % 3600000) / 60000);
      return `${diffHours}h ${remainingMins}m`;
    } else {
      return `${diffMins}m`;
    }
  } catch {
    return '-';
  }
}


export function TokenXDashboard() {
  const [tokens, setTokens] = useState<PostedToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [backfilling, setBackfilling] = useState(false);
  const [backfillingTimestamps, setBackfillingTimestamps] = useState(false);
  const [enrichingCommunities, setEnrichingCommunities] = useState(false);
  const [copiedMint, setCopiedMint] = useState<string | null>(null);
  const [enrichingToken, setEnrichingToken] = useState<string | null>(null);
  const [doneTokens, setDoneTokens] = useState<Set<string>>(new Set());
  const [communityFilter, setCommunityFilter] = useState<CommunityFilter>('all');
  const [bondedFilter, setBondedFilter] = useState<BondedFilter>('all');
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest');
  const [activeTab, setActiveTab] = useState('posted');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState<number>(50);

  const fetchTokens = async () => {
    setLoading(true);
    try {
      // Get posted tokens with timestamps
      const { data: postedTokens, error } = await supabase
        .from('holders_intel_seen_tokens')
        .select('token_mint, symbol, banner_url, image_uri, times_posted, snapshot_slot, minted_at, bonded_at')
        .eq('was_posted', true)
        .order('minted_at', { ascending: false, nullsFirst: false });

      if (error) throw error;

      // Fetch ALL communities with linked tokens in ONE query (fix N+1 problem)
      const { data: allCommunities } = await supabase
        .from('x_communities')
        .select('community_id, community_url, linked_token_mints');

      // Build a lookup map: token_mint -> community
      const communityMap = new Map<string, { community_id: string; community_url: string }>();
      for (const community of allCommunities || []) {
        const linkedMints = community.linked_token_mints as string[] | null;
        if (linkedMints) {
          for (const mint of linkedMints) {
            if (!communityMap.has(mint)) {
              communityMap.set(mint, {
                community_id: community.community_id,
                community_url: community.community_url,
              });
            }
          }
        }
      }

      // Map tokens with communities using the lookup
      const tokensWithCommunities: PostedToken[] = (postedTokens || []).map(token => {
        const community = communityMap.get(token.token_mint);
        return {
          ...token,
          x_community_id: community?.community_id || null,
          x_community_url: community?.community_url || null,
        };
      });

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

  // Apply filtering and sorting
  const filteredAndSortedTokens = useMemo(() => {
    let result = [...tokens];

    // Apply community filter
    if (communityFilter === 'with-community') {
      result = result.filter(t => t.x_community_id);
    } else if (communityFilter === 'no-community') {
      result = result.filter(t => !t.x_community_id);
    }

    // Apply bonded filter
    if (bondedFilter === 'bonded') {
      result = result.filter(t => t.bonded_at);
    } else if (bondedFilter === 'not-bonded') {
      result = result.filter(t => !t.bonded_at);
    }

    // Apply sorting
    result.sort((a, b) => {
      if (sortOrder === 'newest') {
        const dateA = a.minted_at || a.snapshot_slot || '';
        const dateB = b.minted_at || b.snapshot_slot || '';
        return dateB.localeCompare(dateA);
      } else if (sortOrder === 'oldest') {
        const dateA = a.minted_at || a.snapshot_slot || '';
        const dateB = b.minted_at || b.snapshot_slot || '';
        return dateA.localeCompare(dateB);
      } else {
        return (b.times_posted || 0) - (a.times_posted || 0);
      }
    });

    return result;
  }, [tokens, communityFilter, bondedFilter, sortOrder]);

  // Pagination logic
  const totalPages = Math.ceil(filteredAndSortedTokens.length / itemsPerPage);
  const paginatedTokens = itemsPerPage === 0 
    ? filteredAndSortedTokens 
    : filteredAndSortedTokens.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  // Reset to page 1 when filters change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [communityFilter, bondedFilter, sortOrder, itemsPerPage]);

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

  // Manual X Community enrichment - prompts for community URL and links it to token
  const handleEnrichCommunity = async (token: PostedToken) => {
    const communityUrl = prompt(`Enter X Community URL to link to $${token.symbol}:\n\nExample: https://x.com/i/communities/1234567890`);
    if (!communityUrl) return;
    
    if (!communityUrl.includes('communities/')) {
      toast.error('Invalid community URL. Must contain /communities/');
      return;
    }

    setEnrichingToken(token.token_mint);
    try {
      const { data, error } = await supabase.functions.invoke('x-community-enricher', {
        body: { 
          communityUrl,
          linkedTokenMint: token.token_mint
        }
      });
      
      if (error) throw error;
      
      if (data?.isDeleted) {
        toast.error('That community has been deleted');
      } else if (data?.success) {
        toast.success(`Community linked to $${token.symbol}!`);
        fetchTokens(); // Refresh to show new community
      } else {
        toast.error(data?.error || 'Failed to enrich community');
      }
    } catch (err) {
      console.error('Community enrichment error:', err);
      toast.error('Failed to link community');
    } finally {
      setEnrichingToken(null);
    }
  };

  const runTimestampBackfill = async () => {
    setBackfillingTimestamps(true);
    try {
      const { data, error } = await supabase.functions.invoke('backfill-token-timestamps');
      if (error) throw error;
      
      toast.success(`Timestamps: ${data?.results?.mintedUpdated || 0} minted, ${data?.results?.bondedUpdated || 0} bonded`);
      fetchTokens();
    } catch (err) {
      console.error('Timestamp backfill error:', err);
      toast.error('Timestamp backfill failed');
    } finally {
      setBackfillingTimestamps(false);
    }
  };

  // Bulk enrich all tokens missing community links from DexScreener
  const runCommunityEnrichment = async () => {
    setEnrichingCommunities(true);
    try {
      const { data, error } = await supabase.functions.invoke('enrich-token-communities');
      if (error) throw error;
      
      toast.success(`Communities: ${data?.enriched || 0} linked, ${data?.noTwitterUrl || 0} no Twitter URL`);
      fetchTokens();
    } catch (err) {
      console.error('Community enrichment error:', err);
      toast.error('Community enrichment failed');
    } finally {
      setEnrichingCommunities(false);
    }
  };

  const missingBanners = tokens.filter(t => !t.banner_url).length;
  const missingTimestamps = tokens.filter(t => !t.minted_at).length;
  const withCommunity = tokens.filter(t => t.x_community_id).length;
  const bondedCount = tokens.filter(t => t.bonded_at).length;
  const notBondedCount = tokens.filter(t => !t.bonded_at).length;

  return (
    <Card>
      <CardHeader className="flex flex-col gap-4">
        <div className="flex flex-row items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle>Token X Dashboard</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              {tokens.length} total • {bondedCount} bonded • {notBondedCount} not bonded • {withCommunity} with community
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={fetchTokens} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button 
              variant="secondary" 
              size="sm" 
              onClick={runTimestampBackfill} 
              disabled={backfillingTimestamps}
            >
              <Clock className={`h-4 w-4 mr-2 ${backfillingTimestamps ? 'animate-spin' : ''}`} />
              {backfillingTimestamps ? 'Running...' : `Backfill Timestamps (${missingTimestamps})`}
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
            <Button 
              variant="default" 
              size="sm" 
              onClick={runCommunityEnrichment} 
              disabled={enrichingCommunities}
              className="bg-purple-600 hover:bg-purple-700"
            >
              <Users className={`h-4 w-4 mr-2 ${enrichingCommunities ? 'animate-spin' : ''}`} />
              {enrichingCommunities ? 'Enriching...' : `Enrich Communities (${tokens.length - withCommunity})`}
            </Button>
          </div>
        </div>
        
        {/* Filter and Sort Controls */}
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={communityFilter} onValueChange={(v) => setCommunityFilter(v as CommunityFilter)}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Community" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Tokens</SelectItem>
                <SelectItem value="with-community">With Community</SelectItem>
                <SelectItem value="no-community">No Community</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-muted-foreground" />
            <Select value={bondedFilter} onValueChange={(v) => setBondedFilter(v as BondedFilter)}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Bonded" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="bonded">Bonded</SelectItem>
                <SelectItem value="not-bonded">Not Bonded</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="flex items-center gap-2">
            <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
            <Select value={sortOrder} onValueChange={(v) => setSortOrder(v as SortOrder)}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest First</SelectItem>
                <SelectItem value="oldest">Oldest First</SelectItem>
                <SelectItem value="most-posted">Most Posted</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Per page:</span>
            <Select value={itemsPerPage.toString()} onValueChange={(v) => setItemsPerPage(Number(v))}>
              <SelectTrigger className="w-[100px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="25">25</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
                <SelectItem value="250">250</SelectItem>
                <SelectItem value="0">All</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="ml-auto text-sm text-muted-foreground">
            Showing {paginatedTokens.length} of {filteredAndSortedTokens.length}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader className="sticky top-0 bg-background z-10">
              <TableRow>
                <TableHead className="w-12">Icon</TableHead>
                <TableHead>Token</TableHead>
                <TableHead className="text-center">Minted</TableHead>
                <TableHead className="text-center">Bonded</TableHead>
                <TableHead className="text-center">Age</TableHead>
                <TableHead>Links</TableHead>
                <TableHead>Community</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedTokens.map((token) => (
                <TableRow 
                  key={token.token_mint} 
                  className={doneTokens.has(token.token_mint) ? 'opacity-50 bg-muted/30' : ''}
                >
                  <TableCell>
                    {token.image_uri ? (
                      <img 
                        src={token.image_uri} 
                        alt={token.symbol} 
                        className="w-8 h-8 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs">
                        ?
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">${token.symbol}</span>
                      <span className="text-xs text-muted-foreground font-mono">
                        {token.token_mint.slice(0, 6)}...
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <span className="text-xs font-mono text-muted-foreground">
                      {formatTorontoDate(token.minted_at)}
                    </span>
                  </TableCell>
                  <TableCell className="text-center">
                    {token.bonded_at ? (
                      <span className="text-xs font-mono text-muted-foreground">
                        {formatTorontoDate(token.bonded_at)}
                      </span>
                    ) : (
                      <Badge variant="outline" className="text-xs">Not Bonded</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    <span className="text-xs font-medium">
                      {getTimeAgo(token.bonded_at || token.minted_at)}
                    </span>
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
                        href={`https://trade.padre.gg/trade/solana/${token.token_mint}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary hover:underline flex items-center gap-1"
                      >
                        Padre <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
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
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleEnrichCommunity(token)}
                          disabled={enrichingToken === token.token_mint}
                          className="h-6 px-2 text-xs"
                        >
                          {enrichingToken === token.token_mint ? (
                            <RefreshCw className="h-3 w-3 animate-spin" />
                          ) : (
                            <>
                              <Users className="h-3 w-3 mr-1" />
                              Link
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-1 justify-end">
                      <Button
                        size="sm"
                        variant={copiedMint === token.token_mint ? "default" : "outline"}
                        onClick={() => handlePost(token)}
                        disabled={doneTokens.has(token.token_mint)}
                        className="h-7 px-2"
                      >
                        {copiedMint === token.token_mint ? (
                          <Check className="h-3 w-3" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant={doneTokens.has(token.token_mint) ? "secondary" : "ghost"}
                        onClick={() => handleDone(token.token_mint)}
                        disabled={doneTokens.has(token.token_mint)}
                        className="h-7 px-2"
                      >
                        {doneTokens.has(token.token_mint) ? '✓' : 'Done'}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        
        {/* Pagination Controls */}
        {itemsPerPage > 0 && totalPages > 1 && (
          <div className="flex items-center justify-between mt-4">
            <div className="text-sm text-muted-foreground">
              Page {currentPage} of {totalPages}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
              >
                First
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
              >
                Next
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages}
              >
                Last
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default TokenXDashboard;
