import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle2, AlertTriangle, Wallet, DollarSign, Play, Info } from "lucide-react";
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
}

export function CampaignActivationGuide({ campaign }: CampaignActivationGuideProps) {
  const [wallets, setWallets] = useState<WalletData[]>([]);
  const [commands, setCommands] = useState<CommandCode[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadCampaignData();
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

  const activateCampaign = async () => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('blackbox_campaigns')
        .update({ is_active: true })
        .eq('id', campaign.id);

      if (error) throw error;

      toast({
        title: "Campaign Activated! 🚀",
        description: "Your campaign is now live and trading will begin automatically."
      });

      // Reload data to reflect changes
      loadCampaignData();
    } catch (error: any) {
      toast({
        title: "Activation Failed",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  // Check activation requirements
  const hasWallets = wallets.length > 0;
  const hasFundedWallets = wallets.some(w => w.sol_balance > 0);
  const hasCommands = commands.length > 0;
  const hasActiveCommands = commands.some(c => c.is_active);
  
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

  const canActivate = hasWallets && hasFundedWallets && hasActiveCommands && !campaign.is_active;
  const isReady = hasWallets && hasFundedWallets && hasCommands;

  const getStatusIcon = (condition: boolean) => 
    condition ? <CheckCircle2 className="h-5 w-5 text-green-500" /> : <AlertTriangle className="h-5 w-5 text-orange-500" />;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Play className="h-5 w-5" />
          Campaign Activation Status
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Current Status */}
        <div className="text-center p-4 border rounded-lg">
          <Badge variant={campaign.is_active ? "default" : "secondary"} className="text-lg px-4 py-2">
            {campaign.is_active ? "🟢 ACTIVE" : "⏸️ PAUSED"}
          </Badge>
          <p className="text-sm text-muted-foreground mt-2">
            {campaign.is_active ? "Campaign is live and trading" : "Campaign is ready to activate"}
          </p>
        </div>

        {/* Activation Checklist */}
        <div className="space-y-3">
          <h3 className="font-medium flex items-center gap-2">
            <Info className="h-4 w-4" />
            Activation Requirements
          </h3>
          
          <div className="space-y-2">
            <div className="flex items-center gap-3 p-3 border rounded-lg">
              {getStatusIcon(hasWallets)}
              <div className="flex-1">
                <p className="font-medium">Generate Wallets</p>
                <p className="text-sm text-muted-foreground">
                  {hasWallets ? `✓ ${wallets.length} wallet(s) created` : "Create at least one wallet for trading"}
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
              {getStatusIcon(hasActiveCommands)}
              <div className="flex-1">
                <p className="font-medium">Configure Commands</p>
                <p className="text-sm text-muted-foreground">
                  {hasActiveCommands 
                    ? `✓ ${commands.filter(c => c.is_active).length} active command(s)` 
                    : hasCommands 
                      ? "⚠️ Commands created but none are active"
                      : "Create and activate trading commands"}
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

        {/* Activation Button */}
        <div className="pt-4 border-t">
          {campaign.is_active ? (
            <div className="text-center text-muted-foreground">
              <p>✅ Campaign is currently active and trading</p>
            </div>
          ) : (
            <Button 
              onClick={activateCampaign}
              disabled={!canActivate || loading}
              className="w-full"
              size="lg"
            >
              {loading ? "Activating..." : canActivate ? "🚀 Activate Campaign" : "Complete Requirements to Activate"}
            </Button>
          )}
          
          {!canActivate && !campaign.is_active && (
            <p className="text-xs text-muted-foreground text-center mt-2">
              Complete all requirements above to enable activation
            </p>
          )}
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