import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, RefreshCw, ShieldCheck, ShieldX, TrendingUp, Award, BarChart3, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

interface RehabPosition {
  id: string;
  token_mint: string;
  token_symbol: string | null;
  creator_wallet: string | null;
  exit_reason: string | null;
  entry_price_usd: number | null;
  exit_price_usd: number | null;
  post_exit_price_usd: number | null;
  post_exit_mcap: number | null;
  post_exit_multiplier_vs_entry: number | null;
  post_exit_recovered: boolean | null;
  post_exit_graduated: boolean | null;
  post_exit_checked_at: string | null;
  rehabilitation_status: string | null;
  rehabilitated_at: string | null;
}

export default function StopLossRehabReview() {
  const [positions, setPositions] = useState<RehabPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [backchecking, setBackchecking] = useState(false);
  const [rehabFilter, setRehabFilter] = useState<string>('pending_review');
  const [stats, setStats] = useState({ total: 0, pending: 0, rehabilitated: 0, confirmed_bad: 0, recovered: 0, graduated: 0 });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('pumpfun_fantasy_positions')
        .select('id, token_mint, token_symbol, creator_wallet, exit_reason, entry_price_usd, exit_price_usd, post_exit_price_usd, post_exit_mcap, post_exit_multiplier_vs_entry, post_exit_recovered, post_exit_graduated, post_exit_checked_at, rehabilitation_status, rehabilitated_at')
        .eq('status', 'closed')
        .in('exit_reason', ['stop_loss', 'drawdown']);

      if (rehabFilter !== 'all') {
        query = query.eq('rehabilitation_status', rehabFilter);
      }

      query = query.order('post_exit_multiplier_vs_entry', { ascending: false, nullsFirst: false }).limit(200);

      const { data, error } = await query;
      if (error) throw error;
      setPositions((data as RehabPosition[]) || []);
    } catch (err) {
      console.error('Failed to fetch rehab data:', err);
    } finally {
      setLoading(false);
    }
  }, [rehabFilter]);

  const fetchStats = useCallback(async () => {
    try {
      const buildQuery = () => supabase.from('pumpfun_fantasy_positions').select('*', { count: 'exact', head: true }).eq('status', 'closed').in('exit_reason', ['stop_loss', 'drawdown']);

      const totalRes = await buildQuery().not('post_exit_checked_at', 'is', null);
      const pendingRes = await buildQuery().eq('rehabilitation_status', 'pending_review');
      const rehabRes = await buildQuery().eq('rehabilitation_status', 'rehabilitated');
      const badRes = await buildQuery().eq('rehabilitation_status', 'confirmed_bad');
      const recoveredRes = await buildQuery().eq('post_exit_recovered', true);
      const gradRes = await buildQuery().eq('post_exit_graduated', true);

      setStats({
        total: totalRes.count || 0,
        pending: pendingRes.count || 0,
        rehabilitated: rehabRes.count || 0,
        confirmed_bad: badRes.count || 0,
        recovered: recoveredRes.count || 0,
        graduated: gradRes.count || 0,
      });
    } catch {}
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { fetchStats(); }, [fetchStats]);
  useEffect(() => {
    const interval = setInterval(() => { fetchData(); fetchStats(); }, 60000);
    return () => clearInterval(interval);
  }, [fetchData, fetchStats]);

  const triggerBackcheck = async () => {
    setBackchecking(true);
    try {
      const { data, error } = await supabase.functions.invoke('backcheck-stop-loss-exits', {
        body: { batch_size: 25, max_batches: 20 }
      });
      if (error) throw error;
      toast.success(`Backcheck complete: ${data?.summary?.total_checked || 0} checked, ${data?.summary?.rehab_flagged || 0} flagged for review`);
      fetchData();
      fetchStats();
    } catch (err) {
      toast.error('Backcheck failed: ' + (err as Error).message);
    } finally {
      setBackchecking(false);
    }
  };

  const handleRehab = async (pos: RehabPosition, action: 'rehabilitated' | 'confirmed_bad') => {
    setActioningId(pos.id);
    try {
      // Update position
      const { error: updateErr } = await supabase
        .from('pumpfun_fantasy_positions')
        .update({
          rehabilitation_status: action,
          rehabilitated_at: new Date().toISOString(),
          rehabilitated_by: 'admin_manual',
        })
        .eq('id', pos.id);

      if (updateErr) throw updateErr;

      if (action === 'rehabilitated' && pos.creator_wallet) {
        // Add rehabilitated mesh entry
        await supabase.from('reputation_mesh').upsert({
          source_id: pos.creator_wallet,
          source_type: 'wallet',
          linked_id: pos.token_mint,
          linked_type: 'token',
          relationship: 'false_positive_rehabilitated',
          confidence: 1.0,
          discovered_via: 'manual_review',
          evidence: {
            action: 'rehabilitated',
            source: 'stop_loss_backcheck',
            exit_reason: pos.exit_reason,
            post_exit_multiplier: pos.post_exit_multiplier_vs_entry,
            graduated: pos.post_exit_graduated,
            reviewed_at: new Date().toISOString(),
          },
        }, { onConflict: 'source_id,source_type,linked_id,linked_type,relationship' });

        // Adjust dev reputation
        const { data: devData } = await supabase
          .from('dev_wallet_reputation')
          .select('id, fantasy_loss_count, tokens_rugged, tokens_successful, reputation_score, auto_blacklisted, trust_level')
          .eq('wallet_address', pos.creator_wallet)
          .maybeSingle();

        if (devData) {
          const newLossCount = Math.max((devData.fantasy_loss_count || 0) - 1, 0);
          const isRugExit = pos.exit_reason === 'rug' || pos.exit_reason === 'dev_sold';
          const newRugged = isRugExit ? Math.max((devData.tokens_rugged || 0) - 1, 0) : (devData.tokens_rugged || 0);
          const newSuccessful = (devData.tokens_successful || 0) + 1;

          // Reputation boost based on multiplier
          const multiplier = pos.post_exit_multiplier_vs_entry || 1;
          const reputationBoost = Math.min(15, Math.round(multiplier * 3));
          const newReputation = Math.min(100, (devData.reputation_score || 0) + reputationBoost);

          // Check if should un-blacklist
          const shouldUnblacklist = devData.auto_blacklisted &&
            newRugged < 2 && newLossCount < 5;

          await supabase
            .from('dev_wallet_reputation')
            .update({
              fantasy_loss_count: newLossCount,
              tokens_rugged: newRugged,
              tokens_successful: newSuccessful,
              reputation_score: newReputation,
              ...(shouldUnblacklist ? { auto_blacklisted: false, auto_blacklisted_at: null } : {}),
            })
            .eq('id', devData.id);

          // Remove from blacklist if applicable
          if (shouldUnblacklist) {
            await (supabase
              .from('pumpfun_blacklist' as any)
              .update({ is_active: false } as any)
              .eq('wallet_address', pos.creator_wallet)
              .eq('is_active', true) as any);

            toast.success(`Dev ${pos.creator_wallet.slice(0, 8)}... un-blacklisted (losses: ${newLossCount}, rugs: ${newRugged})`);
          }
        }

        toast.success(`✅ ${pos.token_symbol} rehabilitated — dev reputation adjusted`);
      } else if (action === 'confirmed_bad') {
        if (pos.creator_wallet) {
          await supabase.from('reputation_mesh').upsert({
            source_id: pos.creator_wallet,
            source_type: 'wallet',
            linked_id: pos.token_mint,
            linked_type: 'token',
            relationship: 'confirmed_bad_actor',
            confidence: 1.0,
            discovered_via: 'manual_review',
            evidence: {
              action: 'confirmed_bad',
              source: 'stop_loss_backcheck',
              exit_reason: pos.exit_reason,
              reviewed_at: new Date().toISOString(),
            },
          }, { onConflict: 'source_id,source_type,linked_id,linked_type,relationship' });
        }
        toast.info(`❌ ${pos.token_symbol} confirmed bad — no changes to dev rep`);
      }

      fetchData();
      fetchStats();
    } catch (err) {
      toast.error('Action failed: ' + (err as Error).message);
    } finally {
      setActioningId(null);
    }
  };

  const formatPrice = (price: number | null) => {
    if (!price || price === 0) return '—';
    if (price < 0.0001) return `$${price.toExponential(2)}`;
    if (price < 1) return `$${price.toFixed(6)}`;
    return `$${price.toFixed(2)}`;
  };

  const formatMcap = (mcap: number | null) => {
    if (!mcap || mcap === 0) return '—';
    if (mcap >= 1e6) return `$${(mcap / 1e6).toFixed(1)}M`;
    if (mcap >= 1e3) return `$${(mcap / 1e3).toFixed(1)}K`;
    return `$${mcap.toFixed(0)}`;
  };

  const getMultiplierColor = (m: number | null) => {
    if (!m) return 'text-muted-foreground';
    if (m >= 5) return 'text-yellow-400';
    if (m >= 2) return 'text-green-400';
    if (m >= 1) return 'text-blue-400';
    return 'text-destructive';
  };

  const getRehabBadge = (status: string | null) => {
    switch (status) {
      case 'pending_review': return <Badge variant="outline" className="text-[10px] border-orange-400/50 text-orange-400">🔄 Pending</Badge>;
      case 'rehabilitated': return <Badge variant="outline" className="text-[10px] border-green-400/50 text-green-400">✅ Rehabbed</Badge>;
      case 'confirmed_bad': return <Badge variant="outline" className="text-[10px] border-destructive/50 text-destructive">❌ Confirmed</Badge>;
      default: return null;
    }
  };

  return (
    <div className="space-y-4">
      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <Card><CardContent className="p-3 text-center">
          <BarChart3 className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
          <div className="text-2xl font-bold">{stats.total.toLocaleString()}</div>
          <div className="text-xs text-muted-foreground">Total Checked</div>
        </CardContent></Card>
        <Card><CardContent className="p-3 text-center">
          <TrendingUp className="h-4 w-4 mx-auto mb-1 text-green-400" />
          <div className="text-2xl font-bold text-green-400">{stats.recovered.toLocaleString()}</div>
          <div className="text-xs text-muted-foreground">Recovered</div>
        </CardContent></Card>
        <Card><CardContent className="p-3 text-center">
          <Award className="h-4 w-4 mx-auto mb-1 text-yellow-400" />
          <div className="text-2xl font-bold text-yellow-400">{stats.graduated.toLocaleString()}</div>
          <div className="text-xs text-muted-foreground">Graduated</div>
        </CardContent></Card>
        <Card><CardContent className="p-3 text-center">
          <AlertTriangle className="h-4 w-4 mx-auto mb-1 text-orange-400" />
          <div className="text-2xl font-bold text-orange-400">{stats.pending.toLocaleString()}</div>
          <div className="text-xs text-muted-foreground">Pending Review</div>
        </CardContent></Card>
        <Card><CardContent className="p-3 text-center">
          <ShieldCheck className="h-4 w-4 mx-auto mb-1 text-blue-400" />
          <div className="text-2xl font-bold text-blue-400">{stats.rehabilitated.toLocaleString()}</div>
          <div className="text-xs text-muted-foreground">Rehabilitated</div>
        </CardContent></Card>
        <Card><CardContent className="p-3 text-center">
          <ShieldX className="h-4 w-4 mx-auto mb-1 text-destructive" />
          <div className="text-2xl font-bold text-destructive">{stats.confirmed_bad.toLocaleString()}</div>
          <div className="text-xs text-muted-foreground">Confirmed Bad</div>
        </CardContent></Card>
      </div>

      {/* Filters */}
      <Card><CardContent className="p-3 flex flex-wrap items-center gap-3">
        <Select value={rehabFilter} onValueChange={setRehabFilter}>
          <SelectTrigger className="w-[180px] h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending_review">Pending Review</SelectItem>
            <SelectItem value="rehabilitated">Rehabilitated</SelectItem>
            <SelectItem value="confirmed_bad">Confirmed Bad</SelectItem>
            <SelectItem value="none">Not Flagged</SelectItem>
          </SelectContent>
        </Select>

        <Button size="sm" variant="outline" onClick={triggerBackcheck} disabled={backchecking} className="ml-auto h-8 text-xs">
          {backchecking ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <RefreshCw className="h-3 w-3 mr-1" />}
          Run Backcheck
        </Button>
      </CardContent></Card>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead compact>Token</TableHead>
              <TableHead compact>Exit Reason</TableHead>
              <TableHead compact>Entry Price</TableHead>
              <TableHead compact>Exit Price</TableHead>
              <TableHead compact>Current Price</TableHead>
              <TableHead compact>Post-Exit X</TableHead>
              <TableHead compact>MCap Now</TableHead>
              <TableHead compact>Graduated</TableHead>
              <TableHead compact>Rehab</TableHead>
              <TableHead compact>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {positions.length === 0 ? (
              <TableRow><TableCell compact colSpan={10} className="text-center text-muted-foreground py-8">
                No positions match the current filter.
              </TableCell></TableRow>
            ) : positions.map(p => (
              <TableRow key={p.id}>
                <TableCell compact>
                  <div>
                    <div className="font-medium">{p.token_symbol || '???'}</div>
                    <div className="text-[10px] text-muted-foreground truncate max-w-[100px]">{p.token_mint?.slice(0, 8)}...</div>
                  </div>
                </TableCell>
                <TableCell compact>
                  <Badge variant="outline" className="text-[10px]">{p.exit_reason || '—'}</Badge>
                </TableCell>
                <TableCell compact className="text-xs">{formatPrice(p.entry_price_usd)}</TableCell>
                <TableCell compact className="text-xs">{formatPrice(p.exit_price_usd)}</TableCell>
                <TableCell compact className="text-xs">{formatPrice(p.post_exit_price_usd)}</TableCell>
                <TableCell compact>
                  <span className={`font-bold ${getMultiplierColor(p.post_exit_multiplier_vs_entry)}`}>
                    {p.post_exit_multiplier_vs_entry ? `${p.post_exit_multiplier_vs_entry.toFixed(2)}x` : '—'}
                  </span>
                </TableCell>
                <TableCell compact className="text-xs">{formatMcap(p.post_exit_mcap)}</TableCell>
                <TableCell compact>
                  {p.post_exit_graduated
                    ? <Badge variant="outline" className="text-[10px] border-yellow-400/50 text-yellow-400">🎓 Yes</Badge>
                    : <span className="text-[10px] text-muted-foreground">No</span>
                  }
                </TableCell>
                <TableCell compact>{getRehabBadge(p.rehabilitation_status)}</TableCell>
                <TableCell compact>
                  {p.rehabilitation_status === 'pending_review' && (
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0 text-green-400 hover:text-green-300"
                        disabled={actioningId === p.id}
                        onClick={() => handleRehab(p, 'rehabilitated')}
                        title="Rehabilitate — restore dev reputation"
                      >
                        {actioningId === p.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0 text-destructive hover:text-destructive/80"
                        disabled={actioningId === p.id}
                        onClick={() => handleRehab(p, 'confirmed_bad')}
                        title="Confirm bad — penalty stands"
                      >
                        <ShieldX className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
