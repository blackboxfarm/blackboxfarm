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
import { Plus, Search, Trash2, Link2, CheckCircle, Wallet, Twitter, MessageCircle, User, RefreshCw, Eye, Network, ShieldCheck, Star, TrendingUp } from "lucide-react";
import { format } from "date-fns";

interface WhitelistEntry {
  id: string;
  entry_type: string;
  identifier: string;
  linked_token_mints: string[];
  linked_wallets: string[];
  linked_twitter: string[];
  linked_telegram: string[];
  linked_pumpfun_accounts: string[];
  trust_level: string;
  whitelist_reason: string | null;
  tags: string[];
  evidence_notes: string | null;
  first_seen_at: string | null;
  tokens_launched: number;
  tokens_successful: number;
  avg_token_lifespan_hours: number;
  total_volume_sol: number;
  source: string;
  added_by: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const ENTRY_TYPES = [
  { value: 'token_address', label: 'Token Address', icon: ShieldCheck },
  { value: 'dev_wallet', label: 'Dev Wallet', icon: Wallet },
  { value: 'mint_wallet', label: 'Mint Wallet', icon: Wallet },
  { value: 'funding_wallet', label: 'Funding Wallet', icon: Wallet },
  { value: 'trusted_wallet', label: 'Trusted Wallet', icon: ShieldCheck },
  { value: 'pumpfun_account', label: 'Pump.fun Account', icon: User },
  { value: 'twitter_account', label: 'X (Twitter) Account', icon: Twitter },
  { value: 'telegram_account', label: 'Telegram Account', icon: MessageCircle },
  { value: 'kyc_wallet', label: 'KYC Wallet', icon: Wallet },
];

const TRUST_LEVELS = [
  { value: 'low', label: 'Low', color: 'bg-blue-500/20 text-blue-400' },
  { value: 'medium', label: 'Medium', color: 'bg-green-500/20 text-green-400' },
  { value: 'high', label: 'High', color: 'bg-emerald-500/20 text-emerald-400' },
  { value: 'verified', label: 'Verified', color: 'bg-purple-500/20 text-purple-400' },
];

export function PumpfunWhitelist() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterTrust, setFilterTrust] = useState<string>("all");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<WhitelistEntry | null>(null);
  
  const [newEntry, setNewEntry] = useState({
    entry_type: 'token_address',
    identifier: '',
    trust_level: 'medium',
    whitelist_reason: '',
    evidence_notes: '',
    tags: '',
    linked_token_mints: '',
    linked_wallets: '',
    linked_twitter: '',
    linked_telegram: '',
    linked_pumpfun_accounts: '',
    tokens_launched: 0,
    tokens_successful: 0,
  });

  const { data: entries, isLoading, refetch } = useQuery({
    queryKey: ['pumpfun-whitelist', searchQuery, filterType, filterTrust],
    queryFn: async () => {
      let query = supabase
        .from('pumpfun_whitelist')
        .select('*')
        .order('created_at', { ascending: false });

      if (filterType !== 'all') {
        query = query.eq('entry_type', filterType);
      }
      if (filterTrust !== 'all') {
        query = query.eq('trust_level', filterTrust);
      }

      const { data, error } = await query;
      if (error) throw error;

      if (searchQuery) {
        const lowerQuery = searchQuery.toLowerCase();
        return (data as WhitelistEntry[]).filter(entry => 
          entry.identifier.toLowerCase().includes(lowerQuery) ||
          entry.whitelist_reason?.toLowerCase().includes(lowerQuery) ||
          entry.tags.some(tag => tag.toLowerCase().includes(lowerQuery)) ||
          entry.linked_token_mints.some(m => m.toLowerCase().includes(lowerQuery)) ||
          entry.linked_wallets.some(w => w.toLowerCase().includes(lowerQuery)) ||
          entry.linked_twitter.some(t => t.toLowerCase().includes(lowerQuery))
        );
      }

      return data as WhitelistEntry[];
    },
  });

  const addMutation = useMutation({
    mutationFn: async (entry: typeof newEntry) => {
      const { data, error } = await supabase.from('pumpfun_whitelist').insert({
        entry_type: entry.entry_type,
        identifier: entry.identifier.trim(),
        trust_level: entry.trust_level,
        whitelist_reason: entry.whitelist_reason || null,
        evidence_notes: entry.evidence_notes || null,
        tags: entry.tags ? entry.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
        linked_token_mints: entry.linked_token_mints ? entry.linked_token_mints.split(',').map(t => t.trim()).filter(Boolean) : [],
        linked_wallets: entry.linked_wallets ? entry.linked_wallets.split(',').map(t => t.trim()).filter(Boolean) : [],
        linked_twitter: entry.linked_twitter ? entry.linked_twitter.split(',').map(t => t.trim()).filter(Boolean) : [],
        linked_telegram: entry.linked_telegram ? entry.linked_telegram.split(',').map(t => t.trim()).filter(Boolean) : [],
        linked_pumpfun_accounts: entry.linked_pumpfun_accounts ? entry.linked_pumpfun_accounts.split(',').map(t => t.trim()).filter(Boolean) : [],
        tokens_launched: entry.tokens_launched,
        tokens_successful: entry.tokens_successful,
        source: 'manual',
      }).select().single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Whitelist entry added");
      queryClient.invalidateQueries({ queryKey: ['pumpfun-whitelist'] });
      setIsAddDialogOpen(false);
      resetForm();
    },
    onError: (error: any) => {
      toast.error(`Failed to add entry: ${error.message}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('pumpfun_whitelist').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Entry removed from whitelist");
      queryClient.invalidateQueries({ queryKey: ['pumpfun-whitelist'] });
    },
    onError: (error: any) => {
      toast.error(`Failed to delete: ${error.message}`);
    },
  });

  const resetForm = () => {
    setNewEntry({
      entry_type: 'token_address',
      identifier: '',
      trust_level: 'medium',
      whitelist_reason: '',
      evidence_notes: '',
      tags: '',
      linked_token_mints: '',
      linked_wallets: '',
      linked_twitter: '',
      linked_telegram: '',
      linked_pumpfun_accounts: '',
      tokens_launched: 0,
      tokens_successful: 0,
    });
  };

  const getEntryTypeIcon = (type: string) => {
    const entry = ENTRY_TYPES.find(e => e.value === type);
    return entry ? entry.icon : Wallet;
  };

  const getTrustBadge = (level: string) => {
    const trust = TRUST_LEVELS.find(r => r.value === level);
    return trust ? trust.color : 'bg-muted text-muted-foreground';
  };

  const totalConnections = entries?.reduce((acc, entry) => {
    return acc + 
      entry.linked_wallets.length + 
      entry.linked_token_mints.length + 
      entry.linked_twitter.length + 
      entry.linked_telegram.length;
  }, 0) || 0;

  const totalSuccessfulTokens = entries?.reduce((acc, entry) => acc + entry.tokens_successful, 0) || 0;

  return (
    <div className="space-y-6">
      {/* Header Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-green-500/10 to-green-500/5 border-green-500/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <CheckCircle className="h-8 w-8 text-green-400" />
              <div>
                <p className="text-2xl font-bold">{entries?.length || 0}</p>
                <p className="text-sm text-muted-foreground">Whitelisted Entities</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 border-emerald-500/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Wallet className="h-8 w-8 text-emerald-400" />
              <div>
                <p className="text-2xl font-bold">
                  {entries?.filter(e => e.entry_type.includes('wallet')).length || 0}
                </p>
                <p className="text-sm text-muted-foreground">Trusted Wallets</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-purple-500/10 to-purple-500/5 border-purple-500/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Star className="h-8 w-8 text-purple-400" />
              <div>
                <p className="text-2xl font-bold">{totalSuccessfulTokens}</p>
                <p className="text-sm text-muted-foreground">Successful Tokens</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-blue-500/10 to-blue-500/5 border-blue-500/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Network className="h-8 w-8 text-blue-400" />
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
                <ShieldCheck className="h-5 w-5 text-green-500" />
                Pump.fun Whitelist Mesh
              </CardTitle>
              <CardDescription>
                Trusted network of devs, wallets, and social accounts
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                <RefreshCw className="h-4 w-4 mr-1" />
                Refresh
              </Button>
              <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" className="bg-green-600 hover:bg-green-700">
                    <Plus className="h-4 w-4 mr-1" />
                    Add Trusted
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Add Whitelist Entry</DialogTitle>
                    <DialogDescription>
                      Add a trusted actor to the whitelist mesh with optional cross-links
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
                        <Label>Trust Level</Label>
                        <Select 
                          value={newEntry.trust_level} 
                          onValueChange={(v) => setNewEntry({...newEntry, trust_level: v})}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {TRUST_LEVELS.map(trust => (
                              <SelectItem key={trust.value} value={trust.value}>
                                {trust.label}
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
                      <Label>Reason for Whitelisting</Label>
                      <Input
                        placeholder="e.g., Consistent successful launches, trusted dev, etc."
                        value={newEntry.whitelist_reason}
                        onChange={(e) => setNewEntry({...newEntry, whitelist_reason: e.target.value})}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Tokens Launched</Label>
                        <Input
                          type="number"
                          min="0"
                          value={newEntry.tokens_launched}
                          onChange={(e) => setNewEntry({...newEntry, tokens_launched: parseInt(e.target.value) || 0})}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Tokens Successful</Label>
                        <Input
                          type="number"
                          min="0"
                          value={newEntry.tokens_successful}
                          onChange={(e) => setNewEntry({...newEntry, tokens_successful: parseInt(e.target.value) || 0})}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Tags (comma-separated)</Label>
                      <Input
                        placeholder="e.g., diamond-dev, consistent, KOL, builder"
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
                        placeholder="Add any evidence or notes about this trusted actor..."
                        value={newEntry.evidence_notes}
                        onChange={(e) => setNewEntry({...newEntry, evidence_notes: e.target.value})}
                        rows={3}
                      />
                    </div>

                    <Button 
                      className="w-full bg-green-600 hover:bg-green-700" 
                      onClick={() => addMutation.mutate(newEntry)}
                      disabled={!newEntry.identifier || addMutation.isPending}
                    >
                      {addMutation.isPending ? "Adding..." : "Add to Whitelist"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-4 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by identifier, tags, linked entities..."
                className="pl-10"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {ENTRY_TYPES.map(type => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterTrust} onValueChange={setFilterTrust}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by trust" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Trust Levels</SelectItem>
                {TRUST_LEVELS.map(trust => (
                  <SelectItem key={trust.value} value={trust.value}>
                    {trust.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Identifier</TableHead>
                  <TableHead>Trust</TableHead>
                  <TableHead>Track Record</TableHead>
                  <TableHead>Links</TableHead>
                  <TableHead>Added</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8">
                      Loading whitelist...
                    </TableCell>
                  </TableRow>
                ) : entries?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No whitelist entries found
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
                    const successRate = entry.tokens_launched > 0 
                      ? Math.round((entry.tokens_successful / entry.tokens_launched) * 100) 
                      : 0;

                    return (
                      <TableRow key={entry.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Icon className="h-4 w-4 text-green-400" />
                            <span className="text-xs text-muted-foreground">
                              {ENTRY_TYPES.find(t => t.value === entry.entry_type)?.label}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">
                              {entry.identifier.length > 20 
                                ? `${entry.identifier.slice(0, 8)}...${entry.identifier.slice(-8)}`
                                : entry.identifier
                              }
                            </code>
                            {entry.whitelist_reason && (
                              <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                                {entry.whitelist_reason}
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={getTrustBadge(entry.trust_level)}>
                            {entry.trust_level}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <TrendingUp className="h-3 w-3 text-green-400" />
                            <span className="text-xs">
                              {entry.tokens_successful}/{entry.tokens_launched} ({successRate}%)
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {linkCount > 0 ? (
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  className="h-7 px-2"
                                  onClick={() => setSelectedEntry(entry)}
                                >
                                  <Eye className="h-3 w-3 mr-1" />
                                  {linkCount}
                                </Button>
                              </DialogTrigger>
                              <DialogContent>
                                <DialogHeader>
                                  <DialogTitle>Cross-Links for {entry.identifier.slice(0, 12)}...</DialogTitle>
                                </DialogHeader>
                                <div className="space-y-4 py-4">
                                  {entry.linked_wallets.length > 0 && (
                                    <div>
                                      <Label className="text-xs text-muted-foreground">Linked Wallets</Label>
                                      <div className="flex flex-wrap gap-1 mt-1">
                                        {entry.linked_wallets.map((w, i) => (
                                          <Badge key={i} variant="outline" className="text-xs font-mono">
                                            {w.slice(0, 8)}...
                                          </Badge>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                  {entry.linked_token_mints.length > 0 && (
                                    <div>
                                      <Label className="text-xs text-muted-foreground">Linked Tokens</Label>
                                      <div className="flex flex-wrap gap-1 mt-1">
                                        {entry.linked_token_mints.map((m, i) => (
                                          <Badge key={i} variant="outline" className="text-xs font-mono">
                                            {m.slice(0, 8)}...
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
                                      <Label className="text-xs text-muted-foreground">Linked Pump.fun</Label>
                                      <div className="flex flex-wrap gap-1 mt-1">
                                        {entry.linked_pumpfun_accounts.map((p, i) => (
                                          <Badge key={i} variant="outline" className="text-xs">
                                            {p}
                                          </Badge>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </DialogContent>
                            </Dialog>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(entry.created_at), 'MMM d, yyyy')}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                            onClick={() => {
                              if (confirm('Remove from whitelist?')) {
                                deleteMutation.mutate(entry.id);
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
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
