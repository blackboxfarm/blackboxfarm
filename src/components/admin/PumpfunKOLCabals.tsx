import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Radar, Plus, Users, AlertTriangle, Shield, Trash2, RefreshCw, Network } from "lucide-react";

interface Cabal {
  id: string;
  cabal_name?: string;
  cabal_description?: string;
  member_kol_ids: string[];
  member_wallets: string[];
  suspected_hustle_wallets: string[];
  linked_mint_wallets: string[];
  linked_twitter_accounts: string[];
  linked_telegram_groups: string[];
  tokens_coordinated: number;
  avg_entry_delta_secs?: number;
  coordination_score: number;
  cabal_trust_score: number;
  is_predatory: boolean;
  predatory_evidence?: string;
  evidence_notes?: string;
  sample_token_mints: string[];
  is_active: boolean;
  created_at: string;
}

export default function PumpfunKOLCabals() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showPredatoryOnly, setShowPredatoryOnly] = useState(false);
  const [newCabal, setNewCabal] = useState({
    name: "",
    description: "",
    member_wallets: "",
    hustle_wallets: "",
    mint_wallets: "",
    twitter_accounts: "",
    telegram_groups: "",
    is_predatory: false,
    predatory_evidence: "",
    evidence_notes: ""
  });

  const { data: cabals, isLoading } = useQuery({
    queryKey: ['pumpfun-kol-cabals', showPredatoryOnly],
    queryFn: async () => {
      let query = supabase
        .from('pumpfun_kol_cabals')
        .select('*')
        .eq('is_active', true)
        .order('coordination_score', { ascending: false });
      
      if (showPredatoryOnly) query = query.eq('is_predatory', true);
      
      const { data, error } = await query;
      if (error) throw error;
      return data as Cabal[];
    }
  });

  const detectCabalsMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('pumpfun-kol-analyzer', {
        body: { action: 'detect-cabals' }
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['pumpfun-kol-cabals'] });
      toast({ title: "Cabal detection complete", description: `Found ${data.cabals_detected} potential cabals` });
    },
    onError: (err: any) => toast({ title: "Detection failed", description: err.message, variant: "destructive" })
  });

  const addCabalMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('pumpfun-kol-analyzer', {
        body: {
          action: 'add-cabal',
          cabal: {
            name: newCabal.name,
            description: newCabal.description,
            member_wallets: newCabal.member_wallets.split('\n').map(w => w.trim()).filter(Boolean),
            hustle_wallets: newCabal.hustle_wallets.split('\n').map(w => w.trim()).filter(Boolean),
            mint_wallets: newCabal.mint_wallets.split('\n').map(w => w.trim()).filter(Boolean),
            twitter_accounts: newCabal.twitter_accounts.split('\n').map(t => t.trim()).filter(Boolean),
            telegram_groups: newCabal.telegram_groups.split('\n').map(t => t.trim()).filter(Boolean),
            is_predatory: newCabal.is_predatory,
            predatory_evidence: newCabal.predatory_evidence,
            evidence_notes: newCabal.evidence_notes
          }
        }
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pumpfun-kol-cabals'] });
      setShowAddDialog(false);
      setNewCabal({
        name: "", description: "", member_wallets: "", hustle_wallets: "",
        mint_wallets: "", twitter_accounts: "", telegram_groups: "",
        is_predatory: false, predatory_evidence: "", evidence_notes: ""
      });
      toast({ title: "Cabal added", description: "New cabal tracking created" });
    },
    onError: (err: any) => toast({ title: "Failed", description: err.message, variant: "destructive" })
  });

  const deleteCabalMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('pumpfun_kol_cabals').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pumpfun-kol-cabals'] });
      toast({ title: "Deleted", description: "Cabal removed" });
    }
  });

  const stats = {
    total: cabals?.length || 0,
    predatory: cabals?.filter(c => c.is_predatory).length || 0,
    avgScore: cabals?.reduce((sum, c) => sum + c.coordination_score, 0) / (cabals?.length || 1) || 0,
    totalMembers: cabals?.reduce((sum, c) => sum + c.member_wallets.length, 0) || 0
  };

  return (
    <div className="space-y-4">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <Network className="h-4 w-4 text-blue-400" />
              <div>
                <p className="text-xs text-muted-foreground">Total Cabals</p>
                <p className="text-lg font-bold">{stats.total}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-400" />
              <div>
                <p className="text-xs text-muted-foreground">Predatory</p>
                <p className="text-lg font-bold text-red-400">{stats.predatory}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <Radar className="h-4 w-4 text-purple-400" />
              <div>
                <p className="text-xs text-muted-foreground">Avg Score</p>
                <p className="text-lg font-bold">{stats.avgScore.toFixed(0)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-green-400" />
              <div>
                <p className="text-xs text-muted-foreground">Total Members</p>
                <p className="text-lg font-bold">{stats.totalMembers}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Switch checked={showPredatoryOnly} onCheckedChange={setShowPredatoryOnly} />
          <Label className="text-sm">Predatory Only</Label>
        </div>
        <div className="flex-1" />
        <Button onClick={() => detectCabalsMutation.mutate()} disabled={detectCabalsMutation.isPending} variant="outline" size="sm">
          <Radar className={`h-4 w-4 mr-2 ${detectCabalsMutation.isPending ? 'animate-pulse' : ''}`} />
          Auto-Detect
        </Button>
        <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 mr-2" />Add Cabal</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Add Cabal Manually</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <Input placeholder="Cabal Name" value={newCabal.name} onChange={e => setNewCabal({ ...newCabal, name: e.target.value })} />
              <Textarea placeholder="Description" value={newCabal.description} onChange={e => setNewCabal({ ...newCabal, description: e.target.value })} rows={2} />
              <Textarea placeholder="Member Wallets (one per line)" value={newCabal.member_wallets} onChange={e => setNewCabal({ ...newCabal, member_wallets: e.target.value })} rows={3} />
              <Textarea placeholder="Suspected Hustle Wallets (one per line)" value={newCabal.hustle_wallets} onChange={e => setNewCabal({ ...newCabal, hustle_wallets: e.target.value })} rows={2} />
              <Textarea placeholder="Linked Mint Wallets (one per line)" value={newCabal.mint_wallets} onChange={e => setNewCabal({ ...newCabal, mint_wallets: e.target.value })} rows={2} />
              <Textarea placeholder="Twitter Accounts (one per line)" value={newCabal.twitter_accounts} onChange={e => setNewCabal({ ...newCabal, twitter_accounts: e.target.value })} rows={2} />
              <Textarea placeholder="Telegram Groups (one per line)" value={newCabal.telegram_groups} onChange={e => setNewCabal({ ...newCabal, telegram_groups: e.target.value })} rows={2} />
              <div className="flex items-center gap-2">
                <Switch checked={newCabal.is_predatory} onCheckedChange={v => setNewCabal({ ...newCabal, is_predatory: v })} />
                <Label>Mark as Predatory</Label>
              </div>
              {newCabal.is_predatory && (
                <Textarea placeholder="Predatory Evidence..." value={newCabal.predatory_evidence} onChange={e => setNewCabal({ ...newCabal, predatory_evidence: e.target.value })} rows={2} />
              )}
              <Textarea placeholder="Additional Notes..." value={newCabal.evidence_notes} onChange={e => setNewCabal({ ...newCabal, evidence_notes: e.target.value })} rows={2} />
              <Button onClick={() => addCabalMutation.mutate()} disabled={!newCabal.name || addCabalMutation.isPending} className="w-full">
                Add Cabal
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Cabals Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {isLoading ? (
          <Card className="col-span-full"><CardContent className="py-8 text-center text-muted-foreground">Loading cabals...</CardContent></Card>
        ) : cabals?.length === 0 ? (
          <Card className="col-span-full"><CardContent className="py-8 text-center text-muted-foreground">No cabals detected. Run auto-detection or add manually.</CardContent></Card>
        ) : cabals?.map(cabal => (
          <Card key={cabal.id} className={`border-border/50 ${cabal.is_predatory ? 'border-red-500/30 bg-red-500/5' : ''}`}>
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    {cabal.is_predatory && <AlertTriangle className="h-4 w-4 text-red-400" />}
                    {cabal.cabal_name || `Cabal #${cabal.id.slice(0, 6)}`}
                  </CardTitle>
                  {cabal.cabal_description && <CardDescription className="text-xs">{cabal.cabal_description}</CardDescription>}
                </div>
                <Button size="sm" variant="ghost" onClick={() => deleteCabalMutation.mutate(cabal.id)} className="text-destructive">
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="text-xs">
                  <Users className="h-3 w-3 mr-1" />{cabal.member_wallets.length} members
                </Badge>
                <Badge variant="outline" className="text-xs">
                  {cabal.tokens_coordinated} tokens
                </Badge>
                <Badge className={`text-xs ${cabal.coordination_score >= 70 ? 'bg-red-500/20 text-red-400' : cabal.coordination_score >= 40 ? 'bg-yellow-500/20 text-yellow-400' : 'bg-green-500/20 text-green-400'}`}>
                  Score: {cabal.coordination_score.toFixed(0)}
                </Badge>
                {cabal.avg_entry_delta_secs && (
                  <Badge variant="outline" className="text-xs">
                    Δ{cabal.avg_entry_delta_secs}s
                  </Badge>
                )}
              </div>

              {cabal.member_wallets.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Member Wallets:</p>
                  <div className="flex flex-wrap gap-1">
                    {cabal.member_wallets.slice(0, 4).map((w, i) => (
                      <Badge key={i} variant="secondary" className="text-xs font-mono">{w.slice(0, 6)}...</Badge>
                    ))}
                    {cabal.member_wallets.length > 4 && <Badge variant="secondary" className="text-xs">+{cabal.member_wallets.length - 4}</Badge>}
                  </div>
                </div>
              )}

              {cabal.suspected_hustle_wallets.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Hustle Wallets:</p>
                  <div className="flex flex-wrap gap-1">
                    {cabal.suspected_hustle_wallets.slice(0, 3).map((w, i) => (
                      <Badge key={i} variant="outline" className="text-xs font-mono text-orange-400">{w.slice(0, 6)}...</Badge>
                    ))}
                    {cabal.suspected_hustle_wallets.length > 3 && <Badge variant="outline" className="text-xs">+{cabal.suspected_hustle_wallets.length - 3}</Badge>}
                  </div>
                </div>
              )}

              {cabal.linked_twitter_accounts.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {cabal.linked_twitter_accounts.slice(0, 3).map((t, i) => (
                    <a key={i} href={`https://twitter.com/${t}`} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:underline">
                      @{t}
                    </a>
                  ))}
                </div>
              )}

              {cabal.predatory_evidence && (
                <p className="text-xs text-red-400 bg-red-500/10 rounded p-2">{cabal.predatory_evidence}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
