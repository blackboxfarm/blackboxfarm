import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { 
  Users, 
  Network, 
  AlertTriangle, 
  Crown, 
  Shield, 
  Wallet,
  Coins,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Loader2,
  Brain,
  TrendingUp,
  Link2
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface DevTeam {
  id: string;
  team_name: string | null;
  member_wallets: string[];
  member_twitter_accounts: string[];
  admin_usernames: string[];
  moderator_usernames: string[];
  linked_token_mints: string[];
  linked_x_communities: string[];
  tokens_created: number;
  tokens_rugged: number;
  risk_level: string;
  source: string;
  created_at: string;
  updated_at: string;
}

interface MeshStats {
  total_links: number;
  admin_links: number;
  mod_links: number;
  co_mod_links: number;
  token_links: number;
  unique_accounts: number;
  unique_communities: number;
}

interface RotationPattern {
  account: string;
  communities_admin: string[];
  communities_mod: string[];
  co_mods: string[];
  linked_tokens: number;
  risk_score: number;
}

export function TeamIntelDashboard() {
  const [teams, setTeams] = useState<DevTeam[]>([]);
  const [meshStats, setMeshStats] = useState<MeshStats | null>(null);
  const [rotationPatterns, setRotationPatterns] = useState<RotationPattern[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch dev teams
      const { data: teamsData, error: teamsError } = await supabase
        .from('dev_teams')
        .select('*')
        .eq('is_active', true)
        .order('tokens_created', { ascending: false })
        .limit(100);

      if (teamsError) throw teamsError;
      setTeams(teamsData || []);

      // Fetch mesh statistics
      const { data: meshData, error: meshError } = await supabase
        .from('reputation_mesh')
        .select('relationship, source_type, linked_type')
        .in('relationship', ['admin_of', 'mod_of', 'co_mod', 'community_for']);

      if (!meshError && meshData) {
        const stats: MeshStats = {
          total_links: meshData.length,
          admin_links: meshData.filter(m => m.relationship === 'admin_of').length,
          mod_links: meshData.filter(m => m.relationship === 'mod_of').length,
          co_mod_links: meshData.filter(m => m.relationship === 'co_mod').length,
          token_links: meshData.filter(m => m.relationship === 'community_for').length,
          unique_accounts: new Set(meshData.filter(m => m.source_type === 'x_account').map(m => m.source_type)).size,
          unique_communities: new Set(meshData.filter(m => m.linked_type === 'x_community').map(m => m.linked_type)).size
        };
        setMeshStats(stats);
      }

      // Detect rotation patterns (accounts appearing in multiple communities)
      const { data: rotationData, error: rotationError } = await supabase
        .from('reputation_mesh')
        .select('source_id, linked_id, relationship')
        .eq('source_type', 'x_account')
        .eq('linked_type', 'x_community')
        .in('relationship', ['admin_of', 'mod_of']);

      if (!rotationError && rotationData) {
        const accountMap = new Map<string, { admin: Set<string>; mod: Set<string> }>();
        
        for (const link of rotationData) {
          if (!accountMap.has(link.source_id)) {
            accountMap.set(link.source_id, { admin: new Set(), mod: new Set() });
          }
          const entry = accountMap.get(link.source_id)!;
          if (link.relationship === 'admin_of') {
            entry.admin.add(link.linked_id);
          } else {
            entry.mod.add(link.linked_id);
          }
        }

        // Get co-mod relationships
        const { data: coModData } = await supabase
          .from('reputation_mesh')
          .select('source_id, linked_id')
          .eq('relationship', 'co_mod');

        const coModMap = new Map<string, Set<string>>();
        for (const link of coModData || []) {
          if (!coModMap.has(link.source_id)) coModMap.set(link.source_id, new Set());
          coModMap.get(link.source_id)!.add(link.linked_id);
        }

        // Build patterns for accounts in 2+ communities
        const patterns: RotationPattern[] = [];
        for (const [account, data] of accountMap.entries()) {
          const totalCommunities = data.admin.size + data.mod.size;
          if (totalCommunities >= 2) {
            patterns.push({
              account,
              communities_admin: Array.from(data.admin),
              communities_mod: Array.from(data.mod),
              co_mods: Array.from(coModMap.get(account) || []),
              linked_tokens: 0, // Will be enriched
              risk_score: Math.min(100, totalCommunities * 15 + (coModMap.get(account)?.size || 0) * 5)
            });
          }
        }

        // Sort by risk score
        patterns.sort((a, b) => b.risk_score - a.risk_score);
        setRotationPatterns(patterns.slice(0, 50));
      }

    } catch (err: any) {
      toast.error(`Failed to fetch data: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const generateAISummary = async () => {
    setAnalyzing(true);
    try {
      // Build context for AI
      const context = {
        teams_count: teams.length,
        high_risk_teams: teams.filter(t => t.risk_level === 'high').length,
        total_mesh_links: meshStats?.total_links || 0,
        rotation_accounts: rotationPatterns.length,
        top_rotators: rotationPatterns.slice(0, 5).map(p => ({
          account: p.account,
          communities: p.communities_admin.length + p.communities_mod.length,
          co_mods: p.co_mods.length
        })),
        teams_sample: teams.slice(0, 10).map(t => ({
          wallets: t.member_wallets.length,
          twitter: t.member_twitter_accounts.length,
          tokens: t.tokens_created,
          rugged: t.tokens_rugged,
          risk: t.risk_level
        }))
      };

      const { data, error } = await supabase.functions.invoke('ai-social-predictor', {
        body: {
          prompt: `Analyze this developer/moderator network intelligence data and provide actionable insights:

DATA:
${JSON.stringify(context, null, 2)}

Provide a brief analysis (3-4 paragraphs) covering:
1. **Network Health**: Overall assessment of the dev team ecosystem
2. **Rotation Patterns**: Are there concerning patterns of the same accounts appearing across multiple token communities?
3. **Risk Indicators**: Key red flags or concerning patterns
4. **Recommendations**: What to watch for or investigate further

Focus on actionable intelligence for identifying potential coordinated rug operations or serial scammers.`,
          mode: 'analysis'
        }
      });

      if (error) throw error;
      setAiSummary(data?.prediction || data?.analysis || 'Analysis complete but no summary generated.');
    } catch (err: any) {
      toast.error(`AI analysis failed: ${err.message}`);
    } finally {
      setAnalyzing(false);
    }
  };

  const getRiskBadge = (level: string) => {
    switch (level) {
      case 'high': return <Badge variant="destructive">High Risk</Badge>;
      case 'medium': return <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30">Medium</Badge>;
      case 'low': return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Low</Badge>;
      default: return <Badge variant="outline">Unknown</Badge>;
    }
  };

  // Summary stats
  const summaryStats = {
    totalTeams: teams.length,
    highRiskTeams: teams.filter(t => t.risk_level === 'high').length,
    totalTokensTracked: teams.reduce((sum, t) => sum + (t.tokens_created || 0), 0),
    totalRugged: teams.reduce((sum, t) => sum + (t.tokens_rugged || 0), 0),
    rotationAccounts: rotationPatterns.length,
    avgTeamSize: teams.length > 0 
      ? (teams.reduce((sum, t) => sum + (t.member_wallets?.length || 0) + (t.member_twitter_accounts?.length || 0), 0) / teams.length).toFixed(1)
      : 0
  };

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <Card className="bg-card/50">
          <CardContent className="p-3 text-center">
            <div className="text-2xl font-bold">{summaryStats.totalTeams}</div>
            <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
              <Users className="h-3 w-3" /> Teams
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-destructive/30">
          <CardContent className="p-3 text-center">
            <div className="text-2xl font-bold text-destructive">{summaryStats.highRiskTeams}</div>
            <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
              <AlertTriangle className="h-3 w-3" /> High Risk
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/50">
          <CardContent className="p-3 text-center">
            <div className="text-2xl font-bold">{summaryStats.totalTokensTracked}</div>
            <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
              <Coins className="h-3 w-3" /> Tokens
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-orange-500/30">
          <CardContent className="p-3 text-center">
            <div className="text-2xl font-bold text-orange-400">{summaryStats.totalRugged}</div>
            <div className="text-xs text-muted-foreground">Rugged</div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-yellow-500/30">
          <CardContent className="p-3 text-center">
            <div className="text-2xl font-bold text-yellow-400">{summaryStats.rotationAccounts}</div>
            <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
              <Network className="h-3 w-3" /> Rotators
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/50">
          <CardContent className="p-3 text-center">
            <div className="text-2xl font-bold">{meshStats?.total_links || 0}</div>
            <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
              <Link2 className="h-3 w-3" /> Mesh Links
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <Button variant="outline" onClick={fetchData} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
        <Button onClick={generateAISummary} disabled={analyzing || loading}>
          {analyzing ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Brain className="h-4 w-4 mr-2" />
          )}
          Generate AI Summary
        </Button>
      </div>

      {/* AI Summary */}
      {aiSummary && (
        <Card className="border-violet-500/30 bg-gradient-to-br from-violet-950/20 to-purple-950/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Brain className="h-5 w-5 text-violet-400" />
              AI Intelligence Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="prose prose-sm prose-invert max-w-none whitespace-pre-wrap">
              {aiSummary}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Tabs */}
      <Tabs defaultValue="teams" className="space-y-4">
        <TabsList>
          <TabsTrigger value="teams" className="gap-2">
            <Users className="h-4 w-4" />
            Dev Teams ({teams.length})
          </TabsTrigger>
          <TabsTrigger value="rotations" className="gap-2">
            <Network className="h-4 w-4" />
            Rotation Patterns ({rotationPatterns.length})
          </TabsTrigger>
          <TabsTrigger value="mesh" className="gap-2">
            <Link2 className="h-4 w-4" />
            Mesh Overview
          </TabsTrigger>
        </TabsList>

        {/* Dev Teams Tab */}
        <TabsContent value="teams">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Detected Developer Teams</CardTitle>
              <CardDescription>
                Teams auto-detected by overlapping wallets, X accounts, and community moderation
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[500px]">
                {loading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : teams.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    No teams detected yet. Teams are created when overlapping identifiers are found.
                  </div>
                ) : (
                  <div className="divide-y">
                    {teams.map((team) => (
                      <Collapsible
                        key={team.id}
                        open={expandedTeam === team.id}
                        onOpenChange={() => setExpandedTeam(expandedTeam === team.id ? null : team.id)}
                      >
                        <CollapsibleTrigger className="w-full px-4 py-3 hover:bg-muted/50 transition-colors">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              {expandedTeam === team.id ? (
                                <ChevronDown className="h-4 w-4 text-muted-foreground" />
                              ) : (
                                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                              )}
                              <div className="text-left">
                                <div className="font-medium">
                                  {team.team_name || `Team ${team.id.slice(0, 8)}`}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {team.member_wallets?.length || 0} wallets · {team.member_twitter_accounts?.length || 0} X accounts · {team.tokens_created || 0} tokens
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {team.tokens_rugged > 0 && (
                                <Badge variant="destructive" className="gap-1">
                                  <AlertTriangle className="h-3 w-3" />
                                  {team.tokens_rugged} rugged
                                </Badge>
                              )}
                              {getRiskBadge(team.risk_level)}
                            </div>
                          </div>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="px-4 pb-4">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 pl-7">
                            {/* Wallets */}
                            <div className="space-y-2">
                              <div className="text-sm font-medium flex items-center gap-2">
                                <Wallet className="h-4 w-4 text-blue-400" />
                                Member Wallets
                              </div>
                              <div className="space-y-1">
                                {team.member_wallets?.slice(0, 5).map((wallet) => (
                                  <div key={wallet} className="text-xs font-mono bg-muted/50 px-2 py-1 rounded flex items-center justify-between">
                                    <span>{wallet.slice(0, 8)}...{wallet.slice(-6)}</span>
                                    <a 
                                      href={`https://solscan.io/account/${wallet}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-sky-400 hover:text-sky-300"
                                    >
                                      <ExternalLink className="h-3 w-3" />
                                    </a>
                                  </div>
                                ))}
                                {(team.member_wallets?.length || 0) > 5 && (
                                  <div className="text-xs text-muted-foreground">
                                    +{team.member_wallets.length - 5} more
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* X Accounts */}
                            <div className="space-y-2">
                              <div className="text-sm font-medium flex items-center gap-2">
                                <Crown className="h-4 w-4 text-yellow-400" />
                                X Accounts & Mods
                              </div>
                              <div className="flex flex-wrap gap-1">
                                {team.admin_usernames?.map((admin) => (
                                  <Badge key={admin} variant="outline" className="text-xs text-yellow-400 border-yellow-500/30">
                                    <Crown className="h-2.5 w-2.5 mr-1" />
                                    @{admin}
                                  </Badge>
                                ))}
                                {team.moderator_usernames?.map((mod) => (
                                  <Badge key={mod} variant="outline" className="text-xs text-blue-400 border-blue-500/30">
                                    <Shield className="h-2.5 w-2.5 mr-1" />
                                    @{mod}
                                  </Badge>
                                ))}
                                {team.member_twitter_accounts?.filter(a => 
                                  !team.admin_usernames?.includes(a) && !team.moderator_usernames?.includes(a)
                                ).map((account) => (
                                  <Badge key={account} variant="outline" className="text-xs">
                                    @{account}
                                  </Badge>
                                ))}
                              </div>
                            </div>

                            {/* Linked Communities */}
                            {team.linked_x_communities?.length > 0 && (
                              <div className="space-y-2">
                                <div className="text-sm font-medium">Linked Communities</div>
                                <div className="flex flex-wrap gap-1">
                                  {team.linked_x_communities.slice(0, 5).map((comm) => (
                                    <Badge key={comm} variant="secondary" className="text-xs">
                                      #{comm.slice(0, 10)}...
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Linked Tokens */}
                            {team.linked_token_mints?.length > 0 && (
                              <div className="space-y-2">
                                <div className="text-sm font-medium flex items-center gap-2">
                                  <Coins className="h-4 w-4 text-green-400" />
                                  Linked Tokens
                                </div>
                                <div className="flex flex-wrap gap-1">
                                  {team.linked_token_mints.slice(0, 5).map((mint) => (
                                    <a
                                      key={mint}
                                      href={`https://dexscreener.com/solana/${mint}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-xs font-mono bg-muted/50 px-2 py-1 rounded hover:bg-muted transition-colors"
                                    >
                                      {mint.slice(0, 6)}...
                                    </a>
                                  ))}
                                  {(team.linked_token_mints?.length || 0) > 5 && (
                                    <span className="text-xs text-muted-foreground">
                                      +{team.linked_token_mints.length - 5} more
                                    </span>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Rotation Patterns Tab */}
        <TabsContent value="rotations">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Network className="h-5 w-5 text-yellow-400" />
                Rotation Patterns
              </CardTitle>
              <CardDescription>
                X accounts appearing as admin/mod across multiple token communities - potential "serial operators"
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[500px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Account</TableHead>
                      <TableHead>Admin Of</TableHead>
                      <TableHead>Mod Of</TableHead>
                      <TableHead>Co-Mods</TableHead>
                      <TableHead>Risk Score</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8">
                          <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                        </TableCell>
                      </TableRow>
                    ) : rotationPatterns.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                          No rotation patterns detected yet
                        </TableCell>
                      </TableRow>
                    ) : (
                      rotationPatterns.map((pattern) => (
                        <TableRow key={pattern.account}>
                          <TableCell>
                            <a
                              href={`https://x.com/${pattern.account}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-medium text-sky-400 hover:underline flex items-center gap-1"
                            >
                              @{pattern.account}
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Crown className="h-4 w-4 text-yellow-400" />
                              <span className="font-mono">{pattern.communities_admin.length}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Shield className="h-4 w-4 text-blue-400" />
                              <span className="font-mono">{pattern.communities_mod.length}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="font-mono">
                              {pattern.co_mods.length}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Progress 
                                value={pattern.risk_score} 
                                className="w-16 h-2"
                              />
                              <span className={`font-mono text-sm ${
                                pattern.risk_score >= 70 ? 'text-destructive' :
                                pattern.risk_score >= 40 ? 'text-orange-400' : 'text-muted-foreground'
                              }`}>
                                {pattern.risk_score}
                              </span>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Mesh Overview Tab */}
        <TabsContent value="mesh">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Mesh Link Distribution</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {meshStats ? (
                  <>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="flex items-center gap-2">
                          <Crown className="h-4 w-4 text-yellow-400" /> Admin Links
                        </span>
                        <span className="font-mono">{meshStats.admin_links}</span>
                      </div>
                      <Progress value={(meshStats.admin_links / meshStats.total_links) * 100} className="h-2" />
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="flex items-center gap-2">
                          <Shield className="h-4 w-4 text-blue-400" /> Mod Links
                        </span>
                        <span className="font-mono">{meshStats.mod_links}</span>
                      </div>
                      <Progress value={(meshStats.mod_links / meshStats.total_links) * 100} className="h-2" />
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="flex items-center gap-2">
                          <Users className="h-4 w-4 text-purple-400" /> Co-Mod Links
                        </span>
                        <span className="font-mono">{meshStats.co_mod_links}</span>
                      </div>
                      <Progress value={(meshStats.co_mod_links / meshStats.total_links) * 100} className="h-2" />
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="flex items-center gap-2">
                          <Coins className="h-4 w-4 text-green-400" /> Token Links
                        </span>
                        <span className="font-mono">{meshStats.token_links}</span>
                      </div>
                      <Progress value={(meshStats.token_links / meshStats.total_links) * 100} className="h-2" />
                    </div>
                  </>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    No mesh data available
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Network Insights</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center p-4 bg-muted/30 rounded-lg">
                    <div className="text-3xl font-bold">{meshStats?.total_links || 0}</div>
                    <div className="text-xs text-muted-foreground">Total Relationships</div>
                  </div>
                  <div className="text-center p-4 bg-muted/30 rounded-lg">
                    <div className="text-3xl font-bold">{rotationPatterns.length}</div>
                    <div className="text-xs text-muted-foreground">Multi-Community Actors</div>
                  </div>
                </div>
                
                <div className="pt-4 border-t space-y-2">
                  <div className="text-sm font-medium">Key Findings</div>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li className="flex items-start gap-2">
                      <TrendingUp className="h-4 w-4 mt-0.5 text-green-400" />
                      {teams.length} dev teams identified with overlapping members
                    </li>
                    <li className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 mt-0.5 text-yellow-400" />
                      {rotationPatterns.filter(p => p.risk_score >= 70).length} high-risk rotation patterns
                    </li>
                    <li className="flex items-start gap-2">
                      <Network className="h-4 w-4 mt-0.5 text-blue-400" />
                      {meshStats?.co_mod_links || 0} co-moderator relationships mapped
                    </li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default TeamIntelDashboard;
