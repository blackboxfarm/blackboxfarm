import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Wallet, Settings, TestTube, RefreshCw, ArrowLeftRight } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
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
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [withdrawingWallets, setWithdrawingWallets] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (campaign?.id) {
      loadWallets();
      loadDevBalances();
      
      // Set up real-time subscriptions for wallet changes
      const walletChannel = supabase
        .channel('wallet-changes')
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'campaign_wallets'
        }, () => {
          loadWallets();
        })
        .subscribe();

      return () => {
        supabase.removeChannel(walletChannel);
      };
    }
  }, [campaign?.id]);

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
    if (!campaign?.id) return;
    
    const { data, error } = await supabase
      .from('campaign_wallets')
      .select(`
        wallet:blackbox_wallets(*)
      `)
      .eq('campaign_id', campaign.id)
      .order('created_at', { ascending: false });

    if (error) {
      toast({ title: "Error loading wallets", description: error.message });
      return;
    }

    const walletsWithDevBalances = (data || []).map(item => {
      const wallet = item.wallet;
      return {
        ...wallet,
        sol_balance: isDevMode && devBalances[wallet.pubkey] !== undefined 
          ? devBalances[wallet.pubkey] 
          : wallet.sol_balance
      };
    });
    
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
      title: wallet.is_active ? "Wallet disabled" : "Wallet enabled", 
      description: `Wallet ${wallet.pubkey.slice(0, 8)}... ${wallet.is_active ? 'disabled' : 'enabled'}` 
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

  const refreshWalletBalances = async () => {
    if (isRefreshing) return;
    
    setIsRefreshing(true);
    try {
      toast({
        title: "Refreshing balances...",
        description: "Updating wallet balances from blockchain"
      });

      const { data, error } = await supabase.functions.invoke('refresh-wallet-balances');
      
      if (error) {
        throw new Error(error.message);
      }
      
      // Wait a moment for the database to update, then reload wallets
      setTimeout(() => {
        loadWallets();
      }, 1000);
      
      toast({
        title: "Balances updated",
        description: `Successfully refreshed ${data?.updated || 'wallet'} balances`
      });
    } catch (error: any) {
      console.error('Failed to refresh balances:', error);
      toast({
        title: "Refresh failed",
        description: error.message || "Failed to refresh wallet balances",
        variant: "destructive"
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  const withdrawToDepositor = async (wallet: WalletData) => {
    if (withdrawingWallets.has(wallet.id)) return;

    // Confirmation dialog
    const confirmed = window.confirm(
      `Withdraw ALL SOL from wallet ${wallet.pubkey.slice(0, 8)}...${wallet.pubkey.slice(-8)} back to the original depositor?\n\nThis will return approximately ${wallet.sol_balance.toFixed(4)} SOL minus network fees.`
    );
    
    if (!confirmed) return;

    setWithdrawingWallets(prev => new Set(prev).add(wallet.id));
    
    try {
      toast({
        title: "Withdrawing funds...",
        description: "Tracing original depositor and returning SOL"
      });

      const { data, error } = await supabase.functions.invoke('blackbox-wallet-withdrawal', {
        body: { wallet_id: wallet.id }
      });

      if (error) {
        throw new Error(error.message);
      }

      toast({
        title: "Withdrawal successful! 🎉",
        description: (
          <div className="space-y-2">
            <p>{data.message}</p>
            <a 
              href={data.explorerUrl} 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 underline text-sm"
            >
              View on Solscan →
            </a>
          </div>
        )
      });

      // Refresh wallet balances
      setTimeout(() => {
        loadWallets();
      }, 1000);

    } catch (error: any) {
      console.error('Withdrawal failed:', error);
      toast({
        title: "Withdrawal failed",
        description: error.message || "Failed to withdraw funds",
        variant: "destructive"
      });
    } finally {
      setWithdrawingWallets(prev => {
        const newSet = new Set(prev);
        newSet.delete(wallet.id);
        return newSet;
      });
    }
  };

  if (!campaign) {
    return null;
  }

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
                        <button
                          onClick={() => navigator.clipboard.writeText(wallet.pubkey)}
                          className="text-sm bg-muted px-2 py-1 rounded font-mono hover:bg-muted/80 transition-colors cursor-pointer"
                          title="Click to copy full address"
                        >
                          {wallet.pubkey}
                        </button>
                        <Badge variant={wallet.is_active ? "default" : "secondary"}>
                          {wallet.is_active ? "Enabled" : "Disabled"}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <p className="text-sm text-muted-foreground">
                          Balance: {wallet.sol_balance.toFixed(4)} SOL
                          {isDevMode && <span className="text-yellow-500 ml-2">(SIMULATED)</span>}
                        </p>
                        {!isDevMode && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              refreshWalletBalances();
                            }}
                            disabled={isRefreshing}
                            className="h-6 w-6 p-0"
                          >
                            <RefreshCw className={`h-3 w-3 ${isRefreshing ? 'animate-spin' : ''}`} />
                          </Button>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {!isDevMode && wallet.sol_balance > 0 && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            withdrawToDepositor(wallet);
                          }}
                          disabled={withdrawingWallets.has(wallet.id)}
                          className="text-xs"
                        >
                          {withdrawingWallets.has(wallet.id) ? (
                            "Withdrawing..."
                          ) : (
                            <>
                              <ArrowLeftRight className="h-3 w-3 mr-1" />
                              Withdraw to Depositor
                            </>
                          )}
                        </Button>
                      )}
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
                      <div className="flex items-center gap-2">
                        <Label htmlFor={`wallet-${wallet.id}`} className="text-xs">
                          {wallet.is_active ? "Enabled" : "Disabled"}
                        </Label>
                        <Switch
                          id={`wallet-${wallet.id}`}
                          checked={wallet.is_active}
                          onCheckedChange={(checked) => {
                            toggleWallet(wallet);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          disabled={campaign.is_active}
                        />
                      </div>
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