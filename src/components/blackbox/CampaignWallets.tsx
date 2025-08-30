import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Wallet, Settings, Play, Pause, TestTube } from "lucide-react";
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

// Development mode storage key
const DEV_BALANCES_KEY = "blackbox.dev.balances";

interface CampaignWalletsProps {
  campaign: Campaign;
}

export function CampaignWallets({ campaign }: CampaignWalletsProps) {
  const [wallets, setWallets] = useState<WalletData[]>([]);
  const [selectedWallet, setSelectedWallet] = useState<WalletData | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDevMode, setIsDevMode] = useState(false);
  const [devBalances, setDevBalances] = useState<Record<string, number>>({});

  useEffect(() => {
    loadWallets();
    loadDevBalances();
  }, [campaign.id]);

  const loadDevBalances = () => {
    try {
      const stored = localStorage.getItem(DEV_BALANCES_KEY);
      if (stored) {
        setDevBalances(JSON.parse(stored));
      }
    } catch (error) {
      console.warn('Failed to load dev balances:', error);
    }
  };

  const saveDevBalances = (balances: Record<string, number>) => {
    try {
      localStorage.setItem(DEV_BALANCES_KEY, JSON.stringify(balances));
      setDevBalances(balances);
    } catch (error) {
      console.warn('Failed to save dev balances:', error);
    }
  };

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

    const walletsWithDevBalances = (data || []).map(wallet => ({
      ...wallet,
      sol_balance: isDevMode && devBalances[wallet.pubkey] !== undefined 
        ? devBalances[wallet.pubkey] 
        : wallet.sol_balance
    }));
    
    setWallets(walletsWithDevBalances);
    if (walletsWithDevBalances.length > 0 && !selectedWallet) {
      setSelectedWallet(walletsWithDevBalances[0]);
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

  const addDevFunds = (pubkey: string, amount: number = 5) => {
    const newBalances = { ...devBalances, [pubkey]: amount };
    saveDevBalances(newBalances);
    loadWallets(); // Reload to show updated balances
    toast({ 
      title: "Dev funds added", 
      description: `Added ${amount} SOL to wallet for testing` 
    });
  };

  const toggleDevMode = () => {
    setIsDevMode(!isDevMode);
    loadWallets(); // Reload to show real or dev balances
    toast({ 
      title: isDevMode ? "Dev mode disabled" : "Dev mode enabled", 
      description: isDevMode ? "Showing real balances" : "Showing simulated balances" 
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5" />
              {campaign.nickname} - Wallets
              {isDevMode && <Badge variant="outline" className="text-xs">DEV MODE</Badge>}
            </CardTitle>
            <div className="flex gap-2">
              <Button 
                onClick={toggleDevMode} 
                variant="outline"
                size="sm"
              >
                <TestTube className="h-4 w-4 mr-2" />
                {isDevMode ? "Exit Dev Mode" : "Dev Mode"}
              </Button>
              <Button 
                onClick={generateWallet} 
                disabled={isGenerating || wallets.length >= 10}
                size="sm"
              >
                <Plus className="h-4 w-4 mr-2" />
                {isGenerating ? "Generating..." : "Generate Wallet"}
              </Button>
            </div>
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
                        {isDevMode && <span className="text-yellow-500 ml-2">(SIMULATED)</span>}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {isDevMode && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            addDevFunds(wallet.pubkey, 5);
                          }}
                          className="text-xs"
                        >
                          +5 SOL
                        </Button>
                      )}
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
        <WalletCommands 
          wallet={selectedWallet} 
          campaign={campaign} 
          isDevMode={isDevMode}
          devBalance={devBalances[selectedWallet.pubkey]}
        />
      )}
    </div>
  );
}