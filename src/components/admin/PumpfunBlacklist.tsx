import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Search, Trash2, Link2, AlertTriangle, Wallet, Twitter, MessageCircle, User, RefreshCw, Eye, Network, Loader2, Sparkles, CheckCircle2, XCircle } from "lucide-react";
import { format } from "date-fns";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface BlacklistEntry {
  id: string;
  entry_type: string;
  identifier: string;
  linked_token_mints: string[];
  linked_wallets: string[];
  linked_twitter: string[];
  linked_telegram: string[];
  linked_pumpfun_accounts: string[];
  risk_level: string;
  blacklist_reason: string | null;
  tags: string[];
  evidence_notes: string | null;
  first_seen_at: string | null;
  tokens_rugged: number;
  total_victims: number;
  total_stolen_sol: number;
  source: string;
  added_by: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  enrichment_status?: string;
  enriched_at?: string;
  enrichment_error?: string;
  funding_trace?: any;
  auto_discovered_links?: any;
}

const ENTRY_TYPES = [
  { value: 'dev_wallet', label: 'Dev Wallet', icon: Wallet },
  { value: 'mint_wallet', label: 'Mint Wallet', icon: Wallet },
  { value: 'funding_wallet', label: 'Funding Wallet', icon: Wallet },
  { value: 'suspicious_wallet', label: 'Suspicious Wallet', icon: AlertTriangle },
  { value: 'pumpfun_account', label: 'Pump.fun Account', icon: User },
  { value: 'twitter_account', label: 'X (Twitter) Account', icon: Twitter },
  { value: 'telegram_account', label: 'Telegram Account', icon: MessageCircle },
  { value: 'kyc_wallet', label: 'KYC Wallet', icon: Wallet },
];

const RISK_LEVELS = [
  { value: 'low', label: 'Low', color: 'bg-blue-500/20 text-blue-400' },
  { value: 'medium', label: 'Medium', color: 'bg-yellow-500/20 text-yellow-400' },
  { value: 'high', label: 'High', color: 'bg-orange-500/20 text-orange-400' },
  { value: 'critical', label: 'Critical', color: 'bg-red-500/20 text-red-400' },
];

export function PumpfunBlacklist() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterRisk, setFilterRisk] = useState<string>("all");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<BlacklistEntry | null>(null);
  
  // Form state
  const [newEntry, setNewEntry] = useState({
    entry_type: 'dev_wallet',
    identifier: '',
    risk_level: 'medium',
    blacklist_reason: '',
    evidence_notes: '',
    tags: '',
    linked_token_mints: '',
    linked_wallets: '',
    linked_twitter: '',
    linked_telegram: '',
    linked_pumpfun_accounts: '',
  });

  // Fetch blacklist entries
  const { data: entries, isLoading, refetch } = useQuery({
    queryKey: ['pumpfun-blacklist', searchQuery, filterType, filterRisk],
    queryFn: async () => {
      let query = supabase
        .from('pumpfun_blacklist')
        .select('*')
        .order('created_at', { ascending: false });

      if (filterType !== 'all') {
        query = query.eq('entry_type', filterType);
      }
      if (filterRisk !== 'all') {
        query = query.eq('risk_level', filterRisk);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Client-side search filter
      if (searchQuery) {
        const lowerQuery = searchQuery.toLowerCase();
        return (data as BlacklistEntry[]).filter(entry => 
          entry.identifier.toLowerCase().includes(lowerQuery) ||
          entry.blacklist_reason?.toLowerCase().includes(lowerQuery) ||
          entry.tags.some(tag => tag.toLowerCase().includes(lowerQuery)) ||
          entry.linked_token_mints.some(m => m.toLowerCase().includes(lowerQuery)) ||
          entry.linked_wallets.some(w => w.toLowerCase().includes(lowerQuery)) ||
          entry.linked_twitter.some(t => t.toLowerCase().includes(lowerQuery))
        );
      }

      return data as BlacklistEntry[];
    },
  });

  // Add entry mutation
  const addMutation = useMutation({
    mutationFn: async (entry: typeof newEntry) => {
      const { data, error } = await supabase.from('pumpfun_blacklist').insert({
        entry_type: entry.entry_type,
        identifier: entry.identifier.trim(),
        risk_level: entry.risk_level,
        blacklist_reason: entry.blacklist_reason || null,
        evidence_notes: entry.evidence_notes || null,
        tags: entry.tags ? entry.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
        linked_token_mints: entry.linked_token_mints ? entry.linked_token_mints.split(',').map(t => t.trim()).filter(Boolean) : [],
        linked_wallets: entry.linked_wallets ? entry.linked_wallets.split(',').map(t => t.trim()).filter(Boolean) : [],
        linked_twitter: entry.linked_twitter ? entry.linked_twitter.split(',').map(t => t.trim()).filter(Boolean) : [],
        linked_telegram: entry.linked_telegram ? entry.linked_telegram.split(',').map(t => t.trim()).filter(Boolean) : [],
        linked_pumpfun_accounts: entry.linked_pumpfun_accounts ? entry.linked_pumpfun_accounts.split(',').map(t => t.trim()).filter(Boolean) : [],
        source: 'manual',
        enrichment_status: 'pending',
      }).select().single();

      if (error) throw error;
      
      // Trigger auto-enrichment
      triggerEnrichment(data.id, data.entry_type, data.identifier);
      
      return data;
    },
    onSuccess: () => {
      toast.success("Blacklist entry added - enrichment started");
      queryClient.invalidateQueries({ queryKey: ['pumpfun-blacklist'] });
      setIsAddDialogOpen(false);
      resetForm();
    },
    onError: (error: any) => {
      toast.error(`Failed to add entry: ${error.message}`);
    },
  });

  // Enrichment mutation
  const enrichMutation = useMutation({
    mutationFn: async ({ entryId, entryType, identifier }: { entryId: string; entryType: string; identifier: string }) => {
      const { data, error } = await supabase.functions.invoke('blacklist-enricher', {
        body: { entry_id: entryId, entry_type: entryType, identifier, force_reenrich: true }
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Enrichment complete");
      queryClient.invalidateQueries({ queryKey: ['pumpfun-blacklist'] });
    },
    onError: (error: any) => {
      toast.error(`Enrichment failed: ${error.message}`);
      queryClient.invalidateQueries({ queryKey: ['pumpfun-blacklist'] });
    },
  });

  // Trigger enrichment (fire and forget)
  const triggerEnrichment = async (entryId: string, entryType: string, identifier: string) => {
    try {
      await supabase.functions.invoke('blacklist-enricher', {
        body: { entry_id: entryId, entry_type: entryType, identifier }
      });
      // Refresh after enrichment completes
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['pumpfun-blacklist'] });
      }, 5000);
    } catch (error) {
      console.error("Enrichment trigger failed:", error);
    }
  };

  // Delete entry mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('pumpfun_blacklist').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Entry removed from blacklist");
      queryClient.invalidateQueries({ queryKey: ['pumpfun-blacklist'] });
    },
    onError: (error: any) => {
      toast.error(`Failed to delete: ${error.message}`);
    },
  });

  const resetForm = () => {
    setNewEntry({
      entry_type: 'dev_wallet',
      identifier: '',
      risk_level: 'medium',
      blacklist_reason: '',
      evidence_notes: '',
      tags: '',
      linked_token_mints: '',
      linked_wallets: '',
      linked_twitter: '',
      linked_telegram: '',
      linked_pumpfun_accounts: '',
    });
  };

  const getEntryTypeIcon = (type: string) => {
    const entry = ENTRY_TYPES.find(e => e.value === type);
    return entry ? entry.icon : Wallet;
  };

  const getRiskBadge = (level: string) => {
    const risk = RISK_LEVELS.find(r => r.value === level);
    return risk ? risk.color : 'bg-muted text-muted-foreground';
  };

  const getEnrichmentBadge = (status: string | undefined, error: string | undefined) => {
    switch (status) {
      case 'complete':
        return <Badge className="bg-green-500/20 text-green-400 gap-1"><CheckCircle2 className="h-3 w-3" />Enriched</Badge>;
      case 'enriching':
        return <Badge className="bg-blue-500/20 text-blue-400 gap-1"><Loader2 className="h-3 w-3 animate-spin" />Enriching</Badge>;
      case 'failed':
        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <Badge className="bg-red-500/20 text-red-400 gap-1"><XCircle className="h-3 w-3" />Failed</Badge>
              </TooltipTrigger>
              <TooltipContent>{error || 'Unknown error'}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      case 'pending':
      default:
        return <Badge className="bg-muted text-muted-foreground gap-1"><Sparkles className="h-3 w-3" />Pending</Badge>;
    }
  };

  const totalConnections = entries?.reduce((acc, entry) => {
    return acc + 
      entry.linked_wallets.length + 
      entry.linked_token_mints.length + 
      entry.linked_twitter.length + 
      entry.linked_telegram.length;
  }, 0) || 0;

  return (
    <div className="space-y-6">
      {/* Header Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-red-500/10 to-red-500/5 border-red-500/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-8 w-8 text-red-400" />
              <div>
                <p className="text-2xl font-bold">{entries?.length || 0}</p>
                <p className="text-sm text-muted-foreground">Blacklisted Entities</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-orange-500/10 to-orange-500/5 border-orange-500/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Wallet className="h-8 w-8 text-orange-400" />
              <div>
                <p className="text-2xl font-bold">
                  {entries?.filter(e => e.entry_type.includes('wallet')).length || 0}
                </p>
                <p className="text-sm text-muted-foreground">Bad Wallets</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-blue-500/10 to-blue-500/5 border-blue-500/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Twitter className="h-8 w-8 text-blue-400" />
              <div>
                <p className="text-2xl font-bold">
                  {entries?.filter(e => e.entry_type === 'twitter_account').length || 0}
                </p>
                <p className="text-sm text-muted-foreground">Bad X Accounts</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-purple-500/10 to-purple-500/5 border-purple-500/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Network className="h-8 w-8 text-purple-400" />
              <div>
                <p className="text-2xl font-bold">{totalConnections}</p>
                <p className="text-sm text-muted-foreground">Cross-Links</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Controls */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                Pump.fun Blacklist Mesh
              </CardTitle>
              <CardDescription>
                Interconnected network of bad actors: wallets, tokens, social accounts
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                <RefreshCw className="h-4 w-4 mr-1" />
                Refresh
              </Button>
              <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" className="bg-destructive hover:bg-destructive/90">
                    <Plus className="h-4 w-4 mr-1" />
                    Add Entry
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Add Blacklist Entry</DialogTitle>
                    <DialogDescription>
                      Add a bad actor to the blacklist mesh with optional cross-links
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Entry Type</Label>
                        <Select 
                          value={newEntry.entry_type} 
                          onValueChange={(v) => setNewEntry({...newEntry, entry_type: v})}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ENTRY_TYPES.map(type => (
                              <SelectItem key={type.value} value={type.value}>
                                {type.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Risk Level</Label>
                        <Select 
                          value={newEntry.risk_level} 
                          onValueChange={(v) => setNewEntry({...newEntry, risk_level: v})}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {RISK_LEVELS.map(risk => (
                              <SelectItem key={risk.value} value={risk.value}>
                                {risk.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <Label>Identifier (wallet address, @handle, etc.)</Label>
                      <Input
                        placeholder="Enter wallet address, X handle, pump.fun username..."
                        value={newEntry.identifier}
                        onChange={(e) => setNewEntry({...newEntry, identifier: e.target.value})}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Reason for Blacklisting</Label>
                      <Input
                        placeholder="e.g., Serial rugger, pump and dump, etc."
                        value={newEntry.blacklist_reason}
                        onChange={(e) => setNewEntry({...newEntry, blacklist_reason: e.target.value})}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Tags (comma-separated)</Label>
                      <Input
                        placeholder="e.g., rugger, serial-scammer, bundler"
                        value={newEntry.tags}
                        onChange={(e) => setNewEntry({...newEntry, tags: e.target.value})}
                      />
                    </div>

                    <div className="border-t pt-4 mt-4">
                      <h4 className="font-medium mb-3 flex items-center gap-2">
                        <Link2 className="h-4 w-4" />
                        Cross-Links (optional, comma-separated)
                      </h4>
                      <div className="grid grid-cols-1 gap-3">
                        <div className="space-y-2">
                          <Label className="text-xs text-muted-foreground">Linked Token Mints</Label>
                          <Input
                            placeholder="mint1abc..., mint2xyz..."
                            value={newEntry.linked_token_mints}
                            onChange={(e) => setNewEntry({...newEntry, linked_token_mints: e.target.value})}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs text-muted-foreground">Linked Wallets</Label>
                          <Input
                            placeholder="wallet1..., wallet2..."
                            value={newEntry.linked_wallets}
                            onChange={(e) => setNewEntry({...newEntry, linked_wallets: e.target.value})}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs text-muted-foreground">Linked X/Twitter Accounts</Label>
                          <Input
                            placeholder="@handle1, @handle2..."
                            value={newEntry.linked_twitter}
                            onChange={(e) => setNewEntry({...newEntry, linked_twitter: e.target.value})}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs text-muted-foreground">Linked Telegram Accounts</Label>
                          <Input
                            placeholder="@telegram1, @telegram2..."
                            value={newEntry.linked_telegram}
                            onChange={(e) => setNewEntry({...newEntry, linked_telegram: e.target.value})}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs text-muted-foreground">Linked Pump.fun Accounts</Label>
                          <Input
                            placeholder="pumpfun_user1, pumpfun_user2..."
                            value={newEntry.linked_pumpfun_accounts}
                            onChange={(e) => setNewEntry({...newEntry, linked_pumpfun_accounts: e.target.value})}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Evidence Notes</Label>
                      <Textarea
                        placeholder="Add any evidence or notes about this bad actor..."
                        value={newEntry.evidence_notes}
                        onChange={(e) => setNewEntry({...newEntry, evidence_notes: e.target.value})}
                        rows={3}
                      />
                    </div>

                    <Button 
                      className="w-full" 
                      onClick={() => addMutation.mutate(newEntry)}
                      disabled={!newEntry.identifier || addMutation.isPending}
                    >
                      {addMutation.isPending ? "Adding..." : "Add to Blacklist"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex flex-wrap gap-3 mb-4">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search identifiers, tokens, wallets..."
                  className="pl-9"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Filter type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {ENTRY_TYPES.map(type => (
                  <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterRisk} onValueChange={setFilterRisk}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Risk level" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Risks</SelectItem>
                {RISK_LEVELS.map(risk => (
                  <SelectItem key={risk.value} value={risk.value}>{risk.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Identifier</TableHead>
                  <TableHead>Risk</TableHead>
                  <TableHead>Enrichment</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Cross-Links</TableHead>
                  <TableHead>Added</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8">
                      <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2" />
                      Loading blacklist...
                    </TableCell>
                  </TableRow>
                ) : entries?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      No blacklist entries found. Add bad actors to track them.
                    </TableCell>
                  </TableRow>
                ) : (
                  entries?.map((entry) => {
                    const Icon = getEntryTypeIcon(entry.entry_type);
                    const linkCount = 
                      entry.linked_wallets.length + 
                      entry.linked_token_mints.length + 
                      entry.linked_twitter.length + 
                      entry.linked_telegram.length +
                      entry.linked_pumpfun_accounts.length;
                    
                    return (
                      <TableRow key={entry.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Icon className="h-4 w-4 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">
                              {ENTRY_TYPES.find(t => t.value === entry.entry_type)?.label}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">
                            {entry.identifier.length > 20 
                              ? `${entry.identifier.slice(0, 8)}...${entry.identifier.slice(-6)}`
                              : entry.identifier
                            }
                          </code>
                        </TableCell>
                        <TableCell>
                          <Badge className={getRiskBadge(entry.risk_level)}>
                            {entry.risk_level}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {getEnrichmentBadge(entry.enrichment_status, entry.enrichment_error)}
                        </TableCell>
                        <TableCell>
                          <span className="text-sm line-clamp-1">
                            {entry.blacklist_reason || '-'}
                          </span>
                        </TableCell>
                        <TableCell>
                          {linkCount > 0 ? (
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button variant="ghost" size="sm" className="gap-1">
                                  <Link2 className="h-3 w-3" />
                                  {linkCount}
                                </Button>
                              </DialogTrigger>
                              <DialogContent>
                                <DialogHeader>
                                  <DialogTitle>Cross-Links for {entry.identifier.slice(0, 12)}...</DialogTitle>
                                </DialogHeader>
                                <div className="space-y-3 py-4">
                                  {entry.linked_wallets.length > 0 && (
                                    <div>
                                      <Label className="text-xs text-muted-foreground">Linked Wallets</Label>
                                      <div className="flex flex-wrap gap-1 mt-1">
                                        {entry.linked_wallets.map((w, i) => (
                                          <Badge key={i} variant="outline" className="font-mono text-xs">
                                            {w.slice(0, 8)}...{w.slice(-4)}
                                          </Badge>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                  {entry.linked_token_mints.length > 0 && (
                                    <div>
                                      <Label className="text-xs text-muted-foreground">Linked Token Mints</Label>
                                      <div className="flex flex-wrap gap-1 mt-1">
                                        {entry.linked_token_mints.map((m, i) => (
                                          <Badge key={i} variant="outline" className="font-mono text-xs">
                                            {m.slice(0, 8)}...{m.slice(-4)}
                                          </Badge>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                  {entry.linked_twitter.length > 0 && (
                                    <div>
                                      <Label className="text-xs text-muted-foreground">Linked X/Twitter</Label>
                                      <div className="flex flex-wrap gap-1 mt-1">
                                        {entry.linked_twitter.map((t, i) => (
                                          <Badge key={i} variant="outline" className="text-xs">
                                            {t}
                                          </Badge>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                  {entry.linked_telegram.length > 0 && (
                                    <div>
                                      <Label className="text-xs text-muted-foreground">Linked Telegram</Label>
                                      <div className="flex flex-wrap gap-1 mt-1">
                                        {entry.linked_telegram.map((t, i) => (
                                          <Badge key={i} variant="outline" className="text-xs">
                                            {t}
                                          </Badge>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                  {entry.linked_pumpfun_accounts.length > 0 && (
                                    <div>
                                      <Label className="text-xs text-muted-foreground">Linked Pump.fun Accounts</Label>
                                      <div className="flex flex-wrap gap-1 mt-1">
                                        {entry.linked_pumpfun_accounts.map((p, i) => (
                                          <Badge key={i} variant="outline" className="text-xs">
                                            {p}
                                          </Badge>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                  {entry.evidence_notes && (
                                    <div>
                                      <Label className="text-xs text-muted-foreground">Evidence Notes</Label>
                                      <p className="text-sm mt-1 bg-muted p-2 rounded">
                                        {entry.evidence_notes}
                                      </p>
                                    </div>
                                  )}
                                </div>
                              </DialogContent>
                            </Dialog>
                          ) : (
                            <span className="text-muted-foreground text-xs">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(entry.created_at), 'MMM d, yyyy')}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-blue-400 hover:text-blue-300"
                                    disabled={enrichMutation.isPending || entry.enrichment_status === 'enriching'}
                                    onClick={() => enrichMutation.mutate({ 
                                      entryId: entry.id, 
                                      entryType: entry.entry_type, 
                                      identifier: entry.identifier 
                                    })}
                                  >
                                    {enrichMutation.isPending || entry.enrichment_status === 'enriching' 
                                      ? <Loader2 className="h-4 w-4 animate-spin" />
                                      : <Sparkles className="h-4 w-4" />
                                    }
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Re-enrich (scan for new links)</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => {
                                if (confirm('Remove this entry from the blacklist?')) {
                                  deleteMutation.mutate(entry.id);
                                }
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
