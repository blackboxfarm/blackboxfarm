import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { RefreshCw, Flag, ExternalLink } from 'lucide-react';

type OutcomeFilter = 'all' | 'continued_runner' | 'graduated' | 'stable' | 'died_after_profit' | 'dev_rugged_post_exit' | 'unchecked';

const outcomeBadge = (outcome: string | null) => {
  switch (outcome) {
    case 'continued_runner': return <Badge className="bg-green-600">🚀 Runner</Badge>;
    case 'graduated': return <Badge className="bg-blue-600">🎓 Graduated</Badge>;
    case 'stable': return <Badge variant="secondary">📊 Stable</Badge>;
    case 'died_after_profit': return <Badge variant="destructive">📉 Died</Badge>;
    case 'dev_rugged_post_exit': return <Badge variant="destructive">💀 Dev Rugged</Badge>;
    default: return <Badge variant="outline">⏳ Unchecked</Badge>;
  }
};

export default function ProfitExitBackcheck() {
  const [filter, setFilter] = useState<OutcomeFilter>('all');
  const queryClient = useQueryClient();

  const { data: positions, isLoading } = useQuery({
    queryKey: ['profit-exit-backcheck', filter],
    queryFn: async () => {
      let query = supabase
        .from('pumpfun_fantasy_positions')
        .select('id, token_mint, token_symbol, entry_price_usd, exit_price_usd, total_pnl_percent, exit_at, post_exit_price_usd, post_exit_mcap, post_exit_graduated, post_exit_multiplier_vs_entry, post_exit_checked_at, post_exit_outcome, creator_wallet, peak_multiplier')
        .eq('status', 'closed')
        .gt('total_pnl_percent', 0)
        .order('exit_at', { ascending: false })
        .limit(200);

      if (filter === 'unchecked') {
        query = query.is('post_exit_checked_at', null);
      } else if (filter !== 'all') {
        query = query.eq('post_exit_outcome', filter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    staleTime: 60_000,
  });

  const runBackcheck = useMutation({
    mutationFn: async (forceRecheck: boolean) => {
      const { data, error } = await supabase.functions.invoke('backcheck-profit-exits', {
        body: { force_recheck: forceRecheck, batch_size: 25, max_batches: 20 },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success(`Checked ${data.summary?.total_checked || 0} positions`, {
        description: data.summary?.insight,
      });
      queryClient.invalidateQueries({ queryKey: ['profit-exit-backcheck'] });
    },
    onError: (e) => toast.error('Backcheck failed', { description: String(e) }),
  });

  const flagDev = useMutation({
    mutationFn: async ({ creatorWallet, tokenMint, tokenSymbol }: { creatorWallet: string; tokenMint: string; tokenSymbol: string }) => {
      const now = new Date().toISOString();
      // Insert into blacklist
      await supabase.from('pumpfun_blacklist').upsert({
        entry_type: 'wallet',
        identifier: creatorWallet,
        risk_level: 'high',
        blacklist_reason: `Manually flagged from profit-exit backcheck: post-exit rug on ${tokenSymbol}`,
        tags: ['manual_flag', 'profit_exit_backcheck', 'post_exit_rugger'],
        evidence_notes: `Token: ${tokenSymbol} (${tokenMint}). Flagged at ${now}`,
        source: 'admin-manual',
        added_by: 'admin',
        is_active: true,
        linked_wallets: [creatorWallet],
        linked_token_mints: [tokenMint],
      }, { onConflict: 'identifier' });

      // Update reputation
      await supabase.from('dev_wallet_reputation')
        .update({ trust_level: 'serial_rugger', auto_blacklisted: true, auto_blacklisted_at: now })
        .eq('wallet_address', creatorWallet);
    },
    onSuccess: () => {
      toast.success('Dev flagged and blacklisted');
      queryClient.invalidateQueries({ queryKey: ['profit-exit-backcheck'] });
    },
    onError: (e) => toast.error('Flag failed', { description: String(e) }),
  });

  // Summary stats
  const stats = {
    total: positions?.length || 0,
    checked: positions?.filter(p => p.post_exit_checked_at).length || 0,
    runners: positions?.filter(p => p.post_exit_outcome === 'continued_runner').length || 0,
    graduated: positions?.filter(p => p.post_exit_outcome === 'graduated').length || 0,
    died: positions?.filter(p => p.post_exit_outcome === 'died_after_profit').length || 0,
    rugged: positions?.filter(p => p.post_exit_outcome === 'dev_rugged_post_exit').length || 0,
    stable: positions?.filter(p => p.post_exit_outcome === 'stable').length || 0,
  };

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
        <Card><CardContent className="p-3 text-center"><div className="text-2xl font-bold">{stats.total}</div><div className="text-xs text-muted-foreground">Total Wins</div></CardContent></Card>
        <Card><CardContent className="p-3 text-center"><div className="text-2xl font-bold">{stats.checked}</div><div className="text-xs text-muted-foreground">Checked</div></CardContent></Card>
        <Card><CardContent className="p-3 text-center"><div className="text-2xl font-bold text-green-500">{stats.runners}</div><div className="text-xs text-muted-foreground">🚀 Runners</div></CardContent></Card>
        <Card><CardContent className="p-3 text-center"><div className="text-2xl font-bold text-blue-500">{stats.graduated}</div><div className="text-xs text-muted-foreground">🎓 Graduated</div></CardContent></Card>
        <Card><CardContent className="p-3 text-center"><div className="text-2xl font-bold text-yellow-500">{stats.stable}</div><div className="text-xs text-muted-foreground">📊 Stable</div></CardContent></Card>
        <Card><CardContent className="p-3 text-center"><div className="text-2xl font-bold text-orange-500">{stats.died}</div><div className="text-xs text-muted-foreground">📉 Died</div></CardContent></Card>
        <Card><CardContent className="p-3 text-center"><div className="text-2xl font-bold text-red-500">{stats.rugged}</div><div className="text-xs text-muted-foreground">💀 Rugged</div></CardContent></Card>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <Select value={filter} onValueChange={(v) => setFilter(v as OutcomeFilter)}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Filter by outcome" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="unchecked">⏳ Unchecked</SelectItem>
            <SelectItem value="continued_runner">🚀 Continued Runner</SelectItem>
            <SelectItem value="graduated">🎓 Graduated</SelectItem>
            <SelectItem value="stable">📊 Stable</SelectItem>
            <SelectItem value="died_after_profit">📉 Died</SelectItem>
            <SelectItem value="dev_rugged_post_exit">💀 Dev Rugged</SelectItem>
          </SelectContent>
        </Select>

        <Button size="sm" onClick={() => runBackcheck.mutate(false)} disabled={runBackcheck.isPending}>
          <RefreshCw className={`h-4 w-4 mr-1 ${runBackcheck.isPending ? 'animate-spin' : ''}`} />
          Run Backcheck
        </Button>
        <Button size="sm" variant="outline" onClick={() => runBackcheck.mutate(true)} disabled={runBackcheck.isPending}>
          Force Re-check All
        </Button>
      </div>

      {/* Table */}
      <Card>
        <CardHeader className="py-3"><CardTitle className="text-sm">Profit Exit Analysis</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead compact>Token</TableHead>
                <TableHead compact>Exit $</TableHead>
                <TableHead compact>Exit x</TableHead>
                <TableHead compact>Now $</TableHead>
                <TableHead compact>Post-Exit x</TableHead>
                <TableHead compact>MCap Now</TableHead>
                <TableHead compact>Outcome</TableHead>
                <TableHead compact>Dev</TableHead>
                <TableHead compact>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell compact colSpan={9} className="text-center py-8">Loading...</TableCell></TableRow>
              ) : positions?.length === 0 ? (
                <TableRow><TableCell compact colSpan={9} className="text-center py-8 text-muted-foreground">No positions found</TableCell></TableRow>
              ) : positions?.map((pos) => {
                const exitMultiplier = pos.entry_price_usd > 0 && pos.exit_price_usd
                  ? (pos.exit_price_usd / pos.entry_price_usd).toFixed(2)
                  : '-';
                const postExitX = pos.post_exit_multiplier_vs_entry?.toFixed(2) || '-';
                const mcapStr = pos.post_exit_mcap
                  ? pos.post_exit_mcap >= 1_000_000 ? `$${(pos.post_exit_mcap / 1_000_000).toFixed(1)}M`
                    : pos.post_exit_mcap >= 1_000 ? `$${(pos.post_exit_mcap / 1_000).toFixed(0)}K`
                    : `$${pos.post_exit_mcap.toFixed(0)}`
                  : '-';

                return (
                  <TableRow key={pos.id}>
                    <TableCell compact>
                      <a href={`https://pump.fun/coin/${pos.token_mint}`} target="_blank" rel="noopener noreferrer"
                        className="font-mono text-primary hover:underline flex items-center gap-1">
                        ${pos.token_symbol} <ExternalLink className="h-3 w-3" />
                      </a>
                    </TableCell>
                    <TableCell compact className="font-mono">${Number(pos.exit_price_usd).toFixed(8)}</TableCell>
                    <TableCell compact className="font-mono text-green-500">{exitMultiplier}x</TableCell>
                    <TableCell compact className="font-mono">
                      {pos.post_exit_price_usd ? `$${pos.post_exit_price_usd.toFixed(8)}` : '-'}
                    </TableCell>
                    <TableCell compact className={`font-mono ${pos.post_exit_multiplier_vs_entry && pos.post_exit_multiplier_vs_entry > 1 ? 'text-green-500' : 'text-red-400'}`}>
                      {postExitX}x
                    </TableCell>
                    <TableCell compact className="font-mono">{mcapStr}</TableCell>
                    <TableCell compact>{outcomeBadge(pos.post_exit_outcome)}</TableCell>
                    <TableCell compact>
                      {pos.creator_wallet
                        ? <span className="font-mono text-xs">{pos.creator_wallet.slice(0, 6)}...</span>
                        : <span className="text-muted-foreground text-xs">none</span>}
                    </TableCell>
                    <TableCell compact>
                      {pos.creator_wallet && (pos.post_exit_outcome === 'died_after_profit' || pos.post_exit_outcome === 'dev_rugged_post_exit') && (
                        <Button
                          size="sm"
                          variant="destructive"
                          className="h-6 px-2 text-xs"
                          onClick={() => flagDev.mutate({
                            creatorWallet: pos.creator_wallet!,
                            tokenMint: pos.token_mint,
                            tokenSymbol: pos.token_symbol,
                          })}
                          disabled={flagDev.isPending}
                        >
                          <Flag className="h-3 w-3 mr-1" /> Flag
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
