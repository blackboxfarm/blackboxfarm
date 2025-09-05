import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle2, AlertTriangle, Wallet, DollarSign, Info } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

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
}

interface CommandCode {
  id: string;
  name: string;
  config: any;
  is_active: boolean;
}

interface CampaignActivationGuideProps {
  campaign: Campaign;
  onCampaignUpdate?: (updatedCampaign: Campaign) => void;
}

export function CampaignActivationGuide({ campaign, onCampaignUpdate }: CampaignActivationGuideProps) {
  const [wallets, setWallets] = useState<WalletData[]>([]);
  const [commands, setCommands] = useState<CommandCode[]>([]);
  const [loading, setLoading] = useState(false);
  const [buttonState, setButtonState] = useState<'idle' | 'starting' | 'stopping' | 'success'>('idle');

  useEffect(() => {
    loadCampaignData();
    
    // Set up real-time subscriptions
    const campaignChannel = supabase
      .channel('campaign-changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'blackbox_campaigns',
        filter: `id=eq.${campaign.id}`
      }, () => {
        loadCampaignData();
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'blackbox_wallets',
        filter: `campaign_id=eq.${campaign.id}`
      }, () => {
        loadCampaignData();
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'blackbox_command_codes'
      }, () => {
        loadCampaignData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(campaignChannel);
    };
  }, [campaign.id]);

  const loadCampaignData = async () => {
    // Load wallets
    const { data: walletsData } = await supabase
      .from('blackbox_wallets')
      .select('*')
      .eq('campaign_id', campaign.id);

    setWallets(walletsData || []);

    // Load commands for all wallets
    if (walletsData && walletsData.length > 0) {
      const walletIds = walletsData.map(w => w.id);
      const { data: commandsData } = await supabase
        .from('blackbox_command_codes')
        .select('*')
        .in('wallet_id', walletIds);

      setCommands(commandsData || []);
    }
  };

  const toggleCampaign = async () => {
    setLoading(true);
    const newStatus = !campaign.is_active;
    
    try {
      // Set loading state based on action
      setButtonState(newStatus ? 'starting' : 'stopping');
      
      const { error } = await supabase
        .from('blackbox_campaigns')
        .update({ is_active: newStatus })
        .eq('id', campaign.id);

      if (error) throw error;

      // Simulate processing time for cron queue operations
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Show success state
      setButtonState('success');
      
      // Update parent component
      onCampaignUpdate?.({ ...campaign, is_active: newStatus });

      toast({
        title: newStatus ? "Campaign Added Successfully! 🚀" : "Campaign Removed Successfully ⏹️",
        description: newStatus 
          ? "Your campaign has been added to the trading queue."
          : "Your campaign has been removed from the trading queue."
      });

      // Reset to idle after showing success
      setTimeout(() => setButtonState('idle'), 2000);
      
      // Reload data to reflect changes
      loadCampaignData();
    } catch (error: any) {
      setButtonState('idle');
      toast({
        title: newStatus ? "Failed to Start Campaign" : "Failed to Stop Campaign",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  // Check requirements
  const hasWallets = wallets.length > 0;
  const hasEnabledWallets = wallets.some(w => w.is_active);
  const hasFundedWallets = wallets.some(w => w.sol_balance > 0);
  const hasCommands = commands.length > 0;
  const hasEnabledCommands = commands.some(c => c.is_active);
  
  const totalBalance = wallets.reduce((sum, w) => sum + w.sol_balance, 0);
  const estimatedDailyCost = commands.reduce((sum, cmd) => {
    if (!cmd.is_active) return sum;
    const config = cmd.config;
    if (config.type === "simple") {
      const tradesPerDay = (24 * 60 * 60) / config.buyInterval;
      return sum + (tradesPerDay * config.buyAmount);
    }
    return sum + 1; // Conservative estimate for complex commands
  }, 0);

  // CRITICAL: Campaign status determines if it's added to the Cron Service
  // Trading will ONLY start when ALL three requirements are met:
  // 1. At least one enabled wallet
  // 2. At least one funded wallet  
  // 3. At least one enabled command
  const canEnable = hasEnabledWallets && hasFundedWallets && hasEnabledCommands;
  const isReady = hasWallets && hasFundedWallets && hasCommands;

  const getStatusIcon = (condition: boolean) => 
    condition ? <CheckCircle2 className="h-5 w-5 text-green-500" /> : <AlertTriangle className="h-5 w-5 text-orange-500" />;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            Campaign Status
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Current Status */}
        <div className="text-center p-4 border rounded-lg">
          <Badge variant={campaign.is_active ? "default" : "secondary"} className="text-lg px-4 py-2">
            {campaign.is_active ? "🟢 ACTIVE" : "⚪ NOT ACTIVE"}
          </Badge>
          <p className="text-sm text-muted-foreground mt-2">
            {campaign.is_active ? "Campaign is enabled and added to Cron Service" : "Campaign is disabled and not in Cron Service"}
          </p>
        </div>

        {/* Requirements Checklist */}
        <div className="space-y-3">
          <h3 className="font-medium flex items-center gap-2">
            <Info className="h-4 w-4" />
            Campaign Requirements
          </h3>
          
          <div className="space-y-2">
            <div className="flex items-center gap-3 p-3 border rounded-lg">
              {getStatusIcon(hasEnabledWallets)}
              <div className="flex-1">
                <p className="font-medium">Enabled Wallets</p>
                <p className="text-sm text-muted-foreground">
                  {hasEnabledWallets 
                    ? `✓ ${wallets.filter(w => w.is_active).length} of ${wallets.length} wallet(s) enabled` 
                    : hasWallets 
                      ? "Enable at least one wallet for trading"
                      : "Create and enable at least one wallet for trading"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 border rounded-lg">
              {getStatusIcon(hasFundedWallets)}
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Wallet className="h-4 w-4" />
                  <p className="font-medium">Fund Wallets</p>
                </div>
                <p className="text-sm text-muted-foreground">
                  {hasFundedWallets 
                    ? `✓ Total balance: ${totalBalance.toFixed(4)} SOL` 
                    : "⚠️ No funds detected - transfer SOL to your wallets"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 border rounded-lg">
              {getStatusIcon(hasEnabledCommands)}
              <div className="flex-1">
                <p className="font-medium">Enabled Commands</p>
                <p className="text-sm text-muted-foreground">
                  {hasEnabledCommands 
                    ? `✓ ${commands.filter(c => c.is_active).length} of ${commands.length} command(s) enabled` 
                    : hasCommands 
                      ? "Enable at least one command for trading"
                      : "Create and enable trading commands"}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Cost Estimation */}
        {estimatedDailyCost > 0 && (
          <Alert>
            <DollarSign className="h-4 w-4" />
            <AlertDescription>
              <div className="space-y-1">
                <p className="font-medium">Estimated Daily Trading Cost</p>
                <p>~{estimatedDailyCost.toFixed(4)} SOL per day based on current active commands</p>
                <p className="text-xs text-muted-foreground">
                  This estimate assumes commands run continuously. Actual costs may vary based on market conditions.
                </p>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Balance Warning */}
        {hasWallets && !hasFundedWallets && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <div className="space-y-2">
                <p className="font-medium">⚠️ No Funds Detected</p>
                <p>Your wallets have 0 SOL balance. Transfer funds to start trading:</p>
                <div className="space-y-1 font-mono text-xs">
                  {wallets.map(wallet => (
                    <div key={wallet.id} className="p-2 bg-muted rounded">
                      {wallet.pubkey}
                    </div>
                  ))}
                </div>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Low Balance Warning */}
        {hasFundedWallets && estimatedDailyCost > 0 && totalBalance < estimatedDailyCost * 2 && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <p className="font-medium">⚠️ Low Balance Warning</p>
              <p>Current balance ({totalBalance.toFixed(4)} SOL) may only last ~{(totalBalance / estimatedDailyCost).toFixed(1)} days based on your trading configuration.</p>
            </AlertDescription>
          </Alert>
        )}

        {/* CAMPAIGN CONTROL */}
        <div className="pt-4 border-t">
          <div className="text-center space-y-4">
            {/* Big START/STOP Button */}
            <Button
              size="lg"
              className="w-48 h-12 text-sm font-bold"
              variant={
                buttonState === 'success' ? "default" :
                campaign.is_active && buttonState === 'idle' ? "destructive" : "default"
              }
              disabled={loading || (!canEnable && !campaign.is_active)}
              onClick={toggleCampaign}
            >
              {buttonState === 'starting' && "Starting Campaign Queue..."}
              {buttonState === 'stopping' && "Removing Campaign from Queue..."}
              {buttonState === 'success' && !campaign.is_active && "Campaign Added Successfully!"}
              {buttonState === 'success' && campaign.is_active && "Campaign Removed Successfully!"}
              {buttonState === 'idle' && campaign.is_active && "STOP"}
              {buttonState === 'idle' && !campaign.is_active && "START"}
            </Button>
            
            {/* Requirements Status Indicators */}
            <div className="flex justify-center items-center gap-6 p-4 border rounded-lg bg-muted/50">
              <div className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full ${hasEnabledWallets ? 'bg-green-500' : 'bg-red-500'}`} />
                <span className="text-sm font-medium">Campaign</span>
              </div>
              <div className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full ${hasFundedWallets ? 'bg-green-500' : 'bg-red-500'}`} />
                <span className="text-sm font-medium">Wallet</span>
              </div>
              <div className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full ${hasEnabledCommands ? 'bg-green-500' : 'bg-red-500'}`} />
                <span className="text-sm font-medium">Commands</span>
              </div>
            </div>
            
            {!canEnable && !campaign.is_active && (
              <p className="text-xs text-muted-foreground">
                All three indicators must be green to start the campaign
              </p>
            )}
          </div>
        </div>

        {/* No Plan Required Notice */}
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            <p className="font-medium">💡 No Subscription Required</p>
            <p>BlackBox operates on a pay-per-trade model. You only pay small fees for executed trades - no monthly subscriptions needed!</p>
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}