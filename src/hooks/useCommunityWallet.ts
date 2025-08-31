import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Connection, PublicKey, Transaction, SystemProgram, sendAndConfirmTransaction, Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { useToast } from '@/hooks/use-toast';

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

export function useCommunityWallet() {
  const [campaigns, setCampaigns] = useState<CommunityCampaign[]>([]);
  const [myContributions, setMyContributions] = useState<CommunityContribution[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [connection, setConnection] = useState<Connection | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    // Initialize Solana connection
    const rpcUrl = localStorage.getItem('rpcUrl') || 'https://api.mainnet-beta.solana.com';
    setConnection(new Connection(rpcUrl));
    
    loadCampaigns();
    loadMyContributions();
    
    // Set up real-time subscriptions
    const campaignsSubscription = supabase
      .channel('community_campaigns_changes')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'community_campaigns' },
        () => loadCampaigns()
      )
      .subscribe();

    const contributionsSubscription = supabase
      .channel('community_contributions_changes') 
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'community_contributions' },
        () => {
          loadCampaigns();
          loadMyContributions();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(campaignsSubscription);
      supabase.removeChannel(contributionsSubscription);
    };
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

  const createCampaign = async (campaignData: any) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({
          title: "Authentication Required",
          description: "Please sign in to create a campaign",
          variant: "destructive"
        });
        return null;
      }

      const { data, error } = await supabase
        .from('community_campaigns')
        .insert({
          creator_id: user.id,
          ...campaignData
        })
        .select()
        .single();

      if (error) throw error;

      toast({
        title: "Campaign Created!",
        description: "Your community campaign has been created successfully"
      });

      return data;
    } catch (error) {
      console.error('Error creating campaign:', error);
      toast({
        title: "Error",
        description: "Failed to create campaign",
        variant: "destructive"
      });
      return null;
    }
  };

  const contributeToCampaign = async (campaignId: string, amount: number, walletSecret: string) => {
    if (!connection) {
      toast({
        title: "Connection Error",
        description: "Solana connection not available",
        variant: "destructive"
      });
      return false;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({
          title: "Authentication Required",
          description: "Please sign in to contribute",
          variant: "destructive"
        });
        return false;
      }

      // Call the edge function to process the contribution
      const { data, error } = await supabase.functions.invoke('community-contribution', {
        body: {
          campaign_id: campaignId,
          amount_sol: amount,
          contributor_wallet_secret: walletSecret
        }
      });

      if (error) throw error;

      toast({
        title: "Contribution Successful!",
        description: `You contributed ${amount} SOL to the campaign`
      });

      return true;
    } catch (error) {
      console.error('Error contributing:', error);
      toast({
        title: "Error",
        description: "Failed to process contribution",
        variant: "destructive"
      });
      return false;
    }
  };

  const requestRefund = async (contributionId: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({
          title: "Authentication Required",
          description: "Please sign in to request refund",
          variant: "destructive"
        });
        return false;
      }

      // Call refund edge function (to be implemented)
      const { data, error } = await supabase.functions.invoke('community-refund', {
        body: { contribution_id: contributionId }
      });

      if (error) throw error;

      toast({
        title: "Refund Processed",
        description: "Your refund has been processed successfully"
      });

      return true;
    } catch (error) {
      console.error('Error requesting refund:', error);
      toast({
        title: "Error",
        description: "Failed to process refund",
        variant: "destructive"
      });
      return false;
    }
  };

  return {
    campaigns,
    myContributions,
    isLoading,
    loadCampaigns,
    loadMyContributions,
    createCampaign,
    contributeToCampaign,
    requestRefund
  };
}