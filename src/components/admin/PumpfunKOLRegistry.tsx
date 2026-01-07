import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { RefreshCw, Plus, Shield, ShieldAlert, ShieldCheck, Crown, Users, TrendingUp, TrendingDown, Search, Trash2 } from "lucide-react";

interface KOL {
  id: string;
  wallet_address: string;
  twitter_handle?: string;
  twitter_followers?: number;
  kolscan_rank?: number;
  display_name?: string;
  kol_tier: string;
  is_verified: boolean;
  is_active: boolean;
  manual_trust_level?: string;
  manual_override_reason?: string;
  trust_score: number;
  chart_kills: number;
  successful_pumps: number;
  total_trades: number;
  total_volume_sol: number;
  source: string;
  kolscan_weekly_score?: number;
  last_activity_at?: string;
  created_at: string;
}

export default function PumpfunKOLRegistry() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [tierFilter, setTierFilter] = useState<string>("all");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showOverrideDialog, setShowOverrideDialog] = useState(false);
  const [selectedKOL, setSelectedKOL] = useState<KOL | null>(null);
  const [newKOL, setNewKOL] = useState({ wallet_address: "", twitter_handle: "", display_name: "" });
  const [overrideData, setOverrideData] = useState({ trust_level: "", reason: "" });

  const { data: kols, isLoading } = useQuery({
    queryKey: ['pumpfun-kol-registry', tierFilter],
    queryFn: async () => {
      let query = supabase.from('pumpfun_kol_registry').select('*').order('kolscan_rank', { ascending: true, nullsFirst: false });
      if (tierFilter !== 'all') query = query.eq('kol_tier', tierFilter);
      const { data, error } = await query;
      if (error) throw error;
      return data as KOL[];
    }
  });

  const { data: stats } = useQuery({
    queryKey: ['kol-stats'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('pumpfun-kol-registry', {
        body: { action: 'get-stats' }
      });
      if (error) throw error;
      return data.stats;
    }
  });

  const refreshMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('pumpfun-kol-registry', {
        body: { action: 'refresh-kolscan' }
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pumpfun-kol-registry'] });
      toast({ title: "Refresh complete", description: "KOL registry updated from kolscan.io" });
    },
    onError: (err: any) => toast({ title: "Refresh failed", description: err.message, variant: "destructive" })
  });

  const addKOLMutation = useMutation({
    mutationFn: async (kol: typeof newKOL) => {
      const { data, error } = await supabase.functions.invoke('pumpfun-kol-registry', {
        body: { action: 'add-manual', kol: { ...kol, kol_tier: 'suspected', source: 'manual' } }
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pumpfun-kol-registry'] });
      setShowAddDialog(false);
      setNewKOL({ wallet_address: "", twitter_handle: "", display_name: "" });
      toast({ title: "KOL added", description: "New KOL added to registry" });
    },
    onError: (err: any) => toast({ title: "Failed to add", description: err.message, variant: "destructive" })
  });

  const updateTrustMutation = useMutation({
    mutationFn: async ({ wallet, level, reason }: { wallet: string; level: string; reason: string }) => {
      const { data: session } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke('pumpfun-kol-registry', {
        body: { action: 'update-trust', wallet_address: wallet, trust_level: level, reason, user_id: session?.session?.user?.id }
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pumpfun-kol-registry'] });
      setShowOverrideDialog(false);
      setSelectedKOL(null);
      toast({ title: "Trust updated", description: "KOL trust level overridden" });
    },
    onError: (err: any) => toast({ title: "Failed", description: err.message, variant: "destructive" })
  });

  const deleteKOLMutation = useMutation({
    mutationFn: async (wallet: string) => {
      const { error } = await supabase.from('pumpfun_kol_registry').delete().eq('wallet_address', wallet);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pumpfun-kol-registry'] });
      toast({ title: "Deleted", description: "KOL removed from registry" });
    }
  });

  const filteredKOLs = kols?.filter(k => 
    k.wallet_address.toLowerCase().includes(searchTerm.toLowerCase()) ||
    k.twitter_handle?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    k.display_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getTierBadge = (tier: string) => {
    const colors: Record<string, string> = {
      top_10: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
      top_50: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      top_100: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
      verified: 'bg-green-500/20 text-green-400 border-green-500/30',
      suspected: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
      unknown: 'bg-muted text-muted-foreground'
    };
    return <Badge className={colors[tier] || colors.unknown}>{tier.replace('_', ' ')}</Badge>;
  };

  const getTrustBadge = (level?: string, score?: number) => {
    if (level === 'trusted') return <Badge className="bg-green-500/20 text-green-400"><ShieldCheck className="h-3 w-3 mr-1" />Trusted</Badge>;
    if (level === 'dangerous') return <Badge className="bg-red-500/20 text-red-400"><ShieldAlert className="h-3 w-3 mr-1" />Dangerous</Badge>;
    if (level === 'neutral') return <Badge className="bg-gray-500/20 text-gray-400"><Shield className="h-3 w-3 mr-1" />Neutral</Badge>;
    if (score && score >= 80) return <Badge className="bg-green-500/20 text-green-400">{score}</Badge>;
    if (score && score >= 60) return <Badge className="bg-blue-500/20 text-blue-400">{score}</Badge>;
    if (score && score >= 40) return <Badge className="bg-yellow-500/20 text-yellow-400">{score}</Badge>;
    return <Badge className="bg-red-500/20 text-red-400">{score || 50}</Badge>;
  };

  return (
    <div className="space-y-4">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <Crown className="h-4 w-4 text-yellow-400" />
              <div>
                <p className="text-xs text-muted-foreground">Total KOLs</p>
                <p className="text-lg font-bold">{stats?.total || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-blue-400" />
              <div>
                <p className="text-xs text-muted-foreground">Active</p>
                <p className="text-lg font-bold">{stats?.active || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-green-400" />
              <div>
                <p className="text-xs text-muted-foreground">Avg Trust</p>
                <p className="text-lg font-bold">{stats?.avgTrust?.toFixed(0) || 50}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-red-400" />
              <div>
                <p className="text-xs text-muted-foreground">Chart Kills</p>
                <p className="text-lg font-bold">{stats?.totalKills || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <Crown className="h-4 w-4 text-yellow-400" />
              <div>
                <p className="text-xs text-muted-foreground">Top 10</p>
                <p className="text-lg font-bold">{stats?.byTier?.top_10 || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-green-400" />
              <div>
                <p className="text-xs text-muted-foreground">Verified</p>
                <p className="text-lg font-bold">{stats?.byTier?.verified || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search wallet, twitter, name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={tierFilter} onValueChange={setTierFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Filter tier" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Tiers</SelectItem>
            <SelectItem value="top_10">Top 10</SelectItem>
            <SelectItem value="top_50">Top 50</SelectItem>
            <SelectItem value="top_100">Top 100</SelectItem>
            <SelectItem value="verified">Verified</SelectItem>
            <SelectItem value="suspected">Suspected</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={() => refreshMutation.mutate()} disabled={refreshMutation.isPending} variant="outline" size="sm">
          <RefreshCw className={`h-4 w-4 mr-2 ${refreshMutation.isPending ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
        <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 mr-2" />Add KOL</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add KOL Manually</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <Input placeholder="Wallet Address" value={newKOL.wallet_address} onChange={e => setNewKOL({ ...newKOL, wallet_address: e.target.value })} />
              <Input placeholder="Twitter Handle (optional)" value={newKOL.twitter_handle} onChange={e => setNewKOL({ ...newKOL, twitter_handle: e.target.value })} />
              <Input placeholder="Display Name (optional)" value={newKOL.display_name} onChange={e => setNewKOL({ ...newKOL, display_name: e.target.value })} />
              <Button onClick={() => addKOLMutation.mutate(newKOL)} disabled={!newKOL.wallet_address || addKOLMutation.isPending} className="w-full">
                Add to Registry
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* KOL Table */}
      <Card className="border-border/50">
        <CardHeader className="py-3">
          <CardTitle className="text-base">KOL Registry ({filteredKOLs?.length || 0})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="max-h-[500px] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]">#</TableHead>
                  <TableHead>Wallet</TableHead>
                  <TableHead>Twitter</TableHead>
                  <TableHead>Tier</TableHead>
                  <TableHead>Trust</TableHead>
                  <TableHead className="text-right">Kills</TableHead>
                  <TableHead className="text-right">Pumps</TableHead>
                  <TableHead className="text-right">Trades</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
                ) : filteredKOLs?.length === 0 ? (
                  <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">No KOLs found</TableCell></TableRow>
                ) : filteredKOLs?.map((kol, idx) => (
                  <TableRow key={kol.id} className="hover:bg-muted/30">
                    <TableCell className="font-mono text-muted-foreground">{kol.kolscan_rank || idx + 1}</TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-mono text-xs">{kol.wallet_address.slice(0, 8)}...{kol.wallet_address.slice(-6)}</span>
                        {kol.display_name && <span className="text-xs text-muted-foreground">{kol.display_name}</span>}
                      </div>
                    </TableCell>
                    <TableCell>
                      {kol.twitter_handle ? (
                        <a href={`https://twitter.com/${kol.twitter_handle}`} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline text-sm">
                          @{kol.twitter_handle}
                        </a>
                      ) : '-'}
                    </TableCell>
                    <TableCell>{getTierBadge(kol.kol_tier)}</TableCell>
                    <TableCell>{getTrustBadge(kol.manual_trust_level, kol.trust_score)}</TableCell>
                    <TableCell className="text-right font-mono text-red-400">{kol.chart_kills}</TableCell>
                    <TableCell className="text-right font-mono text-green-400">{kol.successful_pumps}</TableCell>
                    <TableCell className="text-right font-mono">{kol.total_trades}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => { setSelectedKOL(kol); setShowOverrideDialog(true); }}>
                          <Shield className="h-3 w-3" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => deleteKOLMutation.mutate(kol.wallet_address)} className="text-destructive hover:text-destructive">
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Override Dialog */}
      <Dialog open={showOverrideDialog} onOpenChange={setShowOverrideDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Override Trust Level</DialogTitle></DialogHeader>
          {selectedKOL && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Override trust for: <span className="font-mono">{selectedKOL.wallet_address.slice(0, 12)}...</span>
              </p>
              <Select value={overrideData.trust_level} onValueChange={v => setOverrideData({ ...overrideData, trust_level: v })}>
                <SelectTrigger><SelectValue placeholder="Select trust level" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="trusted">🟢 Trusted</SelectItem>
                  <SelectItem value="neutral">⚪ Neutral</SelectItem>
                  <SelectItem value="dangerous">🔴 Dangerous</SelectItem>
                </SelectContent>
              </Select>
              <Textarea placeholder="Reason for override..." value={overrideData.reason} onChange={e => setOverrideData({ ...overrideData, reason: e.target.value })} />
              <Button 
                onClick={() => updateTrustMutation.mutate({ wallet: selectedKOL.wallet_address, level: overrideData.trust_level, reason: overrideData.reason })}
                disabled={!overrideData.trust_level || updateTrustMutation.isPending}
                className="w-full"
              >
                Save Override
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
