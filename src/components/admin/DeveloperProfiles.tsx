import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { 
  Search, RefreshCw, TrendingUp, TrendingDown, AlertTriangle, CheckCircle, 
  Ban, Flag, ExternalLink, Download, Upload, Skull, ShieldAlert, Shield,
  User, Coins, Clock
} from "lucide-react";
import { toast } from "sonner";

type TrustLevel = 'trusted' | 'neutral' | 'suspicious' | 'scammer';
type OutcomeFilter = 'all' | 'success' | 'failed' | 'rug_pull' | 'neutral' | 'pending';

export const DeveloperProfiles = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDeveloperId, setSelectedDeveloperId] = useState<string | null>(null);
  const [trustFilter, setTrustFilter] = useState<TrustLevel | 'all'>('all');
  const [outcomeFilter, setOutcomeFilter] = useState<OutcomeFilter>('all');
  const [isBackfilling, setIsBackfilling] = useState(false);
  const [editingNotes, setEditingNotes] = useState<string | null>(null);
  const [notesText, setNotesText] = useState("");

  const { data: profiles, isLoading, refetch } = useQuery({
    queryKey: ["developer-profiles", searchQuery, trustFilter, outcomeFilter],
    queryFn: async () => {
      let query = supabase
        .from("developer_profiles")
        .select("*")
        .order("created_at", { ascending: false });

      if (searchQuery) {
        query = query.or(`master_wallet_address.ilike.%${searchQuery}%,display_name.ilike.%${searchQuery}%,twitter_handle.ilike.%${searchQuery}%`);
      }
      
      if (trustFilter !== 'all') {
        query = query.eq('trust_level', trustFilter);
      }

      const { data, error } = await query.limit(100);
      if (error) throw error;
      
      // If outcome filter is set, we need to filter by tokens
      if (outcomeFilter !== 'all' && data) {
        const developerIds = data.map(d => d.id);
        const { data: tokens } = await supabase
          .from('developer_tokens')
          .select('developer_id')
          .in('developer_id', developerIds)
          .eq('outcome', outcomeFilter);
        
        const matchingIds = new Set(tokens?.map(t => t.developer_id) || []);
        return data.filter(d => matchingIds.has(d.id));
      }
      
      return data;
    },
  });

  const { data: stats } = useQuery({
    queryKey: ["developer-stats"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("developer_profiles")
        .select("trust_level, rug_pull_count");
      
      if (error) throw error;
      
      return {
        total: data?.length || 0,
        scammers: data?.filter(d => d.trust_level === 'scammer').length || 0,
        suspicious: data?.filter(d => d.trust_level === 'suspicious').length || 0,
        rugPulls: data?.reduce((sum, d) => sum + (d.rug_pull_count || 0), 0) || 0,
      };
    },
  });

  const { data: selectedProfile, refetch: refetchProfile } = useQuery({
    queryKey: ["developer-profile-detail", selectedDeveloperId],
    enabled: !!selectedDeveloperId,
    queryFn: async () => {
      if (!selectedDeveloperId) return null;

      const [profileRes, walletsRes, tokensRes] = await Promise.all([
        supabase.from("developer_profiles").select("*").eq("id", selectedDeveloperId).single(),
        supabase.from("developer_wallets").select("*").eq("developer_id", selectedDeveloperId).order("depth_level"),
        supabase.from("developer_tokens").select("*").eq("developer_id", selectedDeveloperId).order("launch_date", { ascending: false }),
      ]);

      if (profileRes.error) throw profileRes.error;
      return {
        profile: profileRes.data,
        wallets: walletsRes.data || [],
        tokens: tokensRes.data || [],
      };
    },
  });

  const getTrustBadge = (trustLevel: string) => {
    const variants = {
      trusted: { icon: Shield, className: "bg-green-500/20 text-green-500 border-green-500/30" },
      neutral: { icon: User, className: "bg-muted text-muted-foreground border-muted" },
      suspicious: { icon: ShieldAlert, className: "bg-orange-500/20 text-orange-500 border-orange-500/30" },
      scammer: { icon: Skull, className: "bg-red-500/20 text-red-500 border-red-500/30" },
    };
    const config = variants[trustLevel as keyof typeof variants] || variants.neutral;
    const Icon = config.icon;
    return (
      <Badge variant="outline" className={config.className}>
        <Icon className="h-3 w-3 mr-1" />
        {trustLevel}
      </Badge>
    );
  };

  const getOutcomeBadge = (outcome: string) => {
    const variants: Record<string, { className: string; label: string }> = {
      success: { className: "bg-green-500/20 text-green-500", label: "Success" },
      neutral: { className: "bg-blue-500/20 text-blue-500", label: "Neutral" },
      failed: { className: "bg-yellow-500/20 text-yellow-500", label: "Failed" },
      rug_pull: { className: "bg-red-500/20 text-red-500", label: "Rug Pull" },
      pending: { className: "bg-muted text-muted-foreground", label: "Pending" },
    };
    const config = variants[outcome] || variants.pending;
    return <Badge className={config.className}>{config.label}</Badge>;
  };

  const getReputationColor = (score: number) => {
    if (score >= 70) return "text-green-500";
    if (score >= 40) return "text-yellow-500";
    return "text-red-500";
  };

  const handleBackfill = async (source: 'flipit' | 'fantasy' | 'all') => {
    setIsBackfilling(true);
    try {
      const { data, error } = await supabase.functions.invoke("backfill-developer-profiles", {
        body: { source, limit: 100 },
      });
      
      if (error) throw error;
      
      toast.success(`Backfill complete: ${data.summary.totalCreated} profiles created`);
      refetch();
    } catch (error) {
      toast.error("Backfill failed: " + (error instanceof Error ? error.message : 'Unknown error'));
      console.error(error);
    } finally {
      setIsBackfilling(false);
    }
  };

  const updateTrustLevel = async (developerId: string, newLevel: TrustLevel) => {
    try {
      const { error } = await supabase
        .from("developer_profiles")
        .update({ trust_level: newLevel, updated_at: new Date().toISOString() })
        .eq("id", developerId);
      
      if (error) throw error;
      
      toast.success(`Trust level updated to ${newLevel}`);
      refetch();
      if (selectedDeveloperId === developerId) refetchProfile();
    } catch (error) {
      toast.error("Failed to update trust level");
      console.error(error);
    }
  };

  const saveNotes = async (developerId: string) => {
    try {
      const { error } = await supabase
        .from("developer_profiles")
        .update({ notes: notesText, updated_at: new Date().toISOString() })
        .eq("id", developerId);
      
      if (error) throw error;
      
      toast.success("Notes saved");
      setEditingNotes(null);
      refetch();
      if (selectedDeveloperId === developerId) refetchProfile();
    } catch (error) {
      toast.error("Failed to save notes");
      console.error(error);
    }
  };

  const exportDevelopers = () => {
    if (!profiles) return;
    
    const csv = [
      ['Wallet', 'Name', 'Trust Level', 'Reputation', 'Total Tokens', 'Successful', 'Rug Pulls', 'Notes'].join(','),
      ...profiles.map(p => [
        p.master_wallet_address,
        p.display_name || '',
        p.trust_level || 'neutral',
        p.reputation_score || 50,
        p.total_tokens_created || 0,
        p.successful_tokens || 0,
        p.rug_pull_count || 0,
        `"${(p.notes || '').replace(/"/g, '""')}"`,
      ].join(','))
    ].join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `developer-profiles-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Total Tracked</span>
            </div>
            <div className="text-2xl font-bold">{stats?.total || 0}</div>
          </CardContent>
        </Card>
        <Card className="border-red-500/30">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Skull className="h-4 w-4 text-red-500" />
              <span className="text-xs text-muted-foreground">Scammers</span>
            </div>
            <div className="text-2xl font-bold text-red-500">{stats?.scammers || 0}</div>
          </CardContent>
        </Card>
        <Card className="border-orange-500/30">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-orange-500" />
              <span className="text-xs text-muted-foreground">Suspicious</span>
            </div>
            <div className="text-2xl font-bold text-orange-500">{stats?.suspicious || 0}</div>
          </CardContent>
        </Card>
        <Card className="border-destructive/30">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-destructive" />
              <span className="text-xs text-muted-foreground">Total Rug Pulls</span>
            </div>
            <div className="text-2xl font-bold text-destructive">{stats?.rugPulls || 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* Main Card */}
      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <CardTitle>Developer Intelligence Profiles</CardTitle>
              <CardDescription>Track and monitor token creators from your trades</CardDescription>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => handleBackfill('all')}
                disabled={isBackfilling}
              >
                <Upload className="h-4 w-4 mr-2" />
                {isBackfilling ? 'Backfilling...' : 'Backfill All'}
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => handleBackfill('flipit')}
                disabled={isBackfilling}
              >
                Backfill FlipIt
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => handleBackfill('fantasy')}
                disabled={isBackfilling}
              >
                Backfill Fantasy
              </Button>
              <Button variant="outline" size="sm" onClick={exportDevelopers}>
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filters */}
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <Input
                placeholder="Search by wallet, name, or Twitter handle..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full"
              />
            </div>
            <Select value={trustFilter} onValueChange={(v) => setTrustFilter(v as TrustLevel | 'all')}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Trust Level" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Trust</SelectItem>
                <SelectItem value="trusted">Trusted</SelectItem>
                <SelectItem value="neutral">Neutral</SelectItem>
                <SelectItem value="suspicious">Suspicious</SelectItem>
                <SelectItem value="scammer">Scammer</SelectItem>
              </SelectContent>
            </Select>
            <Select value={outcomeFilter} onValueChange={(v) => setOutcomeFilter(v as OutcomeFilter)}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Outcome" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Outcomes</SelectItem>
                <SelectItem value="success">Success</SelectItem>
                <SelectItem value="neutral">Neutral</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="rug_pull">Rug Pulls</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={() => refetch()} variant="outline">
              <Search className="h-4 w-4 mr-2" />
              Search
            </Button>
          </div>

          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading profiles...</div>
          ) : profiles?.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <User className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">No developer profiles yet</p>
              <p className="text-sm">Click "Backfill All" to import from your FlipIt and Fantasy trades</p>
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Wallet</TableHead>
                    <TableHead>Name/Handle</TableHead>
                    <TableHead>Trust Level</TableHead>
                    <TableHead>Reputation</TableHead>
                    <TableHead>Tokens</TableHead>
                    <TableHead>Rug Pulls</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {profiles?.map((profile) => (
                    <TableRow key={profile.id} className="cursor-pointer hover:bg-muted/50">
                      <TableCell className="font-mono text-xs">
                        <a 
                          href={`https://solscan.io/account/${profile.master_wallet_address}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:text-primary flex items-center gap-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {profile.master_wallet_address.slice(0, 6)}...{profile.master_wallet_address.slice(-4)}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </TableCell>
                      <TableCell>
                        <div>
                          {profile.display_name && <div className="font-medium">{profile.display_name}</div>}
                          {profile.twitter_handle && (
                            <a 
                              href={`https://twitter.com/${profile.twitter_handle}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-muted-foreground hover:text-primary"
                              onClick={(e) => e.stopPropagation()}
                            >
                              @{profile.twitter_handle}
                            </a>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{getTrustBadge(profile.trust_level || "neutral")}</TableCell>
                      <TableCell>
                        <span className={`font-bold ${getReputationColor(profile.reputation_score || 50)}`}>
                          {profile.reputation_score?.toFixed(0) || 50}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm flex items-center gap-1">
                          <span className="text-green-500">{profile.successful_tokens || 0}</span>
                          <span className="text-muted-foreground">/</span>
                          <span>{profile.total_tokens_created || 0}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className={`font-medium ${(profile.rug_pull_count || 0) > 0 ? 'text-red-500' : 'text-muted-foreground'}`}>
                          {profile.rug_pull_count || 0}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {profile.source || 'manual'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button size="sm" variant="outline" onClick={() => setSelectedDeveloperId(profile.id)}>
                            View
                          </Button>
                          <Button 
                            size="sm" 
                            variant="ghost" 
                            className="text-orange-500 hover:text-orange-600"
                            onClick={() => updateTrustLevel(profile.id, 'suspicious')}
                            title="Mark Suspicious"
                          >
                            <Flag className="h-3 w-3" />
                          </Button>
                          <Button 
                            size="sm" 
                            variant="ghost" 
                            className="text-red-500 hover:text-red-600"
                            onClick={() => {
                              if (window.confirm(`Mark ${profile.display_name || profile.master_wallet_address.slice(0, 8)} as SCAMMER?`)) {
                                updateTrustLevel(profile.id, 'scammer');
                              }
                            }}
                            title="Mark as Scammer"
                          >
                            <Ban className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail View */}
      {selectedProfile && (
        <Card>
          <CardHeader>
            <div className="flex justify-between items-start">
              <div>
                <CardTitle className="flex items-center gap-2">
                  Developer Details
                  {getTrustBadge(selectedProfile.profile.trust_level || 'neutral')}
                </CardTitle>
                <CardDescription className="font-mono">
                  {selectedProfile.profile.master_wallet_address}
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Select 
                  value={selectedProfile.profile.trust_level || 'neutral'} 
                  onValueChange={(v) => updateTrustLevel(selectedProfile.profile.id, v as TrustLevel)}
                >
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="trusted">Trusted</SelectItem>
                    <SelectItem value="neutral">Neutral</SelectItem>
                    <SelectItem value="suspicious">Suspicious</SelectItem>
                    <SelectItem value="scammer">Scammer</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" onClick={() => setSelectedDeveloperId(null)}>
                  Close
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="overview">
              <TabsList>
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="tokens">Tokens ({selectedProfile.tokens.length})</TabsTrigger>
                <TabsTrigger value="wallets">Wallets ({selectedProfile.wallets.length})</TabsTrigger>
                <TabsTrigger value="notes">Notes</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <Card>
                    <CardContent className="pt-4">
                      <div className="flex items-center gap-2 mb-1">
                        <Coins className="h-4 w-4 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">Total Tokens</span>
                      </div>
                      <div className="text-2xl font-bold">{selectedProfile.profile.total_tokens_created || 0}</div>
                    </CardContent>
                  </Card>
                  <Card className="border-green-500/30">
                    <CardContent className="pt-4">
                      <div className="flex items-center gap-2 mb-1">
                        <TrendingUp className="h-4 w-4 text-green-500" />
                        <span className="text-xs text-muted-foreground">Successful</span>
                      </div>
                      <div className="text-2xl font-bold text-green-500">{selectedProfile.profile.successful_tokens || 0}</div>
                    </CardContent>
                  </Card>
                  <Card className="border-yellow-500/30">
                    <CardContent className="pt-4">
                      <div className="flex items-center gap-2 mb-1">
                        <TrendingDown className="h-4 w-4 text-yellow-500" />
                        <span className="text-xs text-muted-foreground">Failed</span>
                      </div>
                      <div className="text-2xl font-bold text-yellow-500">{selectedProfile.profile.failed_tokens || 0}</div>
                    </CardContent>
                  </Card>
                  <Card className="border-red-500/30">
                    <CardContent className="pt-4">
                      <div className="flex items-center gap-2 mb-1">
                        <Skull className="h-4 w-4 text-red-500" />
                        <span className="text-xs text-muted-foreground">Rug Pulls</span>
                      </div>
                      <div className="text-2xl font-bold text-red-500">{selectedProfile.profile.rug_pull_count || 0}</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <div className="flex items-center gap-2 mb-1">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">First Seen</span>
                      </div>
                      <div className="text-sm font-medium">
                        {selectedProfile.profile.created_at 
                          ? new Date(selectedProfile.profile.created_at).toLocaleDateString()
                          : 'Unknown'}
                      </div>
                    </CardContent>
                  </Card>
                </div>
                
                {/* Success Rate Visual */}
                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-muted-foreground">Success Rate</span>
                      <span className="text-sm font-medium">
                        {selectedProfile.profile.total_tokens_created > 0
                          ? `${((selectedProfile.profile.successful_tokens / selectedProfile.profile.total_tokens_created) * 100).toFixed(1)}%`
                          : 'N/A'}
                      </span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-green-500 transition-all"
                        style={{ 
                          width: selectedProfile.profile.total_tokens_created > 0
                            ? `${(selectedProfile.profile.successful_tokens / selectedProfile.profile.total_tokens_created) * 100}%`
                            : '0%'
                        }}
                      />
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="tokens">
                {selectedProfile.tokens.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No tokens tracked for this developer yet
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Token Mint</TableHead>
                        <TableHead>Launch Date</TableHead>
                        <TableHead>Outcome</TableHead>
                        <TableHead>Source</TableHead>
                        <TableHead>Notes</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedProfile.tokens.map((token) => (
                        <TableRow key={token.id}>
                          <TableCell className="font-mono text-xs">
                            <a 
                              href={`https://solscan.io/token/${token.token_mint}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="hover:text-primary flex items-center gap-1"
                            >
                              {token.token_mint.slice(0, 8)}...{token.token_mint.slice(-6)}
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          </TableCell>
                          <TableCell>
                            {token.launch_date ? new Date(token.launch_date).toLocaleDateString() : 'Unknown'}
                          </TableCell>
                          <TableCell>{getOutcomeBadge(token.outcome || 'pending')}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {token.flipit_position_id ? 'FlipIt' : 'Fantasy'}
                            </Badge>
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate text-xs text-muted-foreground">
                            {token.notes || '-'}
                          </TableCell>
                          <TableCell>
                            {token.flipit_position_id && (
                              <Button size="sm" variant="ghost" asChild>
                                <a href={`/super-admin?tab=flipit`}>
                                  View in FlipIt
                                </a>
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </TabsContent>

              <TabsContent value="wallets">
                {selectedProfile.wallets.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No linked wallets discovered yet
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Address</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Depth</TableHead>
                        <TableHead>Transactions</TableHead>
                        <TableHead>SOL Flow</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedProfile.wallets.map((wallet) => (
                        <TableRow key={wallet.id}>
                          <TableCell className="font-mono text-xs">
                            <a 
                              href={`https://solscan.io/account/${wallet.wallet_address}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="hover:text-primary flex items-center gap-1"
                            >
                              {wallet.wallet_address}
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{wallet.wallet_type}</Badge>
                          </TableCell>
                          <TableCell>{wallet.depth_level}</TableCell>
                          <TableCell>{wallet.transaction_count || 0}</TableCell>
                          <TableCell>
                            <div className="text-xs">
                              <div className="text-green-500">↓ {(wallet.total_sol_received || 0).toFixed(2)} SOL</div>
                              <div className="text-red-500">↑ {(wallet.total_sol_sent || 0).toFixed(2)} SOL</div>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </TabsContent>

              <TabsContent value="notes" className="space-y-4">
                {editingNotes === selectedProfile.profile.id ? (
                  <div className="space-y-2">
                    <Textarea
                      value={notesText}
                      onChange={(e) => setNotesText(e.target.value)}
                      placeholder="Add notes about this developer (e.g., known associations, past behavior, warnings)..."
                      rows={6}
                    />
                    <div className="flex gap-2">
                      <Button onClick={() => saveNotes(selectedProfile.profile.id)}>Save Notes</Button>
                      <Button variant="outline" onClick={() => setEditingNotes(null)}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="p-4 rounded-md bg-muted/50 min-h-[120px]">
                      {selectedProfile.profile.notes || (
                        <span className="text-muted-foreground italic">No notes added yet</span>
                      )}
                    </div>
                    <Button 
                      variant="outline" 
                      onClick={() => {
                        setNotesText(selectedProfile.profile.notes || '');
                        setEditingNotes(selectedProfile.profile.id);
                      }}
                    >
                      Edit Notes
                    </Button>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
