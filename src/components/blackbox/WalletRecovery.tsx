import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Wallet, Link } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface OrphanedWallet {
  id: string;
  pubkey: string;
  sol_balance: number;
  is_active: boolean;
  created_at: string;
}

interface Campaign {
  id: string;
  nickname: string;
  token_address: string;
  is_active: boolean;
}

interface WalletRecoveryProps {
  campaigns: Campaign[];
  onWalletRecovered: () => void;
}

export function WalletRecovery({ campaigns, onWalletRecovered }: WalletRecoveryProps) {
  const [orphanedWallets, setOrphanedWallets] = useState<OrphanedWallet[]>([]);
  const [loading, setLoading] = useState(true);
  const [associating, setAssociating] = useState<string | null>(null);
  const [purging, setPurging] = useState(false);

  useEffect(() => {
    loadOrphanedWallets();
  }, []);

  const loadOrphanedWallets = async () => {
    try {
      // Find wallets that don't have campaign associations
      const { data: walletsData, error: walletsError } = await supabase
        .from('blackbox_wallets')
        .select('*')
        .order('created_at', { ascending: false });

      if (walletsError) throw walletsError;

      // Find which wallets have campaign associations
      const { data: associationsData, error: associationsError } = await supabase
        .from('campaign_wallets')
        .select('wallet_id');

      if (associationsError) throw associationsError;

      const associatedWalletIds = new Set(
        associationsData?.map(a => a.wallet_id) || []
      );

      // Filter to only orphaned wallets and exclude placeholders
      const orphaned = walletsData?.filter(w => 
        !associatedWalletIds.has(w.id) && !String(w.pubkey || '').includes('PLACEHOLDER')
      ) || [];

      setOrphanedWallets(orphaned);
    } catch (error) {
      console.error('Error loading orphaned wallets:', error);
      toast({
        title: "Error",
        description: "Failed to load orphaned wallets",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const associateWalletWithCampaign = async (walletId: string, campaignId: string) => {
    setAssociating(walletId);
    try {
      const { error } = await supabase
        .from('campaign_wallets')
        .insert({
          campaign_id: campaignId,
          wallet_id: walletId
        });

      if (error) throw error;

      toast({
        title: "Success",
        description: "Wallet successfully associated with campaign",
      });

      // Refresh the orphaned wallets list
      await loadOrphanedWallets();
      onWalletRecovered();
    } catch (error) {
      console.error('Error associating wallet:', error);
      toast({
        title: "Error",
        description: "Failed to associate wallet with campaign",
        variant: "destructive",
      });
    } finally {
      setAssociating(null);
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
      toast({
        title: 'Placeholders removed',
        description: `Deleted ${data?.length || 0} placeholder wallet(s)`
      });
      await loadOrphanedWallets();
    } catch (error) {
      console.error('Failed to purge placeholders:', error);
      toast({ title: 'Error', description: 'Failed to delete placeholder wallets', variant: 'destructive' });
    } finally {
      setPurging(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            Wallet Recovery
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Loading orphaned wallets...</p>
        </CardContent>
      </Card>
    );
  }

  if (orphanedWallets.length === 0) {
    return null;
  }

  return (
    <Card className="border-destructive/20 bg-destructive/5">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-destructive">
            <Wallet className="h-5 w-5" />
            Wallet Recovery - {orphanedWallets.length} Orphaned Wallet(s)
          </CardTitle>
          <Button variant="outline" size="sm" onClick={purgePlaceholders} disabled={purging}>
            {purging ? 'Deleting…' : 'Delete placeholders'}
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          These wallets were disconnected from campaigns but still contain funds. 
          Associate them with your campaigns to recover access.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {orphanedWallets.map((wallet) => (
          <div key={wallet.id} className="p-4 border rounded-lg bg-card">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <code className="text-sm font-mono bg-muted px-2 py-1 rounded">
                    {wallet.pubkey.slice(0, 8)}...{wallet.pubkey.slice(-8)}
                  </code>
                  <Badge variant={wallet.is_active ? "default" : "secondary"}>
                    {wallet.is_active ? "Active" : "Inactive"}
                  </Badge>
                </div>
                <div className="text-sm text-muted-foreground">
                  Balance: <span className="font-semibold text-primary">
                    {wallet.sol_balance.toFixed(6)} SOL
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  Created: {new Date(wallet.created_at).toLocaleDateString()}
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium">Associate with campaign:</p>
                <div className="flex flex-wrap gap-2">
                  {campaigns.map((campaign) => (
                    <Button
                      key={campaign.id}
                      size="sm"
                      variant="outline"
                      disabled={associating === wallet.id}
                      onClick={() => associateWalletWithCampaign(wallet.id, campaign.id)}
                      className="flex items-center gap-1"
                    >
                      <Link className="h-3 w-3" />
                      {campaign.nickname}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}