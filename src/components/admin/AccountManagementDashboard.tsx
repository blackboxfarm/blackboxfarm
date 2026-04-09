import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { BuyerIntentDetail } from '@/components/admin/BuyerIntentDetail';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { 
  Users, 
  Search, 
  RefreshCw, 
  Mail, 
  Shield, 
  Key, 
  Eye, 
  Twitter, 
  Globe, 
  Smartphone,
  Calendar,
  MapPin,
  Activity,
  DollarSign,
  UserCheck,
  UserX,
  Clock,
  ExternalLink,
  Fingerprint,
  Copy,
  Check,
  MessageCircle,
  Zap,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Ghost,
  Ban,
  ShieldCheck,
  ShoppingCart,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';

interface BuyerIntent {
  pricing_page_views: number;
  checkout_attempts: number;
  last_pricing_visit: string | null;
  last_checkout_attempt: string | null;
  intent_level: string;
  funnel_tag: string | null;
}

interface UserAccount {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  email_confirmed_at: string | null;
  banned_until?: string | null;
  raw_app_meta_data: {
    provider?: string;
    providers?: string[];
  };
  raw_user_meta_data: Record<string, unknown>;
  identities?: {
    provider: string;
    identity_id: string;
    identity_data: {
      email?: string;
      full_name?: string;
      avatar_url?: string;
      user_name?: string;
    };
  }[];
  profile?: {
    display_name: string | null;
    avatar_url: string | null;
    two_factor_enabled: boolean;
    email_verified: boolean;
    oauth_provider: string | null;
    oauth_username: string | null;
    oauth_full_name: string | null;
  };
  roles?: string[];
  advertiser?: {
    twitter_handle: string | null;
    total_spent_sol: number;
    is_active: boolean;
  };
  visit_stats?: {
    total_visits: number;
    last_visit: string | null;
    tokens_analyzed: number;
    ip_addresses: string[];
  };
  telegram_link?: {
    link_code: string;
    telegram_user_id: string | null;
    telegram_username: string | null;
    linked_at: string | null;
  } | null;
  has_channel_install?: boolean;
  subscription_tier?: string | null;
  subscription_meta?: {
    stripe_subscription_id: string | null;
    x_handle_linked: string | null;
    x_subscription_verified: boolean | null;
    expires_at: string | null;
  } | null;
  email_verification?: {
    verified: boolean;
    pending: boolean;
  };
  buyer_intent?: BuyerIntent | null;
}

interface VisitSession {
  id: string;
  created_at: string;
  session_id: string;
  ip_address: string | null;
  device_type: string | null;
  browser: string | null;
  country_code: string | null;
  tokens_analyzed: string[] | null;
  time_on_page_seconds: number | null;
  referrer_domain: string | null;
}

// Helper: check if user is banned
const isBanned = (account: UserAccount) => {
  if (!account.banned_until) return false;
  return new Date(account.banned_until) > new Date();
};

// Badge icons component
const AccountBadges = ({ account }: { account: UserAccount }) => {
  const badges: { icon: string; label: string }[] = [];

  // Crown = super admin
  if (account.roles?.includes('super_admin')) {
    badges.push({ icon: '👑', label: 'Super Admin' });
  }

  // Money bag = paid subscriber
  if (account.subscription_tier && account.subscription_tier !== 'auth') {
    badges.push({ icon: '💰', label: `Subscriber (${account.subscription_tier})` });
  }

  // Rocket = TG linked
  if (account.telegram_link?.telegram_user_id) {
    badges.push({ icon: '🚀', label: `Telegram: @${account.telegram_link.telegram_username || 'linked'}` });
  }

  // Diamond = advertiser
  if (account.advertiser) {
    badges.push({ icon: '💎', label: 'Advertiser' });
  }

  // Thumbs up = email verified (our secondary verification)
  if (account.email_verification?.verified) {
    badges.push({ icon: '👍', label: 'Email Verified' });
  }

  // Sunglasses = TG bot installed in channel/group
  if (account.has_channel_install) {
    badges.push({ icon: '😎', label: 'TG Bot Installed in Channel/Group' });
  }

  if (badges.length === 0) return <span className="text-muted-foreground text-xs">—</span>;

  return (
    <TooltipProvider>
      <div className="flex items-center gap-0.5 flex-nowrap">
        {badges.map((b, i) => (
          <Tooltip key={i}>
            <TooltipTrigger asChild>
              <span className="cursor-default text-sm leading-none">{b.icon}</span>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              {b.label}
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    </TooltipProvider>
  );
};

export function AccountManagementDashboard() {
  const [accounts, setAccounts] = useState<UserAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'advertisers' | 'admins' | 'verified'>('all');
  const [selectedAccount, setSelectedAccount] = useState<UserAccount | null>(null);
  const [visitSessions, setVisitSessions] = useState<VisitSession[]>([]);
  const [isLoadingVisits, setIsLoadingVisits] = useState(false);
  const [resetPasswordEmail, setResetPasswordEmail] = useState('');
  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [isBackfilling, setIsBackfilling] = useState(false);
  const [sortField, setSortField] = useState<'name' | 'email' | 'status' | 'created_at'>('created_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [banningUserId, setBanningUserId] = useState<string | null>(null);

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };
  const { toast } = useToast();

  const fetchAccounts = async () => {
    setIsLoading(true);
    try {
      const { data: users, error: usersError } = await supabase
        .from('profiles')
        .select('*');

      if (usersError) throw usersError;

      const { data: roles, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id, role, is_active')
        .eq('is_active', true);

      if (rolesError) throw rolesError;

      const { data: advertisers, error: advertisersError } = await supabase
        .from('advertiser_accounts')
        .select('user_id, twitter_handle, total_spent_sol, is_active');

      if (advertisersError) throw advertisersError;

      const { data: linkCodes, error: linkCodesError } = await supabase
        .from('telegram_link_codes')
        .select('user_id, link_code, telegram_user_id, telegram_username, linked_at');

      if (linkCodesError) console.warn('Failed to fetch link codes:', linkCodesError);

      const { data: subscriptions, error: subsError } = await supabase
        .from('web_user_subscriptions')
        .select('user_id, tier_key, is_active, stripe_subscription_id, x_handle_linked, x_subscription_verified, expires_at')
        .eq('is_active', true);

      if (subsError) console.warn('Failed to fetch subscriptions:', subsError);

      // Fetch email verification status
      const { data: verifications, error: verifError } = await supabase
        .from('email_verifications')
        .select('user_id, verified_at, verification_type');

      if (verifError) console.warn('Failed to fetch verifications:', verifError);

      // Fetch channel installations (users who installed TG bot in a channel/group)
      const { data: channelInstalls, error: channelError } = await supabase
        .from('channel_installations')
        .select('user_id')
        .eq('is_active', true)
        .neq('kicked', true);

      if (channelError) console.warn('Failed to fetch channel installations:', channelError);

      const channelInstallUserIds = new Set(channelInstalls?.map(ci => ci.user_id) || []);

      const visitStats_raw = await supabase
        .from('holders_page_visits')
        .select('user_id, created_at, tokens_analyzed, ip_address')
        .not('user_id', 'is', null);

      const visitStats = visitStats_raw.data;

      const visitsByUser = visitStats?.reduce((acc, visit) => {
        const userId = visit.user_id;
        if (!acc[userId]) {
          acc[userId] = { total_visits: 0, last_visit: null, tokens_analyzed: 0, ip_addresses: new Set<string>() };
        }
        acc[userId].total_visits++;
        if (!acc[userId].last_visit || new Date(visit.created_at) > new Date(acc[userId].last_visit)) {
          acc[userId].last_visit = visit.created_at;
        }
        if (visit.tokens_analyzed?.length) {
          acc[userId].tokens_analyzed += visit.tokens_analyzed.length;
        }
        if (visit.ip_address) {
          acc[userId].ip_addresses.add(visit.ip_address);
        }
        return acc;
      }, {} as Record<string, { total_visits: number; last_visit: string | null; tokens_analyzed: number; ip_addresses: Set<string> }>);

      const { data: authData } = await supabase.functions.invoke('get-all-users');
      
      const authUsersMap = authData?.users?.reduce((acc: Record<string, any>, user: any) => {
        acc[user.id] = user;
        return acc;
      }, {}) || {};

      // Build verification map per user
      const verifByUser: Record<string, { verified: boolean; pending: boolean }> = {};
      verifications?.forEach(v => {
        if (!verifByUser[v.user_id]) {
          verifByUser[v.user_id] = { verified: false, pending: false };
        }
        if (v.verified_at) verifByUser[v.user_id].verified = true;
        if (v.verification_type === 'signup' && !v.verified_at) verifByUser[v.user_id].pending = true;
      });

      const combinedAccounts: UserAccount[] = (users || []).map(profile => {
        const authUser = authUsersMap[profile.user_id] || {};
        const userRoles = roles?.filter(r => r.user_id === profile.user_id).map(r => r.role) || [];
        const advertiser = advertisers?.find(a => a.user_id === profile.user_id);
        const userVisits = visitsByUser?.[profile.user_id];
        const userLinkCode = linkCodes?.find(lc => lc.user_id === profile.user_id);
        const userSub = subscriptions?.find(s => s.user_id === profile.user_id);

        return {
          id: profile.user_id,
          email: authUser.email || 'Unknown',
          created_at: authUser.created_at || profile.created_at,
          last_sign_in_at: authUser.last_sign_in_at,
          email_confirmed_at: authUser.email_confirmed_at,
          banned_until: authUser.banned_until || null,
          raw_app_meta_data: authUser.raw_app_meta_data || {},
          raw_user_meta_data: authUser.raw_user_meta_data || {},
          identities: authUser.identities || [],
          profile: {
            display_name: profile.display_name,
            avatar_url: profile.avatar_url,
            two_factor_enabled: profile.two_factor_enabled || false,
            email_verified: profile.email_verified || false,
            oauth_provider: profile.oauth_provider || null,
            oauth_username: profile.oauth_username || null,
            oauth_full_name: profile.oauth_full_name || null,
          },
          roles: userRoles,
          advertiser: advertiser ? {
            twitter_handle: advertiser.twitter_handle,
            total_spent_sol: advertiser.total_spent_sol || 0,
            is_active: advertiser.is_active || false
          } : undefined,
          visit_stats: userVisits ? {
            ...userVisits,
            ip_addresses: Array.from(userVisits.ip_addresses)
          } : undefined,
          telegram_link: userLinkCode ? {
            link_code: userLinkCode.link_code,
            telegram_user_id: userLinkCode.telegram_user_id,
            telegram_username: userLinkCode.telegram_username,
            linked_at: userLinkCode.linked_at,
          } : null,
          has_channel_install: channelInstallUserIds.has(profile.user_id),
          subscription_tier: userSub?.tier_key || null,
          subscription_meta: userSub ? {
            stripe_subscription_id: userSub.stripe_subscription_id,
            x_handle_linked: userSub.x_handle_linked,
            x_subscription_verified: userSub.x_subscription_verified,
            expires_at: userSub.expires_at,
          } : null,
          email_verification: verifByUser[profile.user_id] || undefined,
        };
      });

      setAccounts(combinedAccounts);
    } catch (error) {
      console.error('Error fetching accounts:', error);
      toast({ title: 'Error', description: 'Failed to fetch accounts', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchUserVisits = async (userId: string) => {
    setIsLoadingVisits(true);
    try {
      const { data, error } = await supabase
        .from('holders_page_visits')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setVisitSessions(data || []);
    } catch (error) {
      console.error('Error fetching visits:', error);
    } finally {
      setIsLoadingVisits(false);
    }
  };

  const handlePasswordReset = async () => {
    if (!resetPasswordEmail) return;

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(resetPasswordEmail, {
        redirectTo: `${window.location.origin}/reset-password`
      });

      if (error) throw error;

      toast({ title: 'Password Reset Sent', description: `Password reset email sent to ${resetPasswordEmail}` });
      setIsResetDialogOpen(false);
      setResetPasswordEmail('');
    } catch (error) {
      console.error('Error sending password reset:', error);
      toast({ title: 'Error', description: 'Failed to send password reset email', variant: 'destructive' });
    }
  };

  const handleBanToggle = async (account: UserAccount) => {
    setBanningUserId(account.id);
    try {
      const banned = isBanned(account);
      const fnName = banned ? 'unban_user' : 'ban_user';
      
      const { error } = await supabase.rpc(fnName as any, { target_user_id: account.id } as any);
      if (error) throw error;

      toast({
        title: banned ? 'Account Unbanned' : 'Account Banned',
        description: `${account.email} has been ${banned ? 'unbanned' : 'banned'}`
      });
      
      // Optimistic update
      setAccounts(prev => prev.map(a => a.id === account.id ? {
        ...a,
        banned_until: banned ? null : '2099-12-31T00:00:00Z'
      } : a));
    } catch (error: any) {
      console.error('Ban toggle error:', error);
      toast({ title: 'Error', description: error.message || 'Failed to update ban status', variant: 'destructive' });
    } finally {
      setBanningUserId(null);
    }
  };

  const handleImpersonate = (account: UserAccount) => {
    // Open the main site in a new window with impersonation params
    // The admin will need to use the Supabase admin API to generate a magic link
    // For now, open the dashboard with the user's info displayed
    toast({
      title: 'Impersonation',
      description: `Feature requires a server-side magic link generation for ${account.email}. Use Supabase Dashboard → Auth → Users → ${account.email.slice(0, 20)}... to generate a magic link.`,
    });
  };

  const copyRegCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    toast({ title: 'Copied!', description: `Registration code ${code} copied to clipboard` });
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const backfillAllLinkCodes = async () => {
    setIsBackfilling(true);
    try {
      const accountsWithoutCodes = accounts.filter(a => !a.telegram_link);
      let generated = 0;
      for (const account of accountsWithoutCodes) {
        const { error } = await supabase.rpc('generate_telegram_link_code', {
          p_user_id: account.id,
        });
        if (!error) generated++;
      }
      toast({
        title: 'Backfill Complete',
        description: `Generated ${generated} new registration codes for ${accountsWithoutCodes.length} accounts`,
      });
      await fetchAccounts();
    } catch (error) {
      console.error('Backfill error:', error);
      toast({ title: 'Error', description: 'Failed to backfill codes', variant: 'destructive' });
    } finally {
      setIsBackfilling(false);
    }
  };

  const handleTierChange = async (userId: string, newTier: string) => {
    const account = accounts.find(a => a.id === userId);
    try {
      if (newTier === 'auth') {
        const { error } = await supabase
          .from('web_user_subscriptions')
          .update({ is_active: false } as any)
          .eq('user_id', userId)
          .eq('is_active', true);
        if (error) throw error;
      } else {
        const upsertData: Record<string, any> = {
          user_id: userId,
          tier_key: newTier,
          is_active: true,
          starts_at: new Date().toISOString(),
        };

        if (account?.subscription_meta) {
          if (account.subscription_meta.x_handle_linked) upsertData.x_handle_linked = account.subscription_meta.x_handle_linked;
          if (account.subscription_meta.x_subscription_verified) upsertData.x_subscription_verified = account.subscription_meta.x_subscription_verified;
          if (account.subscription_meta.stripe_subscription_id) upsertData.stripe_subscription_id = account.subscription_meta.stripe_subscription_id;
        }

        const { error } = await supabase
          .from('web_user_subscriptions')
          .upsert(upsertData as any, { onConflict: 'user_id,tier_key' });
        if (error) throw error;

        await supabase
          .from('web_user_subscriptions')
          .update({ is_active: false } as any)
          .eq('user_id', userId)
          .neq('tier_key', newTier as any);
      }

      const label = newTier === 'auth' ? 'Free (Auth)' : newTier;
      const warning = account?.subscription_meta?.stripe_subscription_id ? ' (Stripe billing unchanged)' : '';
      toast({ title: 'Tier Updated', description: `Set to ${label}${warning}` });
      setAccounts(prev => prev.map(a => a.id === userId ? { ...a, subscription_tier: newTier === 'auth' ? null : newTier } : a));
    } catch (err: any) {
      console.error('Tier change error:', err);
      toast({ title: 'Error', description: err.message || 'Failed to update tier', variant: 'destructive' });
    }
  };

  const openAccountDetails = (account: UserAccount) => {
    setSelectedAccount(account);
    fetchUserVisits(account.id);
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

  const filteredAccounts = accounts.filter(account => {
    const matchesSearch = !searchQuery || 
      account.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      account.profile?.display_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      account.advertiser?.twitter_handle?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesType = 
      filterType === 'all' ||
      (filterType === 'advertisers' && account.advertiser) ||
      (filterType === 'admins' && account.roles?.includes('super_admin')) ||
      (filterType === 'verified' && account.email_confirmed_at);

    return matchesSearch && matchesType;
  }).sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1;
    switch (sortField) {
      case 'name': {
        const nameA = (a.profile?.display_name || a.profile?.oauth_full_name || '').toLowerCase();
        const nameB = (b.profile?.display_name || b.profile?.oauth_full_name || '').toLowerCase();
        return dir * nameA.localeCompare(nameB);
      }
      case 'email':
        return dir * a.email.toLowerCase().localeCompare(b.email.toLowerCase());
      case 'status': {
        const sA = a.email_confirmed_at ? 1 : 0;
        const sB = b.email_confirmed_at ? 1 : 0;
        return dir * (sA - sB);
      }
      case 'created_at':
        return dir * (new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      default:
        return 0;
    }
  });

  const getProviderBadges = (account: UserAccount) => {
    const providers = account.raw_app_meta_data?.providers || [];
    return providers.map(provider => (
      <Badge key={provider} variant="outline" className="text-xs">
        {provider === 'google' && <Globe className="h-3 w-3 mr-1" />}
        {provider === 'twitter' && <Twitter className="h-3 w-3 mr-1" />}
        {provider === 'email' && <Mail className="h-3 w-3 mr-1" />}
        {provider}
      </Badge>
    ));
  };

  const stats = {
    total: accounts.length,
    advertisers: accounts.filter(a => a.advertiser).length,
    admins: accounts.filter(a => a.roles?.includes('super_admin')).length,
    verified: accounts.filter(a => a.email_confirmed_at).length,
    with2FA: accounts.filter(a => a.profile?.two_factor_enabled).length
  };

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              <div>
                <p className="text-2xl font-bold">{stats.total}</p>
                <p className="text-xs text-muted-foreground">Total Accounts</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-green-500" />
              <div>
                <p className="text-2xl font-bold">{stats.advertisers}</p>
                <p className="text-xs text-muted-foreground">Advertisers</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-purple-500" />
              <div>
                <p className="text-2xl font-bold">{stats.admins}</p>
                <p className="text-xs text-muted-foreground">Admins</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-blue-500" />
              <div>
                <p className="text-2xl font-bold">{stats.verified}</p>
                <p className="text-xs text-muted-foreground">Verified</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Key className="h-5 w-5 text-yellow-500" />
              <div>
                <p className="text-2xl font-bold">{stats.with2FA}</p>
                <p className="text-xs text-muted-foreground">2FA Enabled</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters and Search */}
      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Account Management
            </CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search accounts..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 w-64"
                />
              </div>
              <Tabs value={filterType} onValueChange={(v) => setFilterType(v as typeof filterType)}>
                <TabsList>
                  <TabsTrigger value="all">All</TabsTrigger>
                  <TabsTrigger value="advertisers">Advertisers</TabsTrigger>
                  <TabsTrigger value="admins">Admins</TabsTrigger>
                  <TabsTrigger value="verified">Verified</TabsTrigger>
                </TabsList>
              </Tabs>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={backfillAllLinkCodes} 
                disabled={isBackfilling || accounts.every(a => a.telegram_link)}
              >
                {isBackfilling ? <RefreshCw className="h-4 w-4 mr-1 animate-spin" /> : <Zap className="h-4 w-4 mr-1" />}
                Backfill Codes ({accounts.filter(a => !a.telegram_link).length})
              </Button>
              <Button variant="outline" size="sm" onClick={fetchAccounts} disabled={isLoading}>
                <RefreshCw className={`h-4 w-4 mr-1 ${isLoading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="relative h-[500px] overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-card">
                <TableRow className="border-b border-border">
                  <TableHead className="cursor-pointer select-none hover:text-foreground bg-card" onClick={() => toggleSort('name')}>
                    <div className="flex items-center gap-1">User {sortField === 'name' ? (sortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-30" />}</div>
                  </TableHead>
                  <TableHead className="bg-card">Badges</TableHead>
                  <TableHead className="bg-card">Auth Provider</TableHead>
                  <TableHead className="bg-card">Auth</TableHead>
                  <TableHead className="bg-card">Email Verified</TableHead>
                  <TableHead className="bg-card">Reg Code</TableHead>
                  <TableHead className="bg-card">Tier</TableHead>
                  <TableHead className="cursor-pointer select-none hover:text-foreground bg-card" onClick={() => toggleSort('created_at')}>
                    <div className="flex items-center gap-1">Activity {sortField === 'created_at' ? (sortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-30" />}</div>
                  </TableHead>
                  <TableHead className="bg-card">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAccounts.map((account) => (
                  <TableRow key={account.id} className={isBanned(account) ? 'opacity-50 bg-red-500/5' : ''}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                          {account.profile?.avatar_url ? (
                            <img src={account.profile.avatar_url} alt="" className="w-8 h-8 rounded-full" />
                          ) : (
                            <Users className="h-4 w-4 text-muted-foreground" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">
                            {account.profile?.display_name || account.profile?.oauth_full_name || 'No name'}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">{account.email}</p>
                          {account.profile?.oauth_username && (
                            <p className="text-xs text-primary truncate">@{account.profile.oauth_username}</p>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <AccountBadges account={account} />
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {getProviderBadges(account)}
                      </div>
                    </TableCell>
                    {/* Auth column - shows Auto (yellow) since we auto-confirm on signup */}
                    <TableCell>
                      {isBanned(account) ? (
                        <Badge variant="secondary" className="bg-red-500/20 text-red-400">
                          <Ban className="h-3 w-3 mr-1" /> Banned
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="bg-yellow-500/20 text-yellow-400">
                          <ShieldCheck className="h-3 w-3 mr-1" /> Auto
                        </Badge>
                      )}
                    </TableCell>
                    {/* Email Verified column - true verification status */}
                    <TableCell>
                      {account.email_verification?.verified ? (
                        <Badge variant="secondary" className="bg-green-500/20 text-green-400">
                          <Check className="h-3 w-3 mr-1" /> Verified
                        </Badge>
                      ) : account.email_verification?.pending ? (
                        <Badge variant="secondary" className="bg-orange-500/20 text-orange-400">
                          <Clock className="h-3 w-3 mr-1" /> Pending
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="bg-muted text-muted-foreground">
                          <UserX className="h-3 w-3 mr-1" /> N/A
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {account.telegram_link ? (
                        <div className="flex items-center gap-1">
                          <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">
                            {account.telegram_link.link_code}
                          </code>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={() => copyRegCode(account.telegram_link!.link_code)}
                          >
                            {copiedCode === account.telegram_link.link_code ? (
                              <Check className="h-3 w-3 text-green-500" />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                          </Button>
                          {account.telegram_link.telegram_username && (
                            <Badge variant="outline" className="text-[10px] h-5 bg-green-500/10 text-green-500 border-green-500/30">
                              <MessageCircle className="h-2.5 w-2.5 mr-0.5" />
                              @{account.telegram_link.telegram_username}
                            </Badge>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <select
                          value={account.subscription_tier || 'auth'}
                          onChange={(e) => handleTierChange(account.id, e.target.value)}
                          className="text-xs bg-muted border border-border rounded px-2 py-1 text-foreground cursor-pointer"
                        >
                          <option value="auth">Free (Auth)</option>
                          <option value="x_subscriber">X Subscriber</option>
                          <option value="pro">Pro</option>
                          <option value="dev">Developer</option>
                          <option value="enterprise">Enterprise</option>
                        </select>
                        <div className="flex gap-1">
                          {account.subscription_meta?.stripe_subscription_id && (
                            <Badge variant="outline" className="text-[10px] h-4 border-primary/30 text-primary">
                              <DollarSign className="h-2.5 w-2.5 mr-0.5" />Stripe
                            </Badge>
                          )}
                          {account.subscription_meta?.x_handle_linked && (
                            <Badge variant="outline" className="text-[10px] h-4 border-blue-500/30 text-blue-400">
                              <Twitter className="h-2.5 w-2.5 mr-0.5" />@{account.subscription_meta.x_handle_linked}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {account.last_sign_in_at 
                            ? formatDistanceToNow(new Date(account.last_sign_in_at), { addSuffix: true })
                            : 'Never'
                          }
                        </div>
                        {account.visit_stats && (
                          <div className="flex items-center gap-1 mt-1">
                            <Activity className="h-3 w-3" />
                            {account.visit_stats.total_visits} visits
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <TooltipProvider>
                        <div className="flex items-center gap-1">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="ghost" size="sm" onClick={() => openAccountDetails(account)}>
                                <Eye className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>View Profile</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="ghost" size="sm" onClick={() => {
                                setResetPasswordEmail(account.email);
                                setIsResetDialogOpen(true);
                              }}>
                                <Key className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Send Password Reset Email</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                onClick={() => handleBanToggle(account)}
                                disabled={banningUserId === account.id}
                              >
                                {isBanned(account) ? (
                                  <ShieldCheck className="h-4 w-4 text-green-500" />
                                ) : (
                                  <Ban className="h-4 w-4 text-red-400" />
                                )}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>{isBanned(account) ? 'Unban Account' : 'Ban Account'}</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="ghost" size="sm" onClick={() => handleImpersonate(account)}>
                                <Ghost className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Impersonate User</TooltipContent>
                          </Tooltip>
                        </div>
                      </TooltipProvider>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Account Details Dialog */}
      <Dialog open={!!selectedAccount} onOpenChange={() => setSelectedAccount(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Account Details
            </DialogTitle>
            <DialogDescription>
              {selectedAccount?.email}
            </DialogDescription>
          </DialogHeader>

          {selectedAccount && (
            <div className="space-y-6">
              {/* Basic Info */}
              <div className="grid grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Account Info</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">User ID</span>
                      <span className="font-mono text-xs">{selectedAccount.id.slice(0, 8)}...</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Display Name</span>
                      <span>{selectedAccount.profile?.display_name || 'Not set'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Created</span>
                      <span>{format(new Date(selectedAccount.created_at), 'PPp')}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Last Sign In</span>
                      <span>
                        {selectedAccount.last_sign_in_at 
                          ? format(new Date(selectedAccount.last_sign_in_at), 'PPp')
                          : 'Never'
                        }
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Ban Status</span>
                      {isBanned(selectedAccount) ? (
                        <Badge className="bg-red-500/20 text-red-400">Banned</Badge>
                      ) : (
                        <Badge className="bg-green-500/20 text-green-400">Active</Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Security</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Auth Status</span>
                      <Badge className="bg-yellow-500/20 text-yellow-400">Auto</Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Email Verified</span>
                      {selectedAccount.email_verification?.verified ? (
                        <Badge className="bg-green-500/20 text-green-400">Yes</Badge>
                      ) : (
                        <Badge className="bg-orange-500/20 text-orange-400">
                          {selectedAccount.email_verification?.pending ? 'Pending (7 day)' : 'N/A'}
                        </Badge>
                      )}
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">2FA Enabled</span>
                      {selectedAccount.profile?.two_factor_enabled ? (
                        <Badge className="bg-green-500/20 text-green-400">Yes</Badge>
                      ) : (
                        <Badge className="bg-muted text-muted-foreground">No</Badge>
                      )}
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Auth Providers</span>
                      <div className="flex gap-1">{getProviderBadges(selectedAccount)}</div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* OAuth Identity Info */}
              {(selectedAccount.profile?.oauth_provider || selectedAccount.identities?.length > 0) && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Globe className="h-4 w-4 text-blue-500" />
                      OAuth Identity Data
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    {selectedAccount.profile?.oauth_provider && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Primary Provider</span>
                        <Badge variant="outline">{selectedAccount.profile.oauth_provider}</Badge>
                      </div>
                    )}
                    {selectedAccount.profile?.oauth_full_name && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Full Name (OAuth)</span>
                        <span>{selectedAccount.profile.oauth_full_name}</span>
                      </div>
                    )}
                    {selectedAccount.profile?.oauth_username && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Username (OAuth)</span>
                        <span className="text-primary">@{selectedAccount.profile.oauth_username}</span>
                      </div>
                    )}
                    {selectedAccount.identities && selectedAccount.identities.length > 0 && (
                      <div className="mt-4">
                        <p className="text-muted-foreground text-xs mb-2">Linked Identities:</p>
                        <div className="space-y-2">
                          {selectedAccount.identities.map((identity, idx) => (
                            <div key={idx} className="bg-muted/50 rounded p-2">
                              <div className="flex items-center gap-2 mb-1">
                                {identity.provider === 'google' && <Globe className="h-3 w-3" />}
                                {identity.provider === 'twitter' && <Twitter className="h-3 w-3" />}
                                <span className="font-medium text-xs capitalize">{identity.provider}</span>
                              </div>
                              {identity.identity_data?.full_name && (
                                <p className="text-xs">Name: {identity.identity_data.full_name}</p>
                              )}
                              {identity.identity_data?.user_name && (
                                <p className="text-xs text-primary">@{identity.identity_data.user_name}</p>
                              )}
                              {identity.identity_data?.email && (
                                <p className="text-xs text-muted-foreground">{identity.identity_data.email}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Advertiser Info */}
              {selectedAccount.advertiser && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <DollarSign className="h-4 w-4 text-green-500" />
                      Advertiser Account
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Twitter Handle</span>
                      {selectedAccount.advertiser.twitter_handle ? (
                        <a 
                          href={`https://x.com/${selectedAccount.advertiser.twitter_handle}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline flex items-center gap-1"
                        >
                          @{selectedAccount.advertiser.twitter_handle}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        <span>Not set</span>
                      )}
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Total Spent</span>
                      <span className="text-green-400">{selectedAccount.advertiser.total_spent_sol.toFixed(4)} SOL</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Status</span>
                      {selectedAccount.advertiser.is_active ? (
                        <Badge className="bg-green-500/20 text-green-400">Active</Badge>
                      ) : (
                        <Badge className="bg-muted text-muted-foreground">Inactive</Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Visit Activity */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Activity className="h-4 w-4 text-blue-500" />
                    Visit Activity ({visitSessions.length} sessions)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {isLoadingVisits ? (
                    <div className="flex items-center justify-center py-8">
                      <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : visitSessions.length > 0 ? (
                    <ScrollArea className="h-[200px]">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Time</TableHead>
                            <TableHead>IP</TableHead>
                            <TableHead>Device</TableHead>
                            <TableHead>Location</TableHead>
                            <TableHead>Duration</TableHead>
                            <TableHead>Tokens</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {visitSessions.map((visit) => (
                            <TableRow key={visit.id}>
                              <TableCell className="text-xs">
                                {format(new Date(visit.created_at), 'MMM d, HH:mm')}
                              </TableCell>
                              <TableCell className="font-mono text-xs">
                                {visit.ip_address || '-'}
                              </TableCell>
                              <TableCell className="text-xs">
                                <div className="flex items-center gap-1">
                                  <Smartphone className="h-3 w-3" />
                                  {visit.device_type || '-'}
                                </div>
                              </TableCell>
                              <TableCell className="text-xs">
                                {visit.country_code ? (
                                  <div className="flex items-center gap-1">
                                    <MapPin className="h-3 w-3" />
                                    {visit.country_code}
                                  </div>
                                ) : '-'}
                              </TableCell>
                              <TableCell className="text-xs">
                                {visit.time_on_page_seconds 
                                  ? `${Math.floor(visit.time_on_page_seconds / 60)}m ${visit.time_on_page_seconds % 60}s`
                                  : '-'
                                }
                              </TableCell>
                              <TableCell className="text-xs">
                                {visit.tokens_analyzed?.length || 0}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-4">No visit data available</p>
                  )}
                </CardContent>
              </Card>

              {/* IP Addresses */}
              {selectedAccount.visit_stats?.ip_addresses && selectedAccount.visit_stats.ip_addresses.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Fingerprint className="h-4 w-4 text-orange-500" />
                      Known IP Addresses
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {selectedAccount.visit_stats.ip_addresses.map(ip => (
                        <Badge key={ip} variant="outline" className="font-mono text-xs">
                          {ip}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedAccount(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Password Reset Dialog */}
      <Dialog open={isResetDialogOpen} onOpenChange={setIsResetDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send Password Reset</DialogTitle>
            <DialogDescription>
              Send a password reset email to this user.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input
              value={resetPasswordEmail}
              onChange={(e) => setResetPasswordEmail(e.target.value)}
              placeholder="Email address"
              disabled
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsResetDialogOpen(false)}>Cancel</Button>
            <Button onClick={handlePasswordReset}>
              <Mail className="h-4 w-4 mr-2" />
              Send Reset Email
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
