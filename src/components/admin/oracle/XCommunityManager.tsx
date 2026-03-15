import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { 
  Users, 
  RefreshCw, 
  Search, 
  Shield, 
  Crown, 
  ExternalLink, 
  Plus,
  Edit,
  Loader2,
  AlertTriangle,
  CheckCircle,
  Clock,
  BadgeCheck,
  Coins
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CommunityFollowDialog } from "./CommunityFollowDialog";

interface XCommunity {
  id: string;
  community_id: string;
  community_url: string | null;
  name: string | null;
  admin_usernames: string[] | null;
  moderator_usernames: string[] | null;
  member_count: number | null;
  linked_token_mints: string[] | null;
  linked_wallets: string[] | null;
  last_scraped_at: string | null;
  scrape_status: string | null;
  is_flagged: boolean | null;
  flag_reason: string | null;
  is_deleted: boolean | null;
  created_at: string;
}

export function XCommunityManager() {
  const [communities, setCommunities] = useState<XCommunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedCommunity, setSelectedCommunity] = useState<XCommunity | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [bulkScraping, setBulkScraping] = useState(false);
  
  const [followDialogCommunity, setFollowDialogCommunity] = useState<XCommunity | null>(null);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const PAGE_SIZE = 50;

  // Token mint → symbol map for display
  const [tokenSymbols, setTokenSymbols] = useState<Record<string, string>>({});

  // Form state for manual entry
  const [manualAdmins, setManualAdmins] = useState("");
  const [manualMods, setManualMods] = useState("");
  const [newCommunityUrl, setNewCommunityUrl] = useState("");
  const [newCommunityName, setNewCommunityName] = useState("");

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setPage(0);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Get true total count (once)
  const fetchTotalStats = useCallback(async () => {
    const [totalRes, adminsRes, modsRes, flaggedRes, deletedRes, needsScrapeRes] = await Promise.all([
      supabase.from('x_communities').select('*', { count: 'exact', head: true }),
      supabase.from('x_communities').select('*', { count: 'exact', head: true }).not('admin_usernames', 'eq', '{}'),
      supabase.from('x_communities').select('*', { count: 'exact', head: true }).not('moderator_usernames', 'eq', '{}'),
      supabase.from('x_communities').select('*', { count: 'exact', head: true }).eq('is_flagged', true),
      supabase.from('x_communities').select('*', { count: 'exact', head: true }).eq('is_deleted', true),
      supabase.from('x_communities').select('*', { count: 'exact', head: true }).is('last_scraped_at', null).eq('is_deleted', false),
    ]);
    return {
      total: totalRes.count || 0,
      withAdmins: adminsRes.count || 0,
      withMods: modsRes.count || 0,
      flagged: flaggedRes.count || 0,
      deleted: deletedRes.count || 0,
      needsScrape: needsScrapeRes.count || 0,
    };
  }, []);

  const [stats, setStats] = useState({ total: 0, withAdmins: 0, withMods: 0, flagged: 0, deleted: 0, needsScrape: 0 });

  const fetchCommunities = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch stats
      const newStats = await fetchTotalStats();
      setStats(newStats);

      // Build query with server-side search
      let query = supabase
        .from('x_communities')
        .select('*', { count: 'exact' })
        .order('member_count', { ascending: false, nullsFirst: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (debouncedSearch) {
        query = query.or(`community_id.ilike.%${debouncedSearch}%,name.ilike.%${debouncedSearch}%,admin_usernames.cs.{"${debouncedSearch}"},moderator_usernames.cs.{"${debouncedSearch}"}`);
      }

      const { data, error, count } = await query;
      if (error) throw error;
      setCommunities(data || []);
      setTotalCount(count || 0);

      // Resolve token mints to symbols
      const allMints = new Set<string>();
      (data || []).forEach(c => c.linked_token_mints?.forEach((m: string) => allMints.add(m)));
      if (allMints.size > 0) {
        const { data: tokens } = await supabase
          .from('scraped_tokens')
          .select('token_mint, symbol')
          .in('token_mint', Array.from(allMints));
        const map: Record<string, string> = {};
        tokens?.forEach(t => { if (t.symbol) map[t.token_mint] = t.symbol; });
        setTokenSymbols(map);
      }
    } catch (err: any) {
      toast.error(`Failed to fetch communities: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, fetchTotalStats]);

  useEffect(() => {
    fetchCommunities();
  }, [fetchCommunities]);

  const filteredCommunities = communities; // Already filtered server-side

  // Bulk scrape all communities missing admin/mod data
  const bulkScrapeCommunities = async () => {
    const needsScrape = communities.filter(c => 
      !c.is_deleted && 
      (!c.admin_usernames?.length && !c.moderator_usernames?.length)
    ).slice(0, 10); // Limit to 10 per batch to avoid timeouts

    if (needsScrape.length === 0) {
      toast.info("All communities have admin/mod data");
      return;
    }

    setBulkScraping(true);
    let success = 0;
    let failed = 0;

    for (const community of needsScrape) {
      try {
        await supabase.functions.invoke('x-community-enricher', {
          body: { 
            communityUrl: community.community_url || `https://x.com/i/communities/${community.community_id}`,
            triggerTeamDetection: false // Skip team detection for bulk
          }
        });
        success++;
        
        // Rate limit: 5 second delay between requests
        await new Promise(r => setTimeout(r, 5000));
      } catch {
        failed++;
      }
    }

    toast.success(`Bulk scrape complete: ${success} success, ${failed} failed`);
    await fetchCommunities();
    setBulkScraping(false);
  };

  // Save manual edits
  const saveManualEdits = async () => {
    if (!selectedCommunity) return;

    const admins = manualAdmins.split(',').map(s => s.trim().toLowerCase().replace('@', '')).filter(Boolean);
    const mods = manualMods.split(',').map(s => s.trim().toLowerCase().replace('@', '')).filter(Boolean);

    try {
      const { error } = await supabase
        .from('x_communities')
        .update({
          admin_usernames: admins,
          moderator_usernames: mods,
          updated_at: new Date().toISOString()
        })
        .eq('id', selectedCommunity.id);

      if (error) throw error;

      toast.success("Community updated");
      setEditDialogOpen(false);
      await fetchCommunities();
    } catch (err: any) {
      toast.error(`Save failed: ${err.message}`);
    }
  };

  // Add new community manually
  const addNewCommunity = async () => {
    if (!newCommunityUrl) {
      toast.error("Community URL is required");
      return;
    }

    // Extract community ID from URL
    const match = newCommunityUrl.match(/communities\/(\d+)/);
    if (!match) {
      toast.error("Invalid X Community URL. Expected format: https://x.com/i/communities/123456");
      return;
    }

    const communityId = match[1];
    const admins = manualAdmins.split(',').map(s => s.trim().toLowerCase().replace('@', '')).filter(Boolean);
    const mods = manualMods.split(',').map(s => s.trim().toLowerCase().replace('@', '')).filter(Boolean);

    try {
      const { error } = await supabase
        .from('x_communities')
        .upsert({
          community_id: communityId,
          community_url: newCommunityUrl,
          name: newCommunityName || null,
          admin_usernames: admins,
          moderator_usernames: mods,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }, { onConflict: 'community_id' });

      if (error) throw error;

      toast.success("Community added");
      setAddDialogOpen(false);
      setNewCommunityUrl("");
      setNewCommunityName("");
      setManualAdmins("");
      setManualMods("");
      await fetchCommunities();
    } catch (err: any) {
      toast.error(`Failed to add: ${err.message}`);
    }
  };

  const openEditDialog = (community: XCommunity) => {
    setSelectedCommunity(community);
    setManualAdmins(community.admin_usernames?.join(', ') || '');
    setManualMods(community.moderator_usernames?.join(', ') || '');
    setEditDialogOpen(true);
  };

  const getScrapeStatusBadge = (community: XCommunity) => {
    if (community.is_deleted) {
      return <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" /> Deleted</Badge>;
    }
    if (!community.last_scraped_at) {
      return <Badge variant="outline" className="gap-1 text-muted-foreground"><Clock className="h-3 w-3" /> Pending</Badge>;
    }
    const lastScraped = formatDistanceToNow(new Date(community.last_scraped_at), { addSuffix: true });
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="default" className="gap-1 bg-green-600"><CheckCircle className="h-3 w-3" /> Scraped</Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p>Scraped {lastScraped}</p>
          <p className="text-xs text-muted-foreground mt-1">Community staff data is a historical snapshot — it does not re-scrape.</p>
        </TooltipContent>
      </Tooltip>
    );
  };

  // Stats are fetched from DB (see fetchTotalStats above)
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <div className="space-y-4">
      {/* Header Stats */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <Card className="bg-card/50">
          <CardContent className="p-3 text-center">
            <div className="text-2xl font-bold">{stats.total}</div>
            <div className="text-xs text-muted-foreground">Communities</div>
          </CardContent>
        </Card>
        <Card className="bg-card/50">
          <CardContent className="p-3 text-center">
            <div className="text-2xl font-bold text-yellow-500">{stats.withAdmins}</div>
            <div className="text-xs text-muted-foreground">With Admins</div>
          </CardContent>
        </Card>
        <Card className="bg-card/50">
          <CardContent className="p-3 text-center">
            <div className="text-2xl font-bold text-blue-500">{stats.withMods}</div>
            <div className="text-xs text-muted-foreground">With Mods</div>
          </CardContent>
        </Card>
        <Card className="bg-card/50">
          <CardContent className="p-3 text-center">
            <div className="text-2xl font-bold text-orange-500">{stats.needsScrape}</div>
            <div className="text-xs text-muted-foreground">Pending</div>
          </CardContent>
        </Card>
        <Card className="bg-card/50">
          <CardContent className="p-3 text-center">
            <div className="text-2xl font-bold text-red-500">{stats.flagged}</div>
            <div className="text-xs text-muted-foreground">Flagged</div>
          </CardContent>
        </Card>
        <Card className="bg-card/50">
          <CardContent className="p-3 text-center">
            <div className="text-2xl font-bold text-gray-500">{stats.deleted}</div>
            <div className="text-xs text-muted-foreground">Deleted</div>
          </CardContent>
        </Card>
      </div>

      {/* Actions Bar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by ID, name, admin, or mod..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            <Button variant="outline" onClick={fetchCommunities} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>

            <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="default">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Community
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add X Community</DialogTitle>
                  <DialogDescription>
                    Manually add an X Community with known admins/mods
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Community URL *</Label>
                    <Input
                      placeholder="https://x.com/i/communities/1234567890"
                      value={newCommunityUrl}
                      onChange={(e) => setNewCommunityUrl(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Name (optional)</Label>
                    <Input
                      placeholder="$TOKEN Community"
                      value={newCommunityName}
                      onChange={(e) => setNewCommunityName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Crown className="h-4 w-4 text-yellow-500" />
                      Admins (comma-separated)
                    </Label>
                    <Input
                      placeholder="@admin1, @admin2"
                      value={manualAdmins}
                      onChange={(e) => setManualAdmins(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Shield className="h-4 w-4 text-blue-500" />
                      Moderators (comma-separated)
                    </Label>
                    <Input
                      placeholder="@mod1, @mod2, @mod3"
                      value={manualMods}
                      onChange={(e) => setManualMods(e.target.value)}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setAddDialogOpen(false)}>Cancel</Button>
                  <Button onClick={addNewCommunity}>Add Community</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Button 
              variant="secondary" 
              onClick={bulkScrapeCommunities} 
              disabled={bulkScraping || stats.needsScrape === 0}
            >
              {bulkScraping ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Users className="h-4 w-4 mr-2" />
              )}
              Bulk Scrape ({stats.needsScrape})
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Communities Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Users className="h-5 w-5" />
            X Communities ({stats.total})
          </CardTitle>
          <CardDescription>
            Manage X Community admin/mod rosters for reputation tracking
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[500px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[200px]">Community</TableHead>
                  <TableHead className="w-[120px]">$TICKER</TableHead>
                  <TableHead>Staff</TableHead>
                  <TableHead className="w-[80px]">Members</TableHead>
                  <TableHead className="w-[100px]">Status</TableHead>
                  <TableHead className="w-[120px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                    </TableCell>
                  </TableRow>
                ) : filteredCommunities.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No communities found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredCommunities.map((community) => {
                    const admins = community.admin_usernames || [];
                    const mods = community.moderator_usernames || [];
                    const allStaff = [
                      ...admins.map(h => ({ handle: h, role: 'admin' as const })),
                      ...mods.map(h => ({ handle: h, role: 'mod' as const })),
                    ];
                    const visibleStaff = allStaff.slice(0, 5);
                    const extraCount = allStaff.length - 5;

                    return (
                      <TableRow key={community.id} className={community.is_flagged ? 'bg-red-500/5' : ''}>
                        {/* Community name + ID */}
                        <TableCell>
                          <div className="space-y-0.5">
                            <div className="font-medium text-sm truncate max-w-[200px]">
                              {community.name || `Community ${community.community_id.slice(0, 10)}...`}
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="text-xs text-muted-foreground font-mono">
                                {community.community_id.slice(0, 8)}...
                              </span>
                              {community.community_url && (
                                <a 
                                  href={community.community_url} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="text-sky-400 hover:text-sky-300"
                                >
                                  <ExternalLink className="h-3 w-3" />
                                </a>
                              )}
                            </div>
                          </div>
                        </TableCell>

                        {/* Token ticker column */}
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {(community.linked_token_mints || []).slice(0, 2).map(mint => {
                              const sym = tokenSymbols[mint];
                              return sym ? (
                                <Badge key={mint} variant="outline" className="text-xs text-emerald-400 border-emerald-500/30 gap-1">
                                  <Coins className="h-2.5 w-2.5" />{"$"}{sym}
                                </Badge>
                              ) : (
                                <span key={mint} className="text-xs text-muted-foreground font-mono">{mint.slice(0, 6)}...</span>
                              );
                            })}
                            {(community.linked_token_mints?.length || 0) > 2 && (
                              <span className="text-xs text-muted-foreground">+{(community.linked_token_mints?.length || 0) - 2}</span>
                            )}
                            {!(community.linked_token_mints?.length) && (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </div>
                        </TableCell>

                        {/* Combined Staff column */}
                        <TableCell>
                          <div className="flex flex-wrap gap-1 max-w-[280px]">
                            {visibleStaff.map(({ handle, role }) => (
                              <Badge
                                key={handle}
                                variant="outline"
                                className={`text-xs ${
                                  role === 'admin'
                                    ? 'text-yellow-400 border-yellow-500/30'
                                    : 'text-cyan-400 border-cyan-500/30'
                                }`}
                              >
                                {role === 'admin' ? (
                                  <Crown className="h-2.5 w-2.5 mr-1" />
                                ) : (
                                  <Shield className="h-2.5 w-2.5 mr-1" />
                                )}
                                @{handle}
                              </Badge>
                            ))}
                            {extraCount > 0 && (
                              <Badge variant="outline" className="text-xs">+{extraCount}</Badge>
                            )}
                            {allStaff.length === 0 && (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </div>
                        </TableCell>

                        {/* Members */}
                        <TableCell>
                          <span className="font-mono text-sm">
                            {community.member_count?.toLocaleString() || '—'}
                          </span>
                        </TableCell>

                        {/* Status */}
                        <TableCell>
                          {getScrapeStatusBadge(community)}
                          {community.is_flagged && (
                            <Badge variant="destructive" className="ml-1 text-xs">Flagged</Badge>
                          )}
                        </TableCell>

                        {/* Actions */}
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setFollowDialogCommunity(community)}
                                >
                                  <BadgeCheck className="h-4 w-4 text-sky-400" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-[260px]">
                                <p className="font-medium">Follow Blue Checks</p>
                                <p className="text-xs text-muted-foreground mt-1">Uses Twitter/X API (free). No Apify credits.</p>
                              </TooltipContent>
                            </Tooltip>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openEditDialog(community)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </ScrollArea>
          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between p-4 border-t">
              <span className="text-sm text-muted-foreground">
                Page {page + 1} of {totalPages} ({totalCount} results)
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                  Previous
                </Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Community: {selectedCommunity?.name || selectedCommunity?.community_id}</DialogTitle>
            <DialogDescription>
              Manually update admin and moderator lists
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Crown className="h-4 w-4 text-yellow-500" />
                Admins (comma-separated usernames)
              </Label>
              <Input
                placeholder="admin1, admin2"
                value={manualAdmins}
                onChange={(e) => setManualAdmins(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Enter X usernames without @ symbol, separated by commas
              </p>
            </div>
            <Separator />
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-blue-500" />
                Moderators (comma-separated usernames)
              </Label>
              <Input
                placeholder="mod1, mod2, mod3"
                value={manualMods}
                onChange={(e) => setManualMods(e.target.value)}
              />
            </div>
            {selectedCommunity?.last_scraped_at && (
              <div className="text-xs text-muted-foreground">
                Last scraped: {formatDistanceToNow(new Date(selectedCommunity.last_scraped_at), { addSuffix: true })}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Cancel</Button>
            <Button onClick={saveManualEdits}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Follow Blue Checks Dialog */}
      <CommunityFollowDialog
        open={!!followDialogCommunity}
        onOpenChange={(open) => !open && setFollowDialogCommunity(null)}
        communityId={followDialogCommunity?.community_id || ''}
        communityName={followDialogCommunity?.name || null}
      />
    </div>
  );
}

export default XCommunityManager;
