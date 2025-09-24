import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Settings, Play, Pause, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface Campaign {
  id: string;
  nickname: string;
  token_address: string;
  is_active: boolean;
}

interface Wallet {
  id: string;
  pubkey: string;
  sol_balance: number;
  is_active: boolean;
}

interface Command {
  id: string;
  name: string;
  config: any;
  is_active: boolean;
  wallet_id: string | null;
  created_at: string;
}

interface CampaignCommandsProps {
  campaign: Campaign;
}

export function CampaignCommands({ campaign }: CampaignCommandsProps) {
  const [commands, setCommands] = useState<Command[]>([]);
  const [availableWallets, setAvailableWallets] = useState<Wallet[]>([]);
  const [associatedWallets, setAssociatedWallets] = useState<Wallet[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (campaign?.id) {
      loadCampaignData();
    }
  }, [campaign?.id]);

  const loadCampaignData = async () => {
    if (!campaign?.id) {
      setLoading(false);
      return;
    }
    
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
        .filter(Boolean) as Wallet[];
      setAssociatedWallets(associated);

      // Load unassociated wallets
      const associatedWalletIds = associated.map(w => w.id);
      const { data: allWallets, error: allWalletsError } = await supabase
        .from('blackbox_wallets')
        .select('*')
        .not('id', 'in', `(${associatedWalletIds.join(',') || 'null'})`);

      if (allWalletsError) throw allWalletsError;

      // Filter out wallets that are already associated with other campaigns
      const { data: otherAssociations, error: otherError } = await supabase
        .from('campaign_wallets')
        .select('wallet_id');

      if (otherError) throw otherError;

      const otherAssociatedIds = new Set(otherAssociations?.map(a => a.wallet_id) || []);
      const available = (allWallets || []).filter(w => !otherAssociatedIds.has(w.id));
      setAvailableWallets(available);

      // Load commands for associated wallets
      const walletIds = associated.map(w => w.id);
      if (walletIds.length > 0) {
        const { data: commandsData, error: commandsError } = await supabase
          .from('blackbox_command_codes')
          .select('*')
          .in('wallet_id', walletIds);

        if (commandsError) throw commandsError;
        setCommands(commandsData || []);
      } else {
        setCommands([]);
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

  const associateWallet = async (walletId: string) => {
    try {
      const { error } = await supabase
        .from('campaign_wallets')
        .insert({
          campaign_id: campaign.id,
          wallet_id: walletId
        });

      if (error) throw error;

      toast({
        title: "Success",
        description: "Wallet associated with campaign",
      });

      loadCampaignData();
    } catch (error) {
      console.error('Error associating wallet:', error);
      toast({
        title: "Error",
        description: "Failed to associate wallet",
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

  const deleteCommand = async (commandId: string) => {
    const ok = window.confirm('Delete this command? This action cannot be undone.');
    if (!ok) return;
    try {
      const { error } = await supabase
        .from('blackbox_command_codes')
        .delete()
        .eq('id', commandId);
      if (error) throw error;
      toast({ title: 'Deleted', description: 'Command removed successfully.' });
      loadCampaignData();
    } catch (error) {
      console.error('Error deleting command:', error);
      toast({ title: 'Error', description: 'Failed to delete command', variant: 'destructive' });
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent>
          <p className="text-muted-foreground">Loading...</p>
        </CardContent>
      </Card>
    );
  }

  if (!campaign) {
    return null;
  }

  return (
    <Card>
      <CardContent className="space-y-6">
        {/* Commands */}
        <div>
          <h3 className="font-semibold mb-3">Commands</h3>
          {commands.length === 0 ? (
            <div className="border border-dashed rounded-lg p-4 text-center">
              <p className="text-muted-foreground mb-3">No commands assigned yet</p>
              <p className="text-sm text-muted-foreground">
                Create commands and assign them to campaign wallets
              </p>
            </div>
          ) : (
            <div className="grid gap-2">
              {commands.map((command) => (
                <div key={command.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <h4 className="font-medium">{command.name}</h4>
                    <p className="text-sm text-muted-foreground">
                      Type: {command.config?.type || 'Unknown'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={command.is_active ? "default" : "secondary"}>
                      {command.is_active ? "Active" : "Inactive"}
                    </Badge>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => toggleCommand(command)}
                    >
                      {command.is_active ? (
                        <>
                          <Pause className="h-4 w-4 mr-1" />
                          Pause
                        </>
                      ) : (
                        <>
                          <Play className="h-4 w-4 mr-1" />
                          Start
                        </>
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => deleteCommand(command.id)}
                      aria-label="Delete command"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}