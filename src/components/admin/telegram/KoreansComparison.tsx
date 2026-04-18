import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Loader2, Play, Plus, RefreshCw, Trash2, Crown, Users, TrendingUp, Clock } from 'lucide-react';
import { toast } from 'sonner';

interface Pair {
  id: string;
  pair_name: string;
  vip_channel_id: string;
  vip_channel_name: string | null;
  public_channel_id: string;
  public_channel_name: string | null;
  is_active: boolean;
  notes: string | null;
  created_at: string;
}

interface Run {
  id: string;
  pair_id: string;
  window_start: string;
  window_end: string;
  is_manual: boolean;
  vip_call_count: number;
  public_call_count: number;
  overlap_tokens: any[];
  vip_lead_overlap: any[];
  vip_exclusives: any[];
  public_exclusives: any[];
  vip_avg_mcap_at_call: number | null;
  public_avg_mcap_at_call: number | null;
  vip_avg_lead_seconds: number | null;
  vip_pnl_summary: any;
  public_pnl_summary: any;
  ai_summary: string | null;
  ai_verdict: string | null;
  created_at: string;
}

interface ChannelOption {
  channel_id: string;
  channel_name: string;
}

const verdictBadge = (v: string | null) => {
  switch (v) {
    case 'vip_clearly_earlier':
      return <Badge className="bg-green-600">VIP Clearly Earlier</Badge>;
    case 'marginal_edge':
      return <Badge className="bg-yellow-600">Marginal Edge</Badge>;
    case 'no_edge':
      return <Badge variant="secondary">No Edge</Badge>;
    case 'public_actually_earlier':
      return <Badge className="bg-red-600">Public Was Earlier</Badge>;
    default:
      return <Badge variant="outline">Insufficient Data</Badge>;
  }
};

const fmtSec = (s: number | null) => {
  if (s === null || s === undefined) return '—';
  const abs = Math.abs(s);
  if (abs < 60) return `${s.toFixed(0)}s`;
  if (abs < 3600) return `${(s / 60).toFixed(1)}m`;
  return `${(s / 3600).toFixed(2)}h`;
};
const fmtMcap = (v: number | null) => {
  if (!v) return '—';
  if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
};
const fmtMult = (v: number | null) => (v == null ? '—' : `${v.toFixed(2)}×`);
const fmtPct = (v: number | null) => (v == null ? '—' : `${(v * 100).toFixed(0)}%`);

export const KoreansComparison = () => {
  const [pairs, setPairs] = useState<Pair[]>([]);
  const [channels, setChannels] = useState<ChannelOption[]>([]);
  const [selectedPairId, setSelectedPairId] = useState<string | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newPair, setNewPair] = useState({
    pair_name: 'Koreans',
    vip_channel_id: '',
    public_channel_id: '',
  });

  const loadPairs = async () => {
    const { data, error } = await supabase
      .from('channel_comparison_pairs')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      toast.error('Failed to load pairs');
      return;
    }
    setPairs(data || []);
    if (data && data.length && !selectedPairId) setSelectedPairId(data[0].id);
  };

  const loadChannels = async () => {
    const { data } = await supabase
      .from('telegram_channel_config')
      .select('channel_id, channel_name')
      .eq('is_active', true)
      .order('channel_name');
    if (data) setChannels(data);
  };

  const loadRuns = async (pairId: string) => {
    const { data, error } = await supabase
      .from('channel_pair_comparison_runs')
      .select('*')
      .eq('pair_id', pairId)
      .order('window_start', { ascending: false })
      .limit(48);
    if (error) {
      toast.error('Failed to load runs');
      return;
    }
    setRuns((data as any) || []);
  };

  useEffect(() => {
    Promise.all([loadPairs(), loadChannels()]).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (selectedPairId) loadRuns(selectedPairId);
  }, [selectedPairId]);

  const createPair = async () => {
    if (!newPair.vip_channel_id || !newPair.public_channel_id) {
      toast.error('Pick both channels');
      return;
    }
    if (newPair.vip_channel_id === newPair.public_channel_id) {
      toast.error('VIP and Public must be different channels');
      return;
    }
    const vipCh = channels.find((c) => c.channel_id === newPair.vip_channel_id);
    const pubCh = channels.find((c) => c.channel_id === newPair.public_channel_id);
    const { error } = await supabase.from('channel_comparison_pairs').insert({
      pair_name: newPair.pair_name || 'Comparison',
      vip_channel_id: newPair.vip_channel_id,
      vip_channel_name: vipCh?.channel_name || null,
      public_channel_id: newPair.public_channel_id,
      public_channel_name: pubCh?.channel_name || null,
    });
    if (error) {
      toast.error(`Insert failed: ${error.message}`);
      return;
    }
    toast.success('Pair created');
    setShowAddForm(false);
    setNewPair({ pair_name: 'Koreans', vip_channel_id: '', public_channel_id: '' });
    await loadPairs();
  };

  const deletePair = async (id: string) => {
    if (!confirm('Delete this pair and all its reports?')) return;
    const { error } = await supabase.from('channel_comparison_pairs').delete().eq('id', id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('Deleted');
    if (selectedPairId === id) setSelectedPairId(null);
    await loadPairs();
  };

  const togglePair = async (p: Pair) => {
    const { error } = await supabase
      .from('channel_comparison_pairs')
      .update({ is_active: !p.is_active })
      .eq('id', p.id);
    if (error) toast.error(error.message);
    else loadPairs();
  };

  const runAnalysisNow = async (hours: number) => {
    if (!selectedPairId) return;
    setAnalyzing(true);
    try {
      const { data, error } = await supabase.functions.invoke('channel-pair-analyze-now', {
        body: { pair_id: selectedPairId, hours },
      });
      if (error) throw error;
      toast.success(`Analyzed last ${hours}h`);
      await loadRuns(selectedPairId);
    } catch (e: any) {
      toast.error(`Analyze failed: ${e?.message || e}`);
    } finally {
      setAnalyzing(false);
    }
  };

  const selectedPair = pairs.find((p) => p.id === selectedPairId);
  const latestRun = runs[0];

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Pair management */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Crown className="w-5 h-5 text-yellow-500" /> VIP vs Public Channel Pairs
            </CardTitle>
            <CardDescription>Compare paid channel posting patterns against the public/free counterpart</CardDescription>
          </div>
          <Button size="sm" onClick={() => setShowAddForm((s) => !s)}>
            <Plus className="w-4 h-4 mr-1" /> {showAddForm ? 'Cancel' : 'Add Pair'}
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {showAddForm && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2 p-3 border rounded-lg bg-muted/30">
              <div>
                <Label className="text-xs">Pair Name</Label>
                <Input
                  value={newPair.pair_name}
                  onChange={(e) => setNewPair({ ...newPair, pair_name: e.target.value })}
                  placeholder="Koreans"
                />
              </div>
              <div>
                <Label className="text-xs flex items-center gap-1">
                  <Crown className="w-3 h-3 text-yellow-500" /> VIP Channel
                </Label>
                <Select
                  value={newPair.vip_channel_id}
                  onValueChange={(v) => setNewPair({ ...newPair, vip_channel_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Pick VIP" />
                  </SelectTrigger>
                  <SelectContent>
                    {channels.map((c) => (
                      <SelectItem key={c.channel_id} value={c.channel_id}>
                        {c.channel_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs flex items-center gap-1">
                  <Users className="w-3 h-3" /> Public Channel
                </Label>
                <Select
                  value={newPair.public_channel_id}
                  onValueChange={(v) => setNewPair({ ...newPair, public_channel_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Pick Public" />
                  </SelectTrigger>
                  <SelectContent>
                    {channels.map((c) => (
                      <SelectItem key={c.channel_id} value={c.channel_id}>
                        {c.channel_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Button onClick={createPair} className="w-full">Create</Button>
              </div>
            </div>
          )}

          {pairs.length === 0 && (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No comparison pairs yet. Add one to start tracking VIP vs Public lead times.
            </p>
          )}

          {pairs.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>VIP</TableHead>
                  <TableHead>Public</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pairs.map((p) => (
                  <TableRow
                    key={p.id}
                    className={selectedPairId === p.id ? 'bg-muted/50 cursor-pointer' : 'cursor-pointer'}
                    onClick={() => setSelectedPairId(p.id)}
                  >
                    <TableCell className="font-medium">{p.pair_name}</TableCell>
                    <TableCell className="text-xs">{p.vip_channel_name || p.vip_channel_id}</TableCell>
                    <TableCell className="text-xs">{p.public_channel_name || p.public_channel_id}</TableCell>
                    <TableCell>
                      <Switch checked={p.is_active} onCheckedChange={() => togglePair(p)} />
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          deletePair(p.id);
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {selectedPair && (
        <>
          {/* Action bar */}
          <Card>
            <CardContent className="pt-6 flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">Analyze {selectedPair.pair_name}:</span>
              <Button size="sm" disabled={analyzing} onClick={() => runAnalysisNow(1)}>
                {analyzing ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Play className="w-4 h-4 mr-1" />}
                Last 1h
              </Button>
              <Button size="sm" variant="outline" disabled={analyzing} onClick={() => runAnalysisNow(6)}>
                Last 6h
              </Button>
              <Button size="sm" variant="outline" disabled={analyzing} onClick={() => runAnalysisNow(24)}>
                Last 24h
              </Button>
              <Button size="sm" variant="ghost" onClick={() => loadRuns(selectedPair.id)}>
                <RefreshCw className="w-4 h-4 mr-1" /> Reload
              </Button>
              <span className="text-xs text-muted-foreground ml-auto">
                Auto-runs hourly via cron · Reports stored 48 latest shown
              </span>
            </CardContent>
          </Card>

          {/* Latest snapshot stats */}
          {latestRun && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <Card>
                <CardContent className="pt-6">
                  <p className="text-xs text-muted-foreground">VIP Calls</p>
                  <p className="text-2xl font-bold flex items-center gap-1">
                    <Crown className="w-4 h-4 text-yellow-500" /> {latestRun.vip_call_count}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <p className="text-xs text-muted-foreground">Public Calls</p>
                  <p className="text-2xl font-bold">{latestRun.public_call_count}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <p className="text-xs text-muted-foreground">Overlap</p>
                  <p className="text-2xl font-bold">{latestRun.overlap_tokens.length}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="w-3 h-3" /> Avg VIP Lead
                  </p>
                  <p className="text-2xl font-bold">{fmtSec(latestRun.vip_avg_lead_seconds)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <p className="text-xs text-muted-foreground">Latest Verdict</p>
                  <div className="mt-1">{verdictBadge(latestRun.ai_verdict)}</div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Lead-time bar chart (latest run) */}
          {latestRun && latestRun.vip_lead_overlap.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" /> Lead Time Per Token (latest run)
                </CardTitle>
                <CardDescription>Green = VIP posted earlier, Red = Public posted earlier</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-1">
                  {latestRun.vip_lead_overlap.slice(0, 20).map((row: any, i: number) => {
                    const max = Math.max(
                      ...latestRun.vip_lead_overlap.map((r: any) => Math.abs(r.lead_seconds || 0)),
                      1,
                    );
                    const pct = (Math.abs(row.lead_seconds) / max) * 100;
                    const positive = row.lead_seconds >= 0;
                    return (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <span className="w-24 truncate">{row.symbol || row.mint?.slice(0, 6)}</span>
                        <div className="flex-1 h-4 bg-muted rounded overflow-hidden">
                          <div
                            className={positive ? 'bg-green-500 h-full' : 'bg-red-500 h-full'}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className={`w-16 text-right ${positive ? 'text-green-600' : 'text-red-600'}`}>
                          {positive ? '+' : ''}
                          {fmtSec(row.lead_seconds)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* PnL side-by-side */}
          {latestRun && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">PnL Outcomes (latest run)</CardTitle>
                <CardDescription>Multiplier vs price at call, using current cached price</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead></TableHead>
                      <TableHead className="text-right">Tracked</TableHead>
                      <TableHead className="text-right">Avg ×</TableHead>
                      <TableHead className="text-right">Win Rate (≥1.5×)</TableHead>
                      <TableHead className="text-right">Best</TableHead>
                      <TableHead className="text-right">Worst</TableHead>
                      <TableHead className="text-right">Avg MCap @ Call</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell className="font-medium flex items-center gap-1">
                        <Crown className="w-3 h-3 text-yellow-500" /> VIP
                      </TableCell>
                      <TableCell className="text-right">{latestRun.vip_pnl_summary?.tracked ?? 0}</TableCell>
                      <TableCell className="text-right">{fmtMult(latestRun.vip_pnl_summary?.avg_multiplier)}</TableCell>
                      <TableCell className="text-right">{fmtPct(latestRun.vip_pnl_summary?.win_rate)}</TableCell>
                      <TableCell className="text-right">
                        {latestRun.vip_pnl_summary?.best
                          ? `${latestRun.vip_pnl_summary.best.symbol} ${fmtMult(latestRun.vip_pnl_summary.best.mult)}`
                          : '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        {latestRun.vip_pnl_summary?.worst
                          ? `${latestRun.vip_pnl_summary.worst.symbol} ${fmtMult(latestRun.vip_pnl_summary.worst.mult)}`
                          : '—'}
                      </TableCell>
                      <TableCell className="text-right">{fmtMcap(latestRun.vip_avg_mcap_at_call)}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium">Public</TableCell>
                      <TableCell className="text-right">{latestRun.public_pnl_summary?.tracked ?? 0}</TableCell>
                      <TableCell className="text-right">{fmtMult(latestRun.public_pnl_summary?.avg_multiplier)}</TableCell>
                      <TableCell className="text-right">{fmtPct(latestRun.public_pnl_summary?.win_rate)}</TableCell>
                      <TableCell className="text-right">
                        {latestRun.public_pnl_summary?.best
                          ? `${latestRun.public_pnl_summary.best.symbol} ${fmtMult(latestRun.public_pnl_summary.best.mult)}`
                          : '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        {latestRun.public_pnl_summary?.worst
                          ? `${latestRun.public_pnl_summary.worst.symbol} ${fmtMult(latestRun.public_pnl_summary.worst.mult)}`
                          : '—'}
                      </TableCell>
                      <TableCell className="text-right">{fmtMcap(latestRun.public_avg_mcap_at_call)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Hourly report timeline */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Hourly Reports Timeline</CardTitle>
              <CardDescription>{runs.length} reports for {selectedPair.pair_name}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 max-h-[600px] overflow-auto">
              {runs.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-6">
                  No reports yet. Tap "Last 1h" to generate one now or wait for the hourly cron.
                </p>
              )}
              {runs.map((r) => (
                <div key={r.id} className="border rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">
                        {new Date(r.window_start).toLocaleString()} → {new Date(r.window_end).toLocaleTimeString()}
                      </span>
                      {r.is_manual && <Badge variant="outline" className="text-xs">Manual</Badge>}
                      {verdictBadge(r.ai_verdict)}
                    </div>
                    <div className="text-xs text-muted-foreground flex gap-3">
                      <span>VIP: <strong>{r.vip_call_count}</strong></span>
                      <span>Public: <strong>{r.public_call_count}</strong></span>
                      <span>Overlap: <strong>{r.overlap_tokens.length}</strong></span>
                      <span>Avg Lead: <strong>{fmtSec(r.vip_avg_lead_seconds)}</strong></span>
                    </div>
                  </div>
                  {r.ai_summary && (
                    <p className="text-sm whitespace-pre-wrap text-muted-foreground">{r.ai_summary}</p>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};

export default KoreansComparison;
