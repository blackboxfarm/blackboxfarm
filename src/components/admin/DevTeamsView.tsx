import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { RefreshCw, Users, Wallet, AlertTriangle, Shield, ChevronDown, ChevronRight, Search, Trash2, Eye, Twitter, MessageCircle, Link as LinkIcon, Copy, ExternalLink, Database, Loader2 } from 'lucide-react';

interface DevTeam {
  id: string;
  team_name: string | null;
  team_hash: string | null;
  member_wallets: string[];
  member_twitter_accounts: string[];
  member_telegram_accounts: string[];
  admin_usernames: string[];
  moderator_usernames: string[];
  linked_token_mints: string[];
  linked_x_communities: string[];
  tokens_created: number;
  tokens_rugged: number;
  estimated_stolen_sol: number | null;
  risk_level: string;
  notes: string | null;
  tags: string[];
  evidence: any;
  source: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface XCommunity {
  id: string;
  community_id: string;
  community_url: string;
  name: string | null;
  description: string | null;
  member_count: number | null;
  admin_usernames: string[];
  moderator_usernames: string[];
  linked_token_mints: string[];
  scrape_status: string;
  last_scraped_at: string | null;
  created_at: string;
}

interface LaunchpadCreatorProfile {
  id: string;
  platform: string;
  creator_wallet: string | null;
  platform_username: string | null;
  platform_user_id: string | null;
  linked_x_account: string | null;
  tokens_created: number;
  tokens_graduated: number;
  tokens_rugged: number;
  total_volume_sol: number | null;
  is_blacklisted: boolean;
  is_whitelisted: boolean;
  risk_notes: string | null;
  created_at: string;
}

export function DevTeamsView() {
  const [teams, setTeams] = useState<DevTeam[]>([]);
  const [communities, setCommunities] = useState<XCommunity[]>([]);
  const [creators, setCreators] = useState<LaunchpadCreatorProfile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set());
  const [selectedTeam, setSelectedTeam] = useState<DevTeam | null>(null);
  const [activeTab, setActiveTab] = useState<'teams' | 'communities' | 'creators'>('teams');
  const [isBackfilling, setIsBackfilling] = useState(false);
  const [backfillResults, setBackfillResults] = useState<any>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      // Load all data in parallel
      const [teamsRes, communitiesRes, creatorsRes] = await Promise.all([
        supabase
          .from('dev_teams')
          .select('*')
          .order('tokens_rugged', { ascending: false })
          .order('created_at', { ascending: false }),
        supabase
          .from('x_communities')
          .select('*')
          .order('member_count', { ascending: false, nullsFirst: false })
          .order('created_at', { ascending: false }),
        supabase
          .from('launchpad_creator_profiles')
          .select('*')
          .order('tokens_created', { ascending: false })
          .order('created_at', { ascending: false })
      ]);

      if (teamsRes.data) setTeams(teamsRes.data as unknown as DevTeam[]);
      if (communitiesRes.data) setCommunities(communitiesRes.data as unknown as XCommunity[]);
      if (creatorsRes.data) setCreators(creatorsRes.data as unknown as LaunchpadCreatorProfile[]);
    } catch (err) {
      console.error('Failed to load data:', err);
      toast.error('Failed to load data');
    } finally {
      setIsLoading(false);
    }
  };

  const getRiskBadgeVariant = (riskLevel: string) => {
    switch (riskLevel) {
      case 'high': return 'destructive';
      case 'medium': return 'secondary';
      case 'low': return 'outline';
      default: return 'default';
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  const toggleTeamExpanded = (teamId: string) => {
    setExpandedTeams(prev => {
      const newSet = new Set(prev);
      if (newSet.has(teamId)) {
        newSet.delete(teamId);
      } else {
        newSet.add(teamId);
      }
      return newSet;
    });
  };

  const deleteTeam = async (teamId: string) => {
    if (!confirm('Are you sure you want to delete this team?')) return;
    
    try {
      const { error } = await supabase
        .from('dev_teams')
        .delete()
        .eq('id', teamId);
      
      if (error) throw error;
      toast.success('Team deleted');
      setTeams(prev => prev.filter(t => t.id !== teamId));
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete team');
    }
  };

  const runBackfill = async (dryRun: boolean = false) => {
    setIsBackfilling(true);
    setBackfillResults(null);
    
    try {
      const { data, error } = await supabase.functions.invoke('flipit-backfill-tracking', {
        body: { dryRun, limit: 500 }
      });
      
      if (error) throw error;
      
      setBackfillResults(data);
      
      if (dryRun) {
        toast.info(`Dry run complete: Would process ${data.processed} tokens`);
      } else {
        toast.success(`Backfill complete: ${data.processed} tokens processed`);
        // Reload data to show new entries
        loadData();
      }
    } catch (err: any) {
      toast.error(err.message || 'Backfill failed');
    } finally {
      setIsBackfilling(false);
    }
  };

  const filteredTeams = teams.filter(t => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      t.team_name?.toLowerCase().includes(q) ||
      t.member_wallets.some(w => w.toLowerCase().includes(q)) ||
      t.member_twitter_accounts.some(tw => tw.toLowerCase().includes(q)) ||
      t.linked_token_mints.some(m => m.toLowerCase().includes(q)) ||
      t.admin_usernames.some(a => a.toLowerCase().includes(q)) ||
      t.moderator_usernames.some(m => m.toLowerCase().includes(q))
    );
  });

  const filteredCommunities = communities.filter(c => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      c.name?.toLowerCase().includes(q) ||
      c.community_id.toLowerCase().includes(q) ||
      c.admin_usernames.some(a => a.toLowerCase().includes(q)) ||
      c.moderator_usernames.some(m => m.toLowerCase().includes(q))
    );
  });

  const filteredCreators = creators.filter(c => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      c.platform.toLowerCase().includes(q) ||
      c.creator_wallet?.toLowerCase().includes(q) ||
      c.platform_username?.toLowerCase().includes(q) ||
      c.linked_x_account?.toLowerCase().includes(q)
    );
  });

  return (
    <TooltipProvider>
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Dev Teams & Crew Tracker
                </CardTitle>
                <CardDescription>
                  Track organized groups of developers, X Community admins/mods, and launchpad creators
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button 
                  onClick={() => runBackfill(true)} 
                  disabled={isBackfilling} 
                  variant="outline" 
                  size="sm"
                  title="Preview what would be processed without making changes"
                >
                  {isBackfilling ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Eye className="h-4 w-4 mr-2" />}
                  Dry Run
                </Button>
                <Button 
                  onClick={() => runBackfill(false)} 
                  disabled={isBackfilling} 
                  size="sm"
                  title="Process all sold FlipIt positions and add to tracking lists"
                >
                  {isBackfilling ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Database className="h-4 w-4 mr-2" />}
                  Backfill Sold Positions
                </Button>
                <Button onClick={loadData} disabled={isLoading} variant="outline" size="sm">
                  <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Tab buttons */}
            <div className="flex gap-2 border-b pb-2">
              <Button 
                variant={activeTab === 'teams' ? 'default' : 'ghost'} 
                size="sm"
                onClick={() => setActiveTab('teams')}
              >
                <Users className="h-4 w-4 mr-2" />
                Teams ({teams.length})
              </Button>
              <Button 
                variant={activeTab === 'communities' ? 'default' : 'ghost'} 
                size="sm"
                onClick={() => setActiveTab('communities')}
              >
                <MessageCircle className="h-4 w-4 mr-2" />
                X Communities ({communities.length})
              </Button>
              <Button 
                variant={activeTab === 'creators' ? 'default' : 'ghost'} 
                size="sm"
                onClick={() => setActiveTab('creators')}
              >
                <Wallet className="h-4 w-4 mr-2" />
                Launchpad Creators ({creators.length})
              </Button>
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by wallet, twitter, token mint, admin, moderator..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Teams Tab */}
            {activeTab === 'teams' && (
              <ScrollArea className="h-[600px]">
                {filteredTeams.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    {teams.length === 0 ? 'No dev teams detected yet' : 'No teams match your search'}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredTeams.map(team => (
                      <Collapsible key={team.id} open={expandedTeams.has(team.id)}>
                        <div className="border rounded-lg p-3 bg-card">
                          <CollapsibleTrigger asChild>
                            <div 
                              className="flex items-center justify-between cursor-pointer hover:bg-muted/50 -m-3 p-3 rounded-lg"
                              onClick={() => toggleTeamExpanded(team.id)}
                            >
                              <div className="flex items-center gap-3">
                                {expandedTeams.has(team.id) ? (
                                  <ChevronDown className="h-4 w-4" />
                                ) : (
                                  <ChevronRight className="h-4 w-4" />
                                )}
                                <div>
                                  <div className="font-medium flex items-center gap-2">
                                    {team.team_name || `Team ${team.id.slice(0, 8)}`}
                                    <Badge variant={getRiskBadgeVariant(team.risk_level)}>
                                      {team.risk_level.toUpperCase()}
                                    </Badge>
                                    {team.tokens_rugged > 0 && (
                                      <Badge variant="destructive" className="gap-1">
                                        <AlertTriangle className="h-3 w-3" />
                                        {team.tokens_rugged} rugged
                                      </Badge>
                                    )}
                                  </div>
                                  <div className="text-xs text-muted-foreground flex gap-4 mt-1">
                                    <span>{team.member_wallets.length} wallets</span>
                                    <span>{team.member_twitter_accounts.length} twitter</span>
                                    <span>{team.linked_token_mints.length} tokens</span>
                                    <span>{team.admin_usernames.length + team.moderator_usernames.length} admins/mods</span>
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <Button 
                                  variant="ghost" 
                                  size="icon"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    deleteTeam(team.id);
                                  }}
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </div>
                            </div>
                          </CollapsibleTrigger>
                          <CollapsibleContent className="mt-4 space-y-4">
                            {/* Member Wallets */}
                            {team.member_wallets.length > 0 && (
                              <div>
                                <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                                  <Wallet className="h-4 w-4" />
                                  Member Wallets ({team.member_wallets.length})
                                </h4>
                                <div className="flex flex-wrap gap-2">
                                  {team.member_wallets.map(wallet => (
                                    <Badge key={wallet} variant="outline" className="font-mono text-xs cursor-pointer hover:bg-muted">
                                      <span onClick={() => copyToClipboard(wallet)}>
                                        {wallet.slice(0, 6)}...{wallet.slice(-4)}
                                      </span>
                                      <Copy className="h-3 w-3 ml-1" onClick={() => copyToClipboard(wallet)} />
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Twitter Accounts */}
                            {team.member_twitter_accounts.length > 0 && (
                              <div>
                                <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                                  <Twitter className="h-4 w-4" />
                                  Twitter Accounts ({team.member_twitter_accounts.length})
                                </h4>
                                <div className="flex flex-wrap gap-2">
                                  {team.member_twitter_accounts.map(handle => (
                                    <a 
                                      key={handle}
                                      href={`https://x.com/${handle}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                    >
                                      <Badge variant="outline" className="text-xs cursor-pointer hover:bg-muted">
                                        @{handle}
                                        <ExternalLink className="h-3 w-3 ml-1" />
                                      </Badge>
                                    </a>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Admin/Mod Accounts */}
                            {(team.admin_usernames.length > 0 || team.moderator_usernames.length > 0) && (
                              <div>
                                <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                                  <Shield className="h-4 w-4" />
                                  Community Roles
                                </h4>
                                <div className="flex flex-wrap gap-2">
                                  {team.admin_usernames.map(admin => (
                                    <Badge key={admin} variant="destructive" className="text-xs">
                                      ADMIN: @{admin}
                                    </Badge>
                                  ))}
                                  {team.moderator_usernames.map(mod => (
                                    <Badge key={mod} variant="secondary" className="text-xs">
                                      MOD: @{mod}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Linked Tokens */}
                            {team.linked_token_mints.length > 0 && (
                              <div>
                                <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                                  <LinkIcon className="h-4 w-4" />
                                  Linked Tokens ({team.linked_token_mints.length})
                                </h4>
                                <div className="flex flex-wrap gap-2">
                                  {team.linked_token_mints.slice(0, 10).map(mint => (
                                    <a 
                                      key={mint}
                                      href={`https://dexscreener.com/solana/${mint}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                    >
                                      <Badge variant="outline" className="font-mono text-xs cursor-pointer hover:bg-muted">
                                        {mint.slice(0, 8)}...
                                        <ExternalLink className="h-3 w-3 ml-1" />
                                      </Badge>
                                    </a>
                                  ))}
                                  {team.linked_token_mints.length > 10 && (
                                    <Badge variant="outline" className="text-xs">
                                      +{team.linked_token_mints.length - 10} more
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* Notes */}
                            {team.notes && (
                              <div className="text-sm text-muted-foreground bg-muted/50 p-2 rounded">
                                {team.notes}
                              </div>
                            )}

                            {/* Tags */}
                            {team.tags && team.tags.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {team.tags.map(tag => (
                                  <Badge key={tag} variant="outline" className="text-xs">
                                    {tag}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </CollapsibleContent>
                        </div>
                      </Collapsible>
                    ))}
                  </div>
                )}
              </ScrollArea>
            )}

            {/* X Communities Tab */}
            {activeTab === 'communities' && (
              <ScrollArea className="h-[600px]">
                {filteredCommunities.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    {communities.length === 0 ? 'No X Communities tracked yet' : 'No communities match your search'}
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Community</TableHead>
                        <TableHead>Members</TableHead>
                        <TableHead>Admins</TableHead>
                        <TableHead>Moderators</TableHead>
                        <TableHead>Linked Tokens</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredCommunities.map(community => (
                        <TableRow key={community.id}>
                          <TableCell>
                            <div>
                              <a 
                                href={community.community_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-medium hover:underline flex items-center gap-1"
                              >
                                {community.name || community.community_id.slice(0, 12)}
                                <ExternalLink className="h-3 w-3" />
                              </a>
                              {community.description && (
                                <p className="text-xs text-muted-foreground line-clamp-1">
                                  {community.description}
                                </p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            {community.member_count?.toLocaleString() || '-'}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {community.admin_usernames.slice(0, 3).map(admin => (
                                <Badge key={admin} variant="destructive" className="text-xs">
                                  @{admin}
                                </Badge>
                              ))}
                              {community.admin_usernames.length > 3 && (
                                <Badge variant="outline" className="text-xs">
                                  +{community.admin_usernames.length - 3}
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {community.moderator_usernames.slice(0, 3).map(mod => (
                                <Badge key={mod} variant="secondary" className="text-xs">
                                  @{mod}
                                </Badge>
                              ))}
                              {community.moderator_usernames.length > 3 && (
                                <Badge variant="outline" className="text-xs">
                                  +{community.moderator_usernames.length - 3}
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>{community.linked_token_mints.length}</TableCell>
                          <TableCell>
                            <Badge variant={community.scrape_status === 'completed' ? 'default' : 'secondary'}>
                              {community.scrape_status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </ScrollArea>
            )}

            {/* Launchpad Creators Tab */}
            {activeTab === 'creators' && (
              <ScrollArea className="h-[600px]">
                {filteredCreators.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    {creators.length === 0 ? 'No launchpad creators tracked yet' : 'No creators match your search'}
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Platform</TableHead>
                        <TableHead>Creator Wallet</TableHead>
                        <TableHead>Username</TableHead>
                        <TableHead>X Account</TableHead>
                        <TableHead>Tokens</TableHead>
                        <TableHead>Graduated</TableHead>
                        <TableHead>Rugged</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredCreators.map(creator => (
                        <TableRow key={creator.id}>
                          <TableCell>
                            <Badge variant="outline">
                              {creator.platform}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {creator.creator_wallet ? (
                              <div className="font-mono text-xs flex items-center gap-1">
                                <span>{creator.creator_wallet.slice(0, 6)}...{creator.creator_wallet.slice(-4)}</span>
                                <Copy 
                                  className="h-3 w-3 cursor-pointer hover:text-primary" 
                                  onClick={() => copyToClipboard(creator.creator_wallet!)}
                                />
                              </div>
                            ) : '-'}
                          </TableCell>
                          <TableCell>{creator.platform_username || '-'}</TableCell>
                          <TableCell>
                            {creator.linked_x_account ? (
                              <a 
                                href={`https://x.com/${creator.linked_x_account}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary hover:underline flex items-center gap-1"
                              >
                                @{creator.linked_x_account}
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            ) : '-'}
                          </TableCell>
                          <TableCell>{creator.tokens_created}</TableCell>
                          <TableCell className="text-green-500">{creator.tokens_graduated}</TableCell>
                          <TableCell className="text-red-500">{creator.tokens_rugged}</TableCell>
                          <TableCell>
                            {creator.is_blacklisted && (
                              <Badge variant="destructive">Blacklisted</Badge>
                            )}
                            {creator.is_whitelisted && (
                              <Badge className="bg-green-500">Whitelisted</Badge>
                            )}
                            {!creator.is_blacklisted && !creator.is_whitelisted && (
                              <Badge variant="secondary">Neutral</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
}

export default DevTeamsView;
