import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Play, Pause, ScrollText, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { CommandCreationDialog } from "./CommandCreationDialog";

interface Campaign {
  id: string;
  nickname: string;
  token_address: string;
  is_active: boolean;
}

interface WalletData {
  id: string;
  pubkey: string;
  sol_balance: number;
  is_active: boolean;
  nickname?: string;
  campaigns?: Array<{ id: string; nickname: string }>;
}

interface Command {
  id: string;
  name: string;
  config: any;
  is_active: boolean;
  wallet_id: string | null;
  created_at: string;
}

interface InlineCampaignManagementProps {
  campaign: Campaign;
  onScrollToSection?: (section: 'wallets' | 'commands') => void;
}

export function InlineCampaignManagement({ campaign, onScrollToSection }: InlineCampaignManagementProps) {
  const [associatedWallets, setAssociatedWallets] = useState<WalletData[]>([]);
  const [availableWallets, setAvailableWallets] = useState<WalletData[]>([]);
  const [commands, setCommands] = useState<Command[]>([]);
  const [availableCommands, setAvailableCommands] = useState<Command[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCommandDialog, setShowCommandDialog] = useState(false);

  useEffect(() => {
    loadCampaignData();
  }, [campaign.id]);

  const loadCampaignData = async () => {
    try {
      // Load associated wallets for this campaign
      const { data: campaignWallets, error: walletError } = await supabase
        .from('campaign_wallets')
        .select(`
          wallet_id,
          blackbox_wallets (
            id,
            pubkey,
            sol_balance,
            is_active
          )
        `)
        .eq('campaign_id', campaign.id);

      if (walletError) throw walletError;

      const associated = (campaignWallets || [])
        .map(cw => cw.blackbox_wallets)
        .filter(Boolean) as WalletData[];
      setAssociatedWallets(associated);

      // Load available wallets (now includes all wallets except those already assigned to THIS campaign)
      const associatedWalletIds = associated.map(w => w.id);
      let availableQuery = supabase.from('blackbox_wallets').select('*');
      
      if (associatedWalletIds.length > 0) {
        availableQuery = availableQuery.not('id', 'in', `(${associatedWalletIds.join(',')})`);
      }

      const { data: allWallets, error: allWalletsError } = await availableQuery;
      if (allWalletsError) throw allWalletsError;

      // Get campaign info for each available wallet to show sharing status
      const walletsWithCampaigns = await Promise.all((allWallets || []).map(async (wallet) => {
        const { data: campaigns } = await supabase
          .from('campaign_wallets')
          .select(`
            blackbox_campaigns!inner (
              id,
              nickname
            )
          `)
          .eq('wallet_id', wallet.id);
        
        return {
          ...wallet,
          campaigns: campaigns?.map(c => c.blackbox_campaigns) || []
        };
      }));

      setAvailableWallets(walletsWithCampaigns);

      // Load commands for associated wallets
      const walletIds = associated.map(w => w.id);
      if (walletIds.length > 0) {
        const { data: commandsData, error: commandsError } = await supabase
          .from('blackbox_command_codes')
          .select('*')
          .in('wallet_id', walletIds);

        if (commandsError) throw commandsError;
        setCommands(commandsData || []);

        // Load available commands (not associated with any wallet in this campaign)
        const commandIds = (commandsData || []).map(c => c.id);
        let availableCommandsQuery = supabase
          .from('blackbox_command_codes')
          .select('*')
          .is('wallet_id', null);

        const { data: availableCommandsData, error: availableCommandsError } = await availableCommandsQuery;
        if (availableCommandsError) throw availableCommandsError;
        setAvailableCommands(availableCommandsData || []);
      } else {
        setCommands([]);
        // Load all unassigned commands
        const { data: availableCommandsData, error: availableCommandsError } = await supabase
          .from('blackbox_command_codes')
          .select('*')
          .is('wallet_id', null);
        
        if (availableCommandsError) throw availableCommandsError;
        setAvailableCommands(availableCommandsData || []);
      }
    } catch (error) {
      console.error('Error loading campaign data:', error);
      toast({
        title: "Error",
        description: "Failed to load campaign data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const addWallet = async (walletId: string) => {
    try {
      const { error } = await supabase
        .from('campaign_wallets')
        .insert({
          campaign_id: campaign.id,
          wallet_id: walletId
        });

      if (error) {
        // Handle duplicate assignment gracefully
        if (error.code === '23505') {
          toast({
            title: "Already assigned",
            description: "This wallet is already assigned to this campaign",
            variant: "destructive",
          });
          return;
        }
        throw error;
      }

      toast({
        title: "Success",
        description: "Wallet added to campaign",
      });

      loadCampaignData();
    } catch (error) {
      console.error('Error adding wallet:', error);
      toast({
        title: "Error",
        description: "Failed to add wallet",
        variant: "destructive",
      });
    }
  };

  const removeWallet = async (walletId: string) => {
    try {
      const { error } = await supabase
        .from('campaign_wallets')
        .delete()
        .eq('campaign_id', campaign.id)
        .eq('wallet_id', walletId);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Wallet removed from campaign",
      });

      loadCampaignData();
    } catch (error) {
      console.error('Error removing wallet:', error);
      toast({
        title: "Error",
        description: "Failed to remove wallet",
        variant: "destructive",
      });
    }
  };

  const assignCommand = async (commandId: string) => {
    if (associatedWallets.length === 0) {
      toast({
        title: "No wallets",
        description: "Add a wallet to this campaign first",
        variant: "destructive",
      });
      return;
    }

    // For now, assign to the first available wallet
    const targetWalletId = associatedWallets[0].id;

    try {
      const { error } = await supabase
        .from('blackbox_command_codes')
        .update({ wallet_id: targetWalletId })
        .eq('id', commandId);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Command assigned to campaign",
      });

      loadCampaignData();
    } catch (error) {
      console.error('Error assigning command:', error);
      toast({
        title: "Error",
        description: "Failed to assign command",
        variant: "destructive",
      });
    }
  };

  const removeCommand = async (commandId: string) => {
    try {
      const { error } = await supabase
        .from('blackbox_command_codes')
        .update({ wallet_id: null })
        .eq('id', commandId);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Command removed from campaign",
      });

      loadCampaignData();
    } catch (error) {
      console.error('Error removing command:', error);
      toast({
        title: "Error",
        description: "Failed to remove command",
        variant: "destructive",
      });
    }
  };

  const toggleCommand = async (command: Command) => {
    try {
      const { error } = await supabase
        .from('blackbox_command_codes')
        .update({ is_active: !command.is_active })
        .eq('id', command.id);

      if (error) throw error;

      toast({
        title: "Success",
        description: `Command ${command.is_active ? 'disabled' : 'enabled'}`,
      });

      loadCampaignData();
    } catch (error) {
      console.error('Error toggling command:', error);
      toast({
        title: "Error",
        description: "Failed to toggle command",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return <div className="text-sm text-muted-foreground">Loading campaign details...</div>;
  }

  return (
    <div className="mt-4 space-y-4 border-t pt-4">
      {/* Wallets Section */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="font-medium text-sm">Wallets</h4>
          <div className="flex gap-2">
            {availableWallets.length > 0 && (
              <Select onValueChange={addWallet}>
                <SelectTrigger className="w-[180px] h-8 text-xs">
                  <SelectValue placeholder="Add wallet" />
                </SelectTrigger>
                <SelectContent>
                  {availableWallets.map((wallet) => (
                    <SelectItem key={wallet.id} value={wallet.id}>
                      <div className="flex flex-col items-start w-full">
                        <div className="flex items-center justify-between w-full">
                          <span className="font-mono text-xs">
                            {wallet.pubkey.slice(0, 6)}...{wallet.pubkey.slice(-4)}
                          </span>
                          <span className="text-xs text-muted-foreground ml-2">
                            {wallet.sol_balance.toFixed(3)} SOL
                          </span>
                        </div>
                        {wallet.campaigns && wallet.campaigns.length > 0 && (
                          <div className="text-xs text-muted-foreground mt-1">
                            Also in: {wallet.campaigns.map(c => c.nickname).join(', ')}
                          </div>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() => onScrollToSection?.('wallets')}
              className="h-8 px-2 text-xs"
            >
              <Wallet className="h-3 w-3 mr-1" />
              Create New
            </Button>
          </div>
        </div>
        
        {associatedWallets.length === 0 ? (
          <div className="text-xs text-muted-foreground border border-dashed rounded p-2 text-center">
            No wallets assigned
          </div>
        ) : (
          <div className="space-y-1">
            {associatedWallets.map((wallet) => (
              <div key={wallet.id} className="flex items-center justify-between p-2 border rounded text-xs">
                <div className="flex items-center gap-2">
                  <code className="font-mono">
                    {wallet.pubkey.slice(0, 6)}...{wallet.pubkey.slice(-4)}
                  </code>
                  <span className="text-muted-foreground">
                    {wallet.sol_balance.toFixed(3)} SOL
                  </span>
                  <Badge variant={wallet.is_active ? "default" : "secondary"} className="h-4 text-xs">
                    {wallet.is_active ? "Active" : "Inactive"}
                  </Badge>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => removeWallet(wallet.id)}
                  className="h-6 w-6 p-0"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Commands Section */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="font-medium text-sm">Commands</h4>
          <div className="flex gap-2">
            {availableCommands.length > 0 && (
              <Select onValueChange={assignCommand}>
                <SelectTrigger className="w-[180px] h-8 text-xs">
                  <SelectValue placeholder="Add command" />
                </SelectTrigger>
                <SelectContent>
                  {availableCommands.map((command) => (
                    <SelectItem key={command.id} value={command.id}>
                      <div className="flex items-center justify-between w-full">
                        <span className="text-xs">{command.name}</span>
                        <span className="text-xs text-muted-foreground ml-2">
                          {command.config?.type || 'Unknown'}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowCommandDialog(true)}
              className="h-8 px-2 text-xs"
            >
              <ScrollText className="h-3 w-3 mr-1" />
              Create New
            </Button>
          </div>
        </div>
        
        {commands.length === 0 ? (
          <div className="text-xs text-muted-foreground border border-dashed rounded p-2 text-center">
            No commands assigned
          </div>
        ) : (
          <div className="space-y-1">
            {commands.map((command) => (
              <div key={command.id} className="flex items-center justify-between p-2 border rounded text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{command.name}</span>
                  <span className="text-muted-foreground">
                    {command.config?.type || 'Unknown'}
                  </span>
                  <Badge variant={command.is_active ? "default" : "secondary"} className="h-4 text-xs">
                    {command.is_active ? "Active" : "Inactive"}
                  </Badge>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => toggleCommand(command)}
                    className="h-6 w-6 p-0"
                  >
                    {command.is_active ? (
                      <Pause className="h-3 w-3" />
                    ) : (
                      <Play className="h-3 w-3" />
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => removeCommand(command.id)}
                    className="h-6 w-6 p-0"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <CommandCreationDialog
        open={showCommandDialog}
        onOpenChange={setShowCommandDialog}
        onCommandCreated={loadCampaignData}
      />
    </div>
  );
}