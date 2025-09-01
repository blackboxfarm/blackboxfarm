import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Filter, Users, TrendingUp, Calendar } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface AccountData {
  user_id: string;
  display_name: string | null;
  email_verified: boolean;
  created_at: string;
  campaign_count: number;
  contribution_count: number;
  total_contributed_sol: number;
  last_activity: string;
  account_type: 'donator' | 'client';
}

export const AccountViewer = () => {
  const [accounts, setAccounts] = useState<AccountData[]>([]);
  const [filteredAccounts, setFilteredAccounts] = useState<AccountData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [activityFilter, setActivityFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");

  useEffect(() => {
    fetchAccounts();
  }, []);

  useEffect(() => {
    filterAccounts();
  }, [accounts, searchTerm, activityFilter, typeFilter]);

  const fetchAccounts = async () => {
    try {
      setLoading(true);
      
      // Fetch profiles with campaign and contribution data
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select(`
          user_id,
          display_name,
          email_verified,
          created_at
        `);

      if (profilesError) throw profilesError;

      // Fetch campaign counts
      const { data: campaigns, error: campaignError } = await supabase
        .from('blackbox_campaigns')
        .select('user_id');

      if (campaignError) throw campaignError;

      // Fetch contribution data
      const { data: contributions, error: contributionError } = await supabase
        .from('community_contributions')
        .select('contributor_id, amount_sol');

      if (contributionError) throw contributionError;

      // Process data
      const accountsData: AccountData[] = profiles.map(profile => {
        const userCampaigns = campaigns.filter(c => c.user_id === profile.user_id);
        const userContributions = contributions.filter(c => c.contributor_id === profile.user_id);
        
        const campaignCount = userCampaigns.length;
        const contributionCount = userContributions.length;
        const totalContributed = userContributions.reduce((sum, c) => sum + Number(c.amount_sol), 0);
        
        // Determine account type based on activity
        const accountType: 'donator' | 'client' = campaignCount > 0 ? 'client' : 'donator';

        return {
          user_id: profile.user_id,
          display_name: profile.display_name,
          email_verified: profile.email_verified,
          created_at: profile.created_at,
          campaign_count: campaignCount,
          contribution_count: contributionCount,
          total_contributed_sol: totalContributed,
          last_activity: profile.created_at, // Simplified for now
          account_type: accountType
        };
      });

      setAccounts(accountsData);
    } catch (error) {
      console.error('Error fetching accounts:', error);
      toast.error('Failed to load account data');
    } finally {
      setLoading(false);
    }
  };

  const filterAccounts = () => {
    let filtered = accounts;

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(account => 
        account.display_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        account.user_id.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Activity filter
    if (activityFilter !== "all") {
      const days = parseInt(activityFilter);
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      
      filtered = filtered.filter(account => 
        new Date(account.last_activity) >= cutoff
      );
    }

    // Type filter
    if (typeFilter !== "all") {
      filtered = filtered.filter(account => account.account_type === typeFilter);
    }

    setFilteredAccounts(filtered);
  };

  const getAccountTypeColor = (type: string) => {
    return type === 'client' ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground';
  };

  const stats = {
    total: accounts.length,
    clients: accounts.filter(a => a.account_type === 'client').length,
    donators: accounts.filter(a => a.account_type === 'donator').length,
    totalContributed: accounts.reduce((sum, a) => sum + a.total_contributed_sol, 0)
  };

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Users className="h-4 w-4 text-primary" />
              <div>
                <p className="text-sm text-muted-foreground">Total Accounts</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <TrendingUp className="h-4 w-4 text-success" />
              <div>
                <p className="text-sm text-muted-foreground">Clients</p>
                <p className="text-2xl font-bold text-success">{stats.clients}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Donators</p>
                <p className="text-2xl font-bold">{stats.donators}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div>
              <p className="text-sm text-muted-foreground">Total Contributed</p>
              <p className="text-2xl font-bold">{stats.totalContributed.toFixed(2)} SOL</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Account Directory
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4 mb-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name or user ID..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            
            <Select value={activityFilter} onValueChange={setActivityFilter}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Activity" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Time</SelectItem>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
              </SelectContent>
            </Select>
            
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="client">Clients</SelectItem>
                <SelectItem value="donator">Donators</SelectItem>
              </SelectContent>
            </Select>

            <Button variant="outline" onClick={fetchAccounts}>
              <Filter className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>

          {/* Results */}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Campaigns</TableHead>
                  <TableHead>Contributions</TableHead>
                  <TableHead>Total SOL</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead>Verified</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8">
                      Loading accounts...
                    </TableCell>
                  </TableRow>
                ) : filteredAccounts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No accounts found matching your filters
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredAccounts.map((account) => (
                    <TableRow key={account.user_id}>
                      <TableCell>
                        <div>
                          <div className="font-medium">
                            {account.display_name || 'Anonymous'}
                          </div>
                          <div className="text-xs text-muted-foreground font-mono">
                            {account.user_id.slice(0, 8)}...
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge 
                          variant="secondary" 
                          className={getAccountTypeColor(account.account_type)}
                        >
                          {account.account_type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        {account.campaign_count}
                      </TableCell>
                      <TableCell className="text-center">
                        {account.contribution_count}
                      </TableCell>
                      <TableCell>
                        {account.total_contributed_sol.toFixed(2)} SOL
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(account.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <Badge variant={account.email_verified ? "default" : "secondary"}>
                          {account.email_verified ? "Yes" : "No"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          
          <div className="mt-4 text-sm text-muted-foreground">
            Showing {filteredAccounts.length} of {accounts.length} accounts
          </div>
        </CardContent>
      </Card>
    </div>
  );
};