import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Wallet, Settings, TestTube, RefreshCw, ArrowLeftRight, TrendingDown, Coins } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { WalletCommands } from "./WalletCommands";
import { WalletTokenManager } from "./WalletTokenManager";

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
  const [tokenBalances, setTokenBalances] = useState<Record<string, number>>({});
  const [sellingWallets, setSellingWallets] = useState<Set<string>>(new Set());

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
          console.log('Campaign wallets changed, reloading...');
          loadWallets();
        })
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'blackbox_wallets'
        }, () => {
          console.log('Blackbox wallets changed, reloading...');
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
    
    // Load token balances for campaign token
    if (walletsWithDevBalances.length > 0 && campaign?.token_address) {
      loadTokenBalances(walletsWithDevBalances);
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

  const loadTokenBalances = async (walletsList: WalletData[]) => {
    if (!campaign?.token_address) return;
    
    const balances: Record<string, number> = {};
    
    for (const wallet of walletsList) {
      try {
        // Get wallet with secret key for token balance check
        const { data: walletData, error: walletError } = await supabase
          .from('blackbox_wallets')
          .select('id, pubkey, secret_key_encrypted')
          .eq('id', wallet.id)
          .single();

        if (walletError || !walletData) {
          console.error(`Error fetching wallet data for ${wallet.pubkey}:`, walletError);
          balances[wallet.id] = 0;
          continue;
        }

        // Invoke via Supabase client to include required headers automatically
        const { data, error } = await supabase.functions.invoke('trader-wallet', {
          body: { tokenMint: campaign.token_address },
          headers: { 'x-owner-secret': walletData.secret_key_encrypted },
        });

        if (error) {
          console.error(`Error fetching token balance for wallet ${wallet.pubkey}:`, error);
          balances[wallet.id] = 0;
        } else {
          balances[wallet.id] = data?.tokenUiAmount || 0;
        }
      } catch (error) {
        console.error(`Error fetching token balance for wallet ${wallet.pubkey}:`, error);
        balances[wallet.id] = 0;
      }
    }
    
    setTokenBalances(balances);
  };

  const sellAllTokensForWallet = async (wallet: WalletData, forceSell = false) => {
    const tokenBalance = tokenBalances[wallet.id] || 0;
    
    if (!campaign?.token_address) {
      toast({
        title: "Error",
        description: "No token address set for this campaign",
        variant: "destructive"
      });
      return;
    }

    if (!forceSell && tokenBalance === 0) {
      const confirmForce = window.confirm(
        `No token balance detected for wallet ${wallet.pubkey.slice(0, 8)}...${wallet.pubkey.slice(-8)}. This might be due to balance loading issues. Force sell anyway?`
      );
      if (!confirmForce) return;
    }

    // Confirmation dialog
    const balanceText = tokenBalance > 0 ? `${tokenBalance.toFixed(6)} tokens` : 'all available tokens';
    const confirmed = window.confirm(
      `Sell ${balanceText} from wallet ${wallet.pubkey.slice(0, 8)}...${wallet.pubkey.slice(-8)} for campaign "${campaign.nickname}"?`
    );
    
    if (!confirmed) return;

    setSellingWallets(prev => new Set(prev).add(wallet.id));

    try {
      // Get commands specifically for this wallet
      const { data: commandsData, error: commandsError } = await supabase
        .from('blackbox_command_codes')
        .select('id, name, is_active')
        .eq('wallet_id', wallet.id)
        .eq('is_active', true);

      if (commandsError) {
        throw new Error(`Failed to fetch commands: ${commandsError.message}`);
      }

      if (!commandsData || commandsData.length === 0) {
        toast({
          title: "Error", 
          description: "No active commands found for this wallet",
          variant: "destructive"
        });
        return;
      }

      const successfulSells: string[] = [];
      const failedSells: string[] = [];

      // Execute sell for all commands on this specific wallet
      for (const command of commandsData) {
        try {
          const { data, error } = await supabase.functions.invoke('blackbox-executor', {
            body: {
              command_code_id: command.id,
              action: 'sell'
            }
          });

          if (error) {
            console.error(`Sell failed for command ${command.name}:`, error);
            failedSells.push(command.name);
          } else {
            console.log(`Sell successful for command ${command.name}:`, data);
            successfulSells.push(command.name);
          }
        } catch (error) {
          console.error(`Sell error for command ${command.name}:`, error);
          failedSells.push(command.name);
        }
      }

      // Show results
      if (successfulSells.length > 0) {
        toast({
          title: "Sell All Completed",
          description: `Successfully sold tokens for: ${successfulSells.join(', ')}${failedSells.length > 0 ? `. Failed: ${failedSells.join(', ')}` : ''}`,
          variant: successfulSells.length > failedSells.length ? "default" : "destructive"
        });
      } else if (failedSells.length > 0) {
        toast({
          title: "Sell All Failed",
          description: `Failed to sell tokens for: ${failedSells.join(', ')}`,
          variant: "destructive"
        });
      }

      // Refresh balances after selling
      setTimeout(() => {
        loadWallets();
      }, 2000);

    } catch (error: any) {
      console.error('Sell all error:', error);
      toast({
        title: "Sell All Error",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setSellingWallets(prev => {
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
                        {campaign?.token_address && (
                          <p className="text-sm text-muted-foreground">
                            • Tokens: {(tokenBalances[wallet.id] || 0).toFixed(6)}
                          </p>
                        )}
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
                      {!isDevMode && tokenBalances[wallet.id] > 0 && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            sellAllTokensForWallet(wallet);
                          }}
                          disabled={sellingWallets.has(wallet.id)}
                          className="text-xs"
                        >
                          {sellingWallets.has(wallet.id) ? (
                            "Selling..."
                          ) : (
                            <>
                              <TrendingDown className="h-3 w-3 mr-1" />
                              Sell All Tokens
                            </>
                          )}
                        </Button>
                      )}
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
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          sellAllTokensForWallet(wallet);
                        }}
                        disabled={sellingWallets.has(wallet.id)}
                        className="text-xs"
                      >
                        {sellingWallets.has(wallet.id) ? (
                          "Selling..."
                        ) : (
                          <>
                            <Coins className="h-3 w-3 mr-1" />
                            Sell All ({tokenBalances[wallet.id]?.toFixed(2) || '?'})
                          </>
                        )}
                      </Button>
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
                      
                      {/* Token Manager for each wallet */}
                      <WalletTokenManager 
                        walletId={wallet.id}
                        walletPubkey={wallet.pubkey}
                        onTokensSold={() => {
                          loadWallets();
                          loadTokenBalances([wallet]);
                        }}
                      />
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

          {/* Orphaned Wallets Section */}
          <OrphanedWallets onWalletAction={loadWallets} />

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

    // Orphaned Wallets Component
    function OrphanedWallets({ onWalletAction }: { onWalletAction: () => void }) {
      const [orphanedWallets, setOrphanedWallets] = useState<WalletData[]>([]);
      const [isLoading, setIsLoading] = useState(false);
      const [purging, setPurging] = useState(false);

      const loadOrphanedWallets = async () => {
        setIsLoading(true);
        try {
          // Get all wallets that are not assigned to any campaign
          const { data, error } = await supabase
            .from('blackbox_wallets')
            .select(`
              *,
              campaign_wallets!left(campaign_id)
            `)
            .is('campaign_wallets.campaign_id', null)
            .eq('is_active', true)
            .not('pubkey', 'ilike', '%PLACEHOLDER%')
            .order('created_at', { ascending: false });

          if (error) {
            console.error('Error loading orphaned wallets:', error);
            return;
          }

          setOrphanedWallets(data || []);
        } catch (error) {
          console.error('Error loading orphaned wallets:', error);
        } finally {
          setIsLoading(false);
        }
      };

      const purgePlaceholders = async () => {
        if (purging) return;
        setPurging(true);
        try {
          const { data, error } = await supabase
            .from('blackbox_wallets')
            .delete()
            .ilike('pubkey', '%PLACEHOLDER%')
            .select('id');
          if (error) throw error;
          toast({ title: 'Placeholders removed', description: `Deleted ${data?.length || 0} placeholder wallet(s)` });
          await loadOrphanedWallets();
          onWalletAction();
        } catch (error: any) {
          console.error('Failed to purge placeholders:', error);
          toast({ title: 'Error', description: error.message || 'Failed to delete placeholder wallets', variant: 'destructive' });
        } finally {
          setPurging(false);
        }
      };

      useEffect(() => {
        loadOrphanedWallets();
        
        // Set up real-time updates for orphaned wallets
        const orphanChannel = supabase
          .channel('orphan-wallet-changes')
          .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'campaign_wallets'
          }, () => {
            console.log('Campaign wallets changed, refreshing orphaned wallets...');
            loadOrphanedWallets();
          })
          .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'blackbox_wallets'
          }, () => {
            console.log('Blackbox wallets changed, refreshing orphaned wallets...');
            loadOrphanedWallets();
          })
          .subscribe();

        return () => {
          supabase.removeChannel(orphanChannel);
        };
      }, []);

      if (isLoading) {
        return (
          <Card>
            <CardHeader>
              <CardTitle>Orphaned Wallets</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-4">
                <RefreshCw className="h-4 w-4 animate-spin mx-auto mb-2" />
                Loading orphaned wallets...
              </div>
            </CardContent>
          </Card>
        );
      }

      if (orphanedWallets.length === 0) {
        return null;
      }

      return (
        <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5" />
              Orphaned Wallets ({orphanedWallets.length})
            </CardTitle>
            <Button variant="outline" size="sm" onClick={purgePlaceholders} disabled={purging}>
              {purging ? 'Deleting…' : 'Delete placeholders'}
            </Button>
          </div>
        </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {orphanedWallets.map((wallet) => (
                <div key={wallet.id} className="p-4 border rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => navigator.clipboard.writeText(wallet.pubkey)}
                        className="text-sm bg-muted px-2 py-1 rounded font-mono hover:bg-muted/80 transition-colors cursor-pointer"
                        title="Click to copy full address"
                      >
                        {wallet.pubkey}
                      </button>
                      <Badge variant="outline">Orphaned</Badge>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {wallet.sol_balance.toFixed(4)} SOL
                    </div>
                  </div>
                  
                  <WalletTokenManager 
                    walletId={wallet.id}
                    walletPubkey={wallet.pubkey}
                    isOrphaned={true}
                    onTokensSold={() => {
                      onWalletAction();
                      loadOrphanedWallets();
                    }}
                  />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      );
    }