import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Loader2, Rocket } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export function AllstarAddForm() {
  const [loading, setLoading] = useState(false);
  const [tokenMint, setTokenMint] = useState('');
  const [masterWallet, setMasterWallet] = useState('');
  const [twitterHandle, setTwitterHandle] = useState('');
  const [tier, setTier] = useState('4');
  const [notes, setNotes] = useState('');
  const [mode, setMode] = useState<'token' | 'wallet'>('token');

  const handleSubmit = async () => {
    if (mode === 'token' && !tokenMint.trim()) {
      toast.error('Enter a token mint address');
      return;
    }
    if (mode === 'wallet' && !masterWallet.trim()) {
      toast.error('Enter a master wallet address');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'token') {
        // Resolve creator wallet from token mint via oracle
        toast.info('🔍 Resolving creator wallet from token mint...');
        const { data, error } = await supabase.functions.invoke('oracle-unified-lookup', {
          body: {
            input: tokenMint.trim(),
            mode: 'quick',
          },
        });

        if (error || !data?.resolvedWallet) {
          toast.error('Could not resolve creator wallet from token mint');
          setLoading(false);
          return;
        }

        const resolvedWallet = data.resolvedWallet;
        const symbol = data.tokenHistory?.[0]?.symbol || null;
        const mcap = data.tokenHistory?.[0]?.marketCap || null;

        // Insert into allstar_dev_registry
        const { error: insertError } = await supabase
          .from('allstar_dev_registry')
          .upsert({
            master_wallet: resolvedWallet,
            best_tier: parseInt(tier),
            best_token_mint: tokenMint.trim(),
            best_token_symbol: symbol,
            best_mcap_achieved: mcap,
            twitter_handle: twitterHandle.trim().replace(/^@/, '') || null,
            notes: notes.trim() || null,
            status: 'active',
          }, { onConflict: 'master_wallet' });

        if (insertError) throw insertError;

        toast.success(`✅ Added ${symbol || 'developer'} to Allstar Registry (wallet: ${resolvedWallet.slice(0, 8)}...)`);
      } else {
        // Direct wallet add
        const { error: insertError } = await supabase
          .from('allstar_dev_registry')
          .upsert({
            master_wallet: masterWallet.trim(),
            best_tier: parseInt(tier),
            twitter_handle: twitterHandle.trim().replace(/^@/, '') || null,
            notes: notes.trim() || null,
            status: 'active',
          }, { onConflict: 'master_wallet' });

        if (insertError) throw insertError;

        toast.success(`✅ Added wallet ${masterWallet.slice(0, 8)}... to Allstar Registry`);
      }

      // Reset form
      setTokenMint('');
      setMasterWallet('');
      setTwitterHandle('');
      setNotes('');
    } catch (err: any) {
      toast.error(`Failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Plus className="h-5 w-5 text-green-400" />
          Add Developer to Watchlist
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 max-w-lg">
        <div className="space-y-2">
          <Label>Add by</Label>
          <Select value={mode} onValueChange={(v) => setMode(v as 'token' | 'wallet')}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="token">Token Mint (auto-resolves creator)</SelectItem>
              <SelectItem value="wallet">Wallet Address (direct)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {mode === 'token' ? (
          <div className="space-y-2">
            <Label>Token Mint Address</Label>
            <Input
              placeholder="e.g. BXaW3PYx9Z4mNsZdT53N9hHKChGkSjG6r4pNTK2rpump"
              value={tokenMint}
              onChange={(e) => setTokenMint(e.target.value)}
              className="font-mono text-xs"
            />
            <p className="text-[10px] text-muted-foreground">
              Will resolve the creator wallet via Pump.fun/Helius and start monitoring their family tree
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <Label>Master Wallet Address</Label>
            <Input
              placeholder="e.g. tQi75x9GeqsDeFdPVdwn6fwfiNLog53STe56Wjt4MVj"
              value={masterWallet}
              onChange={(e) => setMasterWallet(e.target.value)}
              className="font-mono text-xs"
            />
          </div>
        )}

        <div className="space-y-2">
          <Label>Twitter Handle (optional)</Label>
          <Input
            placeholder="@devyehudi"
            value={twitterHandle}
            onChange={(e) => setTwitterHandle(e.target.value)}
            className="text-sm"
          />
        </div>

        <div className="space-y-2">
          <Label>Tier</Label>
          <Select value={tier} onValueChange={setTier}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">🥇 Tier 1 ($1M+ mcap)</SelectItem>
              <SelectItem value="2">🥈 Tier 2 ($500K+ mcap)</SelectItem>
              <SelectItem value="3">🥉 Tier 3 ($300K+ mcap)</SelectItem>
              <SelectItem value="4">Tier 4 (promising)</SelectItem>
              <SelectItem value="5">Tier 5 (watch)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Notes (optional)</Label>
          <Textarea
            placeholder="Why is this dev noteworthy?"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="text-sm min-h-[60px]"
          />
        </div>

        <Button onClick={handleSubmit} disabled={loading} className="w-full gap-2">
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Resolving...
            </>
          ) : (
            <>
              <Rocket className="h-4 w-4" /> Add to Allstar Registry
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
