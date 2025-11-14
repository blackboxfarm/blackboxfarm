import { useState, useEffect, useCallback } from 'react';
import { Connection, PublicKey } from '@solana/web3.js';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useLocalSecrets } from '@/hooks/useLocalSecrets';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { ArrowDown, ArrowUp, Copy, Trash2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

interface ChainWallet {
  id: string;
  pubkey: string;
  balance: number;
  position: number;
  is_active: boolean;
}

export function WalletChainManager() {
  const { user } = useAuth();
  const { secrets } = useLocalSecrets();
  const rpcUrl = secrets.rpcUrl;
  const [chainId, setChainId] = useState<string | null>(null);
  const [wallets, setWallets] = useState<ChainWallet[]>([]);
  const [connection, setConnection] = useState<Connection | null>(null);
  const [transferMode, setTransferMode] = useState<'all' | 'sol' | 'percent'>('all');
  const [transferValue, setTransferValue] = useState<number>(0);
  const [isCreating, setIsCreating] = useState(false);
  const [isTransferring, setIsTransferring] = useState<string | null>(null);

  // Initialize connection
  useEffect(() => {
    if (rpcUrl) {
      setConnection(new Connection(rpcUrl, 'confirmed'));
    }
  }, [rpcUrl]);

  // Load existing chain
  useEffect(() => {
    if (!user) return;
    loadChain();
  }, [user]);

  // Poll balances
  useEffect(() => {
    if (!connection || wallets.length === 0) return;

    const interval = setInterval(async () => {
      const updatedWallets = await Promise.all(
        wallets.map(async (wallet) => {
          try {
            const balance = await connection.getBalance(new PublicKey(wallet.pubkey));
            return { ...wallet, balance: balance / 1_000_000_000 };
          } catch (error) {
            console.error(`Failed to fetch balance for ${wallet.pubkey}:`, error);
            return wallet;
          }
        })
      );
      setWallets(updatedWallets);
    }, 5000);

    return () => clearInterval(interval);
  }, [connection, wallets.length]);

  const loadChain = async () => {
    const { data, error } = await supabase
      .from('wallet_chains')
      .select(`
        id,
        parent_wallet_id,
        child_1_wallet_id,
        child_2_wallet_id,
        child_3_wallet_id,
        blackbox_wallets!wallet_chains_parent_wallet_id_fkey(*),
        blackbox_wallets!wallet_chains_child_1_wallet_id_fkey(*),
        blackbox_wallets!wallet_chains_child_2_wallet_id_fkey(*),
        blackbox_wallets!wallet_chains_child_3_wallet_id_fkey(*)
      `)
      .eq('user_id', user?.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Error loading chain:', error);
      return;
    }

    if (data) {
      setChainId(data.id);
      const walletList: ChainWallet[] = [];

      // Map wallets to positions
      if (data.parent_wallet_id) {
        const { data: wallet } = await supabase
          .from('blackbox_wallets')
          .select('*')
          .eq('id', data.parent_wallet_id)
          .single();
        if (wallet && wallet.is_active) {
          walletList.push({ ...wallet, position: 0, balance: wallet.sol_balance || 0 });
        }
      }

      for (let i = 1; i <= 3; i++) {
        const walletId = data[`child_${i}_wallet_id`];
        if (walletId) {
          const { data: wallet } = await supabase
            .from('blackbox_wallets')
            .select('*')
            .eq('id', walletId)
            .single();
          if (wallet && wallet.is_active) {
            walletList.push({ ...wallet, position: i, balance: wallet.sol_balance || 0 });
          }
        }
      }

      setWallets(walletList);
    }
  };

  const createWallet = async (position: number) => {
    if (!user) {
      toast.error('Please log in to create wallets');
      return;
    }

    setIsCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke('wallet-chain-create', {
        body: { chain_id: chainId, position }
      });

      if (error) throw error;

      setChainId(data.chain_id);
      toast.success(`Wallet ${position === 0 ? 'Parent' : `Child ${position}`} created`);
      await loadChain();
    } catch (error: any) {
      console.error('Error creating wallet:', error);
      toast.error(error.message || 'Failed to create wallet');
    } finally {
      setIsCreating(false);
    }
  };

  const transferFunds = async (fromPosition: number, toPosition: number) => {
    if (!rpcUrl) {
      toast.error('Please configure RPC URL in settings');
      return;
    }

    const fromWallet = wallets.find(w => w.position === fromPosition);
    const toWallet = wallets.find(w => w.position === toPosition);

    if (!fromWallet || !toWallet) {
      toast.error('Wallets not found');
      return;
    }

    const transferKey = `${fromPosition}-${toPosition}`;
    setIsTransferring(transferKey);

    try {
      const { data, error } = await supabase.functions.invoke('wallet-chain-transfer', {
        body: {
          from_wallet_id: fromWallet.id,
          to_wallet_id: toWallet.id,
          transfer_mode: transferMode,
          transfer_value: transferValue,
          rpc_url: rpcUrl
        }
      });

      if (error) throw error;

      toast.success(`Transferred ${data.transferred_sol.toFixed(4)} SOL`, {
        action: {
          label: 'View',
          onClick: () => window.open(`https://solscan.io/tx/${data.signature}`, '_blank')
        }
      });

      await loadChain();
    } catch (error: any) {
      console.error('Error transferring funds:', error);
      toast.error(error.message || 'Transfer failed');
    } finally {
      setIsTransferring(null);
    }
  };

  const deleteWallet = async (position: number) => {
    const wallet = wallets.find(w => w.position === position);
    if (!wallet) return;

    try {
      const { error } = await supabase
        .from('blackbox_wallets')
        .update({ is_active: false })
        .eq('id', wallet.id);

      if (error) throw error;

      toast.success('Wallet removed from chain');
      await loadChain();
    } catch (error: any) {
      console.error('Error deleting wallet:', error);
      toast.error('Failed to remove wallet');
    }
  };

  const copyAddress = (address: string) => {
    navigator.clipboard.writeText(address);
    toast.success('Address copied to clipboard');
  };

  const getWalletAtPosition = (position: number) => {
    return wallets.find(w => w.position === position);
  };

  const canTransferDown = (position: number) => {
    const wallet = getWalletAtPosition(position);
    const nextWallet = getWalletAtPosition(position + 1);
    return wallet && nextWallet && wallet.balance > 0.000005;
  };

  const canTransferUp = (position: number) => {
    const wallet = getWalletAtPosition(position);
    const prevWallet = getWalletAtPosition(position - 1);
    return wallet && prevWallet && wallet.balance > 0.000005;
  };

  const renderWallet = (position: number) => {
    const wallet = getWalletAtPosition(position);
    const label = position === 0 ? 'Parent Wallet' : `Child Wallet #${position}`;

    if (!wallet) {
      const canCreate = position === 0 || getWalletAtPosition(position - 1);
      return (
        <Card key={position} className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">{label}</CardTitle>
          </CardHeader>
          <CardContent>
            <Button
              onClick={() => createWallet(position)}
              disabled={!canCreate || isCreating}
              className="w-full"
            >
              {isCreating ? <RefreshCw className="h-4 w-4 animate-spin" /> : `Create ${label}`}
            </Button>
          </CardContent>
        </Card>
      );
    }

    return (
      <Card key={position} className="bg-card border-border">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">{label}</CardTitle>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => copyAddress(wallet.pubkey)}
              >
                <Copy className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => deleteWallet(position)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Address</p>
            <p className="text-xs font-mono break-all">{wallet.pubkey}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Balance</p>
            <p className="text-lg font-bold">{wallet.balance.toFixed(6)} SOL</p>
            <p className={`text-xs ${wallet.balance > 0.000005 ? 'text-green-500' : 'text-muted-foreground'}`}>
              {wallet.balance > 0.000005 ? '🟢 Funded' : '⚪ Empty'}
            </p>
          </div>
          <div className="flex gap-2">
            {position > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => transferFunds(position, position - 1)}
                disabled={!canTransferUp(position) || isTransferring === `${position}-${position - 1}`}
              >
                {isTransferring === `${position}-${position - 1}` ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <ArrowUp className="h-4 w-4 mr-1" /> Up
                  </>
                )}
              </Button>
            )}
            {position < 3 && (
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => transferFunds(position, position + 1)}
                disabled={!canTransferDown(position) || isTransferring === `${position}-${position + 1}`}
              >
                {isTransferring === `${position}-${position + 1}` ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <ArrowDown className="h-4 w-4 mr-1" /> Down
                  </>
                )}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Transfer Settings</CardTitle>
        </CardHeader>
        <CardContent>
          <RadioGroup value={transferMode} onValueChange={(v: any) => setTransferMode(v)}>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="all" id="all" />
              <Label htmlFor="all">100% of balance (default)</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="sol" id="sol" />
              <Label htmlFor="sol">Specific amount</Label>
              {transferMode === 'sol' && (
                <Input
                  type="number"
                  step="0.001"
                  value={transferValue}
                  onChange={(e) => setTransferValue(Number(e.target.value))}
                  placeholder="0.1"
                  className="w-32 ml-2"
                />
              )}
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="percent" id="percent" />
              <Label htmlFor="percent">Percentage</Label>
              {transferMode === 'percent' && (
                <Input
                  type="number"
                  step="1"
                  min="1"
                  max="100"
                  value={transferValue}
                  onChange={(e) => setTransferValue(Number(e.target.value))}
                  placeholder="50"
                  className="w-32 ml-2"
                />
              )}
            </div>
          </RadioGroup>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {[0, 1, 2, 3].map(renderWallet)}
      </div>
    </div>
  );
}
