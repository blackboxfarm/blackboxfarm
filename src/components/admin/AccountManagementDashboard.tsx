import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
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
  Fingerprint
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';

interface UserAccount {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  email_confirmed_at: string | null;
  raw_app_meta_data: {
    provider?: string;
    providers?: string[];
  };
  raw_user_meta_data: Record<string, unknown>;
  profile?: {
    display_name: string | null;
    avatar_url: string | null;
    two_factor_enabled: boolean;
    email_verified: boolean;
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
  const { toast } = useToast();

  const fetchAccounts = async () => {
    setIsLoading(true);
    try {
      // Fetch all users from auth.users
      const { data: users, error: usersError } = await supabase
        .from('profiles')
        .select('*');

      if (usersError) throw usersError;

      // Fetch user roles
      const { data: roles, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id, role, is_active')
        .eq('is_active', true);

      if (rolesError) throw rolesError;

      // Fetch advertiser accounts
      const { data: advertisers, error: advertisersError } = await supabase
        .from('advertiser_accounts')
        .select('user_id, twitter_handle, total_spent_sol, is_active');

      if (advertisersError) throw advertisersError;

      // Fetch visit stats grouped by user
      const { data: visitStats, error: visitError } = await supabase
        .from('holders_page_visits')
        .select('user_id, created_at, tokens_analyzed, ip_address')
        .not('user_id', 'is', null);

      if (visitError) throw visitError;

      // Aggregate visit stats by user
      const visitsByUser = visitStats?.reduce((acc, visit) => {
        const userId = visit.user_id;
        if (!acc[userId]) {
          acc[userId] = {
            total_visits: 0,
            last_visit: null,
            tokens_analyzed: 0,
            ip_addresses: new Set<string>()
          };
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

      // We need to get auth.users data via edge function since we can't query it directly
      const { data: authData, error: authError } = await supabase.functions.invoke('get-all-users');
      
      const authUsersMap = authData?.users?.reduce((acc: Record<string, any>, user: any) => {
        acc[user.id] = user;
        return acc;
      }, {}) || {};

      // Combine all data
      const combinedAccounts: UserAccount[] = (users || []).map(profile => {
        const authUser = authUsersMap[profile.user_id] || {};
        const userRoles = roles?.filter(r => r.user_id === profile.user_id).map(r => r.role) || [];
        const advertiser = advertisers?.find(a => a.user_id === profile.user_id);
        const userVisits = visitsByUser?.[profile.user_id];

        return {
          id: profile.user_id,
          email: authUser.email || 'Unknown',
          created_at: authUser.created_at || profile.created_at,
          last_sign_in_at: authUser.last_sign_in_at,
          email_confirmed_at: authUser.email_confirmed_at,
          raw_app_meta_data: authUser.raw_app_meta_data || {},
          raw_user_meta_data: authUser.raw_user_meta_data || {},
          profile: {
            display_name: profile.display_name,
            avatar_url: profile.avatar_url,
            two_factor_enabled: profile.two_factor_enabled || false,
            email_verified: profile.email_verified || false
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
          } : undefined
        };
      });

      setAccounts(combinedAccounts);
    } catch (error) {
      console.error('Error fetching accounts:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch accounts',
        variant: 'destructive'
      });
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

      toast({
        title: 'Password Reset Sent',
        description: `Password reset email sent to ${resetPasswordEmail}`
      });
      setIsResetDialogOpen(false);
      setResetPasswordEmail('');
    } catch (error) {
      console.error('Error sending password reset:', error);
      toast({
        title: 'Error',
        description: 'Failed to send password reset email',
        variant: 'destructive'
      });
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
    // Search filter
    const matchesSearch = !searchQuery || 
      account.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      account.profile?.display_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      account.advertiser?.twitter_handle?.toLowerCase().includes(searchQuery.toLowerCase());

    // Type filter
    const matchesType = 
      filterType === 'all' ||
      (filterType === 'advertisers' && account.advertiser) ||
      (filterType === 'admins' && account.roles?.includes('super_admin')) ||
      (filterType === 'verified' && account.email_confirmed_at);

    return matchesSearch && matchesType;
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
              <Button variant="outline" size="sm" onClick={fetchAccounts} disabled={isLoading}>
                <RefreshCw className={`h-4 w-4 mr-1 ${isLoading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[500px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Auth Provider</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Roles</TableHead>
                  <TableHead>Activity</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAccounts.map((account) => (
                  <TableRow key={account.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                          {account.profile?.avatar_url ? (
                            <img src={account.profile.avatar_url} alt="" className="w-8 h-8 rounded-full" />
                          ) : (
                            <Users className="h-4 w-4 text-muted-foreground" />
                          )}
                        </div>
                        <div>
                          <p className="font-medium text-sm">{account.profile?.display_name || 'No name'}</p>
                          <p className="text-xs text-muted-foreground">{account.email}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {getProviderBadges(account)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {account.email_confirmed_at ? (
                          <Badge variant="secondary" className="bg-green-500/20 text-green-400">
                            <Mail className="h-3 w-3 mr-1" /> Verified
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="bg-yellow-500/20 text-yellow-400">
                            <UserX className="h-3 w-3 mr-1" /> Pending
                          </Badge>
                        )}
                        {account.profile?.two_factor_enabled && (
                          <Badge variant="secondary" className="bg-blue-500/20 text-blue-400">
                            <Key className="h-3 w-3 mr-1" /> 2FA
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {account.roles?.map(role => (
                          <Badge key={role} className="bg-purple-500/20 text-purple-400">
                            {role}
                          </Badge>
                        ))}
                        {account.advertiser && (
                          <Badge className="bg-green-500/20 text-green-400">
                            <DollarSign className="h-3 w-3 mr-1" />
                            Advertiser
                          </Badge>
                        )}
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
                      <div className="flex items-center gap-1">
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => openAccountDetails(account)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => {
                            setResetPasswordEmail(account.email);
                            setIsResetDialogOpen(true);
                          }}
                        >
                          <Key className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
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
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Security</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Email Verified</span>
                      {selectedAccount.email_confirmed_at ? (
                        <Badge className="bg-green-500/20 text-green-400">Yes</Badge>
                      ) : (
                        <Badge className="bg-yellow-500/20 text-yellow-400">No</Badge>
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
