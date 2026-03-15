import React, { useState, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw, Network, ArrowRight, ExternalLink, Copy, Check, Search, Filter, BarChart3 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

// ── Entity Link (clickable + copy) ──────────────────────────────
const EntityLink = ({ id, type }: { id: string; type: string }) => {
  const [copied, setCopied] = useState(false);

  const url = (() => {
    switch (type) {
      case 'wallet': return `https://solscan.io/account/${id}`;
      case 'token': return id.endsWith('pump') ? `https://pump.fun/coin/${id}` : `https://solscan.io/token/${id}`;
      case 'x_account': case 'x_user': return `https://x.com/${id.replace('@', '')}`;
      case 'website': return id.startsWith('http') ? id : `https://${id}`;
      case 'telegram': case 'telegram_channel': return `https://t.me/${id}`;
      case 'x_community': return `https://x.com/i/communities/${id}`;
      case 'github': return `https://github.com/${id}`;
      case 'discord': return null;
      default: return null;
    }
  })();

  const display = (() => {
    if (type === 'website') return id.length > 40 ? id.slice(0, 37) + '…' : id;
    if (['x_account', 'x_user'].includes(type)) return id.startsWith('@') ? id : `@${id}`;
    if (['telegram', 'telegram_channel', 'discord', 'github', 'medium', 'twitch', 'youtube'].includes(type)) return id;
    if (id.length > 16) return `${id.slice(0, 6)}…${id.slice(-6)}`;
    return id;
  })();

  const handleCopy = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(id);
    setCopied(true);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <span className="inline-flex items-center gap-1 group">
      {url ? (
        <a href={url} target="_blank" rel="noopener noreferrer"
          className="font-mono text-sm text-primary hover:underline inline-flex items-center gap-1" title={id}>
          {display}
          <ExternalLink className="h-3 w-3 opacity-40 group-hover:opacity-100" />
        </a>
      ) : (
        <span className="font-mono text-sm" title={id}>{display}</span>
      )}
      <button onClick={handleCopy} className="opacity-0 group-hover:opacity-70 hover:!opacity-100 transition-opacity" title="Copy full ID">
        {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
      </button>
    </span>
  );
};

// ── Type icons ──────────────────────────────────────────────────
const TYPE_ICONS: Record<string, string> = {
  wallet: '💰', token: '🪙', x_account: '🐦', x_user: '🐦', x_community: '👥',
  website: '🌐', telegram: '📱', telegram_channel: '📱', discord: '🎮',
  github: '🐙', youtube: '📺', twitch: '🎮', medium: '📝', kyc_root: '🔑',
};

const RELATIONSHIP_COLORS: Record<string, string> = {
  created_token: 'bg-green-500/20 text-green-500',
  created_rejected_token: 'bg-red-500/20 text-red-500',
  created_rug_token: 'bg-red-500/20 text-red-500',
  created_loss_token: 'bg-orange-500/20 text-orange-500',
  directly_funded: 'bg-yellow-500/20 text-yellow-500',
  indirectly_funded: 'bg-yellow-500/15 text-yellow-400',
  funded_by: 'bg-yellow-500/20 text-yellow-500',
  funded_rejected_dev: 'bg-red-500/15 text-red-400',
  social_account_of: 'bg-indigo-500/20 text-indigo-400',
  website_of: 'bg-pink-500/20 text-pink-400',
  official_website: 'bg-pink-500/20 text-pink-400',
  official_twitter: 'bg-blue-500/20 text-blue-400',
  official_telegram: 'bg-cyan-500/20 text-cyan-400',
  community_for: 'bg-purple-500/20 text-purple-400',
  community_admin: 'bg-blue-500/20 text-blue-400',
  community_mod: 'bg-blue-500/15 text-blue-300',
  community_admin_of_dev: 'bg-blue-500/20 text-blue-400',
  co_mod: 'bg-purple-500/20 text-purple-400',
  same_kyc_root: 'bg-red-600/20 text-red-400',
  same_team: 'bg-orange-500/20 text-orange-400',
  promotes_token: 'bg-emerald-500/20 text-emerald-400',
};

// ── Main Component ──────────────────────────────────────────────
const OracleMeshViewer = () => {
  const [searchInput, setSearchInput] = useState("");
  const [activeSearch, setActiveSearch] = useState("");
  const [relationshipFilter, setRelationshipFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  // Stats query
  const { data: stats } = useQuery({
    queryKey: ['mesh-stats'],
    queryFn: async () => {
      const [totalRes, typesRes, relsRes] = await Promise.all([
        supabase.from('reputation_mesh').select('*', { count: 'exact', head: true }),
        supabase.rpc('get_mesh_type_counts').catch(() => null),
        supabase.rpc('get_mesh_relationship_counts').catch(() => null),
      ]);
      return { total: totalRes.count || 0 };
    },
    staleTime: 5 * 60 * 1000,
  });

  // Search results query — only runs when user searches
  const { data: searchResults, isLoading, refetch } = useQuery({
    queryKey: ['mesh-search', activeSearch, relationshipFilter, typeFilter],
    queryFn: async () => {
      if (!activeSearch) return null;

      let query = supabase
        .from('reputation_mesh')
        .select('*')
        .order('confidence', { ascending: false });

      // Search across both source and linked IDs
      query = query.or(`source_id.ilike.%${activeSearch}%,linked_id.ilike.%${activeSearch}%`);

      if (relationshipFilter !== 'all') {
        query = query.eq('relationship', relationshipFilter);
      }
      if (typeFilter !== 'all') {
        query = query.or(`source_type.eq.${typeFilter},linked_type.eq.${typeFilter}`);
      }

      query = query.limit(500);

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!activeSearch,
    staleTime: 30 * 1000,
  });

  const handleSearch = useCallback(() => {
    if (searchInput.trim()) {
      setActiveSearch(searchInput.trim());
    }
  }, [searchInput]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  // Group results by the searched entity's connections
  const groupedResults = React.useMemo(() => {
    if (!searchResults) return {};
    return searchResults.reduce((acc, link) => {
      const key = `${link.source_type}:${link.source_id}`;
      if (!acc[key]) acc[key] = { sourceType: link.source_type, sourceId: link.source_id, links: [] };
      acc[key].links.push(link);
      return acc;
    }, {} as Record<string, { sourceType: string; sourceId: string; links: typeof searchResults }>);
  }, [searchResults]);

  const resultCount = searchResults?.length || 0;

  return (
    <div className="space-y-4">
      {/* Search Bar */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Network className="h-5 w-5" />
                Reputation Mesh Search
              </CardTitle>
              <CardDescription>
                {(stats?.total || 0).toLocaleString()} relationships indexed — search by wallet, token, @handle, or URL
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder="Search: wallet address, token mint, @twitter, website URL..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={handleKeyDown}
              className="flex-1 font-mono"
            />
            <Button onClick={handleSearch} disabled={!searchInput.trim() || isLoading}>
              <Search className="h-4 w-4 mr-2" />
              Search
            </Button>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Select value={relationshipFilter} onValueChange={setRelationshipFilter}>
              <SelectTrigger className="w-[200px]">
                <Filter className="h-3.5 w-3.5 mr-1.5" />
                <SelectValue placeholder="Relationship" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All relationships</SelectItem>
                <SelectItem value="created_token">Created token</SelectItem>
                <SelectItem value="created_rejected_token">Created rejected token</SelectItem>
                <SelectItem value="created_rug_token">Created rug token</SelectItem>
                <SelectItem value="directly_funded">Directly funded</SelectItem>
                <SelectItem value="indirectly_funded">Indirectly funded</SelectItem>
                <SelectItem value="funded_by">Funded by</SelectItem>
                <SelectItem value="social_account_of">Social account of</SelectItem>
                <SelectItem value="website_of">Website of</SelectItem>
                <SelectItem value="community_for">Community for</SelectItem>
                <SelectItem value="community_admin">Community admin</SelectItem>
                <SelectItem value="co_mod">Co-mod</SelectItem>
                <SelectItem value="same_kyc_root">Same KYC root</SelectItem>
                <SelectItem value="promotes_token">Promotes token</SelectItem>
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Entity type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="wallet">Wallet</SelectItem>
                <SelectItem value="token">Token</SelectItem>
                <SelectItem value="x_account">X Account</SelectItem>
                <SelectItem value="x_community">X Community</SelectItem>
                <SelectItem value="website">Website</SelectItem>
                <SelectItem value="telegram">Telegram</SelectItem>
                <SelectItem value="github">GitHub</SelectItem>
                <SelectItem value="discord">Discord</SelectItem>
                <SelectItem value="kyc_root">KYC Root</SelectItem>
              </SelectContent>
            </Select>
            {activeSearch && (
              <Button variant="ghost" size="sm" onClick={() => { setActiveSearch(""); setSearchInput(""); setRelationshipFilter("all"); setTypeFilter("all"); }}>
                Clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {isLoading ? (
        <Card>
          <CardContent className="py-12 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4" />
            <p className="text-muted-foreground">Searching {(stats?.total || 0).toLocaleString()} mesh links...</p>
          </CardContent>
        </Card>
      ) : activeSearch && searchResults ? (
        <>
          <div className="flex items-center gap-3">
            <Badge variant="secondary" className="text-sm px-3 py-1">
              <BarChart3 className="h-3.5 w-3.5 mr-1.5" />
              {resultCount.toLocaleString()} links found
            </Badge>
            <span className="text-sm text-muted-foreground">
              across {Object.keys(groupedResults).length} entities
            </span>
          </div>

          {resultCount > 0 ? (
            <div className="space-y-3">
              {Object.values(groupedResults).map((group) => (
                <Card key={`${group.sourceType}:${group.sourceId}`}>
                  <CardHeader className="pb-2 pt-4">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-lg">{TYPE_ICONS[group.sourceType] || '📦'}</span>
                      <Badge variant="outline" className="text-xs">{group.sourceType}</Badge>
                      <EntityLink id={group.sourceId} type={group.sourceType} />
                      <Badge variant="secondary" className="text-xs">{group.links.length} connections</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="space-y-1.5">
                      {group.links.map((link) => (
                        <div key={link.id} className="flex items-center gap-2 p-2 rounded bg-muted/30 flex-wrap">
                          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                          <Badge className={`text-xs ${RELATIONSHIP_COLORS[link.relationship] || 'bg-muted text-muted-foreground'}`}>
                            {link.relationship}
                          </Badge>
                          <span>{TYPE_ICONS[link.linked_type] || '📦'}</span>
                          <EntityLink id={link.linked_id} type={link.linked_type} />
                          <Badge variant="outline" className="text-xs">{link.confidence}%</Badge>
                          <span className="text-xs text-muted-foreground ml-auto flex-shrink-0">
                            {formatDistanceToNow(new Date(link.discovered_at), { addSuffix: true })}
                          </span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="border-dashed">
              <CardContent className="py-8 text-center">
                <p className="text-muted-foreground">No mesh links found for "{activeSearch}"</p>
              </CardContent>
            </Card>
          )}
        </>
      ) : (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center">
            <Search className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium mb-2">Search the Mesh</h3>
            <p className="text-muted-foreground text-sm max-w-md mx-auto">
              Enter a wallet address, token mint, X handle, or website URL to explore all known relationships and connections.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default OracleMeshViewer;
