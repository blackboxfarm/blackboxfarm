import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCommunityWallet } from '@/hooks/useCommunityWallet';
import CommunityWalletConnect from './CommunityWalletConnect';
import { Plus, Users, Wallet, Clock } from 'lucide-react';

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
  const { 
    campaigns, 
    myContributions, 
    isLoading, 
    createCampaign, 
    contributeToCampaign 
  } = useCommunityWallet();
  
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isContributeModalOpen, setIsContributeModalOpen] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<CommunityCampaign | null>(null);
  const [activeTab, setActiveTab] = useState('discover');

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

  const handleCreateCampaign = async () => {
    // Calculate deadline timestamp
    const deadline = new Date(newCampaign.target_deadline).toISOString();

    const campaignData = {
      title: newCampaign.title,
      description: newCampaign.description,
      token_address: newCampaign.token_address,
      funding_goal_sol: parseFloat(newCampaign.funding_goal_sol),
      target_deadline: deadline,
      min_contribution_sol: parseFloat(newCampaign.min_contribution_sol),
      max_contribution_sol: newCampaign.max_contribution_sol ? parseFloat(newCampaign.max_contribution_sol) : null,
      campaign_parameters: newCampaign.campaign_parameters
    };

    const result = await createCampaign(campaignData);
    if (result) {
      setIsCreateModalOpen(false);
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
    }
  };

  const handleContribute = async (amount: number, walletSecret: string) => {
    if (!selectedCampaign) return false;
    
    const success = await contributeToCampaign(selectedCampaign.id, amount, walletSecret);
    if (success) {
      setIsContributeModalOpen(false);
      setSelectedCampaign(null);
    }
    return success;
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
                <Button onClick={handleCreateCampaign}>
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

      {/* Community Wallet Connect Modal */}
      {selectedCampaign && (
        <CommunityWalletConnect
          isOpen={isContributeModalOpen}
          onClose={() => {
            setIsContributeModalOpen(false);
            setSelectedCampaign(null);
          }}
          onContribute={handleContribute}
          campaign={selectedCampaign}
        />
      )}
    </div>
  );
}