import { supabase } from "@/integrations/supabase/client";

export interface WalletData {
  id: string;
  pubkey: string;
  sol_balance: number;
  is_active: boolean;
}

export interface CampaignWalletRelation {
  id: string;
  campaign_id: string;
  wallet_id: string;
  created_at: string;
}

/**
 * Get all wallets associated with a campaign
 */
export async function getCampaignWallets(campaignId: string): Promise<WalletData[]> {
  const { data, error } = await supabase
    .from('campaign_wallets')
    .select(`
      wallet_id,
      blackbox_wallets!inner (
        id,
        pubkey,
        sol_balance,
        is_active
      )
    `)
    .eq('campaign_id', campaignId);

  if (error) {
    throw new Error(`Failed to load campaign wallets: ${error.message}`);
  }

  return data?.map((cw: any) => ({
    id: cw.blackbox_wallets.id,
    pubkey: cw.blackbox_wallets.pubkey,
    sol_balance: cw.blackbox_wallets.sol_balance,
    is_active: cw.blackbox_wallets.is_active
  })) || [];
}

/**
 * Get all available wallets for a user (not restricted to any campaign)
 */
export async function getAllUserWallets(): Promise<WalletData[]> {
  const { data, error } = await supabase
    .from('blackbox_wallets')
    .select('id, pubkey, sol_balance, is_active')
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to load user wallets: ${error.message}`);
  }

  return data || [];
}

/**
 * Get wallets that are NOT currently assigned to a specific campaign
 * (Now allows sharing - returns all wallets except those already assigned to THIS campaign)
 */
export async function getAvailableWalletsForCampaign(campaignId: string): Promise<WalletData[]> {
  // Get all user wallets
  const allWallets = await getAllUserWallets();
  
  // Get currently assigned wallets for this campaign
  const assignedWallets = await getCampaignWallets(campaignId);
  const assignedWalletIds = new Set(assignedWallets.map(w => w.id));
  
  // Return wallets not assigned to this campaign (but may be assigned to others)
  return allWallets.filter(wallet => !assignedWalletIds.has(wallet.id));
}

/**
 * Add a wallet to a campaign (handles duplicates gracefully)
 */
export async function addWalletToCampaign(campaignId: string, walletId: string): Promise<void> {
  const { error } = await supabase
    .from('campaign_wallets')
    .insert({
      campaign_id: campaignId,
      wallet_id: walletId
    });

  if (error) {
    // Handle duplicate key constraint error gracefully
    if (error.code === '23505') {
      throw new Error('Wallet is already assigned to this campaign');
    }
    throw new Error(`Failed to add wallet to campaign: ${error.message}`);
  }
}

/**
 * Remove a wallet from a campaign
 */
export async function removeWalletFromCampaign(campaignId: string, walletId: string): Promise<void> {
  const { error } = await supabase
    .from('campaign_wallets')
    .delete()
    .eq('campaign_id', campaignId)
    .eq('wallet_id', walletId);

  if (error) {
    throw new Error(`Failed to remove wallet from campaign: ${error.message}`);
  }
}

/**
 * Get all campaigns that use a specific wallet
 */
export async function getCampaignsUsingWallet(walletId: string): Promise<any[]> {
  const { data, error } = await supabase
    .from('campaign_wallets')
    .select(`
      campaign_id,
      blackbox_campaigns!inner (
        id,
        nickname,
        token_address,
        is_active
      )
    `)
    .eq('wallet_id', walletId);

  if (error) {
    throw new Error(`Failed to load campaigns using wallet: ${error.message}`);
  }

  return data?.map((cw: any) => cw.blackbox_campaigns) || [];
}