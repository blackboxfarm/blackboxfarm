import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Loader2, CheckCircle, XCircle, RefreshCw, AlertTriangle, TrendingUp, Award, BarChart3, ShieldCheck, ShieldX } from 'lucide-react';
import { toast } from 'sonner';
import { Progress } from '@/components/ui/progress';

interface BackcheckToken {
  id: string;
  token_mint: string;
  token_symbol: string | null;
  token_name: string | null;
  image_url: string | null;
  rejection_reason: string | null;
  rejected_at: string | null;
  creator_wallet: string | null;
  ath_bonding_curve_pct: number;
  current_price_usd: number;
  current_market_cap_usd: number;
  peak_market_cap_usd: number;
  is_graduated: boolean;
  was_false_positive: boolean;
  false_positive_score: number;
  current_holders: number;
  checked_at: string | null;
  rehabilitation_status: string | null;
}

export function RejectedTokensBackcheck() {
  const [tokens, setTokens] = useState<BackcheckToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [backchecking, setBackchecking] = useState(false);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [reasonFilter, setReasonFilter] = useState<string>('all');
  const [falsePositiveOnly, setFalsePositiveOnly] = useState(false);
  const [graduatedOnly, setGraduatedOnly] = useState(false);
  const [rehabFilter, setRehabFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('false_positive_score');
  const [reasons, setReasons] = useState<string[]>([]);
  const [stats, setStats] = useState({ total: 0, falsePositives: 0, graduated: 0, avgAth: 0, pendingReview: 0 });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('pumpfun_rejected_backcheck')
        .select('id, token_mint, token_symbol, token_name, image_url, rejection_reason, rejected_at, creator_wallet, ath_bonding_curve_pct, current_price_usd, current_market_cap_usd, peak_market_cap_usd, is_graduated, was_false_positive, false_positive_score, current_holders, checked_at, rehabilitation_status');

      if (reasonFilter !== 'all') query = query.eq('rejection_reason', reasonFilter);
      if (falsePositiveOnly) query = query.eq('was_false_positive', true);
      if (graduatedOnly) query = query.eq('is_graduated', true);
      if (rehabFilter !== 'all') query = query.eq('rehabilitation_status', rehabFilter);

      if (sortBy === 'false_positive_score') query = query.order('false_positive_score', { ascending: false });
      else if (sortBy === 'ath_bonding_curve_pct') query = query.order('ath_bonding_curve_pct', { ascending: false });
      else query = query.order('rejected_at', { ascending: false });

      query = query.limit(200);
      const { data, error } = await query;
      if (error) throw error;
      setTokens((data as BackcheckToken[]) || []);
    } catch (err) {
      console.error('Failed to fetch backcheck data:', err);
    } finally {
      setLoading(false);
    }
  }, [reasonFilter, falsePositiveOnly, graduatedOnly, rehabFilter, sortBy]);

  const fetchStats = useCallback(async () => {
    try {
      const [totalRes, fpsRes, gradsRes, pendingRes, avgRes] = await Promise.all([
        supabase.from('pumpfun_rejected_backcheck').select('*', { count: 'exact', head: true }),
        supabase.from('pumpfun_rejected_backcheck').select('*', { count: 'exact', head: true }).eq('was_false_positive', true),
        supabase.from('pumpfun_rejected_backcheck').select('*', { count: 'exact', head: true }).eq('is_graduated', true),
        supabase.from('pumpfun_rejected_backcheck').select('*', { count: 'exact', head: true }).eq('rehabilitation_status', 'pending_review'),
        supabase.from('pumpfun_rejected_backcheck').select('ath_bonding_curve_pct').gt('ath_bonding_curve_pct', 0).limit(1000),
      ]);
      const avgAth = avgRes.data && avgRes.data.length > 0
        ? Math.round(avgRes.data.reduce((s, r) => s + (r.ath_bonding_curve_pct || 0), 0) / avgRes.data.length)
        : 0;
      setStats({
        total: totalRes.count || 0,
        falsePositives: fpsRes.count || 0,
        graduated: gradsRes.count || 0,
        avgAth,
        pendingReview: pendingRes.count || 0,
      });
    } catch {}
  }, []);

  const fetchReasons = useCallback(async () => {
    try {
      const { data } = await supabase.from('pumpfun_rejected_backcheck').select('rejection_reason').not('rejection_reason', 'is', null).limit(1000);
      if (data) {
        const unique = [...new Set(data.map(r => r.rejection_reason).filter(Boolean))] as string[];
        setReasons(unique.sort());
      }
    } catch {}
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { fetchStats(); fetchReasons(); }, [fetchStats, fetchReasons]);
  useEffect(() => {
    const interval = setInterval(() => { fetchData(); fetchStats(); }, 60000);
    return () => clearInterval(interval);
  }, [fetchData, fetchStats]);

  const triggerBackcheck = async () => {
    setBackchecking(true);
    try {
      const { data, error } = await supabase.functions.invoke('backcheck-rejected-tokens', {
        body: { batch_size: 25, max_batches: 20 }
      });
      if (error) throw error;
      toast.success(`Backcheck complete: ${data?.processed || 0} processed, ${data?.falsePositivesFound || 0} false positives found`);
      fetchData();
      fetchStats();
    } catch (err) {
      toast.error('Backcheck failed: ' + (err as Error).message);
    } finally {
      setBackchecking(false);
    }
  };

  const handleRehab = async (token: BackcheckToken, action: 'rehabilitated' | 'confirmed_bad') => {
    setActioningId(token.id);
    try {
      // Update backcheck record
      const { error: updateErr } = await supabase
        .from('pumpfun_rejected_backcheck')
        .update({
          rehabilitation_status: action,
          rehabilitated_at: new Date().toISOString(),
        })
        .eq('id', token.id);

      if (updateErr) throw updateErr;

      if (action === 'rehabilitated' && token.creator_wallet) {
        // Add rehabilitated mesh entry
        await supabase.from('reputation_mesh').upsert({
          source_id: token.creator_wallet,
          source_type: 'wallet',
          linked_id: token.token_mint,
          linked_type: 'token',
          relationship: 'false_positive_rehabilitated',
          confidence: 1.0,
          discovered_via: 'manual_review',
          evidence: {
            action: 'rehabilitated',
            false_positive_score: token.false_positive_score,
            is_graduated: token.is_graduated,
            rejection_reason: token.rejection_reason,
            reviewed_at: new Date().toISOString(),
          },
        }, { onConflict: 'source_id,source_type,linked_id,linked_type,relationship' });

        // Increment tokens_successful and reputation_score for the dev
        const { data: devData } = await supabase
          .from('dev_wallet_reputation')
          .select('id, tokens_successful, tokens_rugged, tokens_abandoned, reputation_score, auto_blacklisted')
          .eq('wallet_address', token.creator_wallet)
          .maybeSingle();

        if (devData) {
          const newSuccessful = (devData.tokens_successful || 0) + 1;
          const newRugged = Math.max((devData.tokens_rugged || 0) - 1, 0);
          const newAbandoned = Math.max((devData.tokens_abandoned || 0) - 1, 0);
          // Recalculate simple reputation boost
          const reputationBoost = Math.min(15, token.false_positive_score / 5);
          const newReputation = Math.min(100, (devData.reputation_score || 0) + reputationBoost);
          // If their rug count drops below 3, remove auto-blacklist
          const shouldUnblacklist = newRugged < 3 && devData.auto_blacklisted;

          await supabase
            .from('dev_wallet_reputation')
            .update({
              tokens_successful: newSuccessful,
              tokens_rugged: newRugged,
              tokens_abandoned: newAbandoned,
              reputation_score: newReputation,
              ...(shouldUnblacklist ? { auto_blacklisted: false, auto_blacklisted_at: null } : {}),
            })
            .eq('id', devData.id);

          if (shouldUnblacklist) {
            toast.success(`Dev ${token.creator_wallet.slice(0, 8)}... un-blacklisted (rugs now ${newRugged})`);
          }
        }

        toast.success(`✅ ${token.token_symbol} rehabilitated — dev reputation adjusted`);
      } else if (action === 'confirmed_bad') {
        // Update mesh to confirmed_bad
        if (token.creator_wallet) {
          await supabase.from('reputation_mesh').upsert({
            source_id: token.creator_wallet,
            source_type: 'wallet',
            linked_id: token.token_mint,
            linked_type: 'token',
            relationship: 'confirmed_bad_actor',
            confidence: 1.0,
            discovered_via: 'manual_review',
            evidence: {
              action: 'confirmed_bad',
              rejection_reason: token.rejection_reason,
              reviewed_at: new Date().toISOString(),
            },
          }, { onConflict: 'source_id,source_type,linked_id,linked_type,relationship' });
        }
        toast.info(`❌ ${token.token_symbol} confirmed bad — no changes to dev rep`);
      }

      fetchData();
      fetchStats();
    } catch (err) {
      toast.error('Action failed: ' + (err as Error).message);
    } finally {
      setActioningId(null);
    }
  };

  const formatPrice = (price: number) => {
    if (price === 0) return '—';
    if (price < 0.0001) return `$${price.toExponential(2)}`;
    if (price < 1) return `$${price.toFixed(6)}`;
    return `$${price.toFixed(2)}`;
  };

  const formatMcap = (mcap: number) => {
    if (mcap === 0) return '—';
    if (mcap >= 1e6) return `$${(mcap / 1e6).toFixed(1)}M`;
    if (mcap >= 1e3) return `$${(mcap / 1e3).toFixed(1)}K`;
    return `$${mcap.toFixed(0)}`;
  };

  const getAthColor = (pct: number, graduated: boolean) => {
    if (graduated) return 'text-yellow-400';
    if (pct >= 50) return 'text-green-400';
    if (pct >= 25) return 'text-blue-400';
    return 'text-muted-foreground';
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
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card><CardContent className="p-3 text-center">
          <BarChart3 className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
          <div className="text-2xl font-bold">{stats.total.toLocaleString()}</div>
          <div className="text-xs text-muted-foreground">Total Checked</div>
        </CardContent></Card>
        <Card><CardContent className="p-3 text-center">
          <AlertTriangle className="h-4 w-4 mx-auto mb-1 text-orange-400" />
          <div className="text-2xl font-bold text-orange-400">{stats.falsePositives.toLocaleString()}</div>
          <div className="text-xs text-muted-foreground">False Positives</div>
        </CardContent></Card>
        <Card><CardContent className="p-3 text-center">
          <Award className="h-4 w-4 mx-auto mb-1 text-yellow-400" />
          <div className="text-2xl font-bold text-yellow-400">{stats.graduated.toLocaleString()}</div>
          <div className="text-xs text-muted-foreground">Graduated</div>
        </CardContent></Card>
        <Card><CardContent className="p-3 text-center">
          <TrendingUp className="h-4 w-4 mx-auto mb-1 text-green-400" />
          <div className="text-2xl font-bold text-green-400">{stats.avgAth}%</div>
          <div className="text-xs text-muted-foreground">Avg ATH Curve</div>
        </CardContent></Card>
        <Card><CardContent className="p-3 text-center">
          <ShieldCheck className="h-4 w-4 mx-auto mb-1 text-blue-400" />
          <div className="text-2xl font-bold text-blue-400">{stats.pendingReview.toLocaleString()}</div>
          <div className="text-xs text-muted-foreground">Pending Review</div>
        </CardContent></Card>
      </div>

      {/* Filters */}
      <Card><CardContent className="p-3 flex flex-wrap items-center gap-3">
        <Select value={reasonFilter} onValueChange={setReasonFilter}>
          <SelectTrigger className="w-[200px] h-8 text-xs"><SelectValue placeholder="All Reasons" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Reasons</SelectItem>
            {reasons.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="w-[180px] h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="false_positive_score">Sort: FP Score</SelectItem>
            <SelectItem value="ath_bonding_curve_pct">Sort: ATH Curve %</SelectItem>
            <SelectItem value="rejected_at">Sort: Rejection Date</SelectItem>
          </SelectContent>
        </Select>

        <Select value={rehabFilter} onValueChange={setRehabFilter}>
          <SelectTrigger className="w-[180px] h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Rehab Status</SelectItem>
            <SelectItem value="pending_review">Pending Review</SelectItem>
            <SelectItem value="rehabilitated">Rehabilitated</SelectItem>
            <SelectItem value="confirmed_bad">Confirmed Bad</SelectItem>
            <SelectItem value="none">Not Flagged</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex items-center gap-1.5">
          <Switch id="fp-only" checked={falsePositiveOnly} onCheckedChange={setFalsePositiveOnly} />
          <Label htmlFor="fp-only" className="text-xs">FP Only</Label>
        </div>

        <div className="flex items-center gap-1.5">
          <Switch id="grad-only" checked={graduatedOnly} onCheckedChange={setGraduatedOnly} />
          <Label htmlFor="grad-only" className="text-xs">Graduated Only</Label>
        </div>

        <Button size="sm" variant="outline" onClick={triggerBackcheck} disabled={backchecking} className="ml-auto h-8 text-xs">
          {backchecking ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <RefreshCw className="h-3 w-3 mr-1" />}
          Backcheck All
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
              <TableHead compact>Reason</TableHead>
              <TableHead compact>Rejected</TableHead>
              <TableHead compact>ATH Curve %</TableHead>
              <TableHead compact>Peak MCap</TableHead>
              <TableHead compact>Current Price</TableHead>
              <TableHead compact>Graduated</TableHead>
              <TableHead compact>FP Score</TableHead>
              <TableHead compact>Rehab</TableHead>
              <TableHead compact>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tokens.length === 0 ? (
              <TableRow><TableCell compact colSpan={10} className="text-center text-muted-foreground py-8">
                No backcheck data yet. Click "Backcheck All" to start.
              </TableCell></TableRow>
            ) : tokens.map(t => (
              <TableRow key={t.id}>
                <TableCell compact>
                  <div className="flex items-center gap-1.5">
                    {t.image_url && <img src={t.image_url} alt="" className="w-5 h-5 rounded-full" />}
                    <div>
                      <div className="font-medium">{t.token_symbol || '???'}</div>
                      <div className="text-[10px] text-muted-foreground truncate max-w-[100px]">{t.token_name}</div>
                    </div>
                  </div>
                </TableCell>
                <TableCell compact>
                  <Badge variant="outline" className="text-[10px]">{t.rejection_reason || '—'}</Badge>
                </TableCell>
                <TableCell compact className="text-[10px] text-muted-foreground">
                  {t.rejected_at ? new Date(t.rejected_at).toLocaleDateString() : '—'}
                </TableCell>
                <TableCell compact>
                  <span className={`font-bold ${getAthColor(t.ath_bonding_curve_pct, t.is_graduated)}`}>
                    {t.ath_bonding_curve_pct}%
                  </span>
                </TableCell>
                <TableCell compact className="text-xs">{formatMcap(t.peak_market_cap_usd)}</TableCell>
                <TableCell compact className="text-xs">{formatPrice(t.current_price_usd)}</TableCell>
                <TableCell compact>
                  {t.is_graduated
                    ? <CheckCircle className="h-4 w-4 text-yellow-400" />
                    : <XCircle className="h-4 w-4 text-muted-foreground/40" />}
                </TableCell>
                <TableCell compact>
                  <div className="flex items-center gap-1.5 min-w-[80px]">
                    <Progress value={t.false_positive_score} className="h-2 flex-1" />
                    <span className={`text-xs font-mono ${t.false_positive_score >= 40 ? 'text-orange-400' : 'text-muted-foreground'}`}>
                      {t.false_positive_score}
                    </span>
                  </div>
                </TableCell>
                <TableCell compact>{getRehabBadge(t.rehabilitation_status)}</TableCell>
                <TableCell compact>
                  {t.rehabilitation_status === 'pending_review' && (
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0 text-green-400 hover:text-green-300"
                        onClick={() => handleRehab(t, 'rehabilitated')}
                        disabled={actioningId === t.id}
                        title="Rehabilitate dev"
                      >
                        {actioningId === t.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0 text-destructive hover:text-destructive/80"
                        onClick={() => handleRehab(t, 'confirmed_bad')}
                        disabled={actioningId === t.id}
                        title="Confirm bad actor"
                      >
                        <ShieldX className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                  {t.rehabilitation_status === 'rehabilitated' && <span className="text-[10px] text-green-400">Done</span>}
                  {t.rehabilitation_status === 'confirmed_bad' && <span className="text-[10px] text-destructive">Done</span>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

export default RejectedTokensBackcheck;
