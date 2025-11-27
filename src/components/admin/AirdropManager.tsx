import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Wallet, Send, Upload, Copy, RefreshCw, Trash2 } from "lucide-react";

interface AirdropWallet {
  id: string;
  nickname: string | null;
  pubkey: string;
  sol_balance: number;
  created_at: string;
  is_active: boolean;
}

interface AirdropDistribution {
  id: string;
  token_mint: string;
  amount_per_wallet: number;
  memo: string | null;
  recipient_count: number;
  status: string;
  created_at: string;
}

// Solana memo max is 566 bytes, but UTF-8 can vary. Safe limit is ~280 chars
const MEMO_MAX_CHARS = 280;

export function AirdropManager() {
  const [wallets, setWallets] = useState<AirdropWallet[]>([]);
  const [distributions, setDistributions] = useState<AirdropDistribution[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedWallet, setSelectedWallet] = useState<AirdropWallet | null>(null);
  
  // Create wallet dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [newNickname, setNewNickname] = useState("");
  const [creating, setCreating] = useState(false);
  
  // Airdrop dialog
  const [airdropOpen, setAirdropOpen] = useState(false);
  const [tokenMint, setTokenMint] = useState("");
  const [amountPerWallet, setAmountPerWallet] = useState("");
  const [memo, setMemo] = useState("");
  const [recipientAddresses, setRecipientAddresses] = useState("");
  const [parsedRecipients, setParsedRecipients] = useState<string[]>([]);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    loadWallets();
    loadDistributions();
  }, []);

  useEffect(() => {
    // Parse recipient addresses
    const lines = recipientAddresses.split(/[\n,]/).map(s => s.trim()).filter(s => s.length > 30);
    setParsedRecipients(lines);
  }, [recipientAddresses]);

  async function loadWallets() {
    const { data, error } = await supabase
      .from('airdrop_wallets')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Failed to load wallets:', error);
      return;
    }
    setWallets(data || []);
  }

  async function loadDistributions() {
    const { data, error } = await supabase
      .from('airdrop_distributions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);
    
    if (error) {
      console.error('Failed to load distributions:', error);
      return;
    }
    setDistributions(data || []);
  }

  async function createWallet() {
    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke('airdrop-wallet-generator', {
        body: { nickname: newNickname || null }
      });
      
      if (error) throw error;
      
      toast.success(`Wallet created: ${data.pubkey.slice(0, 8)}...`);
      setCreateOpen(false);
      setNewNickname("");
      loadWallets();
    } catch (err: any) {
      toast.error(err.message || 'Failed to create wallet');
    } finally {
      setCreating(false);
    }
  }

  async function updateNickname(walletId: string, nickname: string) {
    const { error } = await supabase
      .from('airdrop_wallets')
      .update({ nickname })
      .eq('id', walletId);
    
    if (error) {
      toast.error('Failed to update nickname');
      return;
    }
    toast.success('Nickname updated');
    loadWallets();
  }

  async function deleteWallet(walletId: string) {
    if (!confirm('Are you sure you want to delete this wallet?')) return;
    
    const { error } = await supabase
      .from('airdrop_wallets')
      .update({ is_active: false })
      .eq('id', walletId);
    
    if (error) {
      toast.error('Failed to delete wallet');
      return;
    }
    toast.success('Wallet deleted');
    loadWallets();
  }

  async function executeAirdrop() {
    if (!selectedWallet || !tokenMint || !amountPerWallet || parsedRecipients.length === 0) {
      toast.error('Please fill all required fields');
      return;
    }

    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('execute-airdrop', {
        body: {
          wallet_id: selectedWallet.id,
          token_mint: tokenMint,
          amount_per_wallet: parseFloat(amountPerWallet),
          memo: memo || null,
          recipients: parsedRecipients
        }
      });
      
      if (error) throw error;
      
      toast.success(`Airdrop initiated to ${parsedRecipients.length} wallets`);
      setAirdropOpen(false);
      resetAirdropForm();
      loadDistributions();
    } catch (err: any) {
      toast.error(err.message || 'Failed to execute airdrop');
    } finally {
      setSending(false);
    }
  }

  function resetAirdropForm() {
    setTokenMint("");
    setAmountPerWallet("");
    setMemo("");
    setRecipientAddresses("");
    setParsedRecipients([]);
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Airdrop Manager</h2>
          <p className="text-muted-foreground">Create wallets and distribute tokens to multiple recipients</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Create Wallet
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Airdrop Wallet</DialogTitle>
              <DialogDescription>
                Generate a new Solana wallet for airdrops. Private keys are securely stored.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label htmlFor="nickname">Nickname (optional)</Label>
                <Input
                  id="nickname"
                  placeholder="e.g., Marketing Campaign Q1"
                  value={newNickname}
                  onChange={(e) => setNewNickname(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button onClick={createWallet} disabled={creating}>
                {creating ? 'Creating...' : 'Create Wallet'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Wallets Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {wallets.map((wallet) => (
          <Card key={wallet.id} className="relative">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">
                  {wallet.nickname || 'Unnamed Wallet'}
                </CardTitle>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive"
                  onClick={() => deleteWallet(wallet.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <CardDescription className="font-mono text-xs flex items-center gap-2">
                {wallet.pubkey.slice(0, 16)}...{wallet.pubkey.slice(-8)}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => copyToClipboard(wallet.pubkey)}
                >
                  <Copy className="h-3 w-3" />
                </Button>
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-sm text-muted-foreground">SOL Balance</p>
                  <p className="text-xl font-bold">{wallet.sol_balance?.toFixed(4) || '0'} SOL</p>
                </div>
                <Wallet className="h-8 w-8 text-muted-foreground" />
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="Set nickname"
                  defaultValue={wallet.nickname || ''}
                  onBlur={(e) => {
                    if (e.target.value !== wallet.nickname) {
                      updateNickname(wallet.id, e.target.value);
                    }
                  }}
                  className="text-sm"
                />
                <Button
                  variant="secondary"
                  onClick={() => {
                    setSelectedWallet(wallet);
                    setAirdropOpen(true);
                  }}
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        
        {wallets.length === 0 && (
          <Card className="col-span-full">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Wallet className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No airdrop wallets yet</p>
              <Button className="mt-4" onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create Your First Wallet
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Airdrop Dialog */}
      <Dialog open={airdropOpen} onOpenChange={setAirdropOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Execute Airdrop</DialogTitle>
            <DialogDescription>
              Send tokens from {selectedWallet?.nickname || selectedWallet?.pubkey.slice(0, 8)} to multiple recipients
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="tokenMint">Token Mint Address</Label>
                <Input
                  id="tokenMint"
                  placeholder="Token mint address"
                  value={tokenMint}
                  onChange={(e) => setTokenMint(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="amount">Amount per Wallet</Label>
                <Input
                  id="amount"
                  type="number"
                  placeholder="e.g., 1111"
                  value={amountPerWallet}
                  onChange={(e) => setAmountPerWallet(e.target.value)}
                />
              </div>
            </div>
            
            <div>
              <Label htmlFor="memo">
                Memo Message (optional) 
                <span className="text-muted-foreground ml-2">
                  {memo.length}/{MEMO_MAX_CHARS} chars
                </span>
              </Label>
              <Input
                id="memo"
                placeholder="Message to include with each transfer"
                value={memo}
                onChange={(e) => setMemo(e.target.value.slice(0, MEMO_MAX_CHARS))}
                maxLength={MEMO_MAX_CHARS}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Solana memos support up to ~280 characters (566 bytes UTF-8)
              </p>
            </div>
            
            <div>
              <Label htmlFor="recipients">
                Recipient Wallet Addresses
                <Badge variant="secondary" className="ml-2">
                  {parsedRecipients.length} wallets detected
                </Badge>
              </Label>
              <Textarea
                id="recipients"
                placeholder="Paste wallet addresses (one per line or comma-separated)"
                rows={8}
                value={recipientAddresses}
                onChange={(e) => setRecipientAddresses(e.target.value)}
                className="font-mono text-xs"
              />
            </div>

            {parsedRecipients.length > 0 && (
              <Card className="bg-muted/50">
                <CardContent className="py-4">
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <p className="text-2xl font-bold">{parsedRecipients.length}</p>
                      <p className="text-xs text-muted-foreground">Recipients</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{amountPerWallet || '0'}</p>
                      <p className="text-xs text-muted-foreground">Tokens Each</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold">
                        {(parsedRecipients.length * parseFloat(amountPerWallet || '0')).toLocaleString()}
                      </p>
                      <p className="text-xs text-muted-foreground">Total Tokens</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAirdropOpen(false)}>Cancel</Button>
            <Button 
              onClick={executeAirdrop} 
              disabled={sending || parsedRecipients.length === 0 || !tokenMint || !amountPerWallet}
            >
              {sending ? 'Sending...' : `Send to ${parsedRecipients.length} Wallets`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Recent Distributions */}
      {distributions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recent Distributions</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Token</TableHead>
                  <TableHead>Amount/Wallet</TableHead>
                  <TableHead>Recipients</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {distributions.map((dist) => (
                  <TableRow key={dist.id}>
                    <TableCell className="font-mono text-xs">
                      {dist.token_mint.slice(0, 8)}...
                    </TableCell>
                    <TableCell>{dist.amount_per_wallet.toLocaleString()}</TableCell>
                    <TableCell>{dist.recipient_count}</TableCell>
                    <TableCell>
                      <Badge variant={dist.status === 'completed' ? 'default' : 'secondary'}>
                        {dist.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{new Date(dist.created_at).toLocaleDateString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}