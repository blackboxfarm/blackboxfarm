import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Wallet, Settings, Play, Pause } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { WalletCommands } from "./WalletCommands";

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
  created_at: string;
}

interface CampaignWalletsProps {
  campaign: Campaign;
}

export function CampaignWallets({ campaign }: CampaignWalletsProps) {
  const [wallets, setWallets] = useState<WalletData[]>([]);
  const [selectedWallet, setSelectedWallet] = useState<WalletData | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    loadWallets();
  }, [campaign.id]);

  const loadWallets = async () => {
    const { data, error } = await supabase
      .from('blackbox_wallets')
      .select('*')
      .eq('campaign_id', campaign.id)
      .order('created_at', { ascending: false });

    if (error) {
      toast({ title: "Error loading wallets", description: error.message });
      return;
    }

    setWallets(data || []);
    if (data && data.length > 0 && !selectedWallet) {
      setSelectedWallet(data[0]);
    }
  };

  const generateWallet = async () => {
    setIsGenerating(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('blackbox-wallet-generator', {
        body: { campaign_id: campaign.id }
      });

      if (error) throw error;

      toast({ title: "Wallet generated", description: "New wallet created successfully" });
      loadWallets();
    } catch (error: any) {
      toast({ title: "Error generating wallet", description: error.message });
    } finally {
      setIsGenerating(false);
    }
  };

  const toggleWallet = async (wallet: WalletData) => {
    const { error } = await supabase
      .from('blackbox_wallets')
      .update({ is_active: !wallet.is_active })
      .eq('id', wallet.id);

    if (error) {
      toast({ title: "Error updating wallet", description: error.message });
      return;
    }

    toast({ 
      title: wallet.is_active ? "Wallet deactivated" : "Wallet activated", 
      description: `Wallet ${wallet.pubkey.slice(0, 8)}... updated` 
    });
    loadWallets();
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5" />
              {campaign.nickname} - Wallets
            </CardTitle>
            <Button 
              onClick={generateWallet} 
              disabled={isGenerating || wallets.length >= 10}
              size="sm"
            >
              <Plus className="h-4 w-4 mr-2" />
              {isGenerating ? "Generating..." : "Generate Wallet"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {wallets.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>No wallets generated yet. Create your first wallet to start bumping.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {wallets.map((wallet) => (
                <div
                  key={wallet.id}
                  className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                    selectedWallet?.id === wallet.id 
                      ? "border-primary bg-primary/5" 
                      : "hover:border-primary/50"
                  }`}
                  onClick={() => setSelectedWallet(wallet)}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <code className="text-sm bg-muted px-2 py-1 rounded">
                          {wallet.pubkey.slice(0, 12)}...{wallet.pubkey.slice(-8)}
                        </code>
                        <Badge variant={wallet.is_active ? "default" : "secondary"}>
                          {wallet.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        Balance: {wallet.sol_balance.toFixed(4)} SOL
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleWallet(wallet);
                        }}
                      >
                        {wallet.is_active ? (
                          <Pause className="h-4 w-4" />
                        ) : (
                          <Play className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedWallet(wallet);
                        }}
                      >
                        <Settings className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          
          {wallets.length >= 10 && (
            <p className="text-sm text-muted-foreground mt-4 text-center">
              Maximum 10 wallets per campaign reached.
            </p>
          )}
        </CardContent>
      </Card>

      {selectedWallet && (
        <WalletCommands wallet={selectedWallet} campaign={campaign} />
      )}
    </div>
  );
}