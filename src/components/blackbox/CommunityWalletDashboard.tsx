import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Plus, Users, Wallet, TrendingUp, Clock, Target } from 'lucide-react';

interface CommunityCampaign {
  id: string;
  creator_id: string;
  title: string;
  description?: string;
  token_address: string;
  funding_goal_sol: number;
  current_funding_sol: number;
  target_deadline: string;
  campaign_parameters: any;
  multisig_wallet_address?: string;
  status: string;
  min_contribution_sol: number;
  max_contribution_sol?: number;
  contributor_count: number;
  created_at: string;
  updated_at: string;
  funded_at?: string;
  executed_at?: string;
}

interface CommunityContribution {
  id: string;
  campaign_id: string;
  contributor_id: string;
  amount_sol: number;
  transaction_signature?: string;
  contribution_timestamp: string;
  refunded: boolean;
}

export default function CommunityWalletDashboard() {
  const [campaigns, setCampaigns] = useState<CommunityCampaign[]>([]);
  const [myContributions, setMyContributions] = useState<CommunityContribution[]>([]);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isContributeModalOpen, setIsContributeModalOpen] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<CommunityCampaign | null>(null);
  const [contributionAmount, setContributionAmount] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('discover');
  const { toast } = useToast();

  const [newCampaign, setNewCampaign] = useState({
    title: '',
    description: '',
    token_address: '',
    funding_goal_sol: '',
    target_deadline: '',
    min_contribution_sol: '0.01',
    max_contribution_sol: '',
    campaign_parameters: {
      buyAmount: '0.025',
      buyInterval: 30,
      maxSlippage: 5,
      enableSellConditions: true,
      sellTrigger: '2x'
    }
  });

  useEffect(() => {
    loadCampaigns();
    loadMyContributions();
  }, []);

  const loadCampaigns = async () => {
    try {
      const { data, error } = await supabase
        .from('community_campaigns')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setCampaigns(data || []);
    } catch (error) {
      console.error('Error loading campaigns:', error);
      toast({
        title: "Error",
        description: "Failed to load community campaigns",
        variant: "destructive"
      });
    }
  };

  const loadMyContributions = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('community_contributions')
        .select(`
          *,
          community_campaigns (
            title,
            status,
            funding_goal_sol,
            current_funding_sol
          )
        `)
        .eq('contributor_id', user.id)
        .order('contribution_timestamp', { ascending: false });

      if (error) throw error;
      setMyContributions(data || []);
    } catch (error) {
      console.error('Error loading contributions:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const createCampaign = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({
          title: "Authentication Required",
          description: "Please sign in to create a campaign",
          variant: "destructive"
        });
        return;
      }

      // Calculate deadline timestamp
      const deadline = new Date(newCampaign.target_deadline).toISOString();

      const { data, error } = await supabase
        .from('community_campaigns')
        .insert({
          creator_id: user.id,
          title: newCampaign.title,
          description: newCampaign.description,
          token_address: newCampaign.token_address,
          funding_goal_sol: parseFloat(newCampaign.funding_goal_sol),
          target_deadline: deadline,
          min_contribution_sol: parseFloat(newCampaign.min_contribution_sol),
          max_contribution_sol: newCampaign.max_contribution_sol ? parseFloat(newCampaign.max_contribution_sol) : null,
          campaign_parameters: newCampaign.campaign_parameters
        })
        .select()
        .single();

      if (error) throw error;

      toast({
        title: "Campaign Created!",
        description: "Your community campaign has been created successfully"
      });

      setIsCreateModalOpen(false);
      loadCampaigns();
      
      // Reset form
      setNewCampaign({
        title: '',
        description: '',
        token_address: '',
        funding_goal_sol: '',
        target_deadline: '',
        min_contribution_sol: '0.01',
        max_contribution_sol: '',
        campaign_parameters: {
          buyAmount: '0.025',
          buyInterval: 30,
          maxSlippage: 5,
          enableSellConditions: true,
          sellTrigger: '2x'
        }
      });
    } catch (error) {
      console.error('Error creating campaign:', error);
      toast({
        title: "Error",
        description: "Failed to create campaign",
        variant: "destructive"
      });
    }
  };

  const contributeToCampaign = async () => {
    if (!selectedCampaign || !contributionAmount) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({
          title: "Authentication Required",
          description: "Please sign in to contribute",
          variant: "destructive"
        });
        return;
      }

      const amount = parseFloat(contributionAmount);
      
      // Validate contribution amount
      if (amount < selectedCampaign.min_contribution_sol) {
        toast({
          title: "Invalid Amount",
          description: `Minimum contribution is ${selectedCampaign.min_contribution_sol} SOL`,
          variant: "destructive"
        });
        return;
      }

      if (selectedCampaign.max_contribution_sol && amount > selectedCampaign.max_contribution_sol) {
        toast({
          title: "Invalid Amount",
          description: `Maximum contribution is ${selectedCampaign.max_contribution_sol} SOL`,
          variant: "destructive"
        });
        return;
      }

      // Insert contribution record
      const { error: contributionError } = await supabase
        .from('community_contributions')
        .insert({
          campaign_id: selectedCampaign.id,
          contributor_id: user.id,
          amount_sol: amount,
          transaction_signature: 'mock_signature_' + Date.now() // In real implementation, this would be from Solana transaction
        });

      if (contributionError) throw contributionError;

      // Update campaign funding
      const { error: updateError } = await supabase
        .from('community_campaigns')
        .update({ 
          current_funding_sol: selectedCampaign.current_funding_sol + amount,
          contributor_count: selectedCampaign.contributor_count + 1
        })
        .eq('id', selectedCampaign.id);

      if (updateError) throw updateError;

      toast({
        title: "Contribution Successful!",
        description: `You contributed ${amount} SOL to ${selectedCampaign.title}`
      });

      setIsContributeModalOpen(false);
      setContributionAmount('');
      setSelectedCampaign(null);
      loadCampaigns();
      loadMyContributions();
    } catch (error) {
      console.error('Error contributing:', error);
      toast({
        title: "Error",
        description: "Failed to process contribution",
        variant: "destructive"
      });
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      funding: { label: 'Funding', variant: 'default' as const },
      funded: { label: 'Funded', variant: 'secondary' as const },
      executing: { label: 'Executing', variant: 'outline' as const },
      completed: { label: 'Completed', variant: 'default' as const },
      cancelled: { label: 'Cancelled', variant: 'destructive' as const }
    };
    
    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.funding;
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const getFundingProgress = (current: number, goal: number) => {
    return Math.min((current / goal) * 100, 100);
  };

  const formatTimeRemaining = (deadline: string) => {
    const now = new Date();
    const end = new Date(deadline);
    const diff = end.getTime() - now.getTime();
    
    if (diff <= 0) return 'Expired';
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    
    if (days > 0) return `${days}d ${hours}h`;
    return `${hours}h`;
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 bg-muted animate-pulse rounded" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-64 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Community Wallet</h1>
          <p className="text-muted-foreground">
            Pool funds with others to launch bigger, more impactful bump campaigns
          </p>
        </div>
        
        <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Create Campaign
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create Community Campaign</DialogTitle>
              <DialogDescription>
                Set up a new community-funded bump campaign
              </DialogDescription>
            </DialogHeader>
            
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="title">Campaign Title</Label>
                  <Input
                    id="title"
                    value={newCampaign.title}
                    onChange={(e) => setNewCampaign(prev => ({ ...prev, title: e.target.value }))}
                    placeholder="e.g., BONK Moon Mission"
                  />
                </div>
                <div>
                  <Label htmlFor="token">Token Address</Label>
                  <Input
                    id="token"
                    value={newCampaign.token_address}
                    onChange={(e) => setNewCampaign(prev => ({ ...prev, token_address: e.target.value }))}
                    placeholder="Token mint address"
                  />
                </div>
              </div>
              
              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={newCampaign.description}
                  onChange={(e) => setNewCampaign(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Describe your campaign goals and strategy..."
                  rows={3}
                />
              </div>
              
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="goal">Funding Goal (SOL)</Label>
                  <Input
                    id="goal"
                    type="number"
                    step="0.01"
                    value={newCampaign.funding_goal_sol}
                    onChange={(e) => setNewCampaign(prev => ({ ...prev, funding_goal_sol: e.target.value }))}
                    placeholder="5.0"
                  />
                </div>
                <div>
                  <Label htmlFor="deadline">Deadline</Label>
                  <Input
                    id="deadline"
                    type="datetime-local"
                    value={newCampaign.target_deadline}
                    onChange={(e) => setNewCampaign(prev => ({ ...prev, target_deadline: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="minContrib">Min Contribution (SOL)</Label>
                  <Input
                    id="minContrib"
                    type="number"
                    step="0.001"
                    value={newCampaign.min_contribution_sol}
                    onChange={(e) => setNewCampaign(prev => ({ ...prev, min_contribution_sol: e.target.value }))}
                  />
                </div>
              </div>
              
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setIsCreateModalOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={createCampaign}>
                  Create Campaign
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="discover">Discover Campaigns</TabsTrigger>
          <TabsTrigger value="contributions">My Contributions</TabsTrigger>
        </TabsList>

        <TabsContent value="discover" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {campaigns.map((campaign) => (
              <Card key={campaign.id} className="hover:shadow-lg transition-shadow">
                <CardHeader className="pb-4">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <CardTitle className="text-lg">{campaign.title}</CardTitle>
                      <div className="text-sm text-muted-foreground truncate">
                        {campaign.token_address.slice(0, 8)}...{campaign.token_address.slice(-4)}
                      </div>
                    </div>
                    {getStatusBadge(campaign.status)}
                  </div>
                </CardHeader>
                
                <CardContent className="space-y-4">
                  {campaign.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {campaign.description}
                    </p>
                  )}
                  
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Progress</span>
                      <span>{campaign.current_funding_sol.toFixed(2)} / {campaign.funding_goal_sol} SOL</span>
                    </div>
                    <Progress value={getFundingProgress(campaign.current_funding_sol, campaign.funding_goal_sol)} />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div className="space-y-1">
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Users className="h-3 w-3" />
                        Contributors
                      </div>
                      <div className="font-medium">{campaign.contributor_count}</div>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        Time Left
                      </div>
                      <div className="font-medium">{formatTimeRemaining(campaign.target_deadline)}</div>
                    </div>
                  </div>
                  
                  {campaign.status === 'funding' && (
                    <Button 
                      className="w-full" 
                      onClick={() => {
                        setSelectedCampaign(campaign);
                        setIsContributeModalOpen(true);
                      }}
                    >
                      Contribute
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="contributions" className="space-y-4">
          <div className="grid gap-4">
            {myContributions.map((contribution) => (
              <Card key={contribution.id}>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <div className="font-medium">
                        {(contribution as any).community_campaigns?.title || 'Unknown Campaign'}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Contributed {contribution.amount_sol} SOL on{' '}
                        {new Date(contribution.contribution_timestamp).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="text-right space-y-1">
                      {getStatusBadge((contribution as any).community_campaigns?.status || 'funding')}
                      {contribution.refunded && (
                        <Badge variant="outline" className="ml-2">Refunded</Badge>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
            
            {myContributions.length === 0 && (
              <Card>
                <CardContent className="pt-6 text-center text-muted-foreground">
                  <Wallet className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>You haven't made any contributions yet</p>
                  <p className="text-sm">Contribute to campaigns to see them here</p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Contribute Modal */}
      <Dialog open={isContributeModalOpen} onOpenChange={setIsContributeModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Contribute to Campaign</DialogTitle>
            <DialogDescription>
              {selectedCampaign?.title}
            </DialogDescription>
          </DialogHeader>
          
          {selectedCampaign && (
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Current Progress</span>
                  <span>{selectedCampaign.current_funding_sol.toFixed(2)} / {selectedCampaign.funding_goal_sol} SOL</span>
                </div>
                <Progress value={getFundingProgress(selectedCampaign.current_funding_sol, selectedCampaign.funding_goal_sol)} />
              </div>
              
              <div>
                <Label htmlFor="amount">Contribution Amount (SOL)</Label>
                <Input
                  id="amount"
                  type="number"
                  step="0.001"
                  value={contributionAmount}
                  onChange={(e) => setContributionAmount(e.target.value)}
                  placeholder={`Min: ${selectedCampaign.min_contribution_sol} SOL`}
                />
                <div className="text-xs text-muted-foreground mt-1">
                  Min: {selectedCampaign.min_contribution_sol} SOL
                  {selectedCampaign.max_contribution_sol && ` • Max: ${selectedCampaign.max_contribution_sol} SOL`}
                </div>
              </div>
              
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setIsContributeModalOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={contributeToCampaign}>
                  Contribute
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}