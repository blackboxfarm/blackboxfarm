import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { RefreshCw, Search, Users, Crown, CreditCard, Shield, Copy, Trash2, Edit, Plus, Check, X } from 'lucide-react';
import { format } from 'date-fns';

interface Subscriber {
  id: string;
  user_id: string;
  tier_key: string;
  x_handle_linked: string | null;
  x_subscription_verified: boolean;
  starts_at: string;
  expires_at: string | null;
  is_active: boolean;
  stripe_subscription_id: string | null;
  created_at: string;
  email?: string;
}

interface CommunityCode {
  id: string;
  code: string;
  is_active: boolean;
  max_uses: number | null;
  use_count: number;
  expires_at: string | null;
  notes: string | null;
  created_at: string;
}

interface Redemption {
  id: string;
  user_id: string;
  code_id: string;
  x_handle: string;
  redeemed_at: string;
  code?: string;
}

const TIER_COLORS: Record<string, string> = {
  free: 'bg-muted text-muted-foreground',
  auth: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  x_subscriber: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  pro: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  dev: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  enterprise: 'bg-red-500/20 text-red-400 border-red-500/30',
};

export function SubscribersDashboard() {
  const [activeTab, setActiveTab] = useState('subscribers');
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [codes, setCodes] = useState<CommunityCode[]>([]);
  const [redemptions, setRedemptions] = useState<Redemption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [tierFilter, setTierFilter] = useState<string>('all');
  
  // Manual tier override
  const [overrideDialogOpen, setOverrideDialogOpen] = useState(false);
  const [overrideUserId, setOverrideUserId] = useState('');
  const [overrideTier, setOverrideTier] = useState('pro');
  
  // New code dialog
  const [newCodeDialogOpen, setNewCodeDialogOpen] = useState(false);
  const [newCode, setNewCode] = useState('');
  const [newCodeMaxUses, setNewCodeMaxUses] = useState('');
  const [newCodeNotes, setNewCodeNotes] = useState('');

  const fetchSubscribers = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('web_user_subscriptions')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      // Fetch emails for each user
      const subsWithEmail: Subscriber[] = [];
      for (const sub of (data || [])) {
        // Try to get email from profiles or auth
        const { data: profile } = await supabase
          .from('profiles')
          .select('display_name')
          .eq('user_id', sub.user_id)
          .single();
        
        subsWithEmail.push({
          ...sub,
          email: profile?.display_name || sub.user_id.slice(0, 8) + '...',
        });
      }
      
      setSubscribers(subsWithEmail);
    } catch (err) {
      console.error('Error fetching subscribers:', err);
      toast.error('Failed to load subscribers');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchCodes = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('x_community_codes')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setCodes(data || []);
    } catch (err) {
      console.error('Error fetching codes:', err);
    }
  }, []);

  const fetchRedemptions = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('x_community_redemptions')
        .select('*')
        .order('redeemed_at', { ascending: false });
      if (error) throw error;
      
      // Enrich with code text
      const enriched = (data || []).map(r => ({
        ...r,
        code: codes.find(c => c.id === r.code_id)?.code || 'Unknown',
      }));
      setRedemptions(enriched);
    } catch (err) {
      console.error('Error fetching redemptions:', err);
    }
  }, [codes]);

  useEffect(() => {
    fetchSubscribers();
    fetchCodes();
  }, [fetchSubscribers, fetchCodes]);

  useEffect(() => {
    if (codes.length > 0) fetchRedemptions();
  }, [codes, fetchRedemptions]);

  const handleManualTierOverride = async () => {
    if (!overrideUserId.trim()) {
      toast.error('User ID is required');
      return;
    }
    try {
      const { error } = await supabase
        .from('web_user_subscriptions')
        .upsert({
          user_id: overrideUserId.trim(),
          tier_key: overrideTier as any,
          is_active: true,
          starts_at: new Date().toISOString(),
        } as any, { onConflict: 'user_id,tier_key' });

      if (error) throw error;
      toast.success(`Tier set to ${overrideTier} for user`);
      setOverrideDialogOpen(false);
      setOverrideUserId('');
      fetchSubscribers();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update tier');
    }
  };

  const handleToggleSubscription = async (sub: Subscriber) => {
    try {
      const { error } = await supabase
        .from('web_user_subscriptions')
        .update({ is_active: !sub.is_active })
        .eq('id', sub.id);
      if (error) throw error;
      toast.success(sub.is_active ? 'Subscription deactivated' : 'Subscription activated');
      fetchSubscribers();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleCreateCode = async () => {
    if (!newCode.trim()) {
      toast.error('Code is required');
      return;
    }
    try {
      const { error } = await supabase
        .from('x_community_codes')
        .insert({
          code: newCode.trim().toUpperCase(),
          max_uses: newCodeMaxUses ? parseInt(newCodeMaxUses) : null,
          notes: newCodeNotes || null,
        });
      if (error) throw error;
      toast.success('Code created');
      setNewCodeDialogOpen(false);
      setNewCode('');
      setNewCodeMaxUses('');
      setNewCodeNotes('');
      fetchCodes();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleToggleCode = async (code: CommunityCode) => {
    try {
      const { error } = await supabase
        .from('x_community_codes')
        .update({ is_active: !code.is_active })
        .eq('id', code.id);
      if (error) throw error;
      toast.success(code.is_active ? 'Code deactivated' : 'Code activated');
      fetchCodes();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleDeleteCode = async (code: CommunityCode) => {
    try {
      const { error } = await supabase
        .from('x_community_codes')
        .delete()
        .eq('id', code.id);
      if (error) throw error;
      toast.success('Code deleted');
      fetchCodes();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  // Stats
  const totalSubscribers = subscribers.length;
  const activeSubscribers = subscribers.filter(s => s.is_active).length;
  const xVerified = subscribers.filter(s => s.x_subscription_verified).length;
  const byTier = subscribers.reduce((acc, s) => {
    if (s.is_active) acc[s.tier_key] = (acc[s.tier_key] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const stripeSubscribers = subscribers.filter(s => s.stripe_subscription_id).length;

  const filteredSubscribers = subscribers.filter(s => {
    const matchesSearch = !searchQuery || 
      s.user_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.x_handle_linked?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesTier = tierFilter === 'all' || s.tier_key === tierFilter;
    return matchesSearch && matchesTier;
  });

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card>
          <CardContent className="p-4 text-center">
            <Users className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
            <div className="text-2xl font-bold">{totalSubscribers}</div>
            <div className="text-xs text-muted-foreground">Total</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Check className="h-5 w-5 mx-auto mb-1 text-green-400" />
            <div className="text-2xl font-bold text-green-400">{activeSubscribers}</div>
            <div className="text-xs text-muted-foreground">Active</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Shield className="h-5 w-5 mx-auto mb-1 text-cyan-400" />
            <div className="text-2xl font-bold text-cyan-400">{xVerified}</div>
            <div className="text-xs text-muted-foreground">X Verified</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <CreditCard className="h-5 w-5 mx-auto mb-1 text-amber-400" />
            <div className="text-2xl font-bold text-amber-400">{stripeSubscribers}</div>
            <div className="text-xs text-muted-foreground">Stripe</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Crown className="h-5 w-5 mx-auto mb-1 text-purple-400" />
            <div className="text-2xl font-bold text-purple-400">{byTier.pro || 0}</div>
            <div className="text-xs text-muted-foreground">Pro</div>
          </CardContent>
        </Card>
      </div>

      {/* Tier Breakdown */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Active by Tier</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {Object.entries(byTier).map(([tier, count]) => (
              <Badge key={tier} variant="outline" className={TIER_COLORS[tier] || ''}>
                {tier}: {count}
              </Badge>
            ))}
            {Object.keys(byTier).length === 0 && (
              <span className="text-sm text-muted-foreground">No active subscriptions</span>
            )}
          </div>
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="subscribers">👥 Subscribers</TabsTrigger>
          <TabsTrigger value="x-codes">🔑 X Codes</TabsTrigger>
          <TabsTrigger value="redemptions">✅ Redemptions</TabsTrigger>
        </TabsList>

        {/* Subscribers Tab */}
        <TabsContent value="subscribers" className="space-y-4">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by user ID, name, or X handle..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={tierFilter} onValueChange={setTierFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Filter tier" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All tiers</SelectItem>
                <SelectItem value="auth">Auth</SelectItem>
                <SelectItem value="x_subscriber">X Sub</SelectItem>
                <SelectItem value="pro">Pro</SelectItem>
                <SelectItem value="dev">Dev</SelectItem>
                <SelectItem value="enterprise">Enterprise</SelectItem>
              </SelectContent>
            </Select>
            <Dialog open={overrideDialogOpen} onOpenChange={setOverrideDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline">
                  <Edit className="h-4 w-4 mr-1" /> Override Tier
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Manual Tier Override</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <label className="text-sm text-muted-foreground">User ID</label>
                    <Input
                      value={overrideUserId}
                      onChange={e => setOverrideUserId(e.target.value)}
                      placeholder="Paste user UUID..."
                    />
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">Tier</label>
                    <Select value={overrideTier} onValueChange={setOverrideTier}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="x_subscriber">X Subscriber</SelectItem>
                        <SelectItem value="pro">Pro</SelectItem>
                        <SelectItem value="dev">Developer</SelectItem>
                        <SelectItem value="enterprise">Enterprise</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={handleManualTierOverride}>Apply Override</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <Button size="sm" variant="ghost" onClick={fetchSubscribers} disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>

          <div className="rounded-md border overflow-auto max-h-[500px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Tier</TableHead>
                  <TableHead>X Handle</TableHead>
                  <TableHead>X Verified</TableHead>
                  <TableHead>Stripe</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSubscribers.map(sub => (
                  <TableRow key={sub.id}>
                    <TableCell className="font-mono text-xs">
                      <div className="flex items-center gap-1">
                        <span>{sub.email || sub.user_id.slice(0, 8)}...</span>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-5 w-5"
                          onClick={() => {
                            navigator.clipboard.writeText(sub.user_id);
                            toast.success('Copied user ID');
                          }}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={TIER_COLORS[sub.tier_key] || ''}>
                        {sub.tier_key}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {sub.x_handle_linked ? `@${sub.x_handle_linked}` : '—'}
                    </TableCell>
                    <TableCell>
                      {sub.x_subscription_verified ? (
                        <Check className="h-4 w-4 text-green-400" />
                      ) : (
                        <X className="h-4 w-4 text-muted-foreground" />
                      )}
                    </TableCell>
                    <TableCell className="text-xs font-mono">
                      {sub.stripe_subscription_id ? sub.stripe_subscription_id.slice(0, 12) + '...' : '—'}
                    </TableCell>
                    <TableCell className="text-xs">
                      {sub.expires_at ? format(new Date(sub.expires_at), 'MMM d, yyyy') : 'Never'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={sub.is_active ? 'default' : 'secondary'}>
                        {sub.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleToggleSubscription(sub)}
                      >
                        {sub.is_active ? 'Deactivate' : 'Activate'}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredSubscribers.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      {isLoading ? 'Loading...' : 'No subscribers found'}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* X Codes Tab */}
        <TabsContent value="x-codes" className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">Community Verification Codes</h3>
            <Dialog open={newCodeDialogOpen} onOpenChange={setNewCodeDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="h-4 w-4 mr-1" /> New Code
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create Verification Code</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <label className="text-sm text-muted-foreground">Code</label>
                    <Input
                      value={newCode}
                      onChange={e => setNewCode(e.target.value.toUpperCase())}
                      placeholder="e.g. HOLDERSVIP2"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">Max Uses (blank = unlimited)</label>
                    <Input
                      type="number"
                      value={newCodeMaxUses}
                      onChange={e => setNewCodeMaxUses(e.target.value)}
                      placeholder="Unlimited"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">Notes</label>
                    <Input
                      value={newCodeNotes}
                      onChange={e => setNewCodeNotes(e.target.value)}
                      placeholder="Optional notes..."
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={handleCreateCode}>Create</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          <div className="rounded-md border overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Uses</TableHead>
                  <TableHead>Max Uses</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {codes.map(code => (
                  <TableRow key={code.id}>
                    <TableCell className="font-mono font-bold">{code.code}</TableCell>
                    <TableCell>{code.use_count}</TableCell>
                    <TableCell>{code.max_uses ?? '∞'}</TableCell>
                    <TableCell>
                      <Badge variant={code.is_active ? 'default' : 'secondary'}>
                        {code.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      {code.expires_at ? format(new Date(code.expires_at), 'MMM d, yyyy') : 'Never'}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[150px] truncate">
                      {code.notes || '—'}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => handleToggleCode(code)}>
                          {code.is_active ? 'Disable' : 'Enable'}
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => handleDeleteCode(code)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {codes.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      No codes created yet
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* Redemptions Tab */}
        <TabsContent value="redemptions" className="space-y-4">
          <h3 className="text-lg font-semibold">Code Redemptions</h3>
          <div className="rounded-md border overflow-auto max-h-[400px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>X Handle</TableHead>
                  <TableHead>Code Used</TableHead>
                  <TableHead>User ID</TableHead>
                  <TableHead>Redeemed At</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {redemptions.map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">@{r.x_handle}</TableCell>
                    <TableCell className="font-mono">{r.code}</TableCell>
                    <TableCell className="font-mono text-xs">{r.user_id.slice(0, 8)}...</TableCell>
                    <TableCell className="text-xs">
                      {format(new Date(r.redeemed_at), 'MMM d, yyyy HH:mm')}
                    </TableCell>
                  </TableRow>
                ))}
                {redemptions.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                      No redemptions yet
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
